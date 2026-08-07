/** Self-check: npx tsx extensions/usage-pace/test.ts */
import assert from "node:assert/strict";
import { barCells, elapsedPercent, formatReset, paceColor, parseClaude, parseCodex } from "./usage.ts";

const HOUR = 3_600_000;
const now = Date.now();

// Claude: fraction utilization, 3h left of a 5h window => 40% elapsed, 42% used => within slack.
const claude = parseClaude({
	five_hour: { utilization: 0.42, resets_at: new Date(now + 3 * HOUR).toISOString() },
	seven_day: { utilization: 61, resets_at: new Date(now + 2 * 24 * HOUR).toISOString() },
});
assert.equal(claude.length, 2);
assert.equal(Math.round(claude[0].usedPercent), 42);
assert.equal(Math.round(elapsedPercent(claude[0], now)), 40);
assert.equal(paceColor(claude[0].usedPercent, elapsedPercent(claude[0], now)), "success");
// 0-100 form must not be re-scaled; 5 of 7 days gone => 71% elapsed, 61% used => under pace.
assert.equal(paceColor(claude[1].usedPercent, elapsedPercent(claude[1], now)), "success");
assert.equal(Math.round(claude[1].usedPercent), 61);
assert.equal(claude[1].label, "7d");
assert.equal(Math.round(elapsedPercent(claude[1], now)), 71);

// Codex: percent + epoch seconds + explicit window length.
const codex = parseCodex({
	rate_limit: {
		primary_window: { used_percent: 80, reset_at: Math.floor((now + HOUR) / 1000), limit_window_seconds: 5 * 3600 },
		secondary_window: { used_percent: 12, reset_at: Math.floor((now + 6 * 24 * HOUR) / 1000) },
	},
});
assert.equal(codex[0].label, "5h");
assert.equal(Math.round(elapsedPercent(codex[0], now)), 80); // 4h of 5h spent
assert.equal(paceColor(codex[0].usedPercent, elapsedPercent(codex[0], now)), "success");
assert.equal(codex[1].label, "7d"); // duration fell back to 168h
assert.equal(paceColor(codex[1].usedPercent, elapsedPercent(codex[1], now)), "success");

// Pace ladder: on pace (+2pts slack) green, up to +10pts beyond that yellow, then red.
assert.equal(paceColor(40, 40), "success");
assert.equal(paceColor(42, 40), "success"); // jitter slack
assert.equal(paceColor(43, 40), "warning");
assert.equal(paceColor(52, 40), "warning");
assert.equal(paceColor(53, 40), "error");
// The README's weekly examples: one day of a 7d window is 14.3% elapsed.
assert.equal(paceColor(22, 100 / 7), "warning");
assert.equal(paceColor(40, 100 / 7), "error");
// Under 10% of quota left is red no matter how well paced.
assert.equal(paceColor(90, 95), "error");
assert.equal(paceColor(89, 95), "success");

// Malformed / missing payloads must not throw or invent windows.
assert.deepEqual(parseClaude(undefined), []);
assert.deepEqual(parseClaude({ five_hour: { utilization: 0.5 } }), []); // no resets_at
assert.deepEqual(parseCodex({ rate_limit: {} }), []);

assert.equal(formatReset(now + 45 * 60_000, now), "45m");
assert.equal(formatReset(now + 2 * HOUR + 38 * 60_000, now), "2h38m");
assert.equal(formatReset(now + 3 * 24 * HOUR + 2 * HOUR, now), "3d2h");
assert.equal(formatReset(now - 1000, now), "now");

// Bar: one cell per 1/width of the quota, so the default 10-wide bar steps every 10%.
assert.equal(barCells(42, 40).length, 10);
assert.deepEqual(barCells(42, 40).slice(0, 5), ["full", "full", "full", "full", "mark"]);
assert.deepEqual(barCells(0, 0, 4), ["mark", "empty", "empty", "empty"]);
assert.deepEqual(barCells(50, 100, 4), ["full", "full", "empty", "mark"]);
assert.deepEqual(barCells(100, 50, 4), ["full", "full", "mark", "full"]);
// Fill truncates: a part-spent cell stays dim rather than claiming quota that is still there.
assert.deepEqual(barCells(60, 100, 4), ["full", "full", "empty", "mark"]);
assert.deepEqual(barCells(99, 0, 4), ["mark", "full", "full", "empty"]);
assert.deepEqual(barCells(24, 100, 4), ["empty", "empty", "empty", "mark"]);
// Narrow bars stay in range rather than pushing the marker off the end.
assert.deepEqual(barCells(42, 40, 2), ["mark", "empty"]);
assert.deepEqual(barCells(100, 100, 1), ["mark"]);

// Clamps: past reset and over-100 usage stay in range.
assert.equal(elapsedPercent({ label: "5h", usedPercent: 0, resetsAt: now - HOUR, durationMs: 5 * HOUR }, now), 100);

console.log("usage-pace: ok");
