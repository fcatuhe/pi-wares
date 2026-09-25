export interface Finding {
  kind: "value" | "members" | "file";
  path: string[];
  state: "ok" | "missing" | "incomplete" | "diverged";
  expected?: any;
  found?: any;
  absent?: unknown[];
  blocked?: string;
}

export interface Reconciled {
  findings: Finding[];
  text: string;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function members(finding: Finding): unknown[] {
  return [...asMembers(finding.found), ...(finding.absent ?? [])];
}

function asMembers(found: unknown): unknown[] {
  if (Array.isArray(found)) return found;
  return found === undefined ? [] : [found];
}

export function writes(finding: Finding, force: boolean): boolean {
  if (finding.state === "missing" || finding.state === "incomplete") return true;
  return force && finding.state === "diverged";
}

export function diffDefaults(reference: unknown, actual: unknown): Finding[] {
  const findings: Finding[] = [];
  collect(reference, actual, [], findings);
  return findings;
}

function collect(reference: unknown, actual: unknown, path: string[], findings: Finding[]): void {
  if (!isRecord(reference)) return;
  for (const [key, expected] of Object.entries(reference)) {
    const here = [...path, key];
    const found = isRecord(actual) ? actual[key] : undefined;

    if (isRecord(expected)) {
      collect(expected, found, here, findings);
    } else if (Array.isArray(expected)) {
      findings.push(diffMembers(here, expected, found));
    } else {
      const state = found === undefined ? "missing" : expected === found ? "ok" : "diverged";
      findings.push({ kind: "value", path: here, expected, found, state });
    }
  }
}

function diffMembers(path: string[], expected: unknown[], found: unknown): Finding {
  if (expected.some(isRecord)) throw new Error(`a table array at ${path.join(".")} has no reconciler`);
  const absent = expected.filter((member) => !asMembers(found).includes(member));
  const state = found === undefined ? "missing" : absent.length > 0 ? "incomplete" : "ok";
  return { kind: "members", path, expected, found, absent, state };
}
