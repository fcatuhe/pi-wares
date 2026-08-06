import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { writes } from "./defaults-diff.js";
import { reconcileJson } from "./json-defaults.js";
import { reconcileToml } from "./toml-defaults.js";

export const COMMAND = "wares-doctor";
export const APPLY = "apply";
export const FORCE = "force";
export const MODES = [APPLY, FORCE];
export const REPORT_ENTRY = "wares-doctor-report";

interface Target {
	label: string;
	reference: string;
	path: string;
	identity?: Record<string, string>;
	hint: string;
}

interface Finding {
	kind: "value" | "members" | "entry";
	path: string[];
	state: "ok" | "missing" | "incomplete" | "diverged";
	identity?: string;
	expected?: unknown;
	blocked?: string;
}

export interface Note {
	tone: "text" | "warning";
	text: string;
}

export interface Report {
	rows: string[];
	notes: Note[];
}

interface Inspection {
	target: Target;
	missing: boolean;
	findings: Finding[];
	text?: string;
}

const ROOT = join(import.meta.dirname, "..", "..");

export function runDoctor(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): void {
	const mode = args.trim();
	if (mode !== "" && !MODES.includes(mode)) {
		ctx.ui.notify(`${COMMAND}: unknown argument ${mode}, expected "${APPLY}" or "${FORCE}"`, "warning");
		return;
	}

	try {
		pi.appendEntry<Report>(REPORT_ENTRY, report(mode));
	} catch (err) {
		ctx.ui.notify(`${COMMAND} failed: ${err instanceof Error ? err.message : String(err)}`, "error");
	}
}

export function report(mode: string): Report {
	const apply = mode !== "";
	const force = mode === FORCE;
	const inspections = targets().map((target) => inspect(target, force));
	const pending = inspections.filter((it) => needsWrite(it, force));
	if (apply) for (const inspection of pending) write(inspection);

	const notes: Note[] = [];
	if (!apply) {
		const total = pending.reduce((sum, it) => sum + (it.missing ? 1 : writable(it, false)), 0);
		if (total > 0) notes.push({ tone: "text", text: `${total} to add. Re-run as /${COMMAND} ${APPLY} to write them.` });
	}
	const kept = force ? [] : inspections.flatMap(keptNames);
	if (kept.length > 0) {
		notes.push({
			tone: "warning",
			text: `${kept.length} kept as yours: ${kept.join(", ")}. /${COMMAND} ${FORCE} takes the reference instead.`,
		});
	}
	return { rows: describe(inspections, apply, force), notes };
}

function keptNames(inspection: Inspection): string[] {
	return inspection.findings.filter(diverging).map((finding) => `${inspection.target.label} ${name(finding)}`);
}

function name(finding: Finding): string {
	const path = finding.path.join(".");
	if (finding.kind !== "entry" || !finding.identity) return path;
	return `${path}[${(finding.expected as Record<string, unknown>)[finding.identity]}]`;
}

// INFO: fc 06aug26 read per call, not at load: PI_CODING_AGENT_DIR and XDG_CONFIG_HOME are what the self-check points at a temp dir
function targets(): Target[] {
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
	return [
		{
			label: "pi settings",
			reference: "config/pi/settings.json",
			path: join(agentDir, "settings.json"),
			hint: "restart pi",
		},
		{
			label: "model shortcuts",
			reference: "config/pi/extensions/pi-model-shortcuts.json",
			path: join(agentDir, "extensions", "pi-model-shortcuts.json"),
			hint: "/reload in pi",
		},
		{
			label: "codex subagents",
			reference: "config/pi/pi-codex-subagents/config.json",
			path: join(agentDir, "pi-codex-subagents", "config.json"),
			hint: "restart pi",
		},
		{
			label: "herdr",
			reference: "config/herdr/config.toml",
			path: join(configHome, "herdr", "config.toml"),
			identity: { "keys.command": "key" },
			hint: "herdr server reload-config",
		},
	];
}

function inspect(target: Target, force: boolean): Inspection {
	if (!existsSync(target.path)) return { target, missing: true, findings: [] };

	const reconcile = target.reference.endsWith(".toml") ? reconcileToml : reconcileJson;
	const reference = readFileSync(join(ROOT, target.reference), "utf-8");
	return {
		target,
		missing: false,
		...reconcile(readFileSync(target.path, "utf-8"), reference, target.identity, force),
	};
}

function describe(inspections: Inspection[], apply: boolean, force: boolean): string[] {
	const states = inspections.map((it) => state(it, apply, force));
	const labelWidth = width(inspections.map((it) => it.target.label));
	const stateWidth = width(states);
	return inspections.map((it, index) => {
		const hint = apply && needsWrite(it, force) ? `  (${it.target.hint})` : "";
		return `${it.target.label.padEnd(labelWidth)}  ${states[index].padEnd(stateWidth)}  ${tildify(it.target.path)}${hint}`;
	});
}

function state(inspection: Inspection, apply: boolean, force: boolean): string {
	if (inspection.missing) return apply ? "created" : "create";
	const { findings } = inspection;
	const diverged = keeping(inspection);
	const counts: [string, number][] = [
		[apply ? "added" : "add", writable(inspection, false)],
		[apply ? "replaced" : "replace", force ? diverged : 0],
		["manual", findings.filter((finding) => finding.blocked).length],
		["kept", force ? 0 : diverged],
		["ok", findings.filter((finding) => finding.state === "ok").length],
	];
	return counts
		.filter(([, count]) => count > 0)
		.map(([word, count]) => `${word} ${count}`)
		.join(", ");
}

function needsWrite(inspection: Inspection, force: boolean): boolean {
	return inspection.missing || writable(inspection, force) > 0;
}

function writable(inspection: Inspection, force: boolean): number {
	return inspection.findings.filter((finding) => !finding.blocked && writes(finding, force)).length;
}

function keeping(inspection: Inspection): number {
	return inspection.findings.filter(diverging).length;
}

function diverging(finding: Finding): boolean {
	return !finding.blocked && finding.state === "diverged";
}

function width(strings: string[]): number {
	return Math.max(...strings.map((string) => string.length));
}

function write(inspection: Inspection): void {
	const { target } = inspection;
	mkdirSync(dirname(target.path), { recursive: true });
	if (inspection.missing) {
		copyFileSync(join(ROOT, target.reference), target.path);
		return;
	}
	writeFileSync(target.path, inspection.text!);
}

function tildify(path: string): string {
	return path.startsWith(homedir()) ? path.replace(homedir(), "~") : path;
}
