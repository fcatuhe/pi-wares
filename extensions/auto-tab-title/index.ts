import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { buildExchange, extractText, type NamingMessage, TITLE_PROMPT, toTabTitle } from "./naming.ts";

const NAMER_PROVIDER = "anthropic";
const NAMER_MODEL = "claude-haiku-4-5";
const MAX_REPLY_TOKENS = 24;

function findNamer(ctx: ExtensionContext): Model<Api> | undefined {
	return (
		ctx.modelRegistry.find(NAMER_PROVIDER, NAMER_MODEL) ??
		ctx.modelRegistry.getAvailable().find((model) => model.id.includes("haiku"))
	);
}

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

	// INFO: fc 09mar26 a name from /name, -n or an inherited fork is the user's, and ours lands here too
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
		const model = findNamer(ctx);
		if (!model) return;
		try {
			const reply = await ctx.modelRegistry.complete(
				model,
				{
					messages: [
						{ role: "user", content: [{ type: "text", text: TITLE_PROMPT(exchange) }], timestamp: Date.now() },
					],
				},
				{ maxTokens: MAX_REPLY_TOKENS },
			);
			const title = toTabTitle(extractText(reply.content));
			if (title) pi.setSessionName(title);
		} catch {
			pending = true;
		}
	});
}
