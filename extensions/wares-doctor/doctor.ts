import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { agentDir, expandHome, homeRelative } from "../../lib/paths.ts";
import { type Finding, hasStale, type Reconciled, writes } from "./diff.ts";
import { reconcileJson, setJson } from "./json.ts";
import { reconcileToml } from "./toml.ts";

export const COMMAND = "wares-doctor";
export const APPLY = "apply";
export const FORCE = "force";
export const REPORT_ENTRY = "wares-doctor-report";

export interface DoctorCommand {
  name: string;
  mode: string;
  description: string;
}

export const COMMANDS: DoctorCommand[] = [
  {
    name: commandName(""),
    mode: "",
    description: "Compare this machine against the wares reference config",
  },
  {
    name: commandName(APPLY),
    mode: APPLY,
    description: "Write the reference keys this machine is missing, keeping the values you set",
  },
  {
    name: commandName(FORCE),
    mode: FORCE,
    description: "Write those, and overwrite the keys where you differ from the reference",
  },
];

function commandName(mode: string): string {
  return mode === "" ? COMMAND : `${COMMAND}:${mode}`;
}

export type Usable = (model: string) => boolean;

interface Scoped {
  reference: string;
  skipped: string[];
}

interface Target {
  label: string;
  reference: string;
  path: string;
  hint: string;
  scope?: (reference: string, usable: Usable) => Scoped;
}

export interface Note {
  tone: "text" | "warning" | "error";
  text: string;
}

export interface Row {
  label: string;
  state: string;
  path: string;
  hint: string;
  tone?: Note["tone"];
}

export interface Report {
  command: string;
  rows: Row[];
  notes: Note[];
}

interface Inspection {
  target: Target;
  reference: string;
  skipped: string[];
  missing: boolean;
  findings: Finding[];
  text?: string;
}

const ROOT = join(import.meta.dirname, "..", "..");

