/**
 * GPT-Behavior Extension
 *
 * Appends a behavior guide (behavior.md) to the system prompt, but only when
 * the active model is a GPT model (provider "openai", or an id matching /gpt/).
 * For every other model the hook returns early and injects nothing.
 *
 * The decision is re-evaluated every turn against the current model, so it
 * toggles cleanly when you switch models mid-session (/model, Ctrl+P) and on
 * resume. The injected text is appended to the END of the system prompt and is
 * byte-identical every turn, so within a stable-model session it caches once
 * and is reused — no per-turn cache churn. (Switching models busts cache on its
 * own, independent of this ware.)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const behavior = readFileSync(join(__dirname, "behavior.md"), "utf8").trim();

function isGpt(model: { provider?: string; id?: string } | undefined): boolean {
  if (!model) return false;
  return model.provider === "openai" || /gpt/i.test(model.id ?? "");
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    if (!isGpt(ctx.model)) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${behavior}`,
    };
  });
}
