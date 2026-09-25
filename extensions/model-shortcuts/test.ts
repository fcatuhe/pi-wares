import assert from "node:assert/strict";
import { test } from "node:test";
import { isLevel, LEVELS, parseShortcuts } from "./shortcuts.ts";

test("no file, an empty file, and a file holding anything but an object all mean no shortcuts", () => {
  assert.deepEqual(parseShortcuts(undefined), {});
  assert.deepEqual(parseShortcuts("   "), {});
  assert.deepEqual(parseShortcuts("[]"), {});
  assert.deepEqual(parseShortcuts('"glm"'), {});
});

test("corrupt JSON reaches the caller instead of vanishing", () => {
  assert.throws(() => parseShortcuts("{ not json"));
});

test("a full entry parses, and a missing thinking level stays undefined rather than a guessed default", () => {
  const full = '{"opus":{"provider":"anthropic","model":"claude-opus-5","thinkingLevel":"high"}}';
  assert.deepEqual(parseShortcuts(full), {
    opus: { provider: "anthropic", model: "claude-opus-5", thinkingLevel: "high" },
  });
  assert.deepEqual(parseShortcuts('{"opus":{"provider":"anthropic","model":"claude-opus-5"}}'), {
    opus: { provider: "anthropic", model: "claude-opus-5", thinkingLevel: undefined },
  });
});

test("an entry missing provider or model is dropped rather than registering a command that can only fail", () => {
  assert.deepEqual(parseShortcuts('{"opus":{"provider":"anthropic"}}'), {});
  assert.deepEqual(parseShortcuts('{"opus":{"model":"claude-opus-5"}}'), {});
  assert.deepEqual(parseShortcuts('{"opus":{"provider":"  ","model":"claude-opus-5"}}'), {});
  assert.deepEqual(parseShortcuts('{"opus":{"provider":7,"model":"claude-opus-5"}}'), {});
  assert.deepEqual(parseShortcuts('{"opus":"anthropic/claude-opus-5"}'), {});
  assert.deepEqual(parseShortcuts('{"opus":null}'), {});
});

test("an unknown thinking level is dropped, leaving the model's own default in place", () => {
  assert.deepEqual(parseShortcuts('{"o":{"provider":"a","model":"m","thinkingLevel":"ultra"}}'), {
    o: { provider: "a", model: "m", thinkingLevel: undefined },
  });
});

test("names colliding with the /off ... /max thinking commands are ignored, whitespace and all", () => {
  for (const level of LEVELS) {
    assert.deepEqual(parseShortcuts(`{"${level}":{"provider":"a","model":"m"}}`), {});
    assert.equal(isLevel(level), true);
  }
  assert.equal(isLevel("ultra"), false);
  assert.deepEqual(parseShortcuts('{"  ":{"provider":"a","model":"m"}}'), {});
  assert.deepEqual(parseShortcuts('{" opus ":{"provider":" anthropic ","model":" claude-opus-5 "}}'), {
    opus: { provider: "anthropic", model: "claude-opus-5", thinkingLevel: undefined },
  });
});
