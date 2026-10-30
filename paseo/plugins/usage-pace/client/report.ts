import type { FailedReport, UsageEntry, UsageProblem, UsageWindow } from "../shared/usage";

export interface ResolvedReport {
  windows: UsageWindow[];
  balances: NonNullable<Extract<UsageEntry["report"], { status: "available" }>["balances"]>;
  details: { id: string; label: string; value: string }[];
  planLabel: string | null;
  successfulAt: string | undefined;
  retained: boolean;
  messages: string[];
}

export function resolveReport(entry: UsageEntry): ResolvedReport {
  const { report } = entry;
  if (report.status === "available") {
    return {
      windows: report.windows,
      balances: report.balances ?? [],
      details: report.details ?? [],
      planLabel: report.planLabel ?? null,
      successfulAt: entry.successfulAt ?? entry.fetchedAt,
      retained: false,
      messages: [],
    };
  }
  const kept = entry.lastSuccessful;
  return {
    windows: kept?.report.windows ?? [],
    balances: kept?.report.balances ?? [],
    details: kept?.report.details ?? [],
    planLabel: kept?.report.planLabel ?? null,
    successfulAt: kept?.fetchedAt,
    retained: kept != null,
    messages: entry.loginErrors?.map((login) => `${login.harness}: ${failureText(login.report)}`) ?? [failureText(report)],
  };
}

export function summaryWindows(entry: UsageEntry): UsageWindow[] {
  return resolveReport(entry).windows.filter((rateWindow) => rateWindow.summary);
}

function failureText(report: FailedReport): string {
  return report.status === "error" ? report.error : problemText(report.problem);
}

function problemText(problem: UsageProblem): string {
  if (problem.kind === "no_quota") return problem.detail;
  const remedy = problem.refreshedBy ? `Run ${problem.refreshedBy} to refresh it.` : "Sign in again.";
  if (problem.kind === "rejected") return `Login rejected (HTTP ${problem.status}). ${remedy}`;
  return `Login expired. ${remedy}`;
}
