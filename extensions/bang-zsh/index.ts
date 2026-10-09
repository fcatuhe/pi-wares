import { createLocalBashOperations, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { configuredZsh, withZshFallback } from "./zsh.ts";

export default function (pi: ExtensionAPI) {
  const zsh = configuredZsh();
  if (!zsh) return;

  const local = createLocalBashOperations();
  pi.on("user_bash", () => ({
    operations: {
      exec: (command, cwd, options) => local.exec(withZshFallback(command, zsh), cwd, options),
    },
  }));
}
