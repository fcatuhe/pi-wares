import assert from "node:assert/strict";
import { test } from "node:test";

import { borrowedLabel, endedLabel, MAX_LABEL_CHARS, truncateLabel } from "./labels.ts";
import { latestRename } from "./paseo.ts";

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

test("latestRename sends only the latest of names pushed in a burst, and never repeats the synced one", async () => {
  const renamed: string[] = [];
  const push = latestRename(async (label) => {
    renamed.push(label);
  }, assert.fail);
  push("first");
  push("second");
  await push("third");
  await push("third");
  assert.deepEqual(renamed, ["third"]);
});

test("latestRename reports a failed rename and retries the same name on the next push", async () => {
  const errors: string[] = [];
  let fail = true;
  const renamed: string[] = [];
  const push = latestRename(
    async (label) => {
      if (fail) throw new Error("paseo: command not found");
      renamed.push(label);
    },
    (error) => errors.push(error.message),
  );
  await push("oauth-rotation");
  fail = false;
  await push("oauth-rotation");
  assert.deepEqual(errors, ["paseo: command not found"]);
  assert.deepEqual(renamed, ["oauth-rotation"]);
});
