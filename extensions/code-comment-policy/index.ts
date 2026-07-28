/**
 * Code Comment Policy Extension
 *
 * Appends the code comment policy (code-comment-policy.md) to the system prompt, every
 * turn, every model. Declared through settings.json (the pi-wares package
 * entry) rather than a global ~/.pi/agent/AGENTS.md symlink, so the policy
 * travels with the repo and applies in every project instead of only under
 * pi-wares. Text is byte-identical every turn and appended at the END, so it
 * caches once per session.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const policy = readFileSync(join(__dirname, "code-comment-policy.md"), "utf8").trim();

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${policy}`,
  }));
}
