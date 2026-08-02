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
