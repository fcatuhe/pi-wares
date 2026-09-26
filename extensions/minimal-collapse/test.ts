import assert from "node:assert/strict";
import { test } from "node:test";
import { minimalHeader } from "./headers.ts";

const HOME = "/home/ada";

const header = (toolName: string, args: Record<string, unknown>) => minimalHeader(toolName, args, HOME);

test("read shows the path under home as ~, with the requested line range", () => {
  assert.deepEqual(header("read", { path: "/home/ada/app/user.rb", offset: 10, limit: 31 }), {
    title: "read",
    target: "~/app/user.rb",
    detail: ":10-40",
  });
  assert.equal(header("read", { path: "app/user.rb" }).detail, "");
  assert.equal(header("read", { path: "/home/adam/notes.md" }).target, "/home/adam/notes.md");
});

test("bash keeps one line of a multi-line command and says there is more", () => {
  assert.deepEqual(header("bash", { command: "cd app\nnpm test", timeout: 60 }), {
    title: "$",
    target: "cd app ...",
    detail: " (timeout 60s)",
  });
  assert.equal(header("bash", { command: "npm test\n" }).target, "npm test");
});

test("write and edit summarize their payload instead of printing it", () => {
  assert.equal(header("write", { path: "a.txt", content: "one\ntwo" }).detail, " (2 lines)");
  assert.equal(header("write", { path: "a.txt", content: "" }).detail, "");
  assert.equal(header("edit", { path: "a.txt", edits: [{}, {}, {}] }).detail, " (3 edits)");
  assert.equal(header("edit", { path: "a.txt", edits: [{}] }).detail, "");
});

test("arguments still streaming in do not break the header", () => {
  assert.deepEqual(header("bash", {}), { title: "$", target: "", detail: "" });
  assert.deepEqual(header("read", { path: 42 }), { title: "read", target: "", detail: "" });
});
