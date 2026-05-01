/**
 * sidequests — run N pi sessions in parallel from one parent.
 *
 * See ./sidecar.md for the full design and implementation tracker.
 *
 * Two things are registered on load:
 *   1. `--name <string>` CLI flag — generic. On `session_start`, sets the
 *      current session's display name verbatim via `pi.setSessionName()`.
 *      Useful for any `pi -p` invocation, not just children spawned here.
 *   2. `sidequests` tool — LLM-callable. Each entry in `sessions[]` is
 *      either a NEW session (`name` + `prompt`) or a FOLLOW-UP turn on an
 *      existing session (`session` UUID + `prompt`). New and follow-up
 *      entries can be mixed freely in one call. `args` is an optional
 *      escape hatch for extra pi flags (--model, --skill, --thinking, ...).
 *
 * Bytes-on-the-wire from `pi --mode json` are huge (every text_delta re-emits
 * accumulated text + usage), but only `content[0].text` reaches the parent
 * LLM — `details` is for the renderer. So context is bounded by our terse
 * summary, not the raw stream.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import { type ExtensionAPI, getAgentDir, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";

const getSessionsDir = () => path.join(getAgentDir(), "sessions");

const MAX_PARALLEL_TASKS = 8;
const DEFAULT_CONCURRENCY = 4;
// finalText (assistant model output) is returned verbatim, no cap — it's model-generated and
// the whole point of dispatching the sidequest is to get it back. stderr (process noise)
// is still capped via STDERR_PREVIEW_CHARS to avoid dumping pi startup chatter into context.
const STDERR_PREVIEW_CHARS = 500;

// ---------- helpers ----------

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	if (model) parts.push(model);
	return parts.join(" ");
}

// UUIDv7: first 8 hex chars are timestamp-high and collide across siblings spawned in
// the same ~65s bucket. Show 18 chars (through the random region) so siblings render
// distinctly AND the displayed string is a valid contiguous prefix for `pi --session`.
function shortId(uuid: string): string {
	return uuid.length >= 18 ? uuid.slice(0, 18) : uuid;
}

function shortenPath(p: string): string {
	const home = os.homedir();
	return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: any, text: string) => string,
): string {
	switch (toolName) {
		case "bash": {
			const command = (args.command as string) || "...";
			const preview = command.length > 60 ? `${command.slice(0, 60)}...` : command;
			return themeFg("muted", "$ ") + themeFg("toolOutput", preview);
		}
		case "read":
		case "write":
		case "edit":
		case "ls": {
			const rawPath = (args.file_path || args.path || "...") as string;
			return themeFg("muted", `${toolName} `) + themeFg("accent", shortenPath(rawPath));
		}
		case "find":
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", `${toolName} `) +
				themeFg("accent", pattern) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		default: {
			const argsStr = JSON.stringify(args);
			const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
			return themeFg("accent", toolName) + themeFg("dim", ` ${preview}`);
		}
	}
}

async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

/** Pi binary invocation — handles bun-binary, node-from-script, and PATH `pi`. */
function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) return { command: process.execPath, args };
	return { command: "pi", args };
}

/** Encode a cwd to its sessions/ subdirectory name (e.g. /tmp → --tmp--). */
function encodeCwdForSessions(cwd: string): string {
	return `-${cwd.replace(/[/\\]/g, "-")}-`;
}

