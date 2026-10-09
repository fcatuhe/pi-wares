import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export function configuredZsh(path = process.env.PATH ?? "", zdotdir = process.env.ZDOTDIR || homedir()): string | undefined {
  if (!existsSync(join(zdotdir, ".zshrc"))) return undefined;
  return path
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, "zsh"))
    .find((zsh) => existsSync(zsh));
}

export function withZshFallback(command: string, zsh: string): string {
  const interactiveZsh = `exec ${shellQuote(zsh)} -ic`;
  return [
    `((BASH_VERSINFO[0] < 4)) && ${interactiveZsh} ${shellQuote(command)}`,
    `command_not_found_handle() { ${interactiveZsh} "$(printf '%q ' "$@")"; }`,
    command,
  ].join("\n");
}

function shellQuote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}
