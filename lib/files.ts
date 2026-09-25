import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const PRIVATE_FILE = 0o600;

export function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function writeAtomic(path: string, text: string, mode = PRIVATE_FILE): void {
  const temporary = `${path}.${randomUUID()}`;
  writeFileSync(temporary, text, { mode });
  renameSync(temporary, path);
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeAtomic(path, JSON.stringify(value, null, 2));
}
