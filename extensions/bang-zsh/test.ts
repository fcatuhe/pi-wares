/** Self-check: npx tsx extensions/bang-zsh/test.ts */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { interactiveZshCommand, loginZsh } from "./zsh.ts";

// The command reaches an interactive shell, which is what makes zshrc functions and aliases resolve.
assert.equal(interactiveZshCommand("vsc", "/bin/zsh"), "exec /bin/zsh -ic 'vsc'");

// Quotes in the user's command must not end the wrapper's quoting.
assert.equal(
	interactiveZshCommand(`git commit -m 'it's fine'`, "/bin/zsh"),
	`exec /bin/zsh -ic 'git commit -m '\\''it'\\''s fine'\\'''`,
);

// The escaping holds through a real bash -c, the layer pi wraps this in.
const roundTrip = (command: string) =>
	execFileSync("/bin/bash", ["-c", interactiveZshCommand(command, "/bin/zsh")], {
		encoding: "utf-8",
	}).trimEnd();
assert.equal(roundTrip(`printf '%s\n' "it's here"`), "it's here");
assert.equal(roundTrip("printf '%s' \"$ZSH_VERSION\"") !== "", true);

// Only a zsh login shell is intercepted. Anything else leaves pi on its own bash -c.
assert.equal(loginZsh("/bin/zsh"), "/bin/zsh");
assert.equal(loginZsh("/opt/homebrew/bin/zsh"), "/opt/homebrew/bin/zsh");
assert.equal(loginZsh("/bin/bash"), undefined);
assert.equal(loginZsh("/usr/bin/fish"), undefined);
// $SHELL unset, on a bare cron-like environment.
assert.equal(loginZsh(""), undefined);

console.log("bang-zsh: ok");
