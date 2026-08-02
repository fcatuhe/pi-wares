/** Self-check: npx tsx extensions/pi-claude-wire/test.ts */
import assert from "node:assert/strict";
import {
	buildAliasIndex,
	createAliasMaps,
	namespaceFrom,
	rewriteSystemField,
	transformPayload,
	unaliasAssistantMessage,
} from "./index.ts";

// Namespace derivation: package dir name minus pi- prefix, sanitized; wrapper dirs skipped.
assert.equal(namespaceFrom({ path: "/x/pi-codex-subagents/index.ts" }), "codex_subagents");
assert.equal(namespaceFrom({ path: "/x/pi-exa-mcp/extensions/index.ts" }), "exa_mcp");
assert.equal(namespaceFrom({ path: "/x/pi-wares/extensions/usage-pace/index.ts" }), "usage_pace");
assert.equal(namespaceFrom({ baseDir: "/x/token-rate-pi" }), "token_rate_pi");
// path wins over baseDir (baseDir can be a monorepo root).
assert.equal(namespaceFrom({ path: "/repo/packages/pi-foo/index.ts", baseDir: "/repo" }), "foo");
// No usable source info falls back to the generic namespace.
assert.equal(namespaceFrom(undefined), "pi");
assert.equal(namespaceFrom({ path: "/---/index.ts" }), "pi");

// Alias index: core tools and real mcp__ tools are never aliased; everything else is.
const registry = [
	{ name: "read", sourceInfo: { path: "<builtin:read>" } },
	{ name: "spawn_agent", sourceInfo: { path: "/x/pi-codex-subagents/index.ts" } },
	{ name: "wait_agent", sourceInfo: { path: "/x/pi-codex-subagents/index.ts" } },
	{ name: "mcp__linear__search", sourceInfo: { path: "/x/pi-linear/index.ts" } },
	{ name: "handoff", sourceInfo: { path: "/x/pi-wares/extensions/handoff/index.ts" } },
];
const index = buildAliasIndex(registry);
assert.equal(index.has("read"), false);
assert.equal(index.has("mcp__linear__search"), false);
assert.equal(index.get("spawn_agent")?.alias, "mcp__codex_subagents__spawn_agent");
assert.equal(index.get("handoff")?.alias, "mcp__handoff__handoff");

// Payload transform: system rewrite, tool rename with metadata preserved, native and
// core passthrough, tool_choice and history remap.
const maps = createAliasMaps();
const payload = {
	system: [
		{ type: "text", text: "questions about pi itself and pi packages", cache_control: { type: "ephemeral" } },
	],
	tools: [
		{ name: "Read", description: "read", input_schema: {} },
		{ name: "spawn_agent", description: "dynamic templates list", input_schema: {}, cache_control: { type: "ephemeral" } },
		{ name: "mcp__linear__search", description: "foreign mcp", input_schema: {} },
		{ type: "web_search_20250305", name: "web_search" },
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
assert.equal((out.system as any)[0].text, "questions about the cli itself and cli packages");
assert.equal((out.system as any)[0].cache_control.type, "ephemeral");
const toolNames = (out.tools as any[]).map((t) => t.name);
assert.deepEqual(toolNames, ["Read", "mcp__codex_subagents__spawn_agent", "mcp__linear__search", "web_search"]);
assert.equal((out.tools as any)[1].cache_control.type, "ephemeral");
assert.equal((out.tools as any)[1].description, "dynamic templates list");
assert.equal((out.tool_choice as any).name, "mcp__codex_subagents__spawn_agent");
assert.equal((out.messages as any)[0].content[0].name, "mcp__codex_subagents__spawn_agent");
assert.equal((out.messages as any)[1].content[0].content[0].tool_name, "mcp__codex_subagents__wait_agent");
// Original payload untouched.
assert.equal((payload.tools as any)[1].name, "spawn_agent");
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

// System string form and absent tools survive.
const bare = transformPayload({ system: "about pi itself" }, index, createAliasMaps());
assert.equal(bare.system, "about the cli itself");

console.log("pi-claude-wire self-check passed");
