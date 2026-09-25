import assert from "node:assert/strict";
import { test } from "node:test";
import {
  barCells,
  blockedNotice,
  elapsedPercent,
  formatReset,
  paceColor,
  parseClaude,
  parseCodex,
  pollSlotTaken,
  retryAfterMs,
} from "./usage.ts";

const HOUR = 3_600_000;
const now = Date.now();

const claude = parseClaude({
  five_hour: { utilization: 42.0, resets_at: new Date(now + 3 * HOUR).toISOString() },
  seven_day: { utilization: 61.0, resets_at: new Date(now + 2 * 24 * HOUR).toISOString() },
  limits: [
    { kind: "session", group: "session", percent: 42, resets_at: new Date(now + 3 * HOUR).toISOString() },
    { kind: "weekly_all", group: "weekly", percent: 61, resets_at: new Date(now + 2 * 24 * HOUR).toISOString() },
    { kind: "weekly_scoped", group: "weekly", percent: 99, resets_at: new Date(now + 2 * 24 * HOUR).toISOString() },
  ],
});

test("Claude limits parse into the session and weekly windows, both within pace", () => {
  assert.equal(claude.length, 2, "weekly_scoped was kept, but the footer only fits two bars");
  assert.equal(Math.round(claude[0].usedPercent), 42);
  // 3h left of a 5h window
  assert.equal(Math.round(elapsedPercent(claude[0], now)), 40);
  assert.equal(paceColor(claude[0].usedPercent, elapsedPercent(claude[0], now)), "success");
  assert.equal(paceColor(claude[1].usedPercent, elapsedPercent(claude[1], now)), "success");
  assert.equal(Math.round(claude[1].usedPercent), 61);
  assert.equal(claude[1].label, "7d");
  // 5 of 7 days gone
  assert.equal(Math.round(elapsedPercent(claude[1], now)), 71);
});

test("Codex windows parse from percent, epoch seconds and an explicit or default window length", () => {
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
});

test("on pace with 2 points of slack is green, up to 10 points beyond that yellow, then red", () => {
  assert.equal(paceColor(40, 40), "success");
  assert.equal(paceColor(42, 40), "success");
  assert.equal(paceColor(43, 40), "warning");
  assert.equal(paceColor(52, 40), "warning");
  assert.equal(paceColor(53, 40), "error");
});

test("the README's weekly examples hold, one day of a 7d window being 14.3% elapsed", () => {
  assert.equal(paceColor(22, 100 / 7), "warning");
  assert.equal(paceColor(40, 100 / 7), "error");
});

test("under 10% of quota left is red no matter how well paced", () => {
  assert.equal(paceColor(90, 95), "error");
  assert.equal(paceColor(89, 95), "success");
});

test("a sub-1% window stays sub-1%, percent is never rescaled by magnitude", () => {
  assert.equal(
    parseClaude({ limits: [{ kind: "session", percent: 0.6, resets_at: new Date(now + HOUR).toISOString() }] })[0].usedPercent,
    0.6,
  );
});

test("malformed or missing payloads neither throw nor invent windows", () => {
  assert.deepEqual(parseClaude(undefined), []);
  assert.deepEqual(parseClaude({ limits: [{ kind: "session", percent: 50 }] }), [], "a limit without resets_at became a window");
  assert.deepEqual(parseClaude({ five_hour: { utilization: 50, resets_at: new Date(now + HOUR).toISOString() } }), []);
  assert.deepEqual(parseCodex({ rate_limit: {} }), []);
});

test("formatReset shows the time left in its two largest units", () => {
  assert.equal(formatReset(now + 45 * 60_000, now), "45m");
  assert.equal(formatReset(now + 2 * HOUR + 38 * 60_000, now), "2h38m");
  assert.equal(formatReset(now + 3 * 24 * HOUR + 2 * HOUR, now), "3d2h");
  assert.equal(formatReset(now - 1000, now), "now");
});

test("Retry-After reads delta seconds or an HTTP date, and nothing else", () => {
  assert.equal(retryAfterMs("1907", now), 1_907_000);
  assert.equal(retryAfterMs(" 30 ", now), 30_000);
  assert.equal(retryAfterMs("0", now), 0);
  assert.equal(retryAfterMs(new Date(now + 2 * HOUR).toUTCString(), now), 2 * HOUR - (now % 1000)); // the date header floors to the second
  assert.equal(retryAfterMs(new Date(now - HOUR).toUTCString(), now), 0);
  assert.equal(retryAfterMs("-60", now), 0);
  assert.equal(retryAfterMs("soon", now), undefined);
  assert.equal(retryAfterMs(null, now), undefined);
  assert.equal(retryAfterMs("", now), undefined);
});

test("rate-limited, the notice says when the numbers come back and whether the bars on screen are old", () => {
  assert.equal(blockedNotice(new Date(2026, 7, 30, 0, 17).getTime(), false), "no usage data until 00:17");
  assert.equal(blockedNotice(new Date(2026, 7, 30, 0, 17).getTime(), true), "no update until 00:17");
  assert.equal(blockedNotice(new Date(2026, 7, 30, 9, 5).getTime(), true), "no update until 09:05");
});

test("the bar has one cell per 1/width of the quota, so the default 10-wide bar steps every 10%", () => {
  assert.equal(barCells(42, 40).length, 10);
  assert.deepEqual(barCells(42, 40).slice(0, 5), ["full", "full", "full", "full", "mark"]);
  assert.deepEqual(barCells(0, 0, 4), ["mark", "empty", "empty", "empty"]);
  assert.deepEqual(barCells(50, 100, 4), ["full", "full", "empty", "mark"]);
  assert.deepEqual(barCells(100, 50, 4), ["full", "full", "mark", "full"]);
});

test("the fill truncates, so a part-spent cell stays dim rather than claiming quota that is still there", () => {
  assert.deepEqual(barCells(60, 100, 4), ["full", "full", "empty", "mark"]);
  assert.deepEqual(barCells(99, 0, 4), ["mark", "full", "full", "empty"]);
  assert.deepEqual(barCells(24, 100, 4), ["empty", "empty", "empty", "mark"]);
});

test("narrow bars keep the marker in range rather than pushing it off the end", () => {
  assert.deepEqual(barCells(42, 40, 2), ["mark", "empty"]);
  assert.deepEqual(barCells(100, 100, 1), ["mark"]);
});

test("elapsed time past the reset clamps to 100%", () => {
  assert.equal(elapsedPercent({ label: "5h", usedPercent: 0, resetsAt: now - HOUR, durationMs: 5 * HOUR }, now), 100);
});

test("another session's fresh read holds the poll slot, an empty cache never does", () => {
  const held = { polledAt: now - 60_000, windows: claude };
  assert.equal(pollSlotTaken(held, now, 5 * 60_000), true);
  assert.equal(pollSlotTaken({ ...held, polledAt: now - 6 * 60_000 }, now, 5 * 60_000), false);
  assert.equal(pollSlotTaken({ ...held, windows: [] }, now, 5 * 60_000), false);
  assert.equal(pollSlotTaken(undefined, now, 5 * 60_000), false);
});
