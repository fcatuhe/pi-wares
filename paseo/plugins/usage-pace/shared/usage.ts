import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const tone = z.enum(["default", "ok", "warning", "danger"]);

const usageWindow = z.object({
  id: z.string(),
  label: z.string(),
  shortLabel: z.string().optional(),
  summary: z.boolean().optional(),
  usedPct: z.number().nullable().optional(),
  remainingPct: z.number().nullable().optional(),
  resetsAt: z.string().nullable().optional(),
  tone: tone.optional(),
});

const balance = z.object({
  id: z.string(),
  label: z.string(),
  used: z.number().nullable().optional(),
  remaining: z.number().nullable().optional(),
  limit: z.number().nullable().optional(),
  unit: z.enum(["usd", "credits", "requests", "tokens"]),
  tone: tone.optional(),
});

const detail = z.object({ id: z.string(), label: z.string(), value: z.string() });

const availableReport = z.object({
  status: z.literal("available"),
  planLabel: z.string().optional(),
  windows: z.array(usageWindow),
  balances: z.array(balance).optional(),
  details: z.array(detail).optional(),
});

const problem = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("expired"), expiresAt: z.string(), refreshedBy: z.string().optional() }),
  z.object({ kind: z.literal("rejected"), status: z.number(), refreshedBy: z.string().optional() }),
  z.object({ kind: z.literal("no_quota"), detail: z.string() }),
]);

const failedReport = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unavailable"), problem }),
  z.object({ status: z.literal("error"), error: z.string() }),
]);

const usageEntry = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceLabel: z.string(),
  icon: z.string().optional(),
  account: z.object({ label: z.string().optional() }),
  fetchedAt: z.string(),
  successfulAt: z.string().optional(),
  report: z.union([availableReport, failedReport]),
  lastSuccessful: z.object({ fetchedAt: z.string(), report: availableReport }).optional(),
  loginErrors: z.array(z.object({ harness: z.string(), report: failedReport })).optional(),
});

export const usageEntries = z.array(usageEntry);

export type UsageEntry = z.infer<typeof usageEntry>;
export type UsageWindow = z.infer<typeof usageWindow>;
export type UsageBalance = z.infer<typeof balance>;
export type UsageProblem = z.infer<typeof problem>;
export type FailedReport = z.infer<typeof failedReport>;

export const listUsage = defineRpc({
  name: "usage.list",
  input: z.object({ refresh: z.boolean() }),
  output: z.object({ entries: usageEntries }),
});
