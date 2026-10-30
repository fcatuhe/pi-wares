import type { UsageWindow } from "../shared/usage";

export type PaceStage = "on_pace" | "reserve" | "deficit";

export interface Pace {
  expectedPct: number;
  deltaPct: number;
  stage: PaceStage;
  runsOutInMs: number | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function usedPct(rateWindow: UsageWindow): number | null {
  if (rateWindow.usedPct != null) return rateWindow.usedPct;
  if (rateWindow.remainingPct != null) return 100 - rateWindow.remainingPct;
  return null;
}

// INFO: fc 30oct26 ports CodexBar's UsagePace, with its thresholds: hide before 3% of the window, call within 2 points on pace
export function windowPace(rateWindow: UsageWindow, now: number): Pace | null {
  const used = usedPct(rateWindow);
  if (used == null || !rateWindow.resetsAt) return null;
  const resetsAt = Date.parse(rateWindow.resetsAt);
  const duration = windowDurationMs(rateWindow.id, resetsAt);
  if (duration == null || Number.isNaN(resetsAt)) return null;

  const untilReset = resetsAt - now;
  if (untilReset <= 0 || untilReset > duration) return null;
  const elapsed = duration - untilReset;
  const expectedPct = (elapsed / duration) * 100;
  const actual = clamp(used);
  if (actual >= 100 || expectedPct < 3) return null;

  const deltaPct = actual - expectedPct;
  return { expectedPct, deltaPct, stage: stageOf(deltaPct), runsOutInMs: runsOutIn(actual, elapsed, untilReset) };
}

export function windowDurationMs(id: string, resetsAt: number): number | null {
  const period = id.slice(id.lastIndexOf(":") + 1);
  const seconds = /^(\d+)s$/.exec(period);
  if (seconds) return Number(seconds[1]) * 1000;
  if (period === "five_hour") return 5 * HOUR;
  if (period.startsWith("weekly")) return 7 * DAY;
  if (period.startsWith("daily")) return DAY;
  if (period.startsWith("monthly")) return resetsAt - oneMonthBefore(resetsAt);
  return null;
}

function oneMonthBefore(at: number): number {
  const date = new Date(at);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.getTime();
}

function stageOf(deltaPct: number): PaceStage {
  if (Math.abs(deltaPct) <= 2) return "on_pace";
  return deltaPct > 0 ? "deficit" : "reserve";
}

function runsOutIn(actual: number, elapsed: number, untilReset: number): number | null {
  if (actual === 0) return null;
  const left = ((100 - actual) / actual) * elapsed;
  return left >= untilReset ? null : left;
}

export function paceLabel(pace: Pace): string {
  const delta = Math.round(Math.abs(pace.deltaPct));
  if (pace.stage === "on_pace" || delta === 0) return "On pace";
  return pace.stage === "deficit" ? `${delta}% in deficit` : `${delta}% in reserve`;
}

export function outlookLabel(pace: Pace): string {
  if (pace.runsOutInMs == null) return "Lasts until reset";
  const duration = formatDuration(pace.runsOutInMs);
  return duration ? `Runs out in ${duration}` : "Runs out now";
}

export function formatDuration(ms: number): string | null {
  const minutes = Math.floor(ms / 60_000);
  if (minutes <= 0) return null;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  return `${rest}m`;
}

export function resetLabel(resetsAt: string | null | undefined, now: number): string | null {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (Number.isNaN(at)) return null;
  const duration = formatDuration(at - now);
  return duration ? `resets in ${duration}` : "resetting now";
}

export function agoLabel(at: string | undefined, now: number): string | null {
  if (!at) return null;
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (Number.isNaN(minutes)) return null;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function clamp(pct: number): number {
  return Math.max(0, Math.min(100, pct));
}