/** Find the session JSONL file for a given UUID (full or prefix) under sessions/<encoded-cwd>/. */
function findSessionFile(cwd: string, sessionIdOrPrefix: string): string | undefined {
	const dir = path.join(getSessionsDir(), encodeCwdForSessions(cwd));
	if (!existsSync(dir)) return undefined;
	try {
		const entries = readdirSync(dir);
		const exact = entries.find(
			(f) => f.endsWith(`_${sessionIdOrPrefix}.jsonl`) || f === `${sessionIdOrPrefix}.jsonl`,
		);
		if (exact) return path.join(dir, exact);
		const prefixed = entries.find((f) => f.includes(`_${sessionIdOrPrefix}`) && f.endsWith(".jsonl"));
		return prefixed ? path.join(dir, prefixed) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Resolve a session UUID prefix to its file path by scanning every cwd-encoded
 * sessions/ subdirectory. Used by `renderCall` (which has no cwd context) to
 * surface a friendly display name for follow-up entries.
 */
function findSessionFileAcrossCwds(sessionIdOrPrefix: string): string | undefined {
	const root = getSessionsDir();
	if (!existsSync(root)) return undefined;
	try {
		for (const sub of readdirSync(root)) {
			const dir = path.join(root, sub);
			try {
				for (const f of readdirSync(dir)) {
					if (
						f.endsWith(`_${sessionIdOrPrefix}.jsonl`) ||
						f === `${sessionIdOrPrefix}.jsonl` ||
						(f.includes(`_${sessionIdOrPrefix}`) && f.endsWith(".jsonl"))
					) {
						return path.join(dir, f);
					}
				}
			} catch {
				/* ignore unreadable subdir */
			}
		}
	} catch {
		/* ignore */
	}
	return undefined;
}

/**
 * Read the most recent display name from a session's JSONL `session_info` events.
 * Each child writes a `session_info` line on every run via the `--name` hook; the
 * latest one is the current display name (handles follow-up renames correctly).
 */
function readSessionDisplayName(file: string): string | undefined {
	try {
		const content = readFileSync(file, "utf8");
		let latest: string | undefined;
		for (const line of content.split("\n")) {
			if (!line || !line.includes('"session_info"')) continue;
			try {
				const evt = JSON.parse(line);
				if (evt?.type === "session_info" && typeof evt.name === "string" && evt.name.trim()) {
					latest = evt.name.trim();
				}
			} catch {
				/* ignore malformed lines */
			}
		}
		return latest;
	} catch {
		return undefined;
	}
}

/** Slugify the agent's label for inclusion in the decorated session display name. */
function slugify(s: string): string {
	return (
		s
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40) || "task"
	);
}

/**
 * Local-time stamp for decorated session names: `DDmonYY-HHMM-<tz>`.
 * Examples: `01may26-1031-cest`, `15dec25-2359+0200`.
 */
function stamp(now: Date = new Date()): string {
	const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
	const p = (n: number) => String(n).padStart(2, "0");
	const date = `${p(now.getDate())}${months[now.getMonth()]}${String(now.getFullYear()).slice(-2)}`;
	const time = `${p(now.getHours())}${p(now.getMinutes())}`;
	const tz = tzAbbrev(now);
	// Skip the separator dash when tz already has a sign prefix (`+0200`, `-0700`).
	const sep = /^[+-]/.test(tz) ? "" : "-";
	return `${date}-${time}${sep}${tz}`;
}

/** Best-effort tz abbreviation (cest, pst, ...); falls back to ±HHMM offset. */
function tzAbbrev(now: Date): string {
	try {
		const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(now);
		const tz = parts.find((p) => p.type === "timeZoneName")?.value || "";
		if (tz && !/^(GMT|UTC)/i.test(tz)) return tz.toLowerCase();
	} catch {
		/* fall through */
	}
	const offMin = -now.getTimezoneOffset();
	const sign = offMin >= 0 ? "+" : "-";
	const abs = Math.abs(offMin);
	return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Decorate the agent's label into a unique-per-spawn display name for `pi -r`.
 * Format: `sq_<slug>_<DDmonYY>-<HHMM>-<tz>`.
 * Underscores separate the three semantic chunks (prefix / slug / stamp) so
 * they're visually distinguishable from the dashes inside the slug and stamp.
 * Applied only when creating a NEW session. On follow-up renames
 * (`session` + `label` both present), the agent's label is passed verbatim.
 */
function decorateLabel(label: string): string {
	return `sq_${slugify(label)}_${stamp()}`;
}

/**
 * Build the child argv from structured fields.
 *
 *   pi --mode json -p [--session <uuid>] [--name <piName>] [...args] <prompt>
 *
 * `piName` is derived from `task.label`:
 *   - new session (no `session`): decorated `sq-<slug>-<stamp>` form.
 *   - follow-up rename (`session` + `label` both set): agent's verbatim label.
 *   - follow-up without rename (`session` only): no `--name` injected.
 *
 * `args` is the agent's optional escape hatch for flags we don't model
 * directly (--model, --skill, --thinking, --extension, etc.). Passes through.
 */
function derivePiName(task: TaskInput): string | undefined {
	if (!task.label) return undefined;
	return task.session ? task.label : decorateLabel(task.label);
}

function buildChildArgs(task: TaskInput): string[] {
	const out: string[] = ["--mode", "json", "-p"];
	if (task.session) out.push("--session", task.session);
	const piName = derivePiName(task);
	if (piName) out.push("--name", piName);
	if (task.args && task.args.length > 0) out.push(...task.args);
	out.push(task.prompt);
	return out;
}

function getFinalText(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

type DisplayItem = { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, any> };

function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const msg of messages) {
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") items.push({ type: "text", text: part.text });
				else if (part.type === "toolCall") items.push({ type: "toolCall", name: part.name, args: part.arguments });
			}
		}
	}
	return items;
}

