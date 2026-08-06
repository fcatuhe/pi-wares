import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Marker detection runs when the extension registers, so one process covers every
// case: chdir into a scratch tree, load the extension, read what it injects.
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

const ALWAYS = ["policy-code-comment", "policy-engineering", "policy-writing-style"];

const CASES = {
  // A bare directory under tmpdir: no .git anywhere above it, nothing else.
  none: { files: [], git: false, frontend: false, rails: false },
  git: { files: [".git/HEAD"], git: true, frontend: false, rails: false },
  // A static site: frontend policy without Rails.
  html: { files: ["index.html"], git: false, frontend: true, rails: false },
  // Templates deep in the tree trigger it too.
  slim: { files: ["app/views/home/index.slim"], git: false, frontend: true, rails: false },
  // Vendored HTML is not ours to style.
  dependency: { files: ["node_modules/pkg/index.html"], git: false, frontend: false, rails: false },
  rails: {
    files: [".git/HEAD", "config/application.rb", "app/views/layouts/application.html.erb"],
    git: true,
    frontend: true,
    rails: true,
  },
};

for (const [which, { files, ...expected }] of Object.entries(CASES)) {
  scratch(files);

  for (const name of ALWAYS) {
    assert.ok((await injected(name)).startsWith("BASE\n\n"), `${which}: ${name} loads everywhere`);
  }
  for (const marker of ["git", "frontend", "rails"] as const) {
    const prompt = await injected(`policy-${marker}`);
    assert.equal(prompt.startsWith("BASE\n\n"), expected[marker], `${which}: policy-${marker}`);
  }
}

console.log("policies: ok");
