/** Self-check: npx tsx extensions/subscription-tool-alias/test.ts */
import assert from "node:assert/strict";
import {
	buildAliasCandidates,
	createAliasMaps,
	namespaceFrom,
	rewritePromptText,
	transformPayload,
	unaliasToolCalls,
} from "./index.ts";

// Namespace derivation: package dir name minus pi- prefix, sanitized; wrapper dirs skipped.
assert.equal(namespaceFrom({ path: "/x/pi-codex-subagents/index.ts" }), "codex_subagents");
assert.equal(namespaceFrom({ path: "/x/pi-exa-mcp/extensions/index.ts" }), "exa_mcp");
assert.equal(namespaceFrom({ path: "/x/pi-wares/extensions/usage-pace/index.ts" }), "usage_pace");
assert.equal(namespaceFrom({ baseDir: "/x/brave-search-pi" }), "brave_search_pi");
// path wins over baseDir (baseDir can be a monorepo root).
assert.equal(namespaceFrom({ path: "/repo/packages/pi-foo/index.ts", baseDir: "/repo" }), "foo");
// Builtins have no source dir, and a namespace naming pi would undo the prompt neutralization.
assert.equal(namespaceFrom({ path: "<builtin:ls>" }), "local");
assert.equal(namespaceFrom(undefined), "local");

// A candidate for every registered tool except real mcp__ ones, whether it applies being a per-payload decision.
const registry = [
	{ name: "read", sourceInfo: { path: "<builtin:read>" } },
	{ name: "spawn_agent", sourceInfo: { path: "/x/pi-codex-subagents/index.ts" } },
	{ name: "wait_agent", sourceInfo: { path: "/x/pi-codex-subagents/index.ts" } },
	{ name: "wait_all_agents", sourceInfo: { path: "/x/pi-codex-subagents/index.ts" } },
	{ name: "mcp__linear__search", sourceInfo: { path: "/x/pi-linear/index.ts" } },
	{ name: "ls", sourceInfo: { path: "<builtin:ls>" } },
];
const candidates = buildAliasCandidates(registry);
assert.equal(candidates.has("mcp__linear__search"), false);
assert.equal(candidates.get("spawn_agent"), "mcp__codex_subagents__spawn_agent");
assert.equal(candidates.get("ls"), "mcp__local__ls");
assert.equal(candidates.get("read"), "mcp__local__read");

// A name the provider would reject as an alias is left without one.
assert.equal(buildAliasCandidates([{ name: "foo.bar", sourceInfo: { path: "/x/pi-a/i.ts" } }]).size, 0);

// Naming a tool as the transport spells its own opts out: canonicalized to "WebSearch", it misses the candidate map.
const firstParty = transformPayload(
	{ tools: [{ name: "WebSearch", input_schema: {} }] },
	buildAliasCandidates([{ name: "websearch", sourceInfo: { path: "/x/pi-wares/extensions/subscription-web-search/index.ts" } }]),
	createAliasMaps(),
);
assert.deepEqual((firstParty.tools as Array<{ name: string }>).map((tool) => tool.name), ["WebSearch"]);

// Names differing only in case are separate tools, and a lowercase-keyed index sent one out unaliased.
const caseCandidates = buildAliasCandidates([
	{ name: "Run", sourceInfo: { path: "/x/pi-alpha/index.ts" } },
	{ name: "run", sourceInfo: { path: "/x/pi-beta/index.ts" } },
]);
assert.equal(caseCandidates.get("Run"), "mcp__alpha__Run");
assert.equal(caseCandidates.get("run"), "mcp__beta__run");

// Over the provider's 128-char limit the namespace is truncated, never the flat name that routes the call back.
const longName = "a".repeat(100);
const longAlias = buildAliasCandidates([
	{ name: longName, sourceInfo: { path: "/x/pi-a-very-long-package-name/i.ts" } },
]).get(longName);
assert.equal(longAlias?.length, 128);
assert.ok(longAlias?.endsWith(`__${longName}`));
assert.equal(buildAliasCandidates([{ name: "b".repeat(125), sourceInfo: { path: "/x/pi-a/i.ts" } }]).size, 0);