// ---------- types ----------

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface SidequestResult {
	label?: string; // agent-supplied label (verbatim, used in result rows)
	piName?: string; // decorated `sq-<slug>-<stamp>` form actually passed to --name (or verbatim on rename)
	resumedSession?: string; // agent-supplied --session UUID prefix, if this was a follow-up
	prompt: string;
	args: string[]; // final argv passed to the child (after our assembly)
	followUp: boolean; // true if `session` was provided
	model?: string; // captured from message events
	cwd: string;
	sessionId: string; // UUID of the actual session as captured from the JSONL `session` event
	sessionFile: string; // absolute path; empty until process closes
	displayName?: string; // latest `session_info.name` from the child's JSONL (e.g. sq_<slug>_<stamp>)
	exitCode: number; // -1 = running, 0 = ok, >0 = failure
	stopReason?: string;
	errorMessage?: string;
	stderr: string;
	messages: Message[];
	usage: UsageStats;
}

interface SidequestDetails {
	results: SidequestResult[];
}

type TaskInput = {
	session?: string;
	label?: string;
	prompt: string;
	args?: string[];
	cwd?: string;
};

// ---------- core: spawn + parse one sidequest ----------

async function runSingleSidequest(
	defaultCwd: string,
	task: TaskInput,
	signal: AbortSignal | undefined,
	onTaskUpdate: ((r: SidequestResult) => void) | undefined,
): Promise<SidequestResult> {
	const cwd = task.cwd ?? defaultCwd;
	const childArgs = buildChildArgs(task);
	const followUp = !!task.session;

	const result: SidequestResult = {
		label: task.label,
		piName: derivePiName(task),
		resumedSession: task.session,
		prompt: task.prompt,
		args: childArgs,
		followUp,
		cwd,
		sessionId: "",
		sessionFile: "",
		exitCode: -1,
		stderr: "",
		messages: [],
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
	};

	// For follow-ups, eagerly resolve the existing session file + display name so the
	// live renderer can show the friendly name instead of just the UUID prefix.
	// Use the cross-cwd lookup: the existing session's JSONL lives in *its* original
	// cwd-encoded directory, which may differ from the parent's cwd.
	if (task.session) {
		const existing = findSessionFileAcrossCwds(task.session);
		if (existing) {
			result.sessionFile = existing;
			const name = readSessionDisplayName(existing);
			if (name) result.displayName = name;
		}
	}

	let wasAborted = false;

	const exitCode = await new Promise<number>((resolve) => {
		const invocation = getPiInvocation(childArgs);
		const proc = spawn(invocation.command, invocation.args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let buffer = "";

		const processLine = (line: string) => {
			if (!line.trim()) return;
			let event: any;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}

			// Capture session UUID from the very first event.
			if (event.type === "session" && event.id && !result.sessionId) {
				result.sessionId = event.id;
				if (onTaskUpdate) onTaskUpdate(result);
				return;
			}

			if (event.type === "message_end" && event.message) {
				const msg = event.message as Message;
				result.messages.push(msg);
				if (msg.role === "assistant") {
					result.usage.turns++;
					const u = msg.usage;
					if (u) {
						result.usage.input += u.input || 0;
						result.usage.output += u.output || 0;
						result.usage.cacheRead += u.cacheRead || 0;
						result.usage.cacheWrite += u.cacheWrite || 0;
						result.usage.cost += u.cost?.total || 0;
						result.usage.contextTokens = u.totalTokens || 0;
					}
					if (!result.model && msg.model) result.model = msg.model;
					if (msg.stopReason) result.stopReason = msg.stopReason;
					if (msg.errorMessage) result.errorMessage = msg.errorMessage;
				}
				if (onTaskUpdate) onTaskUpdate(result);
				return;
			}

			if (event.type === "tool_result_end" && event.message) {
				result.messages.push(event.message as Message);
				if (onTaskUpdate) onTaskUpdate(result);
				return;
			}
			// Everything else (text_delta, message_update, *_start, *_end lifecycle) is dropped.
		};

		proc.stdout.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) processLine(line);
		});

		proc.stderr.on("data", (data) => {
			result.stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (buffer.trim()) processLine(buffer);
			resolve(code ?? 0);
		});

		proc.on("error", () => resolve(1));

		if (signal) {
			const killProc = () => {
				wasAborted = true;
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 5000);
			};
			if (signal.aborted) killProc();
			else signal.addEventListener("abort", killProc, { once: true });
		}
	});

	result.exitCode = exitCode;
	if (wasAborted && !result.stopReason) result.stopReason = "aborted";

	if (result.sessionId) {
		// New sessions land in the parent's cwd-encoded directory; follow-ups stay in
		// their original directory. Try cwd-bound first (fast path), then fall back to
		// scanning all session subdirs so follow-ups also resolve correctly.
		const file = findSessionFile(cwd, result.sessionId) || findSessionFileAcrossCwds(result.sessionId);
		if (file) {
			result.sessionFile = file;
			const name = readSessionDisplayName(file);
			if (name) result.displayName = name;
		}
	}

	if (onTaskUpdate) onTaskUpdate(result);
	return result;
}

