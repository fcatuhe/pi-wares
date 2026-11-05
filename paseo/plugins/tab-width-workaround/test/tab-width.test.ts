import assert from "node:assert/strict";
import { test } from "node:test";
import { naturalWidth, tabWidths } from "../client/tab-width.ts";

test("gives every tab its full width when the row has room", () => {
  assert.deepEqual(tabWidths([120, 410, 357], 1200), [120, 410, 357]);
});

test("never makes a tab narrower than the clickable minimum", () => {
  assert.deepEqual(tabWidths([30, 200], 1000), [64, 200]);
});

// 600px for three tabs: the 100px tab fits whole, and the two long ones split the other 500px.
test("keeps short tabs whole and shares the rest between the long ones", () => {
  assert.deepEqual(tabWidths([100, 410, 357], 600), [100, 250, 250]);
});

test("never hands out more than the row holds, even with fractions", () => {
  const widths = tabWidths([300, 300, 300], 700) ?? [];
  assert.ok(widths.reduce((total, width) => total + width, 0) <= 700);
});

test("leaves the row to Paseo when even the minimums do not fit", () => {
  assert.equal(tabWidths([200, 200, 200], 150), null);
});

// A 160px chip whose 126px label holds 376px of text, inside a handle with no slack, needs 160 - 126 + 376 + 1.
test("measures the width the full label needs", () => {
  assert.equal(naturalWidth({ chipWidth: 160, handleWidth: 140, handleContentWidth: 140, labelWidth: 126, labelFullWidth: 376 }), 411);
});

test("drops the empty space a renamed shorter label leaves in a wide chip", () => {
  assert.equal(naturalWidth({ chipWidth: 370, handleWidth: 350, handleContentWidth: 31, labelWidth: 13, labelFullWidth: 13 }), 52);
});
