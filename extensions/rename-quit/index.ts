/**
 * Rename-Quit Extension
 *
 * Adds a /rename-quit slash command that:
 *  1. Generates a short, human-readable session name from the current
 *     conversation content using the active model (or uses an explicit
 *     name if one is supplied),
 *  2. Applies it via setSessionName,
 *  3. Requests a clean shutdown.
 *
 * Usage:
 *   /rename-quit            -> auto-name from conversation, then quit
 *   /rename-quit <name>     -> use the supplied name verbatim, then quit
 */

import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

type ContentBlock = { type?: string; text?: string; name?: string };
type SessionEntry = { type: string; message?: { role?: string; content?: unknown } };

const MAX_CHARS = 12_000; // cap conversation text sent to the namer

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const p of content as ContentBlock[]) {
		if (p && typeof p === "object" && p.type === "text" && typeof p.text === "string") {
			parts.push(p.text);
		} else if (p && typeof p === "object" && p.type === "toolCall" && typeof p.name === "string") {
			parts.push(`[tool:${p.name}]`);
		}
	}
	return parts.join("\n");
}

function buildConversationText(entries: SessionEntry[]): string {
	const sections: string[] = [];
	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message?.role) continue;
		const role = entry.message.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = extractText(entry.message.content).trim();
		if (!text) continue;
		sections.push(`${role === "user" ? "User" : "Assistant"}: ${text}`);
	}
	let joined = sections.join("\n\n");
	if (joined.length > MAX_CHARS) {
		// Keep head and tail; the first user message tends to define the topic,
		// the tail reflects where the session ended.
		const head = joined.slice(0, Math.floor(MAX_CHARS * 0.6));
		const tail = joined.slice(joined.length - Math.floor(MAX_CHARS * 0.4));
		joined = `${head}\n\n...[truncated]...\n\n${tail}`;
	}
	return joined;
}

const NAMING_PROMPT = (convo: string) =>
	[
		"You generate short, descriptive titles for coding-assistant sessions.",
		"Read the conversation below and reply with ONE title, on a single line.",
		"Rules:",
		"- 3 to 7 words, Title Case",
		"- No quotes, no trailing punctuation, no emojis",
		"- Focus on the concrete task or topic, not on chit-chat",
		"",
		"<conversation>",
		convo,
		"</conversation>",
		"",
		"Title:",
	].join("\n");

function sanitizeName(raw: string): string {
	let name = raw.trim();
	// Strip common LLM preambles
	name = name.replace(/^title\s*[:\-]\s*/i, "");
	// Take only the first non-empty line
	name = name.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? name;
	// Strip surrounding quotes/backticks
	name = name.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "");
	// Trim trailing punctuation
	name = name.replace(/[.!?,;:]+$/g, "").trim();
	// Hard cap
	if (name.length > 80) name = name.slice(0, 80).trim();
	return name;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("rename-quit", {
		description: "Rename session (auto from content, or with given name) and quit",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			await ctx.waitForIdle();

			const explicit = args.trim();

			if (explicit) {
				pi.setSessionName(explicit);
				ctx.ui.notify(`Session named: ${explicit}. Exiting...`, "info");
				ctx.shutdown();
				return;
			}

			const branch = ctx.sessionManager.getBranch() as SessionEntry[];
			const convo = buildConversationText(branch);

			if (!convo) {
				ctx.ui.notify("No conversation content to name from. Exiting without renaming.", "warning");
				ctx.shutdown();
				return;
			}

			const model = ctx.model;
			if (!model) {
				ctx.ui.notify("No active model; cannot auto-name. Exiting.", "warning");
				ctx.shutdown();
				return;
			}

			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth?.ok || !auth.apiKey) {
				ctx.ui.notify(
					`Could not get API key for ${model.provider}/${model.id}. Exiting without renaming.`,
					"warning",
				);
				ctx.shutdown();
				return;
			}

			ctx.ui.notify("Generating session name...", "info");
			ctx.ui.setStatus("rename-quit", "Naming session...");

			try {
				const response = await complete(
					model,
					{
						messages: [
							{
								role: "user",
								content: [{ type: "text", text: NAMING_PROMPT(convo) }],
								timestamp: Date.now(),
							},
						],
					},
					{
						apiKey: auth.apiKey,
						headers: auth.headers,
						reasoningEffort: "low",
					},
				);

				const raw = response.content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text)
					.join("\n");

				const name = sanitizeName(raw);
				if (!name) {
					ctx.ui.notify("Model returned an empty title. Exiting without renaming.", "warning");
				} else {
					pi.setSessionName(name);
					ctx.ui.notify(`Session named: ${name}. Exiting...`, "info");
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Naming failed: ${msg}. Exiting without renaming.`, "warning");
			} finally {
				ctx.ui.setStatus("rename-quit", "");
				ctx.shutdown();
			}
		},
	});
}