// ---------- schema ----------

const SessionItem = Type.Object({
	session: Type.Optional(
		Type.String({
			description:
				"UUID prefix of an existing session to resume. Presence of this field makes the entry a follow-up turn on that session rather than creating a new one. Use the UUID returned in a previous sidequests result row.",
			minLength: 4,
		}),
	),
	label: Type.Optional(
		Type.String({
			description:
				"Short human-readable label for this entry. Set for NEW sessions — sidequests will derive the actual `pi -r` display name from it (e.g. `sq_<slug>_01may26-1031-cest`). Omit on follow-ups; the existing display name is preserved. Pass both `session` and `label` only to deliberately rename a resumed session (in which case the label is used verbatim, not decorated).",
			minLength: 1,
		}),
	),
	prompt: Type.String({
		description: "The user message for this turn.",
		minLength: 1,
	}),
	args: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"Optional escape hatch for extra pi flags. Most calls don't need this. Examples: `[\"--model\", \"openai-codex/gpt-5.5\"]`, `[\"--skill\", \"brave-search\"]`, `[\"--thinking\", \"high\"]`. Do NOT include `--mode json`, `-p`, `--name`, or `--session` here — those are handled by the dedicated fields.",
		}),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory for the spawned child process. Defaults to the parent's cwd." })),
});

// Native shape — what execute() actually consumes.
const SessionsArray = Type.Array(SessionItem, {
	description: "One or more pi sessions (new or follow-up) to run in parallel. N=1 is allowed.",
	minItems: 1,
	maxItems: MAX_PARALLEL_TASKS,
});

