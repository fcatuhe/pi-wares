import type { Api, Model, Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { oauthHeaders } from "../../lib/anthropic.ts";
import { sideCallModel } from "../../lib/models.ts";

const ANTHROPIC_VERSION = "2023-06-01";
const SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 1 };
export const MAX_QUERY_CHARS = 400;
const SEARCH_MAX_TOKENS = 300;
export const SUMMARY_MAX_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 120_000;
const RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10_000;
const RETRIED_STATUSES = [429, 529];
const THINKING_OFF = { type: "disabled" };
const CLAUDE_CODE_IDENTITY = { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." };

export interface Worker {
  model: Model<Api>;
  apiKey: string;
  baseUrl: string;
  headers?: Record<string, string>;
}

export interface UsageTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface SearchResult {
  title: string;
  url: string;
}

export interface DomainFilter {
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export function formatResults(results: SearchResult[]): string {
  return results.map((result) => `${result.url} ${result.title}`).join("\n");
}

export async function resolveWorker(ctx: ExtensionContext): Promise<Worker> {
  const registry = ctx.modelRegistry;
  const model = sideCallModel(registry);
  if (!model) {
    throw new Error("No authenticated anthropic model. Run /login anthropic.");
  }
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    throw new Error(`Anthropic auth failed: ${auth.error}`);
  }
  if (!auth.apiKey) {
    throw new Error("Anthropic auth resolved no credential.");
  }
  return {
    model,
    apiKey: auth.apiKey,
    baseUrl: auth.baseUrl ?? model.baseUrl,
    headers: auth.headers as Record<string, string> | undefined,
  };
}

export function authHeaders(apiKey: string): Record<string, string> {
  return isOAuth(apiKey) ? oauthHeaders(apiKey) : { "x-api-key": apiKey };
}

function isOAuth(apiKey: string): boolean {
  return apiKey.includes("sk-ant-oat");
}

export function domainFilter(allowed: string[] | undefined, blocked: string[] | undefined): DomainFilter {
  if (allowed?.length && blocked?.length) {
    throw new Error("Cannot specify both allowed_domains and blocked_domains in the same request");
  }
  return {
    ...(allowed?.length ? { allowed_domains: allowed } : {}),
    ...(blocked?.length ? { blocked_domains: blocked } : {}),
  };
}

export function searchRequest(model: string, query: string, filter: DomainFilter = {}): Record<string, unknown> {
  return {
    model,
    max_tokens: SEARCH_MAX_TOKENS,
    thinking: THINKING_OFF,
    messages: [
      {
        role: "user",
        content: `Use the web_search tool once, with the text between the tags as the whole query.\n<query>${query}</query>\nThen reply DONE.`,
      },
    ],
    tools: [{ ...SEARCH_TOOL, ...filter }],
    tool_choice: { type: "tool", name: SEARCH_TOOL.name },
  };
}

export function summaryRequest(model: string, url: string, markdown: string, prompt: string): Record<string, unknown> {
  return {
    model,
    max_tokens: SUMMARY_MAX_TOKENS,
    thinking: THINKING_OFF,
    system: [
      {
        type: "text",
        text: "Answer the request from the page content only. Quote exact figures, versions, names and dates. State what the page does not contain rather than filling the gap.",
      },
    ],
    messages: [
      {
        role: "user",
        content: `<page url="${url}">\n${markdown}\n</page>\n\nRequest: ${prompt}`,
      },
    ],
  };
}

export function parseSearchResults(response: unknown): SearchResult[] {
  const blocks = contentBlocks(response);
  const block = blocks.find((candidate) => candidate.type === "web_search_tool_result");
  if (!block) {
    if (blocks.some((candidate) => candidate.type === "server_tool_use")) {
      throw new Error("The search was cut off before it ran. Retry with a shorter query.");
    }
    throw new Error("The model answered without searching. Retry with a more specific query.");
  }
  const content = block.content;
  if (!Array.isArray(content)) {
    const code = isRecord(content) ? content.error_code : undefined;
    throw new Error(`Search failed: ${code ?? "unknown error"}`);
  }
  const results: SearchResult[] = [];
  for (const item of content) {
    if (!isRecord(item) || typeof item.title !== "string" || typeof item.url !== "string") continue;
    results.push({ title: item.title.trim(), url: item.url });
  }
  if (results.length === 0) {
    throw new Error("The search returned no results. Retry with different terms.");
  }
  return results;
}

export function parseText(response: unknown): string {
  const text = contentBlocks(response)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("")
    .trim();
  if (!text) {
    throw new Error("The model returned no text for this page.");
  }
  const cut = isRecord(response) && response.stop_reason === "max_tokens";
  return cut ? `${text}\n\n[Answer cut at ${SUMMARY_MAX_TOKENS} tokens. Ask for less.]` : text;
}

export function usageTokens(response: unknown): UsageTokens {
  const raw = isRecord(response) && isRecord(response.usage) ? response.usage : {};
  return {
    input: numberOf(raw.input_tokens),
    output: numberOf(raw.output_tokens),
    cacheRead: numberOf(raw.cache_read_input_tokens),
    cacheWrite: numberOf(raw.cache_creation_input_tokens),
  };
}

export async function postMessages(worker: Worker, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  let response = await send(worker, body, signal);
  if (RETRIED_STATUSES.includes(response.status)) {
    await new Promise((resume) => setTimeout(resume, retryDelayMs(response)));
    response = await send(worker, body, signal);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(apiError(response, text));
  }
  return JSON.parse(text);
}

async function send(worker: Worker, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return await fetch(`${worker.baseUrl.replace(/\/+$/, "")}/v1/messages`, {
    method: "POST",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: {
      "content-type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
      ...authHeaders(worker.apiKey),
      ...worker.headers,
    },
    body: JSON.stringify(isOAuth(worker.apiKey) ? withIdentity(body) : body),
  });
}

function retryDelayMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  const delay = response.headers.has("retry-after") && Number.isFinite(seconds) ? seconds * 1000 : RETRY_DELAY_MS;
  return Math.min(Math.max(delay, 0), MAX_RETRY_DELAY_MS);
}

function apiError(response: Response, text: string): string {
  const parsed = response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : undefined;
  if (!isRecord(parsed) || !isRecord(parsed.error)) return `Anthropic ${response.status}: ${text.slice(0, 300)}`;
  const requestId = typeof parsed.request_id === "string" ? ` (${parsed.request_id})` : "";
  return `Anthropic ${response.status} ${parsed.error.type}: ${parsed.error.message}${requestId}`;
}

function withIdentity(body: Record<string, unknown>): Record<string, unknown> {
  const system = Array.isArray(body.system) ? body.system : [];
  return { ...body, system: [CLAUDE_CODE_IDENTITY, ...system] };
}

function contentBlocks(response: unknown): Array<Record<string, unknown>> {
  if (!isRecord(response) || !Array.isArray(response.content)) return [];
  return response.content.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
