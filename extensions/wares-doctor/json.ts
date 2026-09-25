import { applyEdits, modify, parse } from "jsonc-parser";

import { diffDefaults, members, type Reconciled, writes } from "./diff.ts";

const FORMATTING = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

export function reconcileJson(actualSource: string, referenceSource: string, force = false): Reconciled {
  const findings = diffDefaults(JSON.parse(referenceSource), parse(actualSource));

  let text = actualSource;
  for (const finding of findings) {
    if (!writes(finding, force)) continue;
    const value = finding.kind === "members" ? members(finding) : finding.expected;
    text = applyEdits(text, modify(text, finding.path, value, FORMATTING));
  }
  return { findings, text };
}
