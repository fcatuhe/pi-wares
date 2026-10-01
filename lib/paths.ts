import { homedir } from "node:os";
import { join } from "node:path";

export const PROJECT_DIR = ".pi";

export function agentDir(): string {
  const dir = process.env.PI_CODING_AGENT_DIR;
  return dir ? expandHome(dir) : join(homedir(), PROJECT_DIR, "agent");
}

export function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
}

export function wareDir(ware: string): string {
  return join(agentDir(), ware);
}

export function homeRelative(path: string, home = homedir()): string {
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
