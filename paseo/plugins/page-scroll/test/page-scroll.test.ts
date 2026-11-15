import assert from "node:assert/strict";
import { test } from "node:test";
import { covers, nearestTo, pageStep, separatorOffset, separatorOffsets, type TreeNode } from "../client/page-scroll.ts";

function node(parentNode: TreeNode | null = null, name = ""): TreeNode & { name: string } {
  return { parentNode, name };
}

const root = node();
const leftPane = node(root);
const leftChat = node(leftPane, "left chat");
const leftComposer = node(leftPane);
const rightPane = node(root);
const rightChat = node(rightPane, "right chat");

test("picks the chat in the pane that holds the focus", () => {
  assert.equal(nearestTo([leftChat, rightChat], leftComposer)?.name, "left chat");
  assert.equal(nearestTo([leftChat, rightChat], rightPane)?.name, "right chat");
});

test("picks the first chat when nothing has focus", () => {
  assert.equal(nearestTo([rightChat, leftChat], null)?.name, "right chat");
});

test("picks nothing when no chat is visible", () => {
  assert.equal(nearestTo([], leftComposer), undefined);
});

// Chromium pages by 87.5% of the viewport, keeping at most 40px of overlap.
test("pages like the browser does", () => {
  assert.equal(pageStep(200), 175);
  assert.equal(pageStep(800), 760);
});

// The 40px both pages share has the separator in its middle, 20px from the edge that was left behind.
test("draws the separator in the middle of the lines both pages show", () => {
  assert.equal(separatorOffset(800, false), 780);
  assert.equal(separatorOffset(800, true), 20);
});

// After a full page down, the edge just left behind is also where Page Up would bring it back.
test("marks where both page keys would go in the middle of the chat", () => {
  assert.deepEqual(separatorOffsets({ viewportHeight: 800, scrollTop: 1520, scrollHeight: 5000, scrolled: 760, up: false }), [20, 780]);
});

test("keeps the edge left behind when the page stops short at the end", () => {
  assert.deepEqual(separatorOffsets({ viewportHeight: 800, scrollTop: 4200, scrollHeight: 5000, scrolled: 300, up: false }), [480, 20]);
});

test("marks no page above the start of the chat", () => {
  assert.deepEqual(separatorOffsets({ viewportHeight: 800, scrollTop: 0, scrollHeight: 5000, scrolled: -100, up: true }), [120, 780]);
});

const chatBox = { top: 100, right: 800, bottom: 900, left: 0 };

test("hides an overlay that sits over the chat", () => {
  assert.equal(covers({ top: 850, right: 400, bottom: 880, left: 16 }, chatBox), true);
});

test("keeps what only touches the edge of the chat", () => {
  assert.equal(covers({ top: 900, right: 800, bottom: 1000, left: 0 }, chatBox), false);
  assert.equal(covers({ top: 0, right: 800, bottom: 100.5, left: 0 }, chatBox), false);
});
