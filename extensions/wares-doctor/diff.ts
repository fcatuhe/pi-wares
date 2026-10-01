export interface Finding {
  kind: "value" | "members" | "file";
  path: string[];
  state: "ok" | "missing" | "incomplete" | "stale" | "diverged";
  expected?: any;
  found?: any;
  absent?: unknown[];
  stale?: unknown[];
  blocked?: string;
}

export interface Reconciled {
  findings: Finding[];
  text: string;
}

export type Staleness = (member: unknown) => boolean;

const NEVER_STALE: Staleness = () => false;

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function members(finding: Finding, force: boolean): unknown[] {
  const kept = force ? asMembers(finding.found).filter((member) => !finding.stale?.includes(member)) : asMembers(finding.found);
  return [...kept, ...(finding.absent ?? [])];
}

function asMembers(found: unknown): unknown[] {
  if (Array.isArray(found)) return found;
  return found === undefined ? [] : [found];
}

export function writes(finding: Finding, force: boolean): boolean {
  if (finding.state === "missing" || finding.state === "incomplete") return true;
  return force && (finding.state === "diverged" || hasStale(finding));
}

export function hasStale(finding: Finding): boolean {
  return (finding.stale ?? []).length > 0;
}

export function diffDefaults(reference: unknown, actual: unknown, isStale = NEVER_STALE): Finding[] {
  const findings: Finding[] = [];
  collect(reference, actual, [], findings, isStale);
  return findings;
}

function collect(reference: unknown, actual: unknown, path: string[], findings: Finding[], isStale: Staleness): void {
  if (!isRecord(reference)) return;
  for (const [key, expected] of Object.entries(reference)) {
    const here = [...path, key];
    const found = isRecord(actual) ? actual[key] : undefined;

    if (isRecord(expected)) {
      collect(expected, found, here, findings, isStale);
    } else if (Array.isArray(expected)) {
      findings.push(diffMembers(here, expected, found, isStale));
    } else {
      const state = found === undefined ? "missing" : expected === found ? "ok" : "diverged";
      findings.push({ kind: "value", path: here, expected, found, state });
    }
  }
}

function diffMembers(path: string[], expected: unknown[], found: unknown, isStale: Staleness): Finding {
  if (expected.some(isRecord)) throw new Error(`a table array at ${path.join(".")} has no reconciler`);
  const absent = expected.filter((member) => !asMembers(found).includes(member));
  const stale = asMembers(found).filter(isStale);
  const state = found === undefined ? "missing" : absent.length > 0 ? "incomplete" : stale.length > 0 ? "stale" : "ok";
  return { kind: "members", path, expected, found, absent, stale, state };
}
