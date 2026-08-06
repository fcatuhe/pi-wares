import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { Text } from "@earendil-works/pi-tui";

import { APPLY, COMMAND, REPORT_ENTRY, runDoctor } from "./doctor.ts";

export default function (pi: ExtensionAPI) {
	pi.registerEntryRenderer<string[]>(REPORT_ENTRY, (entry, _options, theme) => {
		const body = [theme.fg("accent", `/${COMMAND}`), ...(entry.data ?? [])].join("\n");
		return new Text(body, 1, 1, (text) => theme.bg("customMessageBg", text));
	});

	pi.registerCommand(COMMAND, {
		description: `Compare this machine against the wares reference config, "${APPLY}" writes what is missing`,
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null =>
			APPLY.startsWith(prefix) ? [{ value: APPLY, label: APPLY }] : null,
		handler: async (args: string, ctx: ExtensionCommandContext) => runDoctor(pi, args, ctx),
	});
}
