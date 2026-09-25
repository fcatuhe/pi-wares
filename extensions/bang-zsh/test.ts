import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { interactiveZshCommand, loginZsh } from "./zsh.ts";

const noZsh = !existsSync("/bin/zsh") && "no zsh on this machine";

const roundTrip = (command: string) =>
  execFileSync("/bin/bash", ["-c", interactiveZshCommand(command, "/bin/zsh")], {
    encoding: "utf-8",
  }).trimEnd();

test("the command reaches an interactive shell, so zshrc functions and aliases resolve", () => {
  assert.equal(interactiveZshCommand("vsc", "/bin/zsh"), "exec /bin/zsh -ic 'vsc'");
});

test("quotes in the user's command do not end the wrapper's quoting", () => {
  assert.equal(interactiveZshCommand(`git commit -m 'it's fine'`, "/bin/zsh"), `exec /bin/zsh -ic 'git commit -m '\\''it'\\''s fine'\\'''`);
});

test("the escaping holds through a real bash -c, the layer pi wraps this in", { skip: noZsh }, () => {
  assert.equal(roundTrip(`printf '%s\n' "it's here"`), "it's here");
  assert.notEqual(roundTrip("printf '%s' \"$ZSH_VERSION\""), "");
});

test("only a zsh login shell is intercepted, anything else leaves pi on its own bash -c", () => {
  assert.equal(loginZsh("/bin/zsh"), "/bin/zsh");
  assert.equal(loginZsh("/opt/homebrew/bin/zsh"), "/opt/homebrew/bin/zsh");
  assert.equal(loginZsh("/bin/bash"), undefined);
  assert.equal(loginZsh("/usr/bin/fish"), undefined);
});

test("an unset $SHELL, as on a bare cron-like environment, is not intercepted", () => {
  assert.equal(loginZsh(""), undefined);
});
