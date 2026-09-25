import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai";

import { readJson, writeJson } from "./files.ts";
import { sideCallModel, usingSubscription } from "./models.ts";
import { agentDir, homeRelative, wareDir } from "./paths.ts";

const model = (provider: string, id: string, input: number) => ({ provider, id, cost: { input } }) as Model<Api>;

test("agentDir follows PI_CODING_AGENT_DIR and expands a leading tilde, as pi does", () => {
  const saved = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_CODING_AGENT_DIR = "~/elsewhere";
    assert.equal(agentDir(), join(homedir(), "elsewhere"));
    process.env.PI_CODING_AGENT_DIR = "/tmp/agent";
    assert.equal(wareDir("radio"), "/tmp/agent/radio");
    delete process.env.PI_CODING_AGENT_DIR;
    assert.equal(agentDir(), join(homedir(), ".pi", "agent"));
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
  }
});

test("homeRelative shortens the home directory and nothing that merely starts like it", () => {
  assert.equal(homeRelative("/home/fc/code", "/home/fc"), "~/code");
  assert.equal(homeRelative("/home/fc", "/home/fc"), "~");
  assert.equal(homeRelative("/home/fcx/code", "/home/fc"), "/home/fcx/code");
});

test("readJson reads a missing file as nothing and a corrupt one as an error", () => {
  const dir = mkdtempSync(join(tmpdir(), "lib-"));
  assert.equal(readJson(join(dir, "absent.json")), undefined);
  writeFileSync(join(dir, "broken.json"), "{");
  assert.throws(() => readJson(join(dir, "broken.json")), SyntaxError);
});

test("writeJson creates the directory, writes private, and leaves no temporary file", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "lib-")), "nested");
  writeJson(join(dir, "state.json"), { ok: true });
  assert.deepEqual(readJson(join(dir, "state.json")), { ok: true });
  assert.equal(statSync(join(dir, "state.json")).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dir), ["state.json"]);
});

test("sideCallModel prefers haiku, then the cheapest anthropic model, never another provider", () => {
  const haiku = model("anthropic", "claude-haiku-4-5", 1);
  const sonnet = model("anthropic", "claude-sonnet-5", 3);
  const opus = model("anthropic", "claude-opus-5", 15);
  const gpt = model("openai-codex", "gpt-6-sol", 0.1);
  assert.equal(sideCallModel({ getAvailable: () => [opus, haiku, sonnet] }), haiku);
  assert.equal(sideCallModel({ getAvailable: () => [opus, sonnet] }), sonnet);
  assert.equal(sideCallModel({ getAvailable: () => [gpt] }), undefined);
});

test("usingSubscription needs OAuth and a provider that declares itself a subscription", () => {
  const opus = model("anthropic", "claude-opus-5", 15);
  const registry = (oauth: boolean, isSubscription: boolean) => ({
    isUsingOAuth: () => oauth,
    getProvider: () => ({ auth: { oauth: { isSubscription } } }),
  });
  assert.equal(usingSubscription(registry(true, true), opus), true);
  assert.equal(usingSubscription(registry(false, true), opus), false);
  assert.equal(usingSubscription(registry(true, false), opus), false);
  assert.equal(usingSubscription(registry(true, true), undefined), false);
});
