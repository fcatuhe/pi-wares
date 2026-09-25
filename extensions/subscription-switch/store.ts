import { mkdirSync, rmdirSync } from "node:fs";

import { readJson, writeJson } from "../../lib/files.ts";
import { type Bench, type Credentials, switchAccounts } from "./accounts.ts";

const LOCK_ATTEMPTS = 25;
const LOCK_RETRY_MS = 20;

export function readCredentials(path: string): Credentials {
  return readJson<Credentials>(path) ?? {};
}

export function readBench(path: string): Bench {
  return readJson<Bench>(path) ?? {};
}

export async function moveAccounts(
  authPath: string,
  benchPath: string,
  current: string | undefined,
  target: string | undefined,
): Promise<void> {
  await withAuthLock(authPath, () => {
    const next = switchAccounts(readCredentials(authPath), readBench(benchPath), current, target);
    writeJson(benchPath, next.staged);
    writeJson(authPath, next.auth);
    writeJson(benchPath, next.bench);
  });
}

// INFO: fc 09mar26 pi locks auth.json with proper-lockfile, whose protocol is mkdir of <path>.lock (core/auth-storage.js)
async function withAuthLock<T>(path: string, write: () => T): Promise<T> {
  const lock = `${path}.lock`;
  for (let attempt = 1; ; attempt++) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (attempt === LOCK_ATTEMPTS) throw new Error(`auth.json is locked by another process: ${lock}`);
      await sleep(LOCK_RETRY_MS);
    }
  }
  try {
    return write();
  } finally {
    rmdirSync(lock);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
