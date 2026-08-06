import { createLocalBashOperations, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { interactiveZshCommand, loginZsh } from "./zsh.ts";

export default function (pi: ExtensionAPI) {
	const zsh = loginZsh();
	if (!zsh) return;

	const local = createLocalBashOperations();
	pi.on("user_bash", () => ({
		operations: {
			exec: (command, cwd, options) => local.exec(interactiveZshCommand(command, zsh), cwd, options),
		},
	}));
}
