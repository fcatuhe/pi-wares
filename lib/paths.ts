import { homedir } from "node:os";
import { join } from "node:path";

export const PROJECT_DIR = ".pi";

export function agentDir(): string {
  const dir = process.env.PI_CODING_AGENT_DIR;
  if (!dir) return join(homedir(), PROJECT_DIR, "agent");
  return dir === "~" || dir.startsWith("~/") ? join(homedir(), dir.slice(1)) : dir;
}

export function wareDir(ware: string): string {
  return join(agentDir(), ware);
}

export function homeRelative(path: string, home = homedir()): string {
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
