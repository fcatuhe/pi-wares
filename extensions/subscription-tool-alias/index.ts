import { basename, dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_TOOL_NAME_LENGTH = 128;
const WRAPPER_DIRS = new Set(["extensions", "dist", "src", "build"]);
const FALLBACK_NAMESPACE = "local";

// INFO: fc 05aug26 each phrase carries enough of its stock sentence that a user's own "Raspberry Pi" cannot match it
const CLIENT_NAME_PHRASES: Array<[string, string]> = [
	["operating inside pi, a coding agent harness", "operating inside a coding agent harness"],
	[
		"Pi documentation (read only when the user asks about pi itself",
		"CLI documentation (read only when the user asks about the cli itself",
	],
	["When reading pi docs or examples", "When reading cli docs or examples"],
	["(docs/models.md), pi packages (docs/packages.md)", "(docs/models.md), cli packages (docs/packages.md)"],
	["When working on pi topics, read the docs and examples", "When working on cli topics, read the docs and examples"],
	["Always read pi .md files completely", "Always read cli .md files completely"],
];

export interface AliasMaps {
	aliasByFlat: Map<string, string>;
	flatByAlias: Map<string, string>;
}

type AliasResolver = (name: string) => string | undefined;

export function createAliasMaps(): AliasMaps {
	return { aliasByFlat: new Map(), flatByAlias: new Map() };
}

function lower(name: unknown): string {
	return typeof name === "string" ? name.trim().toLowerCase() : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function rewritePromptText(text: string): string {
	let result = text;
	for (const [phrase, replacement] of CLIENT_NAME_PHRASES) {
		result = result.replaceAll(phrase, replacement);
	}
	return result;
}

// INFO: fc 05aug26 pi declares each tool as "- <name>: <snippet>", never on a block's first line, which the newline anchors to
function rewriteToolDeclarations(text: string, renames: Array<[string, string]>): string {
	let result = text;
	for (const [flat, alias] of renames) {
		result = result.replaceAll(`\n- ${flat}:`, `\n- ${alias}:`);
	}
	return result;
}

function rewriteSystemField(system: unknown, renames: Array<[string, string]>): unknown {
	const rewrite = (text: string) => rewriteToolDeclarations(rewritePromptText(text), renames);
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

// INFO: fc 05aug26 truncate the namespace, never the flat name: the flat name is what routes the call back.
function aliasFor(name: string, sourceInfo?: { path?: string; baseDir?: string }): string | undefined {
	const room = MAX_TOOL_NAME_LENGTH - "mcp____".length - name.length;
	if (room < 1) return undefined;
	const alias = `mcp__${namespaceFrom(sourceInfo).slice(0, room)}__${name}`;
	return PROVIDER_TOOL_NAME_PATTERN.test(alias) ? alias : undefined;
}

export function buildAliasCandidates(
	tools: Array<{ name: string; sourceInfo?: { path?: string; baseDir?: string } }>,
): Map<string, string> {
	const candidates = new Map<string, string>();
	for (const tool of tools) {
		if (!tool.name || lower(tool.name).startsWith("mcp__")) continue;
		const alias = aliasFor(tool.name, tool.sourceInfo);
		if (alias) candidates.set(tool.name, alias);
	}
	return candidates;
}

export function transformPayload(
	raw: Record<string, unknown>,
	candidates: Map<string, string>,
	maps: AliasMaps,
): Record<string, unknown> {
	const payload = { ...raw };
	const tools = Array.isArray(payload.tools) ? payload.tools : [];

	const advertised = new Set<string>();
	for (const tool of tools) {
		if (isPlainObject(tool)) advertised.add(lower(tool.name));
	}

	// INFO: fc 05aug26 pi canonicalizes every tool this transport accepts as-is (read -> Read), so a name spelled as registered needs one
	const resolve: AliasResolver = (name) => {
		const committed = maps.aliasByFlat.get(name);
		if (committed) return committed;
		const candidate = candidates.get(name);
		if (!candidate || advertised.has(lower(candidate))) return undefined;
		maps.aliasByFlat.set(name, candidate);
		maps.flatByAlias.set(candidate, name);
		return candidate;
	};

	if (tools.length > 0) {
		payload.tools = tools.map((tool) => {
			if (!isPlainObject(tool) || typeof tool.name !== "string" || typeof tool.type === "string") return tool;
			const alias = resolve(tool.name);
			return alias ? { ...tool, name: alias } : tool;
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
		payload.messages = payload.messages.map((message) => remapHistoryMessage(message, resolve));
	}

	if (payload.system !== undefined) {
		payload.system = rewriteSystemField(payload.system, [...maps.aliasByFlat]);
	}

	return payload;
}

function remapHistoryMessage(message: unknown, resolve: AliasResolver): unknown {
	if (!isPlainObject(message) || !Array.isArray(message.content)) return message;
	return { ...message, content: message.content.map((block) => remapHistoryBlock(block, resolve)) };
}

function remapHistoryBlock(block: unknown, resolve: AliasResolver): unknown {
	if (!isPlainObject(block)) return block;

	if (block.type === "tool_use" && typeof block.name === "string") {
		const alias = resolve(block.name);
		return alias ? { ...block, name: alias } : block;
	}

	if (block.type === "tool_result" && Array.isArray(block.content)) {
		return {
			...block,
			content: block.content.map((inner) => {
				if (!isPlainObject(inner) || inner.type !== "tool_reference" || typeof inner.tool_name !== "string") {
					return inner;
				}
				const alias = resolve(inner.tool_name);
				return alias ? { ...inner, tool_name: alias } : inner;
			}),
		};
	}

	return block;
}

// INFO: fc 02aug26 message_update has no replacement channel and the TUI binds a tool row's renderer to the streamed name, so the block pi already holds is mutated.
export function unaliasToolCalls(message: unknown, maps: AliasMaps): boolean {
	if (!isPlainObject(message) || message.role !== "assistant" || !Array.isArray(message.content)) return false;
	let changed = false;
	for (const block of message.content) {
		if (!isPlainObject(block) || block.type !== "toolCall" || typeof block.name !== "string") continue;
		const flat = maps.flatByAlias.get(block.name);
		if (!flat) continue;
		block.name = flat;
		changed = true;
	}
	return changed;
}

export default function subscriptionToolAlias(pi: ExtensionAPI): void {
	const maps = createAliasMaps();

	pi.on("session_start", () => {
		maps.aliasByFlat.clear();
		maps.flatByAlias.clear();
	});

	// INFO: fc 06aug26 pi has no isUsingSubscription on the extension registry, so it is composed as its own ModelRuntime does (model-runtime.js:334)
	pi.on("before_provider_request", (event, ctx) => {
		const model = ctx.model;
		if (!model || model.provider !== "anthropic") return undefined;
		const subscription =
			ctx.modelRegistry.isUsingOAuth(model) &&
			ctx.modelRegistry.getProvider(model.provider)?.auth?.oauth?.isSubscription === true;
		if (!subscription) return undefined;
		if (!isPlainObject(event.payload)) return undefined;
		return transformPayload(event.payload as Record<string, unknown>, buildAliasCandidates(pi.getAllTools()), maps);
	});

	pi.on("message_update", (event) => {
		unaliasToolCalls(event.message, maps);
	});

	// INFO: fc 02aug26 message_end runs before pi resolves which tool to execute, so the flat tool's own execute closure handles the call.
	pi.on("message_end", (event) => (unaliasToolCalls(event.message, maps) ? { message: event.message } : undefined));
}
