import type { Api, Model, Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const ANTHROPIC_VERSION = "2023-06-01";
// INFO: fc 06aug26 the OAuth protocol beta, not client identity: this endpoint takes a bare subscription token, without the Claude Code system block and user-agent the main conversation needs.
const OAUTH_BETA = "oauth-2025-04-20";
const SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 1 };
const WORKER_MODEL_IDS = ["claude-haiku-4-5", "claude-sonnet-5"];
// INFO: fc 06aug26 the cap has to outlast the tool arguments, or the turn stops mid-call and no search runs: MAX_QUERY_CHARS of query is ~140 tokens of JSON. Past the results block the model only writes prose we discard, so the rest of the budget is deliberately small.
export const MAX_QUERY_CHARS = 400;
const SEARCH_MAX_TOKENS = 300;
const SUMMARY_MAX_TOKENS = 2048;
// INFO: fc 06aug26 without a deadline of its own a stalled request hangs the tool until the user aborts the turn; summarizing a capped page takes seconds, not minutes.
const REQUEST_TIMEOUT_MS = 120_000;

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
	pageAge?: string;
}

export function formatResults(query: string, results: SearchResult[]): string {
	const lines = results.map((result, index) => {
		const age = result.pageAge ? ` (${result.pageAge})` : "";
		return `${String(index + 1).padStart(2)}. ${result.title}${age}\n    ${result.url}`;
	});
	return [`${results.length} results for "${query}"`, "", ...lines, "", "Titles and URLs only. Read a result with webfetch."].join("\n");
}

export async function resolveWorker(ctx: ExtensionContext): Promise<Worker> {
	const registry = ctx.modelRegistry;
	const preferred = WORKER_MODEL_IDS.map((id) => registry.find("anthropic", id)).find(
		(model) => model && registry.hasConfiguredAuth(model),
	);
	// INFO: fc 06aug26 cheapest first, never merely available: a 300k character page summarized on Opus costs dollars where Haiku costs cents.
	const model =
		preferred ??
		registry
			.getAvailable()
			.filter((candidate) => candidate.provider === "anthropic")
			.sort((a, b) => a.cost.input - b.cost.input)[0];
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
	return apiKey.includes("sk-ant-oat")
		? { authorization: `Bearer ${apiKey}`, "anthropic-beta": OAUTH_BETA }
		: { "x-api-key": apiKey };
}

// INFO: fc 06aug26 a server tool only runs inside a model turn, so the query is wrapped in the shortest prompt that reliably triggers exactly one search.
export function searchRequest(model: string, query: string): Record<string, unknown> {
	return {
		model,
		max_tokens: SEARCH_MAX_TOKENS,
		messages: [
			{
				role: "user",
				content: `Use the web_search tool once, with the text between the tags as the whole query.\n<query>${query}</query>\nThen reply DONE.`,
			},
		],
		tools: [SEARCH_TOOL],
	};
}

export function summaryRequest(model: string, url: string, markdown: string, prompt: string): Record<string, unknown> {
	return {
		model,
		max_tokens: SUMMARY_MAX_TOKENS,
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
		results.push({
			title: item.title.trim(),
			url: item.url,
			...(typeof item.page_age === "string" ? { pageAge: item.page_age } : {}),
		});
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
	return text;
}

// The counts are ours to read off the response; the money is pi's calculateCost, which also applies
// tiered rates and the double charge on 1h cache writes.
export function usageTokens(response: unknown): UsageTokens {
	const raw = isRecord(response) && isRecord(response.usage) ? response.usage : {};
	return {
		input: numberOf(raw.input_tokens),
		output: numberOf(raw.output_tokens),
		cacheRead: numberOf(raw.cache_read_input_tokens),
		cacheWrite: numberOf(raw.cache_creation_input_tokens),
	};
}

export async function postMessages(
	worker: Worker,
	body: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<unknown> {
	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	const response = await fetch(`${worker.baseUrl.replace(/\/+$/, "")}/v1/messages`, {
		method: "POST",
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
		headers: {
			"content-type": "application/json",
			"anthropic-version": ANTHROPIC_VERSION,
			...authHeaders(worker.apiKey),
			...worker.headers,
		},
		body: JSON.stringify(body),
	});
	const text = await response.text();
	if (response.status === 429) {
		// INFO: fc 06aug26 the subscription rate limits per model, so this says which one rather than inviting a retry loop on a model that is out.
		throw new Error(`${body.model} is rate limited on this account. Retry later.`);
	}
	if (!response.ok) {
		throw new Error(`Anthropic ${response.status}: ${text.slice(0, 300)}`);
	}
	return JSON.parse(text);
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
