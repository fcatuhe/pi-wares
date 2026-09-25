import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { sideCallModel } from "../../lib/models.ts";
import { buildExchange, extractText, NAME_PROMPT, type NamingMessage, toSessionName } from "./naming.ts";

const MAX_REPLY_TOKENS = 24;

function branchMessages(ctx: ExtensionContext): NamingMessage[] {
  const messages: NamingMessage[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message") messages.push(entry.message);
  }
  return messages;
}

export default function (pi: ExtensionAPI) {
  let pending = false;

  pi.on("session_start", (_event, ctx) => {
    pending = ctx.hasUI === true && !pi.getSessionName();
  });

  pi.on("session_info_changed", (event) => {
    if (event.name) pending = false;
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (!pending) return;
    pending = false;
    const exchange = buildExchange(branchMessages(ctx));
    if (!exchange) {
      pending = true;
      return;
    }
    const model = sideCallModel(ctx.modelRegistry);
    if (!model) return;
    try {
      const reply = await ctx.modelRegistry.complete(
        model,
        {
          messages: [{ role: "user", content: [{ type: "text", text: NAME_PROMPT(exchange) }], timestamp: Date.now() }],
        },
        { maxTokens: MAX_REPLY_TOKENS },
      );
      const name = toSessionName(extractText(reply.content));
      if (name && !pi.getSessionName()) pi.setSessionName(name);
    } catch {
      pending = !pi.getSessionName();
    }
  });
}
