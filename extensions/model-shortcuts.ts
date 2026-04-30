/**
 * Model Shortcuts Extension
 *
 * Slash-command shortcuts for switching model + thinking level.
 *
 *   /off  /minimal  /low  /medium  /high  /xhigh   Set thinking level
 *   /opus  /sonnet  /glm  /kimi  ...               Switch to a named model
 *   /opus:high  /glm:off  /sonnet:medium  ...      Switch model + thinking
 *
 * Shortcuts are read from JSON config files (project overrides global, merged by name):
 *   - ~/.pi/agent/extensions/pi-model-shortcuts.json
 *   - <cwd>/.pi/extensions/pi-model-shortcuts.json
 *
 * Schema — top-level keys are the shortcut names:
 *   {
 *     "opus":   { "provider": "anthropic", "model": "claude-opus-4-7" },
 *     "sonnet": { "provider": "anthropic", "model": "claude-sonnet-4-6", "thinkingLevel": "high" }
 *   }
 *
 * `thinkingLevel` is optional; the bare `/<name>` form applies it when set,
 * the explicit `/<name>:<level>` form always wins.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { supportsXhigh } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

const CONFIG_FILENAME = "pi-model-shortcuts.json";
const BASE_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];
const LEVELS: ThinkingLevel[] = [...BASE_LEVELS, "xhigh"];
const LEVEL_SET = new Set<string>(LEVELS);

interface Shortcut {
	provider: string;
	model: string;
	thinkingLevel?: ThinkingLevel;
}

type ShortcutsConfig = Record<string, Shortcut>;
type PartialShortcutsConfig = Record<string, Partial<Shortcut>>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Parse a raw shortcut entry into a Partial<Shortcut>. Validation that
 * `provider` and `model` are both present happens after merging, so a project
 * file can override individual fields without restating the whole shortcut.
 */
function parseShortcut(raw: unknown): Partial<Shortcut> | undefined {
	if (!isRecord(raw)) return undefined;
	const out: Partial<Shortcut> = {};
	if (typeof raw.provider === "string" && raw.provider.trim()) out.provider = raw.provider.trim();
	if (typeof raw.model === "string" && raw.model.trim()) out.model = raw.model.trim();
	if (typeof raw.thinkingLevel === "string" && LEVEL_SET.has(raw.thinkingLevel)) {
		out.thinkingLevel = raw.thinkingLevel as ThinkingLevel;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

function readConfigFile(path: string): PartialShortcutsConfig {
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		if (!isRecord(parsed)) return {};
		const out: PartialShortcutsConfig = {};
		for (const [name, raw] of Object.entries(parsed)) {
			const trimmed = name.trim();
			if (!trimmed || LEVEL_SET.has(trimmed)) continue;
			const shortcut = parseShortcut(raw);
			if (shortcut) out[trimmed] = shortcut;
		}
		return out;
	} catch (err) {
		console.error(`[pi-model-shortcuts] failed to read ${path}: ${err}`);
		return {};
	}
}

/**
 * Merge global + project the way pi-core merges settings.json: for each name
 * present in both, shallow-merge the entries so a project can override
 * individual fields (e.g. just `thinkingLevel`) without redeclaring
 * `provider` and `model`. Then drop any entry that is still missing required
 * fields after merging.
 */
function loadShortcuts(cwd: string): ShortcutsConfig {
	const globalPath = join(getAgentDir(), "extensions", CONFIG_FILENAME);
	const projectPath = join(cwd, ".pi", "extensions", CONFIG_FILENAME);
	const global = readConfigFile(globalPath);
	const project = readConfigFile(projectPath);

	const merged: PartialShortcutsConfig = { ...global };
	for (const [name, partial] of Object.entries(project)) {
		merged[name] = global[name] ? { ...global[name], ...partial } : partial;
	}

	const out: ShortcutsConfig = {};
	for (const [name, partial] of Object.entries(merged)) {
		if (partial.provider && partial.model) {
			out[name] = { provider: partial.provider, model: partial.model, thinkingLevel: partial.thinkingLevel };
		}
	}
	return out;
}

export default function modelShortcutsExtension(pi: ExtensionAPI): void {
	let shortcuts: ShortcutsConfig = {};
	const registered = new Set<string>();

	// --- Thinking-level commands (always available) ---
	for (const level of LEVELS) {
		registered.add(level);
		pi.registerCommand(level, {
			description: `Thinking ${level}`,
			handler: async (_args, ctx) => {
				pi.setThinkingLevel(level);
				ctx.ui.notify(`Thinking: ${level}`, "info");
			},
		});
	}

	/** Apply a shortcut, optionally overriding its thinking level. */
	async function applyShortcut(
		ctx: ExtensionContext,
		name: string,
		levelOverride?: ThinkingLevel,
	): Promise<void> {
		const shortcut = shortcuts[name];
		if (!shortcut) {
			ctx.ui.notify(`Shortcut "${name}" no longer defined`, "warning");
			return;
		}
		const model = ctx.modelRegistry.find(shortcut.provider, shortcut.model);
		if (!model) {
			ctx.ui.notify(`Model not found: ${shortcut.provider}/${shortcut.model}`, "error");
			return;
		}
		const previousThinking = pi.getThinkingLevel();
		if (!(await pi.setModel(model))) return;

		const requested = levelOverride ?? shortcut.thinkingLevel;
		if (requested) {
			const supported = supportsXhigh(model) ? LEVELS : BASE_LEVELS;
			const effective = supported.includes(requested) ? requested : supported[supported.length - 1];
			pi.setThinkingLevel(effective);
		}

		const current = pi.getThinkingLevel();
		const msg = previousThinking === current ? `Model: ${model.id}` : `Model: ${model.id} • Thinking: ${current}`;
		ctx.ui.notify(msg, "info");
	}

	function registerShortcut(name: string, shortcut: Shortcut): void {
		const base = `(${shortcut.provider}) ${shortcut.model}`;

		if (!registered.has(name)) {
			registered.add(name);
			pi.registerCommand(name, {
				description: shortcut.thinkingLevel ? `${base} • thinking ${shortcut.thinkingLevel}` : base,
				handler: async (_args, ctx) => applyShortcut(ctx, name),
			});
		}
		for (const level of LEVELS) {
			const cmd = `${name}:${level}`;
			if (registered.has(cmd)) continue;
			registered.add(cmd);
			pi.registerCommand(cmd, {
				description: `${base} • thinking ${level}`,
				handler: async (_args, ctx) => applyShortcut(ctx, name, level),
			});
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		shortcuts = loadShortcuts(ctx.cwd);
		for (const [name, shortcut] of Object.entries(shortcuts)) registerShortcut(name, shortcut);
		if (Object.keys(shortcuts).length === 0) {
			ctx.ui.notify(
				`pi-model-shortcuts: no shortcuts defined (add ~/.pi/agent/extensions/${CONFIG_FILENAME} or .pi/extensions/${CONFIG_FILENAME})`,
				"warning",
			);
		}
	});
}
