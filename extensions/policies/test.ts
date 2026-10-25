import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

type PromptEvent = { systemPromptOptions: { sections: Record<string, string>; skills: Array<{ name: string }> } };

const promptEvent = (): PromptEvent => ({ systemPromptOptions: { sections: {}, skills: [{ name: "gog" }] } });

async function injected(name: string): Promise<string | undefined> {
  const load = (await import(`./${name}/index.ts`)).default;
  let handler: any;
  load({ on: (event: string, fn: unknown) => event === "before_agent_start" && (handler = fn) } as never);
  if (!handler) return undefined;
  const event = promptEvent();
  await handler(event);
  return event.systemPromptOptions.sections[name];
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

const ALWAYS = ["policy-code-comment", "policy-engineering", "policy-writing"];

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
      assert.ok(await injected(name), `${which}: ${name} loads everywhere`);
    }
    for (const marker of ["git", "frontend", "rails"] as const) {
      const section = await injected(`policy-${marker}`);
      assert.equal(section !== undefined, expected[marker], `${which}: policy-${marker}`);
    }
  });
}

test("a subagent, started with --no-extensions, gets every policy that applies and the comment check through one path", async () => {
  const root = scratch({ files: { "config/application.rb": "", "index.html": "" }, repo: true });
  const handlers: Array<(event: PromptEvent) => unknown> = [];
  const events: string[] = [];
  const loadAll = (await import("./subagent-policies/index.ts")).default;
  await loadAll({
    on: (event: string, fn: never) => (events.push(event), event === "before_agent_start" && handlers.push(fn)),
  } as never);
  assert.ok(events.includes("tool_call"), "the comment check never reaches a subagent");

  const event = promptEvent();
  for (const handler of handlers) await handler(event);
  const aggregate = Object.values(event.systemPromptOptions.sections).join("\n\n");

  for (const name of [...ALWAYS, "policy-git", "policy-frontend", "policy-rails"]) {
    const headline = readFileSync(join(import.meta.dirname, name, "policy.md"), "utf8").split("\n")[0];
    assert.ok(aggregate.includes(headline), `${name} never reaches a subagent`);
  }
  assert.equal(handlers.length, 6, `a policy directory was added without a subagent reaching it (${root})`);
});

// A returned systemPrompt replaced pi's whole prompt, so the model lost the loadout's skill list and the mcp_servers section.
test("a policy adds its own prompt section and leaves the rest of the prompt to pi", async () => {
  scratch({ files: {}, repo: false });
  const load = (await import("./policy-writing/index.ts")).default;
  let handler: any;
  load({ on: (event: string, fn: unknown) => event === "before_agent_start" && (handler = fn) } as never);
  const event = promptEvent();

  assert.equal(await handler(event), undefined);
  assert.deepEqual(Object.keys(event.systemPromptOptions.sections), ["policy-writing"]);
  assert.deepEqual(event.systemPromptOptions.skills, [{ name: "gog" }]);
});
