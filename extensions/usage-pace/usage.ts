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
