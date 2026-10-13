import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configuredZsh, withZshFallback } from "./zsh.ts";

const zdotdir = mkdtempSync(join(tmpdir(), "bang-zsh-"));
writeFileSync(join(zdotdir, ".zshrc"), `alias zz_probe='printf "[%s]\\n"'\n`);
const zsh = configuredZsh(process.env.PATH, zdotdir);
const noZsh = !zsh && "no zsh on this machine";
const oldBash = Number(spawnSync("bash", ["-c", "echo ${BASH_VERSINFO[0]}"], { encoding: "utf-8" }).stdout) < 4;

const bang = (command: string) =>
  spawnSync("bash", ["-c", withZshFallback(command, zsh ?? "zsh")], { encoding: "utf-8", env: { ...process.env, ZDOTDIR: zdotdir } });

test("zsh counts only once a zshrc exists, without one there are no aliases for the fallback to find", () => {
  const bin = mkdtempSync(join(tmpdir(), "bang-zsh-bin-"));
  writeFileSync(join(bin, "zsh"), "");
  assert.equal(configuredZsh(`/nonexistent:${bin}`, zdotdir), join(bin, "zsh"));
  assert.equal(configuredZsh(`/nonexistent:${bin}`, mkdtempSync(join(tmpdir(), "bang-zsh-empty-"))), undefined);
  assert.equal(configuredZsh("/nonexistent", zdotdir), undefined);
});

test("a command bash knows runs in bash, without paying for an interactive zsh", {
  skip: noZsh || (oldBash && "bash older than 4 hands every command to zsh"),
}, () => {
  assert.equal(bang(`printf '%s' "\${ZSH_VERSION-bash}"`).stdout, "bash");
});

test("bash older than 4 has no command_not_found_handle, so every command runs in an interactive zsh", {
  skip: noZsh || (!oldBash && "bash 4 or newer"),
}, () => {
  assert.notEqual(bang(`printf '%s' "\${ZSH_VERSION-bash}"`).stdout, "bash");
});

test("a command only zsh knows runs in an interactive zsh, with every argument intact", { skip: noZsh }, () => {
  const result = bang(`echo bash first && zz_probe "it's" $'two\\nlines' '$HOME *' ""`);
  assert.equal(result.stdout, "bash first\n[it's]\n[two\nlines]\n[$HOME *]\n[]\n");
  assert.equal(result.status, 0);
});

test("a command neither shell knows still fails with 127", { skip: noZsh }, () => {
  assert.equal(bang("zz_nowhere").status, 127);
});
