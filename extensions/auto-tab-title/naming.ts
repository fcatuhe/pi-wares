export const MAX_WORDS = 3;
export const MAX_CHARS = 28;
export const MAX_EXCHANGE_CHARS = 4_000;

export type NamingMessage = { role: string; content?: unknown };

type ContentBlock = { type?: string; text?: string; name?: string };

export function extractText(content: unknown): string {
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

export function buildExchange(messages: NamingMessage[]): string | undefined {
	const sections: string[] = [];
	let hasRequest = false;
	let hasAnswer = false;
	for (const message of messages) {
		if (message.role !== "user" && message.role !== "assistant") continue;
		const text = extractText(message.content).trim();
		if (!text) continue;
		if (message.role === "user") hasRequest = true;
		else hasAnswer = true;
		sections.push(`${message.role === "user" ? "User" : "Assistant"}: ${text}`);
	}
	if (!hasRequest || !hasAnswer) return undefined;
	return sections.join("\n\n").slice(0, MAX_EXCHANGE_CHARS);
}

export const TITLE_PROMPT = (exchange: string) =>
	[
		"Name this coding session for a terminal tab label.",
		"Reply with the label and nothing else.",
		"Rules:",
		"- two words, three only when two cannot say it",
		"- lowercase, words joined by hyphens, like tab-title or flaky-test-fix",
		"- name the concrete task or subject, never the tool or the conversation",
		"",
		"<conversation>",
		exchange,
		"</conversation>",
	].join("\n");

export function toTabTitle(raw: string): string {
	const lastLine = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.pop();
	if (!lastLine) return "";
	const words = lastLine
		.toLowerCase()
		.replace(/^(?:label|title|name)\s*[:\-]\s*/, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(" ")
		.filter((word) => word.length > 0)
		.slice(0, MAX_WORDS);
	while (words.length > 1 && words.join("-").length > MAX_CHARS) words.pop();
	return words.join("-").slice(0, MAX_CHARS);
}
