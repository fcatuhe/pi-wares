/**
 * Policies Extension
 *
 * Appends every *.md in this directory to the system prompt, every turn, every
 * model. Declared through settings.json (the pi-wares package entry) rather
 * than a global ~/.pi/agent/AGENTS.md symlink, so the policies travel with the
 * repo and apply in every project instead of only under pi-wares. Text is
 * byte-identical every turn and appended at the END, so it caches once per
 * session.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const policies = readdirSync(__dirname)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => readFileSync(join(__dirname, f), "utf8").trim())
  .join("\n\n");

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${policies}`,
  }));
}