// Payload transform: system, tools with their metadata, canonicalized and native passthrough, tool_choice, history.
const maps = createAliasMaps();
const payload = {
	system: [
		{
			type: "text",
			text: "Available tools:\n- ls: List directory contents\n- read: Read file contents\n- spawn_agent: Spawn a subagent\n\nRun ls before spawn_agent.",
			cache_control: { type: "ephemeral" },
		},
	],
	tools: [
		// "read" arriving as "Read" is how we know the transport accepts it unaliased, where "ls" needs one.
		{ name: "Read", description: "read", input_schema: {} },
		{ name: "ls", description: "list a directory", input_schema: {} },
		{
			name: "spawn_agent",
			description: "Use `wait_agent` or wait_all_agents only when needed.",
			input_schema: {},
			cache_control: { type: "ephemeral" },
		},
		{ name: "wait_agent", input_schema: {} },
		{ name: "wait_all_agents", input_schema: {} },
		{ name: "mcp__linear__search", description: "foreign mcp", input_schema: {} },
		{ type: "web_search_20250305", name: "web_search", description: "see spawn_agent" },
	],
	tool_choice: { type: "tool", name: "spawn_agent" },
	messages: [
		{
			role: "assistant",
			content: [{ type: "tool_use", id: "t1", name: "spawn_agent", input: {} }],
		},
		{
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "t1",
					content: [{ type: "tool_reference", tool_name: "wait_agent" }],
				},
			],
		},
	],
};
const out = transformPayload(payload, candidates, maps);
// The "Available tools" declarations follow the wire name, since they say what this payload carries.

// Prose mentioning a tool is left as the author wrote it, and a canonicalized declaration is untouched.
assert.equal(
	(out.system as any)[0].text,
	"Available tools:\n- mcp__local__ls: List directory contents\n- read: Read file contents\n- mcp__codex_subagents__spawn_agent: Spawn a subagent\n\nRun ls before spawn_agent.",
);
assert.equal((out.system as any)[0].cache_control.type, "ephemeral");
const outTool = (name: string) => (out.tools as any[]).find((tool) => tool.name === name);
assert.deepEqual(
	(out.tools as any[]).map((t) => t.name),
	[
		"Read",
		"mcp__local__ls",
		"mcp__codex_subagents__spawn_agent",
		"mcp__codex_subagents__wait_agent",
		"mcp__codex_subagents__wait_all_agents",
		"mcp__linear__search",
		"web_search",
	],
);
assert.equal(outTool("mcp__codex_subagents__spawn_agent").cache_control.type, "ephemeral");
// Descriptions are never rewritten, aliased tool or native typed one.
assert.equal(
	outTool("mcp__codex_subagents__spawn_agent").description,
	"Use `wait_agent` or wait_all_agents only when needed.",
);
assert.equal(outTool("web_search").description, "see spawn_agent");
assert.equal((out.tool_choice as any).name, "mcp__codex_subagents__spawn_agent");
assert.equal((out.messages as any)[0].content[0].name, "mcp__codex_subagents__spawn_agent");
assert.equal((out.messages as any)[1].content[0].content[0].tool_name, "mcp__codex_subagents__wait_agent");
// Original payload untouched.
assert.ok((payload.tools as any[]).some((tool) => tool.name === "spawn_agent"));
assert.equal((payload.messages[0].content[0] as { name: string }).name, "spawn_agent");

// Idempotency: transforming the transformed payload changes nothing.
assert.deepEqual(transformPayload(out, candidates, maps), out);

// A real tool already advertising the derived alias blocks the mapping, so its calls are never hijacked.
const collisionMaps = createAliasMaps();
const collisionOut = transformPayload(
	{
		tools: [
			{ name: "spawn_agent", input_schema: {} },
			{ name: "mcp__codex_subagents__spawn_agent", input_schema: {} },
		],
	},
	candidates,
	collisionMaps,
);
assert.deepEqual(
	(collisionOut.tools as any[]).map((t) => t.name),
	["spawn_agent", "mcp__codex_subagents__spawn_agent"],
);
assert.equal(
	unaliasToolCalls(
		{ role: "assistant", content: [{ type: "toolCall", id: "c0", name: "mcp__codex_subagents__spawn_agent" }] },
		collisionMaps,
	),
	false,
);

