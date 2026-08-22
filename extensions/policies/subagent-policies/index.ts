import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// INFO: fc 22aug26 a subagent starts with --no-extensions, so its config names this one path instead of six
const POLICIES = join(import.meta.dirname, "..");

export default async function (pi: ExtensionAPI) {
  for (const entry of readdirSync(POLICIES).sort()) {
    if (!entry.startsWith("policy-")) continue;
    const { default: load } = await import(pathToFileURL(join(POLICIES, entry, "index.ts")).href);
    load(pi);
  }
}
