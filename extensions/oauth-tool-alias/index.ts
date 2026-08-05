import { basename, dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const WRAPPER_DIRS = new Set(["extensions", "dist", "src", "build"]);
const FALLBACK_NAMESPACE = "local";

// INFO: fc 05aug26 "cli" because the transport's own first system block calls itself one.
// Only phrases where a lowercase pi is unambiguously the product name: a general \bpi\b pass
// also renames "Raspberry Pi" and "calculate pi" in project instructions, and an entry quoting
// a whole upstream sentence breaks silently the day that sentence is reworded.
const CLIENT_NAME_PHRASES: Array<[string | RegExp, string]> = [
	["pi itself", "the cli itself"],
	["pi packages", "cli packages"],
	["pi docs", "cli docs"],
	["pi topics", "cli topics"],
	["pi .md files", "cli .md files"],
	// Anchored: mid-sentence this is "Raspberry Pi documentation", at line start it is pi's own heading.
	[/^Pi documentation/gm, "CLI documentation"],
];

export interface AliasEntry {
	flat: string;
	alias: string;
}

export interface AliasMaps {
	aliasByFlat: Map<string, string>;
	flatByAlias: Map<string, string>;
}

export function createAliasMaps(): AliasMaps {
	return { aliasByFlat: new Map(), flatByAlias: new Map() };
}

export function lower(name: unknown): string {
	return typeof name === "string" ? name.trim().toLowerCase() : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function rewritePromptText(text: string): string {
	let result = text;
	for (const [pattern, replacement] of CLIENT_NAME_PHRASES) {
		result =
			typeof pattern === "string" ? result.replaceAll(pattern, replacement) : result.replace(pattern, replacement);
	}
	return result;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// INFO: fc 02aug26 a bare single-word tool name collides with English prose (a guideline about
// the shell commands ls and find became one about mcp__local__ls), so only identifier-shaped
// names are rewritten bare. Backticks mark a name as a tool name whatever its shape.
// A flat name inside its own alias has no word boundary before it (mcp__ns__name), so repeated
// rewrites are no-ops.
export function rewriteNameReferences(text: string, renames: AliasEntry[]): string {
	let result = text;
	for (const { flat, alias } of renames) {
		const escaped = escapeRegExp(flat);
		result = result.replace(new RegExp(`\`${escaped}\``, "g"), `\`${alias}\``);
		if (flat.includes("_")) {
			result = result.replace(new RegExp(`\\b${escaped}\\b`, "g"), alias);
		}
	}
	return result;
}

export function rewriteSystemField(system: unknown, renames: AliasEntry[]): unknown {
	const rewrite = (text: string) => rewriteNameReferences(rewritePromptText(text), renames);
	if (typeof system === "string") return rewrite(system);
	if (!Array.isArray(system)) return system;
	return system.map((block) => {
		if (!isPlainObject(block) || block.type !== "text" || typeof block.text !== "string") return block;
		const rewritten = rewrite(block.text);
		return rewritten === block.text ? block : { ...block, text: rewritten };
	});
}

export function namespaceFrom(sourceInfo?: { path?: string; baseDir?: string }): string {
	const candidates = [sourceInfo?.path ? dirname(sourceInfo.path) : undefined, sourceInfo?.baseDir];
	for (const dir of candidates) {
		if (!dir) continue;
		let name = basename(dir);
		if (WRAPPER_DIRS.has(name)) name = basename(dirname(dir));
		const ns = name
			.toLowerCase()
			.replace(/^pi-/, "")
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "");
		if (ns) return ns;
	}
	return FALLBACK_NAMESPACE;
}

// INFO: fc 05aug26 candidates only. Which ones apply is decided per request in transformPayload,
// because only the outgoing payload says which names the transport accepts unaliased.
export function buildAliasIndex(
	tools: Array<{ name: string; sourceInfo?: { path?: string; baseDir?: string } }>,
): Map<string, AliasEntry> {
	const index = new Map<string, AliasEntry>();
	for (const tool of tools) {
		const nameLc = lower(tool.name);
		if (!nameLc || nameLc.startsWith("mcp__")) continue;
		const alias = `mcp__${namespaceFrom(tool.sourceInfo)}__${tool.name}`;
		if (!PROVIDER_TOOL_NAME_PATTERN.test(alias)) continue;
		index.set(nameLc, { flat: tool.name, alias });
	}
	return index;
}

export function transformPayload(
	raw: Record<string, unknown>,
	aliasIndex: Map<string, AliasEntry>,
	maps: AliasMaps,
): Record<string, unknown> {
	const payload = { ...raw };
	const tools = Array.isArray(payload.tools) ? payload.tools : [];

	const advertised = new Set<string>();
	for (const tool of tools) {
		if (isPlainObject(tool)) advertised.add(lower(tool.name));
	}

	// INFO: fc 05aug26 the transport renames every tool it accepts as-is to its own casing
	// (read -> Read) while building this payload, before the hook runs, so a name still spelled
	// exactly as registered is one it left alone, and that is the one needing an alias. Deriving
	// this beats copying the transport's private allowlist, where a stale copy would silently drop
	// an alias and get the request rejected.
	const resolve = (name: string): string | undefined => {
		const committed = maps.aliasByFlat.get(lower(name));
		if (committed) return committed;
		const candidate = aliasIndex.get(lower(name));
		if (!candidate || candidate.flat !== name) return undefined;
		if (advertised.has(lower(candidate.alias))) return undefined;
		maps.aliasByFlat.set(lower(candidate.flat), candidate.alias);
		maps.flatByAlias.set(lower(candidate.alias), candidate.flat);
		return candidate.alias;
	};

	for (const tool of tools) {
		if (isPlainObject(tool) && typeof tool.name === "string") resolve(tool.name);
	}

	const renames = [...aliasIndex.values()].filter((entry) => maps.flatByAlias.get(lower(entry.alias)) === entry.flat);

	if (payload.system !== undefined) {
		payload.system = rewriteSystemField(payload.system, renames);
	}

	if (Array.isArray(payload.tools)) {
		payload.tools = payload.tools.map((tool) => {
			if (!isPlainObject(tool) || typeof tool.name !== "string") return tool;
			if (typeof tool.type === "string" && tool.type.trim().length > 0) return tool;
			const alias = resolve(tool.name);
			const description =
				typeof tool.description === "string" ? rewriteNameReferences(tool.description, renames) : undefined;
			const descriptionChanged = description !== undefined && description !== tool.description;
			if (!alias && !descriptionChanged) return tool;
			return {
				...tool,
				...(alias ? { name: alias } : {}),
				...(descriptionChanged ? { description } : {}),
			};
		});
	}

	if (
		isPlainObject(payload.tool_choice) &&
		payload.tool_choice.type === "tool" &&
		typeof payload.tool_choice.name === "string"
	) {
		const alias = resolve(payload.tool_choice.name);
		if (alias) payload.tool_choice = { ...payload.tool_choice, name: alias };
	}

	if (Array.isArray(payload.messages)) {
		payload.messages = remapHistory(payload.messages, resolve);
	}

	return payload;
}

type AliasResolver = (name: string) => string | undefined;

function remapHistory(messages: unknown[], resolve: AliasResolver): unknown[] {
	let anyChanged = false;
	const result = messages.map((msg) => {
		if (!isPlainObject(msg) || !Array.isArray(msg.content)) return msg;
		let changed = false;
		const content = msg.content.map((block) => {
			const next = remapHistoryBlock(block, resolve);
			if (next !== block) changed = true;
			return next;
		});
		if (!changed) return msg;
		anyChanged = true;
		return { ...msg, content };
	});
	return anyChanged ? result : messages;
}

function remapHistoryBlock(block: unknown, resolve: AliasResolver): unknown {
	if (!isPlainObject(block)) return block;

	if (block.type === "tool_use" && typeof block.name === "string") {
		const alias = resolve(block.name);
		return alias && alias !== block.name ? { ...block, name: alias } : block;
	}

	if (block.type === "tool_result" && Array.isArray(block.content)) {
		let changed = false;
		const content = block.content.map((inner) => {
			if (isPlainObject(inner) && inner.type === "tool_reference" && typeof inner.tool_name === "string") {
				const alias = resolve(inner.tool_name);
				if (alias && alias !== inner.tool_name) {
					changed = true;
					return { ...inner, tool_name: alias };
				}
			}
			return inner;
		});
		return changed ? { ...block, content } : block;
	}

	return block;
}

// INFO: fc 02aug26 message_update has no replacement channel, and the TUI resolves a
// tool row's renderer from the streamed block name when the row is created, so the
// streamed alias must be rewritten by mutating the block the TUI will read.
export function unaliasToolCallsInPlace(message: unknown, maps: AliasMaps): void {
	if (!isPlainObject(message) || message.role !== "assistant" || !Array.isArray(message.content)) return;
	for (const block of message.content) {
		if (!isPlainObject(block) || block.type !== "toolCall" || typeof block.name !== "string") continue;
		const flat = maps.flatByAlias.get(lower(block.name));
		if (flat && flat !== block.name) block.name = flat;
	}
}

// INFO: fc 02aug26 runs on message_end, before pi resolves which tool to execute, so the original
// extension's execute closure handles the call. Only names this extension aliased are rewritten,
// real mcp__ tools from other extensions pass through untouched.
export function unaliasAssistantMessage(message: unknown, maps: AliasMaps): Record<string, unknown> | undefined {
	if (!isPlainObject(message) || message.role !== "assistant" || !Array.isArray(message.content)) return undefined;
	let changed = false;
	const content = message.content.map((block) => {
		if (!isPlainObject(block) || block.type !== "toolCall" || typeof block.name !== "string") return block;
		const flat = maps.flatByAlias.get(lower(block.name));
		if (!flat || flat === block.name) return block;
		changed = true;
		return { ...block, name: flat };
	});
	return changed ? { ...message, content } : undefined;
}

export default function oauthToolAlias(pi: ExtensionAPI): void {
	const maps = createAliasMaps();

	pi.on("session_start", () => {
		maps.aliasByFlat.clear();
		maps.flatByAlias.clear();
	});

	pi.on("before_provider_request", (event, ctx) => {
		const model = ctx.model;
		if (!model || model.provider !== "anthropic" || !ctx.modelRegistry.isUsingOAuth(model)) return undefined;
		if (!isPlainObject(event.payload)) return undefined;
		const aliasIndex = buildAliasIndex(pi.getAllTools());
		return transformPayload(event.payload as Record<string, unknown>, aliasIndex, maps);
	});

	pi.on("message_update", (event) => {
		unaliasToolCallsInPlace(event.message, maps);
	});

	pi.on("message_end", (event) => {
		const rewritten = unaliasAssistantMessage(event.message, maps);
		return rewritten ? { message: rewritten as typeof event.message } : undefined;
	});
}
