import assert from "node:assert/strict";
import { test } from "node:test";
import { type Deps, land, type Result } from "./land.ts";

const MERGE = "1111111111111111111111111111111111111111";
const HEAD = "2222222222222222222222222222222222222222";
const MAIN = "3333333333333333333333333333333333333333";
const TREE = "/home/fc/.paseo/worktrees/abc/feat-glass";

const ok = (stdout: unknown = ""): Result => ({
  status: 0,
  stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
  stderr: "",
});
const failed: Result = { status: 1, stdout: "", stderr: "" };

const worktreeList = (branch = "feat-glass", head = HEAD) =>
  `worktree /home/fc/app\nHEAD ${MAIN}\nbranch refs/heads/main\n\nworktree ${TREE}\nHEAD ${head}\nbranch refs/heads/${branch}\n`;

const mergedRepo = (): Record<string, Result | Result[]> => ({
  "gh pr view 330 --json state,url,headRefName,headRefOid,mergeCommit": ok({
    state: "MERGED",
    url: "https://github.com/fc/app/pull/330",
    headRefName: "feat-glass",
    headRefOid: HEAD,
    mergeCommit: { oid: MERGE },
  }),
  [`gh run list --commit ${MERGE} --event push --json databaseId,workflowName,url`]: ok([
    { databaseId: 7, workflowName: "server", url: "https://github.com/fc/app/actions/runs/7" },
  ]),
  "gh run watch 7 --exit-status --compact --interval 10": ok(),
  "gh run view 7 --json jobs": ok({
    jobs: [
      { name: "test", conclusion: "success" },
      { name: "deploy with Kamal", conclusion: "success" },
    ],
  }),
  "git worktree list --porcelain": ok(worktreeList()),
  [`git -C ${TREE} status --porcelain`]: ok(),
  "paseo workspace ls --background --json": ok([{ workspaceId: "wks_1", cwd: TREE }]),
  "paseo workspace archive wks_1": ok(),
  "git worktree prune": ok(),
  "git rev-parse --verify --quiet refs/heads/feat-glass": ok(`${HEAD}\n`),
  "git branch -D feat-glass": ok(),
  "git fetch -q --prune origin": ok(),
});

const fake = (responses: Record<string, Result | Result[]>) => {
  const calls: string[] = [];
  const lines: string[] = [];
  let pauses = 0;
  const deps: Deps = {
    run: (command, args) => {
      const key = [command, ...args].join(" ");
      calls.push(key);
      const response = responses[key];
      if (response === undefined) throw new Error(`unexpected command: ${key}`);
      return Array.isArray(response) ? (response.length > 1 ? response.shift()! : response[0]) : response;
    },
    log: (line) => lines.push(line),
    pause: async () => {
      pauses++;
    },
  };
  return { deps, calls, lines, pauses: () => pauses };
};

test("a merged PR whose deploy passes archives its Paseo worktree and deletes its local branch", async () => {
  const { deps, calls, lines } = fake(mergedRepo());
  assert.equal(await land([330], deps), true);
  assert.ok(calls.includes("paseo workspace archive wks_1"));
  assert.ok(calls.includes("git branch -D feat-glass"));
  assert.ok(lines.some((line) => line.includes("server passed, ran deploy with Kamal success")));
});

test("an open PR is reported and nothing is watched or cleaned", async () => {
  const repo = mergedRepo();
  repo["gh pr view 330 --json state,url,headRefName,headRefOid,mergeCommit"] = ok({
    state: "OPEN",
    url: "https://github.com/fc/app/pull/330",
    headRefName: "feat-glass",
    headRefOid: HEAD,
    mergeCommit: null,
  });
  const { deps, calls, lines } = fake(repo);
  assert.equal(await land([330], deps), false);
  assert.deepEqual(calls, ["gh pr view 330 --json state,url,headRefName,headRefOid,mergeCommit", "git fetch -q --prune origin"]);
  assert.match(lines[0], /is open, not merged/);
});

test("a failed run leaves the worktree and the branch in place, so the tab can investigate", async () => {
  const repo = mergedRepo();
  repo["gh run watch 7 --exit-status --compact --interval 10"] = failed;
  repo["gh run view 7 --json jobs"] = ok({ jobs: [{ name: "deploy with Kamal", conclusion: "failure" }] });
  const { deps, calls, lines } = fake(repo);
  assert.equal(await land([330], deps), false);
  assert.ok(!calls.some((call) => call.startsWith("paseo workspace archive") || call.startsWith("git branch -D")));
  assert.ok(lines.some((line) => line.includes("server failed in deploy with Kamal")));
});

test("a worktree with uncommitted changes is left alone, and so is its branch", async () => {
  const repo = mergedRepo();
  repo[`git -C ${TREE} status --porcelain`] = ok(" M app.rb\n");
  const { deps, calls } = fake(repo);
  assert.equal(await land([330], deps), false);
  assert.ok(!calls.some((call) => call.startsWith("paseo workspace archive") || call.startsWith("git branch -D")));
});

test("a local branch with commits the PR never got is kept", async () => {
  const repo = mergedRepo();
  repo["git worktree list --porcelain"] = ok(worktreeList("other-branch"));
  repo["git rev-parse --verify --quiet refs/heads/feat-glass"] = ok(`${MAIN}\n`);
  const { deps, calls, lines } = fake(repo);
  assert.equal(await land([330], deps), false);
  assert.ok(!calls.includes("git branch -D feat-glass"));
  assert.ok(lines.some((line) => line.includes("is not the PR head")));
});

test("a worktree Paseo already archived at merge leaves only the branch to delete", async () => {
  const repo = mergedRepo();
  repo["git worktree list --porcelain"] = ok(`worktree /home/fc/app\nHEAD ${MAIN}\nbranch refs/heads/main\n`);
  const { deps, calls } = fake(repo);
  assert.equal(await land([330], deps), true);
  assert.ok(!calls.some((call) => call.startsWith("paseo")));
  assert.ok(calls.includes("git branch -D feat-glass"));
});

test("a worktree outside Paseo is removed with git", async () => {
  const repo = mergedRepo();
  repo["paseo workspace ls --background --json"] = ok([]);
  repo[`git worktree remove ${TREE}`] = ok();
  const { deps, calls } = fake(repo);
  assert.equal(await land([330], deps), true);
  assert.ok(calls.includes(`git worktree remove ${TREE}`));
});

test("runs that GitHub has not listed yet are waited for, then listed once more for late siblings", async () => {
  const repo = mergedRepo();
  const listed = `gh run list --commit ${MERGE} --event push --json databaseId,workflowName,url`;
  const runs = repo[listed] as Result;
  repo[listed] = [ok([]), ok([]), runs];
  const { deps, pauses } = fake(repo);
  assert.equal(await land([330], deps), true);
  assert.equal(pauses(), 3);
});

test("a merge that triggered no workflow still lands", async () => {
  const repo = mergedRepo();
  repo[`gh run list --commit ${MERGE} --event push --json databaseId,workflowName,url`] = ok([]);
  const { deps, lines } = fake(repo);
  assert.equal(await land([330], deps), true);
  assert.ok(lines.some((line) => line.includes("no workflow ran")));
});
