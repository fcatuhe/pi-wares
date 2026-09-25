import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type Markers = { paths?: string[]; files?: RegExp };

const LS_FILES_BUFFER = 256 * 1024 * 1024;

export function policy(dir: string, markers?: Markers) {
  return function (pi: ExtensionAPI) {
    if (markers && !triggered(markers)) return;
    const text = readFileSync(join(dir, "policy.md"), "utf8").trim();
    pi.on("before_agent_start", async (event) => ({
      systemPrompt: `${event.systemPrompt}\n\n${text}`,
    }));
  };
}

function triggered({ paths = [], files }: Markers): boolean {
  if (existsHereOrAbove(paths)) return true;
  if (!files) return false;
  const root = repositoryRoot();
  return root !== undefined && repositoryFiles(root).some((file) => files.test(file));
}

function existsHereOrAbove(paths: string[]): boolean {
  for (let dir = process.cwd(); ; ) {
    if (paths.some((m) => existsSync(join(dir, m)))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function repositoryRoot(): string | undefined {
  for (let dir = process.cwd(); ; ) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function repositoryFiles(root: string): string[] {
  const listing = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: LS_FILES_BUFFER,
  });
  return listing.split("\0");
}
