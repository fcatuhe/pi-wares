import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { Box, Text } from "@earendil-works/pi-tui";

import { APPLY, REPORT_ENTRY, type Report, runDoctor } from "./doctor.ts";

export default function (pi: ExtensionAPI) {
	pi.registerEntryRenderer<Report>(REPORT_ENTRY, (entry, _options, theme) => {
		const { lines, applied } = entry.data ?? { lines: [], applied: false };
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		box.addChild(new Text(theme.fg("accent", applied ? `wares-doctor ${APPLY}` : "wares-doctor"), 0, 0));
		for (const line of lines) box.addChild(new Text(line, 0, 0));
		return box;
	});

	pi.registerCommand("wares-doctor", {
		description: `Compare this machine against the wares reference config, "${APPLY}" writes what is missing`,
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null =>
			APPLY.startsWith(prefix) ? [{ value: APPLY, label: APPLY }] : null,
		handler: (args: string, ctx: ExtensionCommandContext) => runDoctor(pi, args, ctx),
	});
}
