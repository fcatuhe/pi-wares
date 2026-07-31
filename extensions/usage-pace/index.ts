/**
 * Usage Pace Extension
 *
 * Footer status showing the active subscription's usage as a bar with a pace
 * marker (╵ = how far into the window we are) plus a reset countdown. A light
 * gray track spans the whole window; the thick overlay is quota used. Overlay
 * short of the marker = under pace, past it = burning faster than the clock.
 *
 * Shows Claude (anthropic) or Codex (openai-codex), whichever model is active.
 * Set via ctx.ui.setStatus(), so the built-in footer, compact-footer and any
 * other footer pick it up without extra wiring.
 *
 * Auth discovery and the two usage endpoints are adapted from
 * @ogulcancelik/pi-minimal-footer (MIT).
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HOUR = 3_600_000;
const REFRESH_MS = 5 * 60_000;
const BAR_W = Number(process.env.PI_USAGE_BAR_WIDTH) || 6;
// Half-height tick so the bar stays visually flat. Override if the font lacks U+2575.
const MARKER = process.env.PI_USAGE_MARKER || "╵";
const PROVIDERS: Record<string, Provider> = { anthropic: "claude", "openai-codex": "codex" };
const SNAPSHOT_FILE = join(homedir(), ".pi", "agent", "usage-pace.json");

type Provider = "claude" | "codex";

/** Raw window state. Pace and countdown are derived at render time so a cached
 *  snapshot stays truthful between refreshes. */
export interface Window {
	label: string;
	usedPercent: number;
	/** Window end, epoch ms. */
	resetsAt: number;
	durationMs: number;
}

// ============ Auth ============

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
	// Fallback: Claude Code's macOS keychain entry.
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
	// Fallback: Codex CLI's own auth file.
	try {
		const data = JSON.parse(
			readFileSync(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json"), "utf8"),
		);
		if (data.tokens?.access_token) return { token: data.tokens.access_token, accountId: data.tokens.account_id };
	} catch {}
	return undefined;
}

// ============ Parsing ============

function clamp(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/** Anthropic reports utilization as either a 0-1 fraction or a 0-100 percent. */
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

// ============ Snapshot ============

/** Last good windows, shared across sessions: a new session shows a bar before its
 *  first poll, and one poll per window serves every session, which matters because
 *  the Anthropic usage endpoint answers 429 when polled hard.
 *  INFO: fc 31jul26 last writer wins across concurrent sessions, fine for a display
 *  cache. Needs per-provider locking only if a caller ever reads it back as truth. */
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

/** Stake the next poll before doing it, so sessions starting in the same second
 *  don't all fetch. `polledAt` is the attempt, `at` the last success, so a failed
 *  attempt still holds the slot without making stale numbers look fresh. */
function claimPoll(provider: Provider): void {
	patchSnapshot(provider, { polledAt: Date.now() });
}

function writeSnapshot(provider: Provider, windows: Window[]): void {
	patchSnapshot(provider, { at: Date.now(), polledAt: Date.now(), windows });
}

// ============ Fetching ============

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

// ============ Rendering ============

/** Share of the window already spent, from its end time and total length. */
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

/**
 * Pace, not absolute usage: are we ahead of the window's clock?
 * Exception: under 10% of quota left is red however well paced, since there is
 * no room to spend at any rate.
 *
 * SLACK absorbs ordinary jitter so a couple of points over the clock isn't amber.
 */
const SLACK = 2;
export function paceColor(usedPercent: number, elapsed: number): "success" | "warning" | "error" {
	if (usedPercent >= 90) return "error";
	const over = usedPercent - elapsed - SLACK;
	if (over <= 0) return "success";
	return over <= 10 ? "warning" : "error";
}

function renderWindow(w: Window, theme: any, now: number, stale: boolean): string {
	const elapsed = elapsedPercent(w, now);
	const filled = Math.round((w.usedPercent / 100) * BAR_W);
	const mark = Math.min(BAR_W - 1, Math.floor((elapsed / 100) * BAR_W));
	const color = paceColor(w.usedPercent, elapsed);

	let bar = "";
	for (let i = 0; i < BAR_W; i++) {
		if (i === mark) bar += theme.fg("accent", MARKER);
		else bar += i < filled ? theme.fg(color, "━") : theme.fg("dim", "─");
	}
	return (
		theme.fg("dim", `${stale ? "~" : ""}${w.label} `) +
		bar +
		theme.fg("dim", ` ${Math.round(w.usedPercent)}% ${formatReset(w.resetsAt, now)}`)
	);
}

// ============ Extension ============

export default function (pi: ExtensionAPI) {
	const KEY = "usage";
	const cache = new Map<Provider, { at: number; windows: Window[] }>();
	// Two missed polls: usedPercent is old enough to mislead, so the label wears a ~.
	const STALE_MS = 2 * REFRESH_MS;
	let active: Provider | null = null;
	let ctxRef: any = null;
	let timer: ReturnType<typeof setInterval> | null = null;

	// INFO: fc 31jul26 countdown text only refreshes with the 5min poll, so it can lag
	// by up to 5 minutes. Re-render on turn_end if that ever reads as wrong.
	// ctx getters throw once the session is replaced/reloaded; a fresh ctx arrives
	// with the next session_start, so drop the dead one and stop the timer.
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
		paint(); // cached snapshot first, or clears for non-subscription providers
		if (!provider) return;
		if (saved && Date.now() - saved.polledAt < REFRESH_MS) return; // another session has this window
		claimPoll(provider);
		try {
			const windows = await fetchUsage(provider);
			if (active !== provider) return; // model switched mid-flight
			if (windows.length) {
				cache.set(provider, { at: Date.now(), windows }); // keep last good on transient failure
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
	pi.on("session_switch", (_event, ctx) => start(ctx));
	pi.on("model_select", (event, ctx) => {
		ctxRef = ctx;
		void refresh(event.model?.provider ?? ctx.model?.provider);
	});
}
