import { applyEdits, modify, parse } from "jsonc-parser";

import { diffDefaults, members, type Reconciled, type Staleness, writes } from "./diff.ts";

const FORMATTING = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

export function reconcileJson(actualSource: string, referenceSource: string, force = false, isStale?: Staleness): Reconciled {
  const findings = diffDefaults(JSON.parse(referenceSource), parse(actualSource), isStale);

  let text = actualSource;
  for (const finding of findings) {
    if (!writes(finding, force)) continue;
    const value = finding.kind === "members" ? members(finding, force) : finding.expected;
    text = setJson(text, finding.path, value);
  }
  return { findings, text };
}

export function setJson(text: string, path: string[], value: unknown): string {
  return applyEdits(text, modify(text, path, value, FORMATTING));
}
