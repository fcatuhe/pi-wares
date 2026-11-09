import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expandHome } from "../../../lib/paths.ts";

export type Byline = { byline: string; shortcode: string; emoji: string };

type Refusal = { block: true; reason: string };

const MCP_SEND = /(?:slack_send_message(?:_draft)?|slack_schedule_message|create_comment|update_comment)\b/;
const CLI_SEND = [
  /\bgog(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s+send\b/,
  /\bgog\b.*?\s(?:gmail|mail|email)\s+(?:send|reply|reply-all|replyall|forward|fwd|autoreply)\b/,
  /\bgog\b.*?\s(?:gmail|mail|email)\s+drafts?\s+(?:create|add|new|update|edit|set|reply|reply-all|replyall|forward|fwd)\b/,
  /\bgog\b.*?\schat\s+(?:messages|dm)\s+(?:send|create|post)\b/,
  /\bgog\b.*?\s(?:docs?|drive|drv)\s+comments\s+(?:add|create|new|update|edit|set|reply|respond)\b/,
  /\bgh\s+(?:pr|issue)\s+comment\b/,
  /\bgh\s+pr\s+review\b.*\s(?:-b|--body|-F|--body-file)\b/,
  /\bgh\s+api\b.*\s(?:-f|-F|--field|--raw-field)[=\s]+body=/,
];
const HELP = /\s(?:-h|--help)\s*$/;
const BODY_FILE = /(?:--(?:body|body-html|text)-file|\s-F)[=\s]+(["']?)(?:body=@)?([^\s"']+)\1/g;

export function parseByline(config: unknown, file: string): Byline {
  const { byline, shortcode, emoji } = (config ?? {}) as Partial<Byline>;
  if ([byline, shortcode, emoji].every((value) => typeof value === "string" && value.trim())) {
    return { byline, shortcode, emoji } as Byline;
  }
  throw new Error(`[policy-byline] ${file} needs non-empty strings byline, shortcode and emoji`);
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

function bylineRefusal(text: string, { byline, shortcode, emoji }: Byline): Refusal | undefined {
  if (text.includes(byline)) return;
  return {
    block: true,
    reason: `Byline policy refused the message: open it with "_${shortcode} ${byline}._" in Slack, or "_${emoji} ${byline}._" elsewhere.`,
  };
}

function bodyFiles(command: string): string[] {
  return [...command.matchAll(BODY_FILE)].map((m) => m[2]).filter((path) => path !== "-");
}

function signed(path: string, { byline }: Byline): boolean {
  const full = resolve(expandHome(path));
  return existsSync(full) && readFileSync(full, "utf8").includes(byline);
}
