import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { COMMAND, COMMANDS, type Report, REPORT_ENTRY, runDoctor } from "./doctor.ts";

export default function (pi: ExtensionAPI) {
	pi.registerEntryRenderer<Report>(REPORT_ENTRY, (entry, _options, theme) => {
		const { command = COMMAND, rows = [], notes = [] } = entry.data ?? {};
		const body = [
			theme.fg("accent", `/${command}`),
			...rows,
			...notes.map((note) => theme.fg(note.tone, note.text)),
		].join("\n");
		return new Text(body, 1, 1, (text) => theme.bg("customMessageBg", text));
	});

	for (const command of COMMANDS) {
		pi.registerCommand(command.name, {
			description: command.description,
			handler: async (args: string, ctx: ExtensionCommandContext) => runDoctor(pi, command, args, ctx),
		});
	}
}
