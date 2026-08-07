import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

import { LEVELS, parseShortcuts, type Shortcut } from "./shortcuts.ts";

const CONFIG_FILENAME = "pi-model-shortcuts.json";

function loadShortcuts(): Record<string, Shortcut> {
	const file = join(getAgentDir(), "extensions", CONFIG_FILENAME);
	if (!existsSync(file)) return {};
	try {
		return parseShortcuts(readFileSync(file, "utf8"));
	} catch (err) {
		console.error(`[model-shortcuts] ignoring ${file}: ${err}`);
		return {};
	}
}

function thinkingNotice(requested: ThinkingLevel, effective: ThinkingLevel): string {
	return requested === effective ? `Thinking: ${effective}` : `Thinking: ${effective} (${requested} unsupported)`;
}

export default function modelShortcutsExtension(pi: ExtensionAPI): void {
	for (const level of LEVELS) {
		pi.registerCommand(level, {
			description: `Thinking ${level}`,
			handler: async (_args, ctx) => {
				pi.setThinkingLevel(level);
				ctx.ui.notify(thinkingNotice(level, pi.getThinkingLevel()), "info");
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
		const parts = [`Model: ${model.id}`];
		if (requested) parts.push(thinkingNotice(requested, current));
		else if (previousThinking !== current) parts.push(`Thinking: ${current}`);
		ctx.ui.notify(parts.join(" • "), "info");
	}

	pi.on("session_start", async (_event, ctx) => {
		for (const [name, shortcut] of Object.entries(loadShortcuts())) {
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
