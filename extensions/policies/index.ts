// INFO: fc 30jul26 appended at the END of the system prompt and byte-identical every turn, so it caches once per session
// INFO: fc 30jul26 a when/*.md with no MARKERS entry never loads

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MARKERS: Record<string, { paths?: string[]; extensions?: string[] }> = {
  "frontend.md": { extensions: [".html", ".erb", ".slim"] },
  "git.md": { paths: [".git"] },
  "rails.md": { paths: ["config/application.rb"] },
};

const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "tmp", "log", "dist", "build", "coverage"]);

function triggered({ paths = [], extensions = [] }: { paths?: string[]; extensions?: string[] }): boolean {
  if (existsHereOrAbove(paths)) return true;
  return extensions.length > 0 && anyFileBelow(projectRoot(), extensions);
}

function existsHereOrAbove(paths: string[]): boolean {
  for (let dir = process.cwd(); ; ) {
    if (paths.some((m) => existsSync(join(dir, m)))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function projectRoot(): string {
  for (let dir = process.cwd(); ; ) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

function anyFileBelow(root: string, extensions: string[]): boolean {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // INFO: fc 03aug26 an unreadable dir must not kill agent start, treat as no match
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(join(dir, entry.name));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) return true;
    }
  }
  return false;
}

function load(dir: string, keep: (file: string) => boolean): string[] {
  const here = join(import.meta.dirname, dir);
  return readdirSync(here)
    .filter((f) => f.endsWith(".md") && keep(f))
    .sort()
    .map((f) => readFileSync(join(here, f), "utf8").trim());
}

const policies = [
  ...load("always", () => true),
  ...load("when", (f) => Boolean(MARKERS[f]) && triggered(MARKERS[f])),
].join("\n\n");

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${policies}`,
  }));
}
