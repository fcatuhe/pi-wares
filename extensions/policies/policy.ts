import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type Markers = { paths?: string[]; extensions?: string[] };

const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "tmp", "log", "dist", "build", "coverage"]);

export function policy(dir: string, markers?: Markers) {
  return function (pi: ExtensionAPI) {
    if (markers && !triggered(markers)) return;
    const text = readFileSync(join(dir, "policy.md"), "utf8").trim();
    pi.on("before_agent_start", async (event) => ({
      systemPrompt: `${event.systemPrompt}\n\n${text}`,
    }));
  };
}

function triggered({ paths = [], extensions = [] }: Markers): boolean {
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
