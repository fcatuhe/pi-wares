import assert from "node:assert/strict";
import { test } from "node:test";

import { borrowedLabel, endedLabel, MAX_LABEL_CHARS, truncateLabel } from "./labels.ts";

test("a numeric title is herdr's own tab position, recomputed as tabs move, so it is never borrowed", () => {
  assert.equal(borrowedLabel("3"), undefined);
  assert.equal(borrowedLabel("42"), undefined);
  assert.equal(borrowedLabel("dev"), "dev");
  assert.equal(borrowedLabel("routeur 5G"), "routeur 5G");
  assert.equal(borrowedLabel(undefined), undefined);
});

test("a parenthesized baseline is a previous session's tombstone, not a label the user gave the tab", () => {
  assert.equal(borrowedLabel("(oauth-rotation)"), undefined);
});

test("endedLabel parenthesizes once and keeps the closing parenthesis within the length cap", () => {
  assert.equal(endedLabel("oauth-rotation"), "(oauth-rotation)");
  assert.equal(endedLabel("(oauth-rotation)"), "(oauth-rotation)");
  assert.ok(endedLabel("x".repeat(80)).length <= MAX_LABEL_CHARS);
  assert.equal(endedLabel("x".repeat(80)).at(-1), ")");
});

test("truncateLabel trims whitespace and cuts to the length cap", () => {
  assert.equal(truncateLabel("  spaced  "), "spaced");
  assert.equal(truncateLabel("x".repeat(80)).length, MAX_LABEL_CHARS);
});
