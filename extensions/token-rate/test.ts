import assert from "node:assert/strict";
import { test } from "node:test";
import { format, record, tokensPerSecond, WINDOW_SAMPLES } from "./rate.ts";

test("no samples means no rate", () => {
  assert.equal(format([]), undefined);
  assert.equal(tokensPerSecond([]), undefined);
});

test("the rate is token-weighted across the window, not a mean of per-message rates", () => {
  const mixed = [
    { tokens: 1000, seconds: 10 },
    { tokens: 500, seconds: 20 },
  ];
  // 1500 tokens over 30s
  assert.equal(tokensPerSecond(mixed), 50);
  assert.equal(format(mixed), "50 tok/s");
  assert.equal(format([{ tokens: 419, seconds: 10 }]), "42 tok/s");
});

test("a single-chunk message or an empty reply is not recorded, both make the rate nonsense", () => {
  assert.deepEqual(record([], { tokens: 800, seconds: 0 }), []);
  assert.deepEqual(record([], { tokens: 0, seconds: 4 }), []);
  assert.deepEqual(record([], { tokens: 800, seconds: Number.POSITIVE_INFINITY }), []);
});

test("the window keeps only the latest samples", () => {
  let samples: { tokens: number; seconds: number }[] = [];
  for (let i = 1; i <= WINDOW_SAMPLES + 3; i++) samples = record(samples, { tokens: i * 100, seconds: 1 });
  assert.equal(samples.length, WINDOW_SAMPLES);
  assert.equal(samples[0].tokens, 400);
  assert.equal(format(samples), "600 tok/s");
});
