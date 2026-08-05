/** Self-check: npx tsx extensions/oauth-tool-alias/test.ts */
import assert from "node:assert/strict";
import {
	buildAliasIndex,
	createAliasMaps,
	namespaceFrom,
	rewritePromptText,
	rewriteToolDeclarations,
	transformPayload,
	unaliasAssistantMessage,
	unaliasToolCallsInPlace,
} from "./index.ts";

// Namespace derivation: package dir name minus pi- prefix, sanitized; wrapper dirs skipped.
assert.equal(namespaceFrom({ path: "/x/pi-codex-subagents/index.ts" }), "codex_subagents");
assert.equal(namespaceFrom({ path: "/x/pi-exa-mcp/extensions/index.ts" }), "exa_mcp");
assert.equal(namespaceFrom({ path: "/x/pi-wares/extensions/usage-pace/index.ts" }), "usage_pace");
assert.equal(namespaceFrom({ baseDir: "/x/token-rate-pi" }), "token_rate_pi");
// path wins over baseDir (baseDir can be a monorepo root).
assert.equal(namespaceFrom({ path: "/repo/packages/pi-foo/index.ts", baseDir: "/repo" }), "foo");
// No usable source info falls back to a namespace that does not name the harness: builtins
// have no source dir, and mcp__pi__ls on the wire would undo the prompt neutralization.
assert.equal(namespaceFrom(undefined), "local");
assert.equal(namespaceFrom({ path: "/---/index.ts" }), "local");
assert.equal(namespaceFrom({ path: "<builtin:ls>" }), "local");

// Alias index holds a candidate for every registered tool except real mcp__ ones. Whether a
// candidate applies is decided per payload, not here.
const registry = [
	{ name: "read", sourceInfo: { path: "<builtin:read>" } },
	{ name: "spawn_agent", sourceInfo: { path: "/x/pi-codex-subagents/index.ts" } },
	{ name: "wait_agent", sourceInfo: { path: "/x/pi-codex-subagents/index.ts" } },
	{ name: "wait_all_agents", sourceInfo: { path: "/x/pi-codex-subagents/index.ts" } },
	{ name: "mcp__linear__search", sourceInfo: { path: "/x/pi-linear/index.ts" } },
	{ name: "handoff", sourceInfo: { path: "/x/pi-wares/extensions/handoff/index.ts" } },
	{ name: "ls", sourceInfo: { path: "<builtin:ls>" } },
	{ name: "find", sourceInfo: { path: "<builtin:find>" } },
];
const index = buildAliasIndex(registry);
assert.equal(index.has("mcp__linear__search"), false);
assert.equal(index.get("spawn_agent")?.alias, "mcp__codex_subagents__spawn_agent");
assert.equal(index.get("handoff")?.alias, "mcp__handoff__handoff");
assert.equal(index.get("ls")?.alias, "mcp__local__ls");
assert.equal(index.get("read")?.alias, "mcp__local__read");

// Names differing only in case are separate tools in the registry, so they keep separate
// aliases. A lowercase-keyed index dropped one of them, and it went out unaliased.
const caseIndex = buildAliasIndex([
	{ name: "Run", sourceInfo: { path: "/x/pi-alpha/index.ts" } },
	{ name: "run", sourceInfo: { path: "/x/pi-beta/index.ts" } },
]);
assert.equal(caseIndex.get("Run")?.alias, "mcp__alpha__Run");
assert.equal(caseIndex.get("run")?.alias, "mcp__beta__run");

// Over the provider's 128-char name limit the namespace is truncated, never the flat name:
// the flat name is what routes the call back. Skipped only when it cannot fit at all.
const longName = "a".repeat(100);
const longAlias = buildAliasIndex([{ name: longName, sourceInfo: { path: "/x/pi-a-very-long-package-name/i.ts" } }]).get(
	longName,
)?.alias;
assert.equal(longAlias?.length, 128);
assert.ok(longAlias?.endsWith(`__${longName}`));
assert.equal(buildAliasIndex([{ name: "b".repeat(125), sourceInfo: { path: "/x/pi-a/i.ts" } }]).size, 0);

