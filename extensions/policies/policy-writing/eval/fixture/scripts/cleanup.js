#!/usr/bin/env node
import { readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

const MAX_AGE_DAYS = 14;
const dir = process.argv[2] ?? "tmp/cache";

for (const name of readdirSync(dir)) {
  const path = join(dir, name);
  const ageDays = (Date.now() - statSync(path).mtimeMs) / 86_400_000;
  if (ageDays > MAX_AGE_DAYS) {
    rmSync(path, { recursive: true });
    console.log(`removed ${path}`);
  }
}
