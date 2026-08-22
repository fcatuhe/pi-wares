export const HOUR = 3_600_000;
export const BAR_WIDTH_CELLS = 10;

export type Cell = "full" | "empty" | "mark";

export interface Window {
	label: string;
	usedPercent: number;
	resetsAt: number;
	durationMs: number;
}

function clamp(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function windowLabel(durationMs: number, fallback: string): string {
	if (!Number.isFinite(durationMs) || durationMs <= 0) return fallback;
	const hours = Math.round(durationMs / HOUR);
	if (hours < 48) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

// INFO: fc 11aug26 the sibling five_hour and seven_day objects report a float whose unit is unreadable below 1 (0.6 is 0.6%)
export function parseClaude(data: any): Window[] {
	const windows: Window[] = [];
	for (const [kind, durationMs, label] of [
		["session", 5 * HOUR, "5h"],
		["weekly_all", 168 * HOUR, "7d"],
	] as const) {
		const limit = data?.limits?.find((entry: any) => entry?.kind === kind);
		if (limit?.percent === undefined || !limit?.resets_at) continue;
		windows.push({
			label,
			usedPercent: clamp(Number(limit.percent)),
			resetsAt: new Date(limit.resets_at).getTime(),
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

// INFO: fc 04aug26 fill and marker both floor, so the bar never claims spend that has not happened
export function barCells(usedPercent: number, elapsed: number, width = BAR_WIDTH_CELLS): Cell[] {
	const filled = Math.floor((usedPercent / 100) * width);
	const mark = Math.min(width - 1, Math.floor((elapsed / 100) * width));
	return Array.from({ length: width }, (_, i) => (i === mark ? "mark" : i < filled ? "full" : "empty"));
}
