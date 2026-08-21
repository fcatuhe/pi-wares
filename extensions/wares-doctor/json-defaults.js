import { applyEdits, modify, parse } from "jsonc-parser";

import { diffDefaults, members, writes } from "./defaults-diff.js";

const FORMATTING = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

export function reconcileJson(actualSource, referenceSource, identityByPath = {}, force = false) {
	const findings = diffDefaults(JSON.parse(referenceSource), parse(actualSource), identityByPath);

	let text = actualSource;
	for (const finding of findings) {
		if (!writes(finding, force)) continue;
		if (finding.kind === "entry") {
			throw new Error(`cannot write a table array into JSON at ${finding.path.join(".")}`);
		}
		const value = finding.kind === "members" ? members(finding) : finding.expected;
		text = applyEdits(text, modify(text, finding.path, value, FORMATTING));
	}
	return { findings, text };
}
