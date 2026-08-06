import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { Text } from "@earendil-works/pi-tui";

import { APPLY, COMMAND, FORCE, MODES, type Report, REPORT_ENTRY, runDoctor } from "./doctor.ts";

export default function (pi: ExtensionAPI) {
	pi.registerEntryRenderer<Report>(REPORT_ENTRY, (entry, _options, theme) => {
		const { rows = [], notes = [] } = entry.data ?? {};
		const body = [
			theme.fg("accent", `/${COMMAND}`),
			...rows,
			...notes.map((note) => theme.fg(note.tone, note.text)),
		].join("\n");
		return new Text(body, 1, 1, (text) => theme.bg("customMessageBg", text));
	});

	pi.registerCommand(COMMAND, {
		description: `Compare this machine against the wares reference config, "${APPLY}" writes what is missing, "${FORCE}" also overwrites what differs`,
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const matches = MODES.filter((mode) => mode.startsWith(prefix)).map((mode) => ({ value: mode, label: mode }));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args: string, ctx: ExtensionCommandContext) => runDoctor(pi, args, ctx),
	});
}
