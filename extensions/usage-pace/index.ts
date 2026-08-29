import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

import {
	barCells,
	type Cell,
	elapsedPercent,
	formatReset,
	paceColor,
	parseClaude,
	parseCodex,
	retryAfterMs,
	type Window,
} from "./usage.ts";

const REFRESH_MS = 5 * 60_000;
// INFO: fc 04aug26 half-height, so the marker rides above the bar's centerline and never reads as fill
const GLYPH: Record<Cell, string> = { full: "━", empty: "─", mark: "╵" };
const PROVIDERS: Record<string, Provider> = { anthropic: "claude", "openai-codex": "codex" };
const SNAPSHOT_FILE = join(getAgentDir(), "usage-pace.json");

type Provider = "claude" | "codex";

function authJson(): Record<string, any> {
	try {
		return JSON.parse(readFileSync(join(getAgentDir(), "auth.json"), "utf8"));
	} catch {
		return {};
	}
}

function claudeToken(): string | undefined {
	return authJson().anthropic?.access;
}

function codexToken(): { token: string; accountId?: string } | undefined {
	const entry = authJson()["openai-codex"];
	return entry?.access ? { token: entry.access, accountId: entry.accountId } : undefined;
}

// INFO: fc 31jul26 last writer wins, fine for a display cache, and only a truth source would need locking
type Entry = { at: number; polledAt: number; blockedUntil: number; windows: Window[] };
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
		const prev = all[provider] ?? { at: 0, polledAt: 0, blockedUntil: 0, windows: [] };
		writeFileSync(SNAPSHOT_FILE, JSON.stringify({ ...all, [provider]: { ...prev, ...patch } }));
	} catch {}
}

// INFO: fc 02aug26 polledAt is the attempt, so a failed one holds the slot without making stale numbers look fresh
function claimPoll(provider: Provider): void {
	patchSnapshot(provider, { polledAt: Date.now() });
}

function writeSnapshot(provider: Provider, windows: Window[]): void {
	patchSnapshot(provider, { at: Date.now(), polledAt: Date.now(), blockedUntil: 0, windows });
}

type Poll = { windows: Window[]; blockedUntil?: number };

async function fetchUsage(provider: Provider): Promise<Poll> {
	const signal = AbortSignal.timeout(5000);
	const res = provider === "claude" ? await fetchClaude(signal) : await fetchCodex(signal);
	if (!res) return { windows: [] };
	if (res.status === 429) {
		const now = Date.now();
		const wait = retryAfterMs(res.headers.get("retry-after"), now);
		return wait === undefined ? { windows: [] } : { windows: [], blockedUntil: now + wait };
	}
	if (!res.ok) return { windows: [] };
	return { windows: provider === "claude" ? parseClaude(await res.json()) : parseCodex(await res.json()) };
}

function fetchClaude(signal: AbortSignal): Promise<Response> | undefined {
	const token = claudeToken();
	if (!token) return undefined;
	return fetch("https://api.anthropic.com/api/oauth/usage", {
		headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
		signal,
	});
}

function fetchCodex(signal: AbortSignal): Promise<Response> | undefined {
	const creds = codexToken();
	if (!creds) return undefined;
	return fetch("https://chatgpt.com/backend-api/wham/usage", {
		headers: {
			Authorization: `Bearer ${creds.token}`,
			Accept: "application/json",
			"User-Agent": "pi-agent",
			...(creds.accountId ? { "ChatGPT-Account-Id": creds.accountId } : {}),
		},
		signal,
	});
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

	// INFO: fc 02aug26 ctx getters throw once the session is replaced, and a fresh ctx arrives with the next session_start
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
		const rateLimited = saved?.blockedUntil ? Date.now() < saved.blockedUntil : false;
		if (polledRecentlyBySomeSession || rateLimited) return;
		claimPoll(provider);
		try {
			const { windows, blockedUntil } = await fetchUsage(provider);
			if (blockedUntil) patchSnapshot(provider, { blockedUntil });
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
