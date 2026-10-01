import { applyEdits, modify, parse } from "jsonc-parser";

import { diffDefaults, members, type Reconciled, type Staleness, writes } from "./diff.ts";

const FORMATTING = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

export function reconcileJson(actualSource: string, referenceSource: string, force = false, isStale?: Staleness): Reconciled {
  const findings = diffDefaults(JSON.parse(referenceSource), parse(actualSource), isStale);

  let text = actualSource;
  for (const finding of findings) {
    if (!writes(finding, force)) continue;
    const value = finding.kind === "members" ? members(finding, force) : finding.expected;
    text = applyEdits(text, modify(text, finding.path, value, FORMATTING));
  }
  return { findings, text };
}
