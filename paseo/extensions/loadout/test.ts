import assert from "node:assert/strict";
import { test } from "node:test";

import { PASEO_TOOLS, paseoLoadout, paseoSkills } from "./loadout.ts";

const active = [
  "read",
  "bash",
  "spawn_agent",
  "wait_agent",
  "list_agents",
  "herdr_worktree_jump",
  "radio_agents",
  "radio_call",
  "websearch",
];

test("once Paseo's tools are registered, its core tools replace the subagents, the worktree jump and the radio", () => {
  const next = paseoLoadout(active, ["read", "bash", ...PASEO_TOOLS]);

  assert.deepEqual(next, ["read", "bash", "websearch", ...PASEO_TOOLS]);
});

test("before Paseo's MCP server connects, the active tools stay as they are", () => {
  assert.equal(paseoLoadout(active, ["read", "bash", "spawn_agent"]), active);
});

test("a Paseo tool the host disabled is not declared", () => {
  const registered = PASEO_TOOLS.filter((name) => !name.startsWith("mcp__paseo__browser_"));

  assert.ok(paseoLoadout(active, registered).every((name) => !name.startsWith("mcp__paseo__browser_")));
});

test("applying the loadout twice changes nothing", () => {
  const once = paseoLoadout(active, PASEO_TOOLS);

  assert.deepEqual(paseoLoadout(once, PASEO_TOOLS), once);
});

test("the agent-browser skill goes only when Paseo's browser tools are registered", () => {
  const skills = [{ name: "agent-browser" }, { name: "gog" }];

  assert.deepEqual(paseoSkills(skills, PASEO_TOOLS), [{ name: "gog" }]);
  assert.equal(paseoSkills(skills, ["mcp__paseo__create_agent"]), skills);
});
