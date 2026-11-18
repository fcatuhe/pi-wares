import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expandHome } from "../../../lib/paths.ts";

export type Byline = { agent: string; human: string; emoji?: string; url?: string; skill?: string };

type Refusal = { block: true; reason: string };

const MCP_SEND = /(?:slack_send_message|slack_schedule_message|create_comment|update_comment)\b/;
const CLI_SEND = [
  /\bgog(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s+send\b/,
  /\bgog\b.*?\s(?:gmail|mail|email)\s+(?:send|reply|reply-all|replyall|forward|fwd|autoreply)\b/,
  /\bgog\b.*?\schat\s+(?:messages|dm)\s+(?:send|create|post)\b/,
  /\bgog\b.*?\s(?:docs?|drive|drv)\s+comments\s+(?:add|create|new|update|edit|set|reply|respond)\b/,
  /\bgh\s+(?:pr|issue)\s+comment\b/,
  /\bgh\s+(?:pr|issue)\s+(?:create|edit)\b.*\s(?:-b|--body|-F|--body-file)\b/,
  /\bgh\s+pr\s+review\b.*\s(?:-b|--body|-F|--body-file)\b/,
  /\bgh\s+api\b.*\s(?:-f|-F|--field|--raw-field)[=\s]+body=/,
];
const HELP = /\s(?:-h|--help)\s*$/;
const BODY_FILE = /(?:--(?:body|body-html|text)-file|\s-F)[=\s]+(["']?)(?:body=@)?([^\s"']+)\1/g;
const LINKS = [/<https?:\/\/[^|>\s]+\|([^>]*)>/g, /\[([^\]]*)\]\([^)\s]+\)/g, /<a\s[^>]*>([^<]*)<\/a>/g];

export function parseByline(config: unknown, file: string): Byline {
  const { agent, human, emoji, url, skill } = (config ?? {}) as Partial<Byline>;
  if (![agent, human].every(filled) || ![emoji, url, skill].every((value) => value === undefined || filled(value))) {
    throw new Error(`[policy-byline] ${file} needs non-empty strings agent and human, and optional non-empty strings emoji, url and skill`);
  }
  if (url !== undefined && !/^https:\/\/\S+$/.test(url)) throw new Error(`[policy-byline] ${file} needs an https url, not: ${url}`);
  if (skill !== undefined && !existsSync(expandHome(skill))) {
    throw new Error(`[policy-byline] ${file} names a skill that does not exist: ${skill}`);
  }
  return { agent, human, ...(emoji && { emoji }), ...(url && { url }), ...(skill && { skill }) } as Byline;
}

function filled(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function bylineFormats({ agent, human, emoji, url }: Byline) {
  const line = (name: string) => `${emoji ? `${emoji} ` : ""}${name} writing for ${human}.`;
  return {
    Slack: `_${line(url ? `<${url}|${agent}>` : agent)}_`,
    Markdown: `_${line(url ? `[${agent}](${url})` : agent)}_`,
    "HTML mail": `<i>${line(url ? `<a href="${url}">${agent}</a>` : agent)}</i>`,
    "plain text": line(agent),
  };
}

export function refusal(toolName: string, input: unknown, byline: Byline): Refusal | undefined {
  if (toolName === "bash") return cliRefusal((input as { command: string }).command, byline);
  if (toolName === "mcp__local__codemode") return mcpRefusal((input as { code: string }).code, byline);
  if (MCP_SEND.test(toolName)) return bylineRefusal(JSON.stringify(input), byline);
}

function mcpRefusal(code: string, byline: Byline): Refusal | undefined {
  if (MCP_SEND.test(code)) return bylineRefusal(code, byline);
}

function cliRefusal(command: string, byline: Byline): Refusal | undefined {
  const sends = command.split(/[\n;&|]/).filter((part) => !HELP.test(part) && CLI_SEND.some((pattern) => pattern.test(part)));
  if (!sends.length) return;
  if (!bodyFiles(command).some((path) => signed(path, byline))) return bylineRefusal(command, byline);
}

function bylineRefusal(text: string, byline: Byline): Refusal | undefined {
  if (signs(text, byline)) return;
  const formats = Object.entries(bylineFormats(byline)).map(([where, format]) => `"${format}" in ${where}`);
  return { block: true, reason: `Byline policy refused the message: open it with ${formats.join(", ")}.` };
}

function bodyFiles(command: string): string[] {
  return [...command.matchAll(BODY_FILE)].map((m) => m[2]).filter((path) => path !== "-");
}

function signed(path: string, byline: Byline): boolean {
  const full = resolve(expandHome(path));
  return existsSync(full) && signs(readFileSync(full, "utf8"), byline);
}

function signs(text: string, { agent, human }: Byline): boolean {
  return LINKS.reduce((plain, link) => plain.replace(link, "$1"), text).includes(`${agent} writing for ${human}`);
}
