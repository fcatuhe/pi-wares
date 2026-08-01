import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Marker detection runs at import time against cwd, so each case needs a fresh
// process. Re-exec self with a scratch cwd, then assert on the injected prompt.
async function injected(): Promise<string> {
  const load = (await import("./index.ts")).default;
  let handler: any;
  load({ on: (_: string, fn: unknown) => (handler = fn) } as never);
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

async function main() {
  const which = process.argv[2] as keyof typeof CASES;
  if (!which) {
    const { execFileSync } = await import("node:child_process");
    for (const name of Object.keys(CASES)) {
      execFileSync(process.argv[0], [import.meta.filename, name], { stdio: "inherit" });
    }
    console.log("policies: ok");
    return;
  }

  const { files, git, frontend, rails } = CASES[which];
  scratch(files);
  const prompt = await injected();

  assert.ok(prompt.startsWith("BASE\n\n"), "keeps the base prompt");
  assert.ok(prompt.includes("# Engineering Policy"), "always/ loads everywhere");
  assert.equal(prompt.includes("# Git Policy"), git, `${which}: git.md`);
  assert.equal(prompt.includes("# Frontend Policy"), frontend, `${which}: frontend.md`);
  assert.equal(prompt.includes("# Rails Conventions"), rails, `${which}: rails.md`);
}

main();
