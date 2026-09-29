import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const MIGRATION_FILE = /(?:^|\/)db\/migrate\/[^/]+\.rb$/;
const SUPERCLASS = /ActiveRecord::Migration(?:\[(\d+\.\d+)\])?/g;
const LOCKED_RAILS = /^ {4}rails \((\d+\.\d+)/m;

export function railsVersion(from: string): string | undefined {
  for (let dir = resolve(from); ; ) {
    const lock = join(dir, "Gemfile.lock");
    if (existsSync(lock)) return readFileSync(lock, "utf8").match(LOCKED_RAILS)?.[1];
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function refusal(path: string, texts: string[]): { block: true; reason: string } | undefined {
  if (!MIGRATION_FILE.test(path)) return;
  const brackets = texts.flatMap((text) => [...text.matchAll(SUPERCLASS)].map((match) => match[1]));
  if (brackets.length === 0) return;
  const version = railsVersion(dirname(path));
  if (version === undefined || brackets.every((bracket) => bracket === version)) return;
  return {
    block: true,
    reason: `Rails policy refused ${path}: the migration superclass is ActiveRecord::Migration[${version}], the Rails version in Gemfile.lock.`,
  };
}
