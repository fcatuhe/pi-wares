// INFO: fc 02aug26 auth discovery and the two usage endpoints adapted from @ogulcancelik/pi-minimal-footer (MIT)

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HOUR = 3_600_000;
const REFRESH_MS = 5 * 60_000;
const BAR_WIDTH_CELLS = 10;
// INFO: fc 04aug26 the marker is LIGHT UP, half-height: it rides above the bar's centerline so it
// never reads as fill
const GLYPH: Record<Cell, string> = { full: "━", empty: "─", mark: "╵" };
const PROVIDERS: Record<string, Provider> = { anthropic: "claude", "openai-codex": "codex" };
const SNAPSHOT_FILE = join(homedir(), ".pi", "agent", "usage-pace.json");

type Provider = "claude" | "codex";
type Cell = "full" | "empty" | "mark";

export interface Window {
	label: string;
	usedPercent: number;
	resetsAt: number;
	durationMs: number;
}

function authJson(): Record<string, any> {
	try {
		return JSON.parse(readFileSync(join(homedir(), ".pi", "agent", "auth.json"), "utf8"));
	} catch {
		return {};
	}
}

function claudeToken(): string | undefined {
	const access = authJson().anthropic?.access;
	if (access) return access;
	try {
		const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "ignore"],
		});
		return JSON.parse(raw.trim()).claudeAiOauth?.accessToken;
	} catch {
		return undefined;
	}
}

function codexToken(): { token: string; accountId?: string } | undefined {
	const entry = authJson()["openai-codex"];
	if (entry?.access) return { token: entry.access, accountId: entry.accountId };
	try {
		const data = JSON.parse(
			readFileSync(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json"), "utf8"),
		);
		if (data.tokens?.access_token) return { token: data.tokens.access_token, accountId: data.tokens.account_id };
	} catch {}
	return undefined;
}

function clamp(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

// INFO: fc 02aug26 Anthropic reports utilization as either a 0-1 fraction or a 0-100 percent
function normalizePercent(value: number): number {
	return clamp(value > 0 && value <= 1 ? value * 100 : value);
}

function windowLabel(durationMs: number, fallback: string): string {
	if (!Number.isFinite(durationMs) || durationMs <= 0) return fallback;
	const hours = Math.round(durationMs / HOUR);
	if (hours < 48) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

export function parseClaude(data: any): Window[] {
	const windows: Window[] = [];
	for (const [key, durationMs, label] of [
		["five_hour", 5 * HOUR, "5h"],
		["seven_day", 168 * HOUR, "7d"],
	] as const) {
		const w = data?.[key];
		if (w?.utilization === undefined || !w?.resets_at) continue;
		windows.push({
			label,
			usedPercent: normalizePercent(Number(w.utilization)),
			resetsAt: new Date(w.resets_at).getTime(),
			durationMs,
		});
	}
	return windows;
}

export function parseCodex(data: any): Window[] {
	const windows: Window[] = [];
	for (const [key, fallbackMs, fallbackLabel] of [
		["primary_window", 5 * HOUR, "5h"],
		["secondary_window", 168 * HOUR, "7d"],
	] as const) {
		const w = data?.rate_limit?.[key];
		if (!w || w.used_percent === undefined || !w.reset_at) continue;
		const durationMs = Number(w.limit_window_seconds) > 0 ? Number(w.limit_window_seconds) * 1000 : fallbackMs;
		windows.push({
			label: windowLabel(durationMs, fallbackLabel),
			usedPercent: clamp(Number(w.used_percent)),
			resetsAt: Number(w.reset_at) * 1000,
			durationMs,
		});
	}
	return windows;
}

// INFO: fc 31jul26 the snapshot file shares last good windows across sessions, one poll serves all of them;
// last writer wins, fine for a display cache, needs per-provider locking only if ever read back as truth
type Entry = { at: number; polledAt: number; windows: Window[] };
type Snapshot = Record<string, Entry>;

function readSnapshot(): Snapshot {
	try {
		return JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8"));
	} catch {
		return {};
	}
}

function patchSnapshot(provider: Provider, patch: Partial<Entry>): void {
	try {
		const all = readSnapshot();
		const prev = all[provider] ?? { at: 0, polledAt: 0, windows: [] };
		writeFileSync(SNAPSHOT_FILE, JSON.stringify({ ...all, [provider]: { ...prev, ...patch } }));
	} catch {}
}

// INFO: fc 02aug26 polledAt is the attempt, at the last success: a failed attempt still holds the poll
// slot without making stale numbers look fresh
function claimPoll(provider: Provider): void {
	patchSnapshot(provider, { polledAt: Date.now() });
}

function writeSnapshot(provider: Provider, windows: Window[]): void {
	patchSnapshot(provider, { at: Date.now(), polledAt: Date.now(), windows });
}

async function fetchUsage(provider: Provider): Promise<Window[]> {
	const signal = AbortSignal.timeout(5000);
	if (provider === "claude") {
		const token = claudeToken();
		if (!token) return [];
		const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
			headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
			signal,
		});
		return res.ok ? parseClaude(await res.json()) : [];
	}
	const creds = codexToken();
	if (!creds) return [];
	const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
		headers: {
			Authorization: `Bearer ${creds.token}`,
			Accept: "application/json",
			"User-Agent": "pi-agent",
			...(creds.accountId ? { "ChatGPT-Account-Id": creds.accountId } : {}),
		},
		signal,
	});
	return res.ok ? parseCodex(await res.json()) : [];
}

