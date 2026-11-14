#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { land } from "./land.ts";

const prs = process.argv.slice(2).map((arg) => Number(arg.replace(/^#/, "")));
if (prs.length === 0 || prs.some((number) => !Number.isInteger(number) || number <= 0)) {
  console.error("usage: land <pull request number>...");
  process.exit(2);
}

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
};

try {
  const landed = await land(prs, { run, log: (line) => console.log(line), pause: (ms) => setTimeout(ms) });
  process.exit(landed ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}