// Payload transform: system rewrite, tool rename with metadata preserved, canonicalized and
// native passthrough, tool_choice and history remap.
const maps = createAliasMaps();
const payload = {
	system: [
		{
			type: "text",
			text: "Available tools:\n- ls: List directory contents\n- read: Read file contents\n\nRun ls before spawn_agent.",
			cache_control: { type: "ephemeral" },
		},
	],
	tools: [
		// The transport canonicalized the registered "read" to "Read" before this hook, which is
		// how we know it accepts that name unaliased. "ls" came through untouched, so it needs one.
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
const out = transformPayload(payload, index, maps);
// System text: the "Available tools" declaration follows the wire name, since it tells the model
// which tools exist in this payload. Prose mentioning a tool is left as the author wrote it, and
// the declaration for a tool the transport canonicalized is untouched.
assert.equal(
	(out.system as any)[0].text,
	"Available tools:\n- mcp__local__ls: List directory contents\n- read: Read file contents\n\nRun ls before spawn_agent.",
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
assert.equal(payload.messages[0].content[0].name, "spawn_agent");

// Idempotency: transforming the transformed payload changes nothing.
const again = transformPayload(out, index, maps);
assert.deepEqual(again, out);

// Collision: a real tool already advertising the derived alias name blocks the mapping,
// so the flat tool passes through and the real tool's calls are never hijacked.
const collisionMaps = createAliasMaps();
const collisionOut = transformPayload(
	{
		tools: [
			{ name: "spawn_agent", input_schema: {} },
			{ name: "mcp__codex_subagents__spawn_agent", input_schema: {} },
		],
	},
	index,
	collisionMaps,
);
assert.deepEqual(
	(collisionOut.tools as any[]).map((t) => t.name),
	["spawn_agent", "mcp__codex_subagents__spawn_agent"],
);
assert.equal(
	unaliasAssistantMessage(
		{ role: "assistant", content: [{ type: "toolCall", id: "c0", name: "mcp__codex_subagents__spawn_agent", arguments: {} }] },
		collisionMaps,
	),
	undefined,
);

// message_end unalias: aliased calls return to their flat names, foreign mcp calls and
// wait_agent (aliased via history remap earlier) resolve correctly.
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
const rewritten = unaliasAssistantMessage(assistant, maps);
assert.ok(rewritten);
const names = (rewritten!.content as any[]).filter((b) => b.type === "toolCall").map((b) => b.name);
assert.deepEqual(names, ["spawn_agent", "wait_agent", "mcp__linear__search", "Read"]);
// Untouched messages return undefined so the hook leaves them alone.
assert.equal(unaliasAssistantMessage({ role: "assistant", content: [{ type: "text", text: "hi" }] }, maps), undefined);
assert.equal(unaliasAssistantMessage({ role: "user", content: [] }, maps), undefined);

// A canonicalized name is left alone wherever it appears, including history for a tool the
// current request no longer advertises. An untouched one is aliased from the registry there too.
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
	index,
	historyMaps,
);
assert.equal((historyOut.messages as any)[0].content[0].name, "Read");
assert.equal((historyOut.messages as any)[0].content[1].name, "mcp__local__ls");
// Anything put on the wire is reversible, so the call comes back to the registered name.
assert.equal(
	(unaliasAssistantMessage(
		{ role: "assistant", content: [{ type: "toolCall", id: "h3", name: "mcp__local__ls", arguments: {} }] },
		historyMaps,
	)?.content as any)[0].name,
	"ls",
);

// Client-name phrases from the stock prompt are neutralized.
assert.equal(
	transformPayload({ system: "questions about pi itself and pi packages" }, index, createAliasMaps()).system,
	"questions about the cli itself and cli packages",
);
assert.equal(
	rewritePromptText("When reading pi docs, working on pi topics, always read pi .md files completely"),
	"When reading cli docs, working on cli topics, always read cli .md files completely",
);
assert.equal(rewritePromptText("Pi documentation (read only when asked)"), "CLI documentation (read only when asked)");

// Words that are not the product name survive: a general \bpi\b pass turned these into nonsense
// in project instructions, and the heading rewrite is line-anchored for the same reason.
const unrelated = [
	"Calculate pi to 20 digits.",
	"Raspberry Pi support is required.",
	"See the Raspberry Pi documentation for pinout details.",
	"- Main documentation: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/README.md",
	"PI_SESSION_ID stays a variable name",
];
for (const text of unrelated) {
	assert.equal(rewritePromptText(text), text);
}

// Only a declaration at line start is renamed, and renaming it twice is a no-op. Prose is left
// alone: the stock guideline below is about the shell commands, and rewriting mentions fed the
// model "like mcp__local__ls, rg, mcp__local__find".
const declRenames = [
	{ flat: "ls", alias: "mcp__local__ls" },
	{ flat: "find", alias: "mcp__local__find" },
	{ flat: "spawn_agent", alias: "mcp__codex_subagents__spawn_agent" },
];
const declared = rewriteToolDeclarations("- ls: List directory contents\n- find: Find files by glob pattern", declRenames);
assert.equal(declared, "- mcp__local__ls: List directory contents\n- mcp__local__find: Find files by glob pattern");
assert.equal(rewriteToolDeclarations(declared, declRenames), declared);
const prose = "Use bash for file operations like ls, rg, find. Call `spawn_agent` or ls - now.";
assert.equal(rewriteToolDeclarations(prose, declRenames), prose);

// Streaming unalias mutates the toolCall blocks in place (the TUI reads the same
// objects when it creates tool rows mid-stream), leaving foreign names alone.
const streaming = {
	role: "assistant",
	content: [
		{ type: "toolCall", id: "s1", name: "mcp__codex_subagents__spawn_agent", arguments: {} },
		{ type: "toolCall", id: "s2", name: "mcp__linear__search", arguments: {} },
		{ type: "text", text: "working" },
	],
};
unaliasToolCallsInPlace(streaming, maps);
assert.equal(streaming.content[0]!.name, "spawn_agent");
assert.equal(streaming.content[1]!.name, "mcp__linear__search");
unaliasToolCallsInPlace({ role: "user", content: [] }, maps);

console.log("oauth-tool-alias self-check passed");