export function elapsedPercent(w: Window, now: number): number {
	return clamp(((w.durationMs - (w.resetsAt - now)) / w.durationMs) * 100);
}

export function formatReset(resetsAt: number, now: number): string {
	const mins = Math.floor((resetsAt - now) / 60_000);
	if (mins <= 0) return "now";
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return mins % 60 ? `${hours}h${mins % 60}m` : `${hours}h`;
	return hours % 24 ? `${Math.floor(hours / 24)}d${hours % 24}h` : `${Math.floor(hours / 24)}d`;
}

const PACE_JITTER_POINTS = 2;
export function paceColor(usedPercent: number, elapsed: number): "success" | "warning" | "error" {
	if (usedPercent >= 90) return "error";
	const over = usedPercent - elapsed - PACE_JITTER_POINTS;
	if (over <= 0) return "success";
	return over <= 10 ? "warning" : "error";
}

// INFO: fc 04aug26 fill and marker both floor: a cell is colored only once its quota is fully spent,
// so the bar never claims spend that has not happened and both sides of the comparison share a scale
export function barCells(usedPercent: number, elapsed: number, width = BAR_WIDTH_CELLS): Cell[] {
	const filled = Math.floor((usedPercent / 100) * width);
	const mark = Math.min(width - 1, Math.floor((elapsed / 100) * width));
	return Array.from({ length: width }, (_, i) => (i === mark ? "mark" : i < filled ? "full" : "empty"));
}

function renderWindow(w: Window, theme: any, now: number, stale: boolean): string {
	const elapsed = elapsedPercent(w, now);
	const color = paceColor(w.usedPercent, elapsed);
	const bar = barCells(w.usedPercent, elapsed)
		.map((cell) => theme.fg(cell === "mark" ? "accent" : cell === "empty" ? "dim" : color, GLYPH[cell]))
		.join("");
	return (
		theme.fg("dim", `${stale ? "~" : ""}${w.label} `) +
		bar +
		theme.fg("dim", ` ${Math.round(w.usedPercent)}% ${formatReset(w.resetsAt, now)}`)
	);
}

export default function (pi: ExtensionAPI) {
	const KEY = "usage";
	const cache = new Map<Provider, { at: number; windows: Window[] }>();
	const STALE_MS = 2 * REFRESH_MS;
	let active: Provider | null = null;
	let ctxRef: any = null;
	let timer: ReturnType<typeof setInterval> | null = null;

	// INFO: fc 31jul26 countdown text only refreshes with the 5min poll, so it can lag
	// by up to 5 minutes. Re-render on turn_end if that ever reads as wrong.
	// INFO: fc 02aug26 ctx getters throw once the session is replaced/reloaded; drop the dead
	// ctx and stop the timer, a fresh one arrives with the next session_start
	function live(): any {
		try {
			ctxRef?.hasUI;
			return ctxRef;
		} catch {
			ctxRef = null;
			if (timer) clearInterval(timer);
			timer = null;
			return null;
		}
	}

	function paint(): void {
		if (!live()?.hasUI) return;
		const entry = active ? cache.get(active) : undefined;
		if (!entry?.windows.length) {
			ctxRef.ui.setStatus(KEY, undefined);
			return;
		}
		const now = Date.now();
		const stale = now - entry.at > STALE_MS;
		ctxRef.ui.setStatus(KEY, entry.windows.map((w) => renderWindow(w, ctxRef.ui.theme, now, stale)).join("  "));
	}

	async function refresh(providerId: string | undefined): Promise<void> {
		const provider = PROVIDERS[providerId ?? ""] ?? null;
		active = provider;
		const saved = provider ? readSnapshot()[provider] : undefined;
		if (provider && saved && saved.at > (cache.get(provider)?.at ?? 0))
			cache.set(provider, { at: saved.at, windows: saved.windows.filter((w) => w.resetsAt > Date.now()) });
		paint();
		if (!provider) return;
		const polledRecentlyBySomeSession = saved && Date.now() - saved.polledAt < REFRESH_MS;
		if (polledRecentlyBySomeSession) return;
		claimPoll(provider);
		try {
			const windows = await fetchUsage(provider);
			const modelSwitchedMidFlight = active !== provider;
			if (modelSwitchedMidFlight) return;
			if (windows.length) {
				cache.set(provider, { at: Date.now(), windows });
				writeSnapshot(provider, windows);
			}
			paint();
		} catch {}
	}

	function start(ctx: any): void {
		ctxRef = ctx;
		if (!ctx.hasUI) return;
		void refresh(ctx.model?.provider);
		if (!timer) {
			timer = setInterval(() => void refresh(live()?.model?.provider), REFRESH_MS);
			timer.unref?.();
		}
	}

	pi.on("session_start", (_event, ctx) => start(ctx));
	pi.on("model_select", (event, ctx) => {
		ctxRef = ctx;
		void refresh(event.model?.provider ?? ctx.model?.provider);
	});
}