export function runDoctor(pi: ExtensionAPI, command: DoctorCommand, args: string, ctx: ExtensionCommandContext): void {
  if (args.trim() !== "") {
    ctx.ui.notify(`${command.name}: takes no argument, got ${args.trim()}`, "warning");
    return;
  }

  try {
    const available = new Set(ctx.modelRegistry.getAvailable().map((model) => `${model.provider}/${model.id}`));
    pi.appendEntry<Report>(
      REPORT_ENTRY,
      report(command.mode, (model) => available.has(model)),
    );
  } catch (err) {
    ctx.ui.notify(`${command.name} failed: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
}

export function report(mode: string, usable: Usable): Report {
  const apply = mode !== "";
  const force = mode === FORCE;
  const inspections = targets().map((target) => inspect(target, usable, force));
  if (apply) for (const inspection of inspections.filter((it) => needsWrite(it, force))) write(inspection);
  return {
    command: commandName(mode),
    rows: describe(inspections, apply, force),
    notes: notes(inspections, apply, force),
  };
}

function notes(inspections: Inspection[], apply: boolean, force: boolean): Note[] {
  const toAdd = apply ? [] : pending(inspections);
  const manual = items(inspections, (finding) => finding.blocked !== undefined);
  const kept = force ? [] : items(inspections, diverging);
  const stale = force ? [] : items(inspections, staling, removal);
  const skipped = [...new Set(inspections.flatMap((inspection) => inspection.skipped))];
  return [
    ...note("warning", toAdd, `to add. /${commandName(APPLY)} writes ${toAdd.length === 1 ? "it" : "them"}.`),
    ...note("error", manual, "manual. No command writes these, edit the file."),
    ...note("warning", kept, `kept as yours. /${commandName(FORCE)} takes the reference instead.`),
    ...note(
      "warning",
      stale,
      `stale, a wares path that no longer exists. /${commandName(FORCE)} removes ${stale.length === 1 ? "it" : "them"}.`,
    ),
    ...note("text", skipped, "skipped, not available here. /login to the provider, then run this again."),
  ];
}

function note(tone: Note["tone"], items: string[], headline: string): Note[] {
  if (items.length === 0) return [];
  return [{ tone, text: `${items.length} ${headline}` }, ...items.map((item) => ({ tone: "text" as const, text: `  ${item}` }))];
}

function pending(inspections: Inspection[]): string[] {
  return inspections.flatMap((inspection) =>
    inspection.missing ? [inspection.target.label] : names(inspection, (finding) => !finding.blocked && writes(finding, false)),
  );
}

type Describe = (finding: Finding) => string;

function items(inspections: Inspection[], keep: (finding: Finding) => boolean, describe: Describe = change): string[] {
  return inspections.flatMap((inspection) => names(inspection, keep, describe));
}

function names(inspection: Inspection, keep: (finding: Finding) => boolean, describe: Describe = change): string[] {
  return inspection.findings.filter(keep).map((finding) => `${inspection.target.label} ${name(finding, describe)}`);
}

function name(finding: Finding, describe: Describe): string {
  return [finding.path.join("."), describe(finding), finding.blocked ? `(${finding.blocked})` : ""].filter(Boolean).join(" ");
}

function removal(finding: Finding): string {
  return `- [${(finding.stale ?? []).map(show).join(", ")}]`;
}

function change(finding: Finding): string {
  if (finding.kind === "file") return "differs from the reference";
  if (finding.kind === "members") return `+ [${(finding.absent ?? []).map(show).join(", ")}]`;
  if (finding.state === "diverged") return `${show(finding.found)} -> ${show(finding.expected)}`;
  return `= ${show(finding.expected)}`;
}

function show(value: unknown): string {
  return value === undefined ? "unset" : JSON.stringify(value);
}

function targets(): Target[] {
  const pi = agentDir();
  const herdr = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "herdr");
  const paseo = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
  return [
    {
      label: "pi settings",
      reference: "config/pi/settings.json",
      path: join(pi, "settings.json"),
      hint: "restart pi",
      scope: enabledModels,
    },
    {
      label: "model shortcuts",
      reference: "config/pi/model-shortcuts/config.json",
      path: join(pi, "model-shortcuts", "config.json"),
      hint: "/reload in pi",
      scope: shortcuts,
    },
    {
      label: "subagents",
      reference: "config/pi/pi-codex-subagents/config.json",
      path: join(pi, "pi-codex-subagents", "config.json"),
      hint: "restart pi",
    },
    {
      label: "rails-review agent",
      reference: "config/pi/pi-codex-subagents/agents/rails-review.md",
      path: join(pi, "pi-codex-subagents", "agents", "rails-review.md"),
      hint: "restart pi",
    },
    {
      label: "herdr",
      reference: "config/herdr/config.toml",
      path: join(herdr, "config.toml"),
      hint: "herdr server reload-config",
    },
    {
      label: "paseo",
      reference: "config/paseo/config.json",
      path: join(paseo, "config.json"),
      hint: "paseo reload, then reload the agents",
    },
  ];
}

function enabledModels(reference: string, usable: Usable): Scoped {
  const models: string[] = JSON.parse(reference).enabledModels;
  const skipped = models.filter((model) => !usable(model));
  if (skipped.length === 0) return { reference, skipped };
  return { reference: setJson(reference, ["enabledModels"], models.filter(usable)), skipped };
}

function shortcuts(reference: string, usable: Usable): Scoped {
  const unusable = Object.entries<{ provider: string; model: string }>(JSON.parse(reference)).filter(
    ([, shortcut]) => !usable(`${shortcut.provider}/${shortcut.model}`),
  );
  return {
    reference: unusable.reduce((text, [name]) => setJson(text, [name], undefined), reference),
    skipped: unusable.map(([, shortcut]) => `${shortcut.provider}/${shortcut.model}`),
  };
}

function inspect(target: Target, usable: Usable, force: boolean): Inspection {
  const source = readFileSync(join(ROOT, target.reference), "utf-8");
  const { reference, skipped } = target.scope ? target.scope(source, usable) : { reference: source, skipped: [] };
  if (!existsSync(target.path)) return { target, reference, skipped, missing: true, findings: [] };
  return { target, reference, skipped, missing: false, ...reconcile(target, readFileSync(target.path, "utf-8"), reference, force) };
}

function reconcile(target: Target, actual: string, reference: string, force: boolean): Reconciled {
  const extension = extname(target.reference);
  if (extension === ".json") return reconcileJson(actual, reference, force, staleWarePath);
  if (extension === ".toml") return reconcileToml(actual, reference, force, staleWarePath);
  const state = actual === reference ? "ok" : "diverged";
  return { findings: [{ kind: "file", path: [], state }], text: reference };
}

function staleWarePath(member: unknown): boolean {
  if (typeof member !== "string") return false;
  const path = expandHome(member);
  return path.startsWith(`${ROOT}/`) && !existsSync(path);
}

function describe(inspections: Inspection[], apply: boolean, force: boolean): Row[] {
  const states = inspections.map((it) => state(it, apply, force));
  const labelWidth = width(inspections.map((it) => it.target.label));
  const stateWidth = width(states);
  return inspections.map((it, index) => ({
    label: it.target.label.padEnd(labelWidth),
    state: states[index].padEnd(stateWidth),
    path: homeRelative(it.target.path),
    hint: apply && needsWrite(it, force) ? `  (${it.target.hint})` : "",
    tone: tone(it, force),
  }));
}

function tone(inspection: Inspection, force: boolean): Note["tone"] | undefined {
  if (inspection.findings.some((finding) => finding.blocked)) return "error";
  if (inspection.missing || writable(inspection, force) > 0) return "warning";
  return !force && keeping(inspection) + stales(inspection) > 0 ? "warning" : undefined;
}

function state(inspection: Inspection, apply: boolean, force: boolean): string {
  if (inspection.missing) return apply ? "created" : "create";
  const { findings } = inspection;
  const diverged = keeping(inspection);
  const counts: [string, number][] = [
    [apply ? "added" : "add", writable(inspection, false)],
    [apply ? "replaced" : "replace", force ? diverged : 0],
    ["removed", force ? stales(inspection) : 0],
    ["manual", findings.filter((finding) => finding.blocked).length],
    ["kept", force ? 0 : diverged],
    ["stale", force ? 0 : stales(inspection)],
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

function stales(inspection: Inspection): number {
  return inspection.findings.filter(staling).length;
}

function staling(finding: Finding): boolean {
  return !finding.blocked && hasStale(finding);
}

function width(strings: string[]): number {
  return Math.max(...strings.map((string) => string.length));
}

function write(inspection: Inspection): void {
  const { target } = inspection;
  mkdirSync(dirname(target.path), { recursive: true });
  writeFileSync(target.path, inspection.missing ? inspection.reference : inspection.text!);
}
