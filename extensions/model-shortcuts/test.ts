/** Self-check: npx tsx extensions/model-shortcuts/test.ts */
import assert from "node:assert/strict";
import { isLevel, LEVELS, parseShortcuts } from "./shortcuts.ts";

// No file, an empty file, and a file holding anything but an object all mean "no shortcuts".
assert.deepEqual(parseShortcuts(undefined), {});
assert.deepEqual(parseShortcuts("   "), {});
assert.deepEqual(parseShortcuts("[]"), {});
assert.deepEqual(parseShortcuts('"glm"'), {});
// Corrupt JSON is a mistake worth reporting, so it reaches the caller instead of vanishing.
assert.throws(() => parseShortcuts("{ not json"));

const full = '{"opus":{"provider":"anthropic","model":"claude-opus-5","thinkingLevel":"high"}}';
assert.deepEqual(parseShortcuts(full), {
	opus: { provider: "anthropic", model: "claude-opus-5", thinkingLevel: "high" },
});
// Thinking level is optional, and stays undefined rather than guessing a default.
assert.deepEqual(parseShortcuts('{"opus":{"provider":"anthropic","model":"claude-opus-5"}}'), {
	opus: { provider: "anthropic", model: "claude-opus-5", thinkingLevel: undefined },
});

// Provider and model are what make a shortcut resolvable, so an entry missing either is dropped
// rather than registering a command that can only ever fail.
assert.deepEqual(parseShortcuts('{"opus":{"provider":"anthropic"}}'), {});
assert.deepEqual(parseShortcuts('{"opus":{"model":"claude-opus-5"}}'), {});
assert.deepEqual(parseShortcuts('{"opus":{"provider":"  ","model":"claude-opus-5"}}'), {});
assert.deepEqual(parseShortcuts('{"opus":{"provider":7,"model":"claude-opus-5"}}'), {});
assert.deepEqual(parseShortcuts('{"opus":"anthropic/claude-opus-5"}'), {});
assert.deepEqual(parseShortcuts('{"opus":null}'), {});

// A level the extension does not know is dropped, leaving the model's own default in place.
assert.deepEqual(parseShortcuts('{"o":{"provider":"a","model":"m","thinkingLevel":"ultra"}}'), {
	o: { provider: "a", model: "m", thinkingLevel: undefined },
});

// Names collide with the /off ... /max commands registered for thinking, so they are ignored,
// and surrounding whitespace never reaches a slash command.
for (const level of LEVELS) {
	assert.deepEqual(parseShortcuts(`{"${level}":{"provider":"a","model":"m"}}`), {});
	assert.equal(isLevel(level), true);
}
assert.equal(isLevel("ultra"), false);
assert.deepEqual(parseShortcuts('{"  ":{"provider":"a","model":"m"}}'), {});
assert.deepEqual(parseShortcuts('{" opus ":{"provider":" anthropic ","model":" claude-opus-5 "}}'), {
	opus: { provider: "anthropic", model: "claude-opus-5", thinkingLevel: undefined },
});

