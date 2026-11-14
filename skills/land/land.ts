export type Result = { status: number; stdout: string; stderr: string };
export type Run = (command: string, args: string[]) => Result;
export type Deps = { run: Run; log: (line: string) => void; pause: (ms: number) => Promise<void> };

type PullRequest = { state: string; url: string; headRefName: string; headRefOid: string; mergeCommit: { oid: string } | null };
type WorkflowRun = { databaseId: number; workflowName: string; url: string };
type Job = { name: string; conclusion: string };
type Worktree = { path: string; head: string; branch?: string };

const RUN_POLLS = 12;
const RUN_POLL_MS = 10_000;
const DEPLOY_JOB = /deploy|release|publish/i;

export async function land(prs: number[], deps: Deps): Promise<boolean> {
  let landed = true;
  for (const number of prs) {
    if (!(await landOne(number, deps))) landed = false;
  }
  must(deps, "git", ["fetch", "-q", "--prune", "origin"]);
  return landed;
}

async function landOne(number: number, deps: Deps): Promise<boolean> {
  const log = (line: string) => deps.log(`#${number} ${line}`);
  const pr: PullRequest = JSON.parse(
    must(deps, "gh", ["pr", "view", String(number), "--json", "state,url,headRefName,headRefOid,mergeCommit"]),
  );
  if (pr.state !== "MERGED" || !pr.mergeCommit) {
    log(`is ${pr.state.toLowerCase()}, not merged: ${pr.url}`);
    return false;
  }

  if (!(await deployed(pr.mergeCommit.oid, log, deps))) {
    log("left everything in place, since a run failed");
    return false;
  }
  return cleanUp(pr, log, deps);
}

async function deployed(sha: string, log: (line: string) => void, deps: Deps): Promise<boolean> {
  const runs = await runsOn(sha, deps);
  if (runs.length === 0) log(`no workflow ran on merge commit ${sha.slice(0, 8)}`);

  let green = true;
  for (const run of runs) {
    const id = String(run.databaseId);
    const watch = deps.run("gh", ["run", "watch", id, "--exit-status", "--compact", "--interval", "10"]);
    const { jobs }: { jobs: Job[] } = JSON.parse(must(deps, "gh", ["run", "view", id, "--json", "jobs"]));
    const deploys = jobs.filter((job) => DEPLOY_JOB.test(job.name) && job.conclusion !== "skipped");
    const ran = deploys.map((job) => `${job.name} ${job.conclusion}`).join(", ");
    if (watch.status === 0) {
      log(`${run.workflowName} passed${ran ? `, ran ${ran}` : ""}: ${run.url}`);
      continue;
    }
    green = false;
    const failed = jobs.filter((job) => job.conclusion === "failure").map((job) => job.name);
    log(`${run.workflowName} failed${failed.length ? ` in ${failed.join(", ")}` : ""}: ${run.url}`);
  }
  return green;
}

async function runsOn(sha: string, deps: Deps): Promise<WorkflowRun[]> {
  const list = (): WorkflowRun[] =>
    JSON.parse(must(deps, "gh", ["run", "list", "--commit", sha, "--event", "push", "--json", "databaseId,workflowName,url"]));
  let runs = list();
  if (runs.length > 0) return runs;
  for (let poll = 1; poll < RUN_POLLS && runs.length === 0; poll++) {
    await deps.pause(RUN_POLL_MS);
    runs = list();
  }
  if (runs.length === 0) return runs;
  // INFO: fc 14nov26 GitHub can list a merge's first run before its siblings, so a run found only after waiting gets one more look
  await deps.pause(RUN_POLL_MS);
  return list();
}

function cleanUp(pr: PullRequest, log: (line: string) => void, deps: Deps): boolean {
  const branch = pr.headRefName;
  const [main, ...linked] = worktrees(deps);
  if (main.branch === branch) {
    log(`left ${branch} alone, since the main checkout has it checked out`);
    return false;
  }

  const worktree = linked.find((tree) => tree.branch === branch);
  if (worktree && !removeWorktree(worktree, pr, log, deps)) return false;
  must(deps, "git", ["worktree", "prune"]);

  const tip = deps.run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).stdout.trim();
  if (!tip) {
    log(`landed, and no local ${branch} was left`);
    return true;
  }
  if (tip !== pr.headRefOid) {
    log(`left local ${branch} alone, since its tip ${tip.slice(0, 8)} is not the PR head ${pr.headRefOid.slice(0, 8)}`);
    return false;
  }
  must(deps, "git", ["branch", "-D", branch]);
  log(`landed, and deleted local ${branch}`);
  return true;
}

function removeWorktree(worktree: Worktree, pr: PullRequest, log: (line: string) => void, deps: Deps): boolean {
  if (must(deps, "git", ["-C", worktree.path, "status", "--porcelain"]).trim()) {
    log(`left worktree ${worktree.path} alone, since it has uncommitted changes`);
    return false;
  }
  if (worktree.head !== pr.headRefOid) {
    log(`left worktree ${worktree.path} alone, since its HEAD ${worktree.head.slice(0, 8)} is not the PR head`);
    return false;
  }

  const workspaces: { workspaceId: string; cwd: string }[] = JSON.parse(
    must(deps, "paseo", ["workspace", "ls", "--background", "--json"]),
  );
  const workspace = workspaces.find((candidate) => candidate.cwd === worktree.path);
  if (workspace) {
    must(deps, "paseo", ["workspace", "archive", workspace.workspaceId]);
    log(`archived Paseo workspace ${workspace.workspaceId}`);
  } else {
    must(deps, "git", ["worktree", "remove", worktree.path]);
    log(`removed worktree ${worktree.path}`);
  }
  return true;
}

function worktrees(deps: Deps): Worktree[] {
  return must(deps, "git", ["worktree", "list", "--porcelain"])
    .trim()
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n");
      const field = (name: string) => lines.find((line) => line.startsWith(`${name} `))?.slice(name.length + 1);
      return { path: field("worktree") ?? "", head: field("HEAD") ?? "", branch: field("branch")?.replace(/^refs\/heads\//, "") };
    });
}

function must(deps: Deps, command: string, args: string[]): string {
  const result = deps.run(command, args);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}
