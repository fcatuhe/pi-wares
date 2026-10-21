import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
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

test("git wt checks out a new or existing branch in ~/fcode/worktrees/<repo>/<branch>, and refuses a slash", () => {
  const home = mkdtempSync(join(tmpdir(), "policy-git-home-"));
  const repo = join(home, "fcode", "app");
  const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: join(import.meta.dirname, "../../../config/git/config") };
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
  git(repo, "branch", "fix-existing");

  const created = git(repo, "wt", "feat-x");
  assert.equal(created, join(home, "fcode", "worktrees", "app", "feat-x"));
  assert.equal(git(created, "branch", "--show-current"), "feat-x");
  assert.equal(
    git(created, "wt", "fix-existing"),
    join(home, "fcode", "worktrees", "app", "fix-existing"),
    "named after the main checkout, even from a worktree",
  );

  const slash = spawnSync("git", ["wt", "feat/y"], { cwd: repo, env, encoding: "utf8" });
  assert.notEqual(slash.status, 0);
  assert.match(slash.stderr, /no \/ in the branch/);
  assert.equal(existsSync(join(home, "fcode", "worktrees", "app", "feat")), false);
});

test("git wt branches from a fresh origin/HEAD whatever the main checkout holds, and tracks nothing so the first push sets the upstream", () => {
  const home = mkdtempSync(join(tmpdir(), "policy-git-home-"));
  const upstream = join(home, "upstream");
  const repo = join(home, "fcode", "app");
  const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: join(import.meta.dirname, "../../../config/git/config") };
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  const commit = (cwd: string, message: string) => git(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", message);
  execFileSync("git", ["init", "-q", "-b", "main", upstream]);
  commit(upstream, "init");
  execFileSync("git", ["clone", "-q", upstream, repo]);
  git(repo, "checkout", "-q", "-b", "feat-elsewhere");
  writeFileSync(join(repo, "wip.txt"), "uncommitted");
  commit(upstream, "landed on main after the clone");

  const fresh = git(repo, "wt", "feat-fresh");
  assert.equal(git(fresh, "log", "-1", "--format=%s"), "landed on main after the clone");
  assert.equal(existsSync(join(fresh, "wip.txt")), false);
  assert.equal(spawnSync("git", ["rev-parse", "--abbrev-ref", "feat-fresh@{upstream}"], { cwd: repo, env }).status, 128);

  const based = git(repo, "wt", "feat-based", "origin/main");
  assert.equal(git(based, "log", "-1", "--format=%s"), "landed on main after the clone");
  assert.equal(spawnSync("git", ["rev-parse", "--abbrev-ref", "feat-based@{upstream}"], { cwd: repo, env }).status, 128);
});

test("git wt checks out a branch that exists only on origin, tracking it, rather than starting a new one", () => {
  const home = mkdtempSync(join(tmpdir(), "policy-git-home-"));
  const upstream = join(home, "upstream");
  const repo = join(home, "fcode", "app");
  const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: join(import.meta.dirname, "../../../config/git/config") };
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  const commit = (cwd: string, message: string) => git(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", message);
  execFileSync("git", ["init", "-q", "-b", "main", upstream]);
  commit(upstream, "init");
  execFileSync("git", ["clone", "-q", upstream, repo]);
  git(upstream, "checkout", "-q", "-b", "docs-pushed-elsewhere");
  commit(upstream, "pushed from another machine");

  const checkedOut = git(repo, "wt", "docs-pushed-elsewhere");
  assert.equal(git(checkedOut, "log", "-1", "--format=%s"), "pushed from another machine");
  assert.equal(git(repo, "rev-parse", "--abbrev-ref", "docs-pushed-elsewhere@{upstream}"), "origin/docs-pushed-elsewhere");
});

test("git worktree add is refused in favour of git wt, which owns the worktree directory", () => {
  for (const command of ["git worktree add ../app-x -b feat-x", "git -C ~/fcode/app worktree add /tmp/x main"]) {
    assert.match(refusal(command)?.reason ?? "", /git wt <type>-<slug>/, command);
  }
  assert.equal(refusal("git worktree list && git worktree remove ../app-x"), undefined);
});

test("the extension checks bash only, and only where the git policy loads", async () => {
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
});
