import assert from "node:assert/strict";
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

const scratch = (files: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), "policies-"));
  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), "");
  }
  process.chdir(dir);
  return dir;
};

const ALWAYS = ["policy-code-comment", "policy-engineering"];

const CASES = {
  "a bare directory with no .git above it": { files: [], git: false, frontend: false, rails: false },
  "a git repository": { files: [".git/HEAD"], git: true, frontend: false, rails: false },
  "a static site gets the frontend policy without Rails": { files: ["index.html"], git: false, frontend: true, rails: false },
  "a template deep in the tree": { files: ["app/views/home/index.slim"], git: false, frontend: true, rails: false },
  "vendored HTML, which is not ours to style": { files: ["node_modules/pkg/index.html"], git: false, frontend: false, rails: false },
  "a Rails app": {
    files: [".git/HEAD", "config/application.rb", "app/views/layouts/application.html.erb"],
    git: true,
    frontend: true,
    rails: true,
  },
};

for (const [which, { files, ...expected }] of Object.entries(CASES)) {
  test(`policies injected in ${which}`, async () => {
    scratch(files);

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
  const root = scratch([".git/HEAD", "config/application.rb", "index.html"]);
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
