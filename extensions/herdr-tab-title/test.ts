/** Self-check: npx tsx extensions/herdr-tab-title/test.ts */
import assert from "node:assert/strict";

import { borrowedLabel, endedLabel, MAX_LABEL_CHARS, truncateLabel } from "./labels.ts";

// A number is herdr's own tab position, recomputed as tabs move, so writing it back would pin a label that goes wrong.
assert.equal(borrowedLabel("3"), undefined);
assert.equal(borrowedLabel("42"), undefined);
assert.equal(borrowedLabel("dev"), "dev");
assert.equal(borrowedLabel("routeur 5G"), "routeur 5G");
assert.equal(borrowedLabel(undefined), undefined);

// A parenthesized baseline is a previous session's tombstone, not a label the user gave the tab.
assert.equal(borrowedLabel("(oauth-rotation)"), undefined);

assert.equal(endedLabel("oauth-rotation"), "(oauth-rotation)");
assert.equal(endedLabel("(oauth-rotation)"), "(oauth-rotation)");
assert.ok(endedLabel("x".repeat(80)).length <= MAX_LABEL_CHARS);
assert.equal(endedLabel("x".repeat(80)).at(-1), ")");

assert.equal(truncateLabel("  spaced  "), "spaced");
assert.equal(truncateLabel("x".repeat(80)).length, MAX_LABEL_CHARS);
