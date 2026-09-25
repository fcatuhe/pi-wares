import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { oauthHeaders } from "../../lib/anthropic.ts";
import { readJson, writeJson } from "../../lib/files.ts";
import { agentDir, wareDir } from "../../lib/paths.ts";

import {
  barCells,
  blockedNotice,
  type Cell,
  elapsedPercent,
  formatReset,
  paceColor,
  parseClaude,
  parseCodex,
  pollSlotTaken,
  retryAfterMs,
  type Window,
} from "./usage.ts";

const KEY = "subscription-usage-pace";
const REFRESH_MS = 5 * 60_000;
const STALE_MS = 2 * REFRESH_MS;
const REQUEST_TIMEOUT_MS = 5000;
const GLYPH: Record<Cell, string> = { full: "━", empty: "─", mark: "╵" };
const PROVIDERS: Record<string, Provider> = { anthropic: "claude", "openai-codex": "codex" };
const ACCOUNT_SWITCHED = "subscription-switch:switched";

type Provider = "claude" | "codex";

function authJson(): Record<string, any> {
  return readJson<Record<string, any>>(join(agentDir(), "auth.json")) ?? {};
}

function claudeToken(): string | undefined {
  return authJson().anthropic?.access;
}

function codexToken(): { token: string; accountId?: string } | undefined {
  const entry = authJson()["openai-codex"];
  return entry?.access ? { token: entry.access, accountId: entry.accountId } : undefined;
}

type Entry = { at: number; polledAt: number; blockedUntil: number; windows: Window[] };
type Snapshot = Record<string, Entry>;

function snapshotFile(): string {
  return join(wareDir(KEY), "snapshot.json");
}

function readSnapshot(): Snapshot {
  return readJson<Snapshot>(snapshotFile()) ?? {};
}

function patchSnapshot(provider: Provider, patch: Partial<Entry>): void {
  const all = readSnapshot();
  const prev = all[provider] ?? { at: 0, polledAt: 0, blockedUntil: 0, windows: [] };
  writeJson(snapshotFile(), { ...all, [provider]: { ...prev, ...patch } });
}

function claimPoll(provider: Provider): void {
  patchSnapshot(provider, { polledAt: Date.now() });
}

function writeSnapshot(provider: Provider, windows: Window[]): void {
  patchSnapshot(provider, { at: Date.now(), polledAt: Date.now(), blockedUntil: 0, windows });
}

type Poll = { windows: Window[]; blockedUntil?: number };

async function fetchUsage(provider: Provider): Promise<Poll> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = provider === "claude" ? await fetchClaude(signal) : await fetchCodex(signal);
  if (!res) throw new Error("not logged in");
  if (res.status === 429) {
    const now = Date.now();
    const wait = retryAfterMs(res.headers.get("retry-after"), now) ?? REFRESH_MS;
    return { windows: [], blockedUntil: now + wait };
  }
  if (!res.ok) throw new Error(`endpoint answered ${res.status}`);
  return { windows: provider === "claude" ? parseClaude(await res.json()) : parseCodex(await res.json()) };
}

function fetchClaude(signal: AbortSignal): Promise<Response> | undefined {
  const token = claudeToken();
  if (!token) return undefined;
  return fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: oauthHeaders(token),
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
  const cache = new Map<Provider, { at: number; windows: Window[] }>();
  const heldUntil = new Map<Provider, number>();
  const failures = new Map<Provider, string>();
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
    const now = Date.now();
    const entry = active ? cache.get(active) : undefined;
    const windows = entry?.windows ?? [];
    const until = (active ? heldUntil.get(active) : 0) ?? 0;
    const failure = active ? failures.get(active) : undefined;
    const notice = until > now ? blockedNotice(until, windows.length > 0) : failure && !windows.length ? `no usage data: ${failure}` : "";
    const note = notice ? ctxRef.ui.theme.fg("dim", notice) : "";
    if (!windows.length) {
      ctxRef.ui.setStatus(KEY, note || undefined);
      return;
    }
    const stale = now - (entry?.at ?? 0) > STALE_MS;
    const bars = windows.map((w) => renderWindow(w, ctxRef.ui.theme, now, stale)).join("  ");
    ctxRef.ui.setStatus(KEY, note ? `${note}  ${bars}` : bars);
  }

  function forget(provider: Provider): void {
    cache.delete(provider);
    heldUntil.delete(provider);
    failures.delete(provider);
    patchSnapshot(provider, { at: 0, polledAt: 0, blockedUntil: 0, windows: [] });
  }

  async function refresh(providerId: string | undefined, force = false): Promise<void> {
    const provider = PROVIDERS[providerId ?? ""] ?? null;
    active = provider;
    if (!provider) return paint();
    try {
      await poll(provider, force);
      failures.delete(provider);
    } catch (error) {
      failures.set(provider, error instanceof Error ? error.message : String(error));
    }
    if (active === provider) paint();
  }

  async function poll(provider: Provider, force: boolean): Promise<void> {
    const saved = readSnapshot()[provider];
    heldUntil.set(provider, saved?.blockedUntil ?? 0);
    if (saved && saved.at > (cache.get(provider)?.at ?? 0))
      cache.set(provider, { at: saved.at, windows: saved.windows.filter((w) => w.resetsAt > Date.now()) });
    paint();
    const rateLimited = Date.now() < (heldUntil.get(provider) ?? 0);
    if (!force && (pollSlotTaken(saved, Date.now(), REFRESH_MS) || rateLimited)) return;
    claimPoll(provider);
    const result = await fetchUsage(provider);
    if (result.blockedUntil) {
      patchSnapshot(provider, { blockedUntil: result.blockedUntil });
      heldUntil.set(provider, result.blockedUntil);
    }
    if (active !== provider || !result.windows.length) return;
    cache.set(provider, { at: Date.now(), windows: result.windows });
    writeSnapshot(provider, result.windows);
    heldUntil.set(provider, 0);
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
  pi.events.on(ACCOUNT_SWITCHED, () => {
    if (active) forget(active);
    void refresh(live()?.model?.provider, true);
  });
}
