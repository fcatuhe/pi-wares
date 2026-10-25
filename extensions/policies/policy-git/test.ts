import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { refusal, subject } from "./check.ts";

test("a Conventional Commit subject passes, with or without scope and breaking mark", () => {
  for (const command of [
    'git commit -m "feat(policies): fold the check in"',
    "git add -A && git commit -m 'fix: take the version from the lockfile'",
    'git -C ../repo commit -m "refactor!: drop the table"',
    'git commit -m "fixup! docs: tighten"',
  ]) {
    assert.equal(refusal(command), undefined, command);
  }
});

test("a subject without a known type is refused, naming the subject and the types", () => {
  for (const command of ['git commit -m "Update policies"', 'git commit -m "chore: bump"', 'git commit -m "feat:no space"']) {
    assert.match(refusal(command)?.reason ?? "", /not a Conventional Commit subject.*feat\|fix\|ui/, command);
  }
});

test("a heredoc message is judged by its first line", () => {
  const command = `git commit -m "$(cat <<'EOF'\nUpdate stuff\n\nBody.\nEOF\n)"`;
  assert.equal(subject(command), "Update stuff");
  assert.equal(refusal(command.replace("Update stuff", "docs: update stuff")), undefined);
});

test("what it cannot read, it lets through: no -m, a message file, an amend, anything that is not a commit", () => {
  for (const command of ["git commit", "git commit -F msg.txt", "git commit --amend --no-edit", 'echo "git log -m x"', "git status"]) {
    assert.equal(refusal(command), undefined, command);
  }
});

test("a new branch with a slash is refused, naming the hyphenated form", () => {
  for (const command of [
    "git checkout -b feat/exempt-user-role",
    "git -C ../repo switch -c 'feat/exempt-user-role'",
    "git switch --create feat/exempt-user-role",
    "git fetch && git branch feat/exempt-user-role origin/main",
    "herdr worktree create --cwd . --branch feat/exempt-user-role --no-focus",
  ]) {
    assert.match(refusal(command)?.reason ?? "", /"feat\/exempt-user-role".*as in feat-exempt-user-role\./, command);
  }
});

test("a hyphenated branch, or a slash anywhere but a new branch name, passes", () => {
  for (const command of [
    "git checkout -b feat-exempt-user-role",
    "git checkout origin/main -- app/models/user.rb",
    "git branch -r | grep origin/",
    "git branch --show-current | tr / -",
    "git switch feat/existing",
    "herdr worktree create --cwd ~/fcode/app --branch feat-x",
  ]) {
    assert.equal(refusal(command), undefined, command);
  }
});

test("git worktree add is refused in favour of create_workspace, so Paseo lists and archives the worktree", () => {
  for (const command of ["git worktree add ../app-x -b feat-x", "git -C ~/fcode/app worktree add /tmp/x main"]) {
    assert.match(refusal(command)?.reason ?? "", /create_workspace/, command);
  }
  assert.equal(refusal("git worktree list && git worktree remove ../app-x"), undefined);
});

test("the extension checks bash and the worktree tools, and only where the git policy loads", async () => {
  const handlers: Record<string, (event: unknown) => Promise<unknown>> = {};
  process.chdir(mkdtempSync(join(tmpdir(), "policy-git-")));
  const load = (await import("./index.ts")).default;
  load({ on: (event: string, fn: never) => (handlers[event] = fn) } as never);
  assert.equal(handlers.tool_call, undefined, "outside a repository nothing is registered");

  process.chdir(join(import.meta.dirname, ".."));
  load({ on: (event: string, fn: never) => (handlers[event] = fn) } as never);
  const call = (toolName: string, input: object) => handlers.tool_call({ toolName, input });
  assert.equal(((await call("bash", { command: 'git commit -m "wip"' })) as { block: boolean }).block, true);
  assert.equal(await call("write", { path: "x", content: 'git commit -m "wip"' }), undefined);
  assert.equal(((await call("herdr_worktree_jump", { branch: "feat/x" })) as { block: boolean }).block, true);
  assert.equal(await call("herdr_worktree_jump", { branch: "feat-x" }), undefined);
  assert.equal(await call("herdr_worktree_jump", {}), undefined);
  assert.equal(((await call("mcp__paseo__create_workspace", { branchName: "feat/x" })) as { block: boolean }).block, true);
  assert.equal(await call("mcp__paseo__create_workspace", { branchName: "feat-x" }), undefined);
  assert.equal(await call("mcp__paseo__create_workspace", { mode: "checkout-branch", branch: "dependabot/npm/x" }), undefined);
});
