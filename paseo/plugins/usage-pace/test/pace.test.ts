import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, outlookLabel, paceLabel, windowDurationMs, windowPace } from "../client/pace.ts";
import { resolveReport, summaryWindows } from "../client/report.ts";
import type { UsageEntry } from "../shared/usage.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.parse("2026-10-30T12:00:00Z");

function weekly(usedPct: number, untilReset: number, id = "weekly") {
  return { id, label: "Weekly", usedPct, resetsAt: new Date(now + untilReset).toISOString() };
}

test("under the elapsed share is in reserve and lasts until reset", () => {
  const pace = windowPace(weekly(40, 3.5 * DAY), now);
  assert.ok(pace);
  assert.equal(pace.stage, "reserve");
  assert.equal(paceLabel(pace), "10% in reserve");
  assert.equal(outlookLabel(pace), "Lasts until reset");
});

test("over the elapsed share is in deficit and runs out before reset", () => {
  const pace = windowPace(weekly(60, 3.5 * DAY), now);
  assert.ok(pace);
  assert.equal(paceLabel(pace), "10% in deficit");
  // 60% in 3.5 days leaves 40% for 3.5 * 40 / 60 = 2.33 days.
  assert.equal(outlookLabel(pace), "Runs out in 2d 8h");
});

test("within two points is on pace", () => {
  const pace = windowPace(weekly(51.5, 3.5 * DAY), now);
  assert.equal(pace?.stage, "on_pace");
  assert.equal(paceLabel(pace!), "On pace");
});

test("hides the pace early in the window, once exhausted, and for unknown windows", () => {
  assert.equal(windowPace({ ...weekly(1, 4.9 * HOUR), id: "five_hour" }, now), null);
  assert.equal(windowPace(weekly(100, 2 * DAY), now), null);
  assert.equal(windowPace(weekly(30, 2 * DAY, "rolling"), now), null);
  assert.equal(windowPace(weekly(30, 8 * DAY), now), null);
});

test("reads the window length from its id", () => {
  const reset = Date.parse("2026-11-01T00:00:00Z");
  assert.equal(windowDurationMs("five_hour", reset), 5 * HOUR);
  assert.equal(windowDurationMs("code_review:weekly", reset), 7 * DAY);
  assert.equal(windowDurationMs("weekly_model_fable", reset), 7 * DAY);
  assert.equal(windowDurationMs("gpt-5:86400s", reset), DAY);
  assert.equal(windowDurationMs("monthly", reset), 31 * DAY);
});

test("formats durations in two units at most", () => {
  assert.equal(formatDuration(30_000), null);
  assert.equal(formatDuration(43 * 60_000), "43m");
  assert.equal(formatDuration(2 * HOUR), "2h");
  assert.equal(formatDuration(HOUR + 12 * 60_000), "1h 12m");
  assert.equal(formatDuration(4 * DAY + 23 * HOUR + 59 * 60_000), "4d 23h");
});

test("a failed report keeps its last successful windows and names each login's problem", () => {
  const entry: UsageEntry = {
    id: "codex:acct",
    sourceId: "codex",
    sourceLabel: "Codex",
    account: {},
    fetchedAt: "2026-10-30T11:59:00Z",
    report: { status: "error", error: "timeout" },
    lastSuccessful: {
      fetchedAt: "2026-10-30T11:00:00Z",
      report: { status: "available", windows: [{ ...weekly(20, DAY), summary: true }, weekly(5, DAY, "other")] },
    },
    loginErrors: [
      { harness: "Codex", report: { status: "unavailable", problem: { kind: "rejected", status: 401, refreshedBy: "codex" } } },
    ],
  };
  const report = resolveReport(entry);
  assert.equal(report.retained, true);
  assert.equal(report.successfulAt, "2026-10-30T11:00:00Z");
  assert.deepEqual(report.messages, ["Codex: Login rejected (HTTP 401). Run codex to refresh it."]);
  assert.deepEqual(
    summaryWindows(entry).map((rateWindow) => rateWindow.id),
    ["weekly"],
  );
});