// Some providers/transports stringify nested tool-call args (the LLM emits
// `"tasks": "[...]"` instead of `"tasks": [...]`). pi-ai's validator only
// does primitive coercion — it won't JSON.parse a string into an array.
// So we accept either form here and normalize in execute().
const SidequestsParams = Type.Object({
	sessions: Type.Union(
		[
			SessionsArray,
			Type.String({
				description:
					"JSON-encoded array of session objects (only used as a fallback when the transport stringifies nested args). Prefer passing a real array.",
			}),
		],
		{ description: "Sessions to run. Pass an array of {session?, label?, prompt, args?, cwd?} objects." },
	),
});

/**
 * Normalize `sessions`: accept either a real array or a JSON-encoded string
 * (transport-stringified). Throws a clear error if parsing fails or the
 * shape is wrong.
 */
function normalizeSessions(raw: unknown): TaskInput[] {
	let value: unknown = raw;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch (e) {
			throw new Error(
				`'sessions' was a string but not valid JSON: ${(e as Error).message}. Pass an array of session objects.`,
			);
		}
	}
	if (!Array.isArray(value)) {
		throw new Error(`'sessions' must be an array of {name?, session?, prompt, args?, cwd?} (got ${typeof value}).`);
	}
	const out: TaskInput[] = [];
	for (let i = 0; i < value.length; i++) {
		let t: unknown = value[i];
		if (typeof t === "string") {
			try {
				t = JSON.parse(t);
			} catch (e) {
				throw new Error(`sessions[${i}] was a string but not valid JSON: ${(e as Error).message}.`);
			}
		}
		if (!t || typeof t !== "object" || Array.isArray(t)) {
			throw new Error(`sessions[${i}] must be an object.`);
		}
		const rec = t as Record<string, unknown>;

		const session = typeof rec.session === "string" && rec.session.trim().length > 0 ? rec.session.trim() : undefined;
		const label = typeof rec.label === "string" && rec.label.trim().length > 0 ? rec.label.trim() : undefined;
		if (!label && !session) {
			throw new Error(
				`sessions[${i}] must provide either 'label' (for a new session) or 'session' (UUID to resume).`,
			);
		}
		if (typeof rec.prompt !== "string" || rec.prompt.trim().length === 0) {
			throw new Error(`sessions[${i}].prompt is required and must be a non-empty string.`);
		}
		let args: string[] | undefined;
		if (rec.args !== undefined) {
			if (!Array.isArray(rec.args)) {
				throw new Error(`sessions[${i}].args must be an array of strings.`);
			}
			args = [];
			for (let j = 0; j < rec.args.length; j++) {
				const a = rec.args[j];
				if (typeof a !== "string") {
					throw new Error(`sessions[${i}].args[${j}] must be a string (got ${typeof a}).`);
				}
				args.push(a);
			}
		}
		if (args && args.some((a) => a === "--session" || a.startsWith("--session="))) {
			throw new Error(
				`sessions[${i}].args must not contain '--session'. Use the dedicated 'session' field instead.`,
			);
		}
		if (args && args.some((a) => a === "--name" || a.startsWith("--name="))) {
			throw new Error(
				`sessions[${i}].args must not contain '--name'. Use the dedicated 'name' field instead.`,
			);
		}
		out.push({
			session,
			label,
			prompt: rec.prompt,
			args,
			cwd: typeof rec.cwd === "string" ? rec.cwd : undefined,
		});
	}

	// Cross-entry validation: reject duplicate `session` UUIDs in one call.
	// Two concurrent turns on the same session leaf would race their appends;
	// the right pattern for "fan out from this state" is N new sessions, or
	// `pi --fork <uuid>` semantics (not currently exposed).
	const seenSessions = new Map<string, number>();
	for (let i = 0; i < out.length; i++) {
		const s = out[i].session;
		if (!s) continue;
		const prior = seenSessions.get(s);
		if (prior !== undefined) {
			throw new Error(
				`Duplicate session '${s}' in sessions[${prior}] and sessions[${i}]. Each follow-up must target a distinct session UUID; concurrent turns on the same session would race their appends. To fan out from one state, spawn N new sessions instead.`,
			);
		}
		seenSessions.set(s, i);
	}

	return out;
}

