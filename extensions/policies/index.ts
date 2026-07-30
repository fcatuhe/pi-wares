// INFO: fc 30jul26 appended at the END of the system prompt and byte-identical every turn, so it caches once per session
// INFO: fc 30jul26 a when/*.md with no MARKERS entry never loads

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MARKERS: Record<string, string> = {
  "git.md": ".git",
  "rails.md": "config/application.rb",
};

function existsHereOrAbove(marker: string): boolean {
  for (let dir = process.cwd(); ; ) {
    if (existsSync(join(dir, marker))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
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
  ...load("when", (f) => Boolean(MARKERS[f]) && existsHereOrAbove(MARKERS[f])),
].join("\n\n");

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${policies}`,
  }));
}