// Aliased calls return to their flat names in place, foreign mcp and canonicalized names are left alone.
const assistant = {
	role: "assistant",
	content: [
		{ type: "text", text: "spawning" },
		{ type: "toolCall", id: "c1", name: "mcp__codex_subagents__spawn_agent", arguments: {} },
		{ type: "toolCall", id: "c2", name: "mcp__codex_subagents__wait_agent", arguments: {} },
		{ type: "toolCall", id: "c3", name: "mcp__linear__search", arguments: {} },
		{ type: "toolCall", id: "c4", name: "Read", arguments: {} },
	],
};
assert.equal(unaliasToolCalls(assistant, maps), true);
assert.deepEqual(
	assistant.content.filter((b) => b.type === "toolCall").map((b) => b.name),
	["spawn_agent", "wait_agent", "mcp__linear__search", "Read"],
);
// Nothing to rename reports false, so the message_end hook leaves the message alone.
assert.equal(unaliasToolCalls({ role: "assistant", content: [{ type: "text", text: "hi" }] }, maps), false);
// A non-assistant message carrying an alias is not ours to rewrite.
const userMessage = {
	role: "user",
	content: [{ type: "toolCall", id: "u1", name: "mcp__codex_subagents__spawn_agent" }],
};
assert.equal(unaliasToolCalls(userMessage, maps), false);
assert.equal(userMessage.content[0]!.name, "mcp__codex_subagents__spawn_agent");

// A canonicalized name is left alone wherever it appears, history for an unadvertised tool included.
const historyMaps = createAliasMaps();
const historyOut = transformPayload(
	{
		messages: [
			{
				role: "assistant",
				content: [
					{ type: "tool_use", id: "h1", name: "Read", input: {} },
					{ type: "tool_use", id: "h2", name: "ls", input: {} },
				],
			},
		],
	},
	candidates,
	historyMaps,
);
assert.equal((historyOut.messages as any)[0].content[0].name, "Read");
assert.equal((historyOut.messages as any)[0].content[1].name, "mcp__local__ls");
// Anything put on the wire is reversible, so the call comes back to the registered name.
const historyCall = { role: "assistant", content: [{ type: "toolCall", id: "h3", name: "mcp__local__ls" }] };
assert.equal(unaliasToolCalls(historyCall, historyMaps), true);
assert.equal(historyCall.content[0]!.name, "ls");

// Client-name phrases from the stock prompt are neutralized.
assert.equal(
	rewritePromptText("You are an expert coding assistant operating inside pi, a coding agent harness."),
	"You are an expert coding assistant operating inside a coding agent harness.",
);
assert.equal(
	transformPayload(
		{ system: "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, or TUI):" },
		candidates,
		createAliasMaps(),
	).system,
	"CLI documentation (read only when the user asks about the cli itself, its SDK, extensions, or TUI):",
);
assert.equal(
	rewritePromptText("- When reading pi docs or examples, resolve docs/... under Additional docs"),
	"- When reading cli docs or examples, resolve docs/... under Additional docs",
);
assert.equal(
	rewritePromptText("adding models (docs/models.md), pi packages (docs/packages.md), environment variables"),
	"adding models (docs/models.md), cli packages (docs/packages.md), environment variables",
);
assert.equal(
	rewritePromptText("- When working on pi topics, read the docs and examples, and follow .md cross-references"),
	"- When working on cli topics, read the docs and examples, and follow .md cross-references",
);
assert.equal(
	rewritePromptText("- Always read pi .md files completely and follow links to related docs"),
	"- Always read cli .md files completely and follow links to related docs",
);

// Words that are not the product name survive: a general \bpi\b pass turned these into nonsense.
const unrelated = [
	"Calculate pi to 20 digits.",
	"See the Raspberry Pi documentation for pinout details.",
	"Pi documentation for the GPIO header lives on the vendor site.",
	"We keep pi docs and pi packages for the Raspberry Pi cluster in the wiki.",
	"- Main documentation: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/README.md",
];
for (const text of unrelated) {
	assert.equal(rewritePromptText(text), text);
}