// ---------- extension entry point ----------

export default function (pi: ExtensionAPI) {
	// Generic --name flag: sets the session display name verbatim.
	pi.registerFlag("name", {
		description: "Set the session display name (shown in `pi -r` / `/resume`).",
		type: "string",
	});

	pi.on("session_start", async () => {
		const name = pi.getFlag("name") as string | undefined;
		if (name && name.trim()) pi.setSessionName(name.trim());
	});

	pi.registerTool({
		name: "sidequests",
		label: "Sidequests",
		description: [
			"Spawn N pi sessions in parallel. Each entry is either a NEW session (provide `label` + `prompt`) or a FOLLOW-UP turn on an existing session (provide `session` + `prompt`).",
			"Use this to investigate / implement multiple angles concurrently. You can mix new sessions and follow-ups freely in one call.",
			"Each new session becomes a real, persistent, resumable pi session: a JSONL file under ~/.pi/agent/sessions/, browsable via `pi -r`.",
			"For a new session: { label: 'investigate-auth', prompt: 'investigate the auth flow' }.",
			"For a follow-up: { session: '019de2af', prompt: 'now refactor it' }. Use the UUID prefix returned in a previous sidequests result.",
			"For a follow-up that also renames the session: { session: '019de2af', label: 'auth-refactor', prompt: '...' } — the label is used verbatim in this case.",
			"`args` is an optional escape hatch for extra pi flags (--model, --skill, --thinking, etc.); most calls don't need it.",
			"The result summary returns each entry's label (or UUID for unlabeled follow-ups), status, and a preview of the final reply. To follow up later, pass `session: '<uuid-prefix>'` from that summary.",
		].join(" "),
		parameters: SidequestsParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			let tasks: TaskInput[];
			try {
				tasks = normalizeSessions(params.sessions);
			} catch (e) {
				return {
					content: [{ type: "text", text: (e as Error).message }],
					details: { results: [] },
					isError: true,
				};
			}
			if (tasks.length === 0) {
				return {
					content: [{ type: "text", text: "No tasks provided." }],
					details: { results: [] },
					isError: true,
				};
			}
			if (tasks.length > MAX_PARALLEL_TASKS) {
				return {
					content: [
						{ type: "text", text: `Too many tasks (${tasks.length}). Max is ${MAX_PARALLEL_TASKS}.` },
					],
					details: { results: [] },
					isError: true,
				};
			}

			const concurrency = DEFAULT_CONCURRENCY;

			// Initialize placeholder results for streaming UI.
			const allResults: SidequestResult[] = tasks.map((t) => ({
				label: t.label,
				piName: derivePiName(t),
				resumedSession: t.session,
				prompt: t.prompt,
				args: buildChildArgs(t),
				followUp: !!t.session,
				cwd: t.cwd ?? ctx.cwd,
				sessionId: "",
				sessionFile: "",
				exitCode: -1,
				stderr: "",
				messages: [],
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
			}));

			const emitUpdate = () => {
				if (!onUpdate) return;
				const running = allResults.filter((r) => r.exitCode === -1).length;
				const done = allResults.length - running;
				onUpdate({
					content: [{ type: "text", text: `Sidequests: ${done}/${allResults.length} done, ${running} running...` }],
					details: { results: [...allResults] },
				});
			};

			emitUpdate();

			await mapWithConcurrencyLimit(tasks, concurrency, async (t, index) => {
				const r = await runSingleSidequest(ctx.cwd, t, signal, (live) => {
					allResults[index] = { ...live };
					emitUpdate();
				});
				allResults[index] = r;
				emitUpdate();
				return r;
			});

			// Build summary for the parent LLM (terse — only `content[0].text` reaches the model).
			const successCount = allResults.filter((r) => r.exitCode === 0 && r.stopReason !== "error").length;
			const failCount = allResults.length - successCount;

			const lines: string[] = [`${successCount}/${allResults.length} sidequests completed.`];
			if (failCount > 0) lines[0] += ` ${failCount} failed.`;
			lines.push("");

			for (const r of allResults) {
				const status =
					r.exitCode === 0 && r.stopReason !== "error" ? "ok" : r.stopReason || (r.exitCode > 0 ? "failed" : "?");
				const finalText = getFinalText(r.messages);
				const body = finalText
					? finalText.trim()
					: r.errorMessage || r.stderr.slice(-STDERR_PREVIEW_CHARS).trim() || "(no output)";
				const idHint = r.sessionId ? shortId(r.sessionId) : "";
				const kind = r.followUp ? "↻" : "✦";
				const shownName = r.label || r.displayName;
				const row = shownName
					? `[${shownName}] ${kind}${idHint ? ` (${idHint})` : ""}`
					: idHint
						? `(${idHint}) ${kind}`
						: `${kind}`;
				lines.push(`--- ${row} [${status}] ---`);
				lines.push(body);
				lines.push("");
			}
			lines.push("");
			lines.push("Follow up by passing `session: '<uuid-prefix>'` in a future sidequests call, or run `pi --session <uuid-prefix>` directly.");

			const allFailed = successCount === 0 && allResults.length > 0;

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: { results: allResults },
				isError: allFailed,
			};
		},

		renderCall(args: any, theme) {
			// `sessions` may be a real array or (in transport-stringified form) a string.
			let sessions: Array<{ session?: string; label?: string; prompt?: string }> = [];
			if (Array.isArray(args.sessions)) sessions = args.sessions;
			else if (typeof args.sessions === "string") {
				try {
					const parsed = JSON.parse(args.sessions);
					if (Array.isArray(parsed)) sessions = parsed;
				} catch {
					/* render best-effort */
				}
			}
			let text =
				theme.fg("toolTitle", theme.bold("sidequests ")) +
				theme.fg("accent", `(${sessions.length} session${sessions.length === 1 ? "" : "s"})`);
			for (const s of sessions.slice(0, 3)) {
				const kind = s.session ? "↻ " : "✦ ";
				let displayName: string | undefined;
				if (s.session && !s.label) {
					const file = findSessionFileAcrossCwds(s.session);
					if (file) displayName = readSessionDisplayName(file);
				}
				const nameText = s.label || displayName || (s.session ? shortId(s.session) : undefined);
				const label = nameText
					? theme.fg("accent", `${kind}${nameText}`) + " "
					: theme.fg("accent", kind);
				const preview = (s.prompt || "").length > 50 ? `${(s.prompt || "").slice(0, 50)}...` : s.prompt || "";
				text += `\n  ${label}${theme.fg("dim", preview)}`;
			}
			if (sessions.length > 3) text += `\n  ${theme.fg("muted", `... +${sessions.length - 3} more`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as SidequestDetails | undefined;
			if (!details || details.results.length === 0) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const mdTheme = getMarkdownTheme();
			const results = details.results;
			const running = results.filter((r) => r.exitCode === -1).length;
			const successCount = results.filter((r) => r.exitCode === 0 && r.stopReason !== "error").length;
			const failCount = results.length - successCount - running;

			const headerIcon =
				running > 0
					? theme.fg("warning", "⏳")
					: failCount > 0
						? theme.fg("warning", "◐")
						: theme.fg("success", "✓");
			const status =
				running > 0
					? `${results.length - running}/${results.length} done, ${running} running`
					: `${successCount}/${results.length} ok${failCount > 0 ? `, ${failCount} failed` : ""}`;

			const aggregateUsage = () => {
				const total = {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					cost: 0,
					contextTokens: 0,
					turns: 0,
				};
				for (const r of results) {
					total.input += r.usage.input;
					total.output += r.usage.output;
					total.cacheRead += r.usage.cacheRead;
					total.cacheWrite += r.usage.cacheWrite;
					total.cost += r.usage.cost;
					total.turns += r.usage.turns;
				}
				return total;
			};

			const renderDisplayItems = (items: DisplayItem[], limit?: number) => {
				const toShow = limit ? items.slice(-limit) : items;
				const skipped = limit && items.length > limit ? items.length - limit : 0;
				let text = "";
				if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier items\n`);
				for (const item of toShow) {
					if (item.type === "text") {
						const preview = expanded ? item.text : item.text.split("\n").slice(0, 3).join("\n");
						text += `${theme.fg("toolOutput", preview)}\n`;
					} else {
						text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
					}
				}
				return text.trimEnd();
			};

			const headerLineFor = (r: SidequestResult, rIcon: string): string => {
				const kind = r.followUp ? theme.fg("dim", " ↻") : theme.fg("dim", " ✦");
				const friendly = r.label || r.displayName;
				const shown = friendly || (r.sessionId ? shortId(r.sessionId) : "(unlabeled)");
				// Only append the dim (uuid) suffix when `shown` is a friendly name, otherwise
				// `shown` itself already is the UUID and we'd render it twice.
				const id = friendly && r.sessionId ? theme.fg("dim", ` (${shortId(r.sessionId)})`) : "";
				return `${theme.fg("muted", "─── ")}${theme.fg("accent", shown)}${kind}${id} ${rIcon}`;
			};

			if (expanded && running === 0) {
				const container = new Container();
				container.addChild(
					new Text(
						`${headerIcon} ${theme.fg("toolTitle", theme.bold("sidequests "))}${theme.fg("accent", status)}`,
						0,
						0,
					),
				);
				for (const r of results) {
					const rIcon =
						r.exitCode === -1
							? theme.fg("warning", "⏳")
							: r.exitCode === 0 && r.stopReason !== "error"
								? theme.fg("success", "✓")
								: theme.fg("error", "✗");
					const items = getDisplayItems(r.messages);
					const finalText = getFinalText(r.messages);

					container.addChild(new Spacer(1));
					container.addChild(new Text(headerLineFor(r, rIcon), 0, 0));
					container.addChild(new Text(theme.fg("muted", "Prompt: ") + theme.fg("dim", r.prompt), 0, 0));
					if (r.errorMessage)
						container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
					for (const item of items) {
						if (item.type === "toolCall")
							container.addChild(
								new Text(
									theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
									0,
									0,
								),
							);
					}
					if (finalText) {
						container.addChild(new Spacer(1));
						container.addChild(new Markdown(finalText.trim(), 0, 0, mdTheme));
					}
					const taskUsage = formatUsageStats(r.usage, r.model);
					if (taskUsage) container.addChild(new Text(theme.fg("dim", taskUsage), 0, 0));
				}
				const totalUsage = formatUsageStats(aggregateUsage());
				if (totalUsage) {
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("dim", `Total: ${totalUsage}`), 0, 0));
				}
				container.addChild(
					new Text(
						theme.fg("muted", "Resume with `pi --session <uuid-prefix>` or `pi -r`."),
						0,
						0,
					),
				);
				return container;
			}

			// Collapsed (or still running)
			let text = `${headerIcon} ${theme.fg("toolTitle", theme.bold("sidequests "))}${theme.fg("accent", status)}`;
			for (const r of results) {
				const rIcon =
					r.exitCode === -1
						? theme.fg("warning", "⏳")
						: r.exitCode === 0 && r.stopReason !== "error"
							? theme.fg("success", "✓")
							: theme.fg("error", "✗");
				const items = getDisplayItems(r.messages);
				text += `\n\n${headerLineFor(r, rIcon)}`;
				if (items.length === 0)
					text += `\n${theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)")}`;
				else text += `\n${renderDisplayItems(items, 5)}`;
			}
			if (running === 0) {
				const totalUsage = formatUsageStats(aggregateUsage());
				if (totalUsage) text += `\n\n${theme.fg("dim", `Total: ${totalUsage}`)}`;
			}
			if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
			return new Text(text, 0, 0);
		},
	});
}
