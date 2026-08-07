import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

export type Shortcut = { provider: string; model: string; thinkingLevel?: ThinkingLevel };

export const LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export function isLevel(value: string): value is ThinkingLevel {
	return (LEVELS as string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseShortcut(raw: unknown): Shortcut | null {
	if (!isRecord(raw)) return null;
	const provider = typeof raw.provider === "string" ? raw.provider.trim() : "";
	const model = typeof raw.model === "string" ? raw.model.trim() : "";
	if (!provider || !model) return null;
	const thinkingLevel =
		typeof raw.thinkingLevel === "string" && isLevel(raw.thinkingLevel) ? raw.thinkingLevel : undefined;
	return { provider, model, thinkingLevel };
}

export function parseShortcuts(raw: string | undefined): Record<string, Shortcut> {
	if (!raw?.trim()) return {};
	const parsed: unknown = JSON.parse(raw);
	if (!isRecord(parsed)) return {};
	const out: Record<string, Shortcut> = {};
	for (const [name, value] of Object.entries(parsed)) {
		const trimmed = name.trim();
		if (!trimmed || isLevel(trimmed)) continue;
		const shortcut = parseShortcut(value);
		if (shortcut) out[trimmed] = shortcut;
	}
	return out;
}
