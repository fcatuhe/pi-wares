import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const CONFIG_FILENAME = "pi-model-shortcuts.json";
const LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

interface Shortcut {
	provider: string;
	model: string;
	thinkingLevel?: ThinkingLevel;
}

function isLevel(value: string): value is ThinkingLevel {
	return (LEVELS as string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseShortcut(raw: unknown): Partial<Shortcut> {
	if (!isRecord(raw)) return {};
	const out: Partial<Shortcut> = {};
	if (typeof raw.provider === "string" && raw.provider.trim()) out.provider = raw.provider.trim();
	if (typeof raw.model === "string" && raw.model.trim()) out.model = raw.model.trim();
	if (typeof raw.thinkingLevel === "string" && isLevel(raw.thinkingLevel)) {
		out.thinkingLevel = raw.thinkingLevel;
	}
	return out;
}

function readConfigFile(path: string): Record<string, Partial<Shortcut>> {
	if (!existsSync(path)) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf-8"));
	} catch (err) {
		console.error(`[model-shortcuts] failed to read ${path}: ${err}`);
		return {};
	}
	if (!isRecord(parsed)) return {};
	const out: Record<string, Partial<Shortcut>> = {};
	for (const [name, raw] of Object.entries(parsed)) {
		const trimmed = name.trim();
		if (!trimmed || isLevel(trimmed)) continue;
		out[trimmed] = parseShortcut(raw);
	}
	return out;
}

function loadShortcuts(cwd: string): Record<string, Shortcut> {
	const global = readConfigFile(join(getAgentDir(), "extensions", CONFIG_FILENAME));
	const project = readConfigFile(join(cwd, ".pi", "extensions", CONFIG_FILENAME));

	const out: Record<string, Shortcut> = {};
	for (const name of new Set([...Object.keys(global), ...Object.keys(project)])) {
		const { provider, model, thinkingLevel } = { ...global[name], ...project[name] };
		if (provider && model) out[name] = { provider, model, thinkingLevel };
	}
	return out;
}

export default function modelShortcutsExtension(pi: ExtensionAPI): void {
	for (const level of LEVELS) {
		pi.registerCommand(level, {
			description: `Thinking ${level}`,
			handler: async (_args, ctx) => {
				pi.setThinkingLevel(level);
				ctx.ui.notify(`Thinking: ${level}`, "info");
			},
		});
	}

	async function applyShortcut(
		ctx: ExtensionContext,
		shortcut: Shortcut,
		levelOverride?: ThinkingLevel,
	): Promise<void> {
		const model = ctx.modelRegistry.find(shortcut.provider, shortcut.model);
		if (!model) {
			ctx.ui.notify(`Model not found: ${shortcut.provider}/${shortcut.model}`, "error");
			return;
		}
		const previousThinking = pi.getThinkingLevel();
		if (!(await pi.setModel(model))) return;

		const requested = levelOverride ?? shortcut.thinkingLevel;
		if (requested) pi.setThinkingLevel(requested);

		const current = pi.getThinkingLevel();
		const msg = previousThinking === current ? `Model: ${model.id}` : `Model: ${model.id} • Thinking: ${current}`;
		ctx.ui.notify(msg, "info");
	}

	pi.on("session_start", async (_event, ctx) => {
		for (const [name, shortcut] of Object.entries(loadShortcuts(ctx.cwd))) {
			const base = `(${shortcut.provider}) ${shortcut.model}`;
			pi.registerCommand(name, {
				description: shortcut.thinkingLevel ? `${base} • thinking ${shortcut.thinkingLevel}` : base,
				handler: async (_args, cmdCtx) => applyShortcut(cmdCtx, shortcut),
			});
			const model = ctx.modelRegistry.find(shortcut.provider, shortcut.model);
			for (const level of model ? getSupportedThinkingLevels(model) : LEVELS) {
				pi.registerCommand(`${name}:${level}`, {
					description: `${base} • thinking ${level}`,
					handler: async (_args, cmdCtx) => applyShortcut(cmdCtx, shortcut, level),
				});
			}
		}
	});
}
