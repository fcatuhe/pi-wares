import { basename } from "node:path";

export function loginZsh(shell = process.env.SHELL): string | undefined {
	return shell && basename(shell) === "zsh" ? shell : undefined;
}

export function interactiveZshCommand(command: string, zsh: string): string {
	return `exec ${zsh} -ic '${command.replaceAll("'", `'\\''`)}'`;
}
