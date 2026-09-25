import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

async function injected(name: string): Promise<string> {
  const load = (await import(`./${name}/index.ts`)).default;
  let handler: any;
  load({ on: (_: string, fn: unknown) => (handler = fn) } as never);
  if (!handler) return "";
  const { systemPrompt } = await handler({ systemPrompt: "BASE" });
  return systemPrompt;
}

type Scratch = { files: Record<string, string>; repo: boolean; cwd?: string };

const scratch = ({ files, repo, cwd = "." }: Scratch) => {
  const dir = mkdtempSync(join(tmpdir(), "policies-"));
  if (repo) execFileSync("git", ["init", "--quiet"], { cwd: dir });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  mkdirSync(join(dir, cwd), { recursive: true });
  process.chdir(join(dir, cwd));
  return dir;
};

const ALWAYS = ["policy-code-comment", "policy-engineering"];

const CASES: Record<string, Scratch & { git: boolean; frontend: boolean; rails: boolean }> = {
  "a bare directory": { files: {}, repo: false, git: false, frontend: false, rails: false },
  "a directory of downloaded HTML outside any repository, as $HOME": {
    files: { "psref/laptop.html": "" },
    repo: false,
    git: false,
    frontend: false,
    rails: false,
  },
  "a git repository": { files: {}, repo: true, git: true, frontend: false, rails: false },
  "a static site gets the frontend policy without Rails": {
    files: { "index.html": "" },
    repo: true,
    git: true,
    frontend: true,
    rails: false,
  },
  "a template deep in the tree": { files: { "app/views/home/index.slim": "" }, repo: true, git: true, frontend: true, rails: false },
  "a subdirectory of a repository with templates elsewhere": {
    files: { "site/index.html": "", "firmware/main.c": "" },
    repo: true,
    cwd: "firmware",
    git: true,
    frontend: true,
    rails: false,
  },
  "gitignored build output, which is not ours to style": {
    files: { ".gitignore": "_site/\nnode_modules/\n", "_site/index.html": "", "node_modules/pkg/index.html": "" },
    repo: true,
    git: true,
    frontend: false,
    rails: false,
  },
  "a Rails app": {
    files: { "config/application.rb": "", "app/views/layouts/application.html.erb": "" },
    repo: true,
    git: true,
    frontend: true,
    rails: true,
  },
  "a repository root holding a Rails app one level down": {
    files: { "website/config/application.rb": "", "website/app/views/layouts/application.html.erb": "" },
    repo: true,
    git: true,
    frontend: true,
    rails: true,
  },
  "a Rails app two levels down, too deep to be the repository's app": {
    files: { "test/dummy/app/config/application.rb": "" },
    repo: true,
    git: true,
    frontend: false,
    rails: false,
  },
  "a directory inside a Rails app that is not a repository": {
    files: { "config/application.rb": "" },
    repo: false,
    cwd: "app/models",
    git: false,
    frontend: false,
    rails: true,
  },
};

for (const [which, { git, frontend, rails, ...setup }] of Object.entries(CASES)) {
  test(`policies injected in ${which}`, async () => {
    scratch(setup);
    const expected = { git, frontend, rails };

    for (const name of ALWAYS) {
      assert.ok((await injected(name)).startsWith("BASE\n\n"), `${which}: ${name} loads everywhere`);
    }
    for (const marker of ["git", "frontend", "rails"] as const) {
      const prompt = await injected(`policy-${marker}`);
      assert.equal(prompt.startsWith("BASE\n\n"), expected[marker], `${which}: policy-${marker}`);
    }
  });
}

test("a subagent, started with --no-extensions, gets every policy that applies through one path", async () => {
  const root = scratch({ files: { "config/application.rb": "", "index.html": "" }, repo: true });
  const handlers: Array<(event: { systemPrompt: string }) => Promise<{ systemPrompt: string }>> = [];
  const loadAll = (await import("./subagent-policies/index.ts")).default;
  await loadAll({ on: (_: string, fn: never) => handlers.push(fn) } as never);

  let aggregate = "BASE";
  for (const handler of handlers) aggregate = (await handler({ systemPrompt: aggregate })).systemPrompt;

  for (const name of [...ALWAYS, "policy-git", "policy-frontend", "policy-rails"]) {
    const headline = readFileSync(join(import.meta.dirname, name, "policy.md"), "utf8").split("\n")[0];
    assert.ok(aggregate.includes(headline), `${name} never reaches a subagent`);
  }
  assert.equal(handlers.length, 5, `a policy directory was added without a subagent reaching it (${root})`);
});
