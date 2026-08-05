import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTOML } from "toml-eslint-parser";

import { reconcileJson } from "./json-defaults.js";
import { reconcileToml } from "./toml-defaults.js";

const IDENTITY = { "keys.command": "key" };

const REFERENCE_TOML = `onboarding = false

[keys]
prefix = "ctrl+space"
new_tab = "cmd+shift+t"

# Launch pi in a new tab.
[[keys.command]]
key = "cmd+shift+i"
command = 'herdr pane run pi'

[ui]
pane_scrollbars = false

# Inline images.
[experimental]
kitty_graphics = true
`;

// A user file that diverges on purpose: its own comment, its own alignment, a
// prefix it chose itself, and no [ui] or [experimental] table at all.
const USER_TOML = `onboarding = false

[theme]
name = "nord"     # mine, hands off

[keys]
prefix     = "ctrl+a"
new_tab    = "cmd+shift+t"
`;

const toml = reconcileToml(USER_TOML, REFERENCE_TOML, IDENTITY);

// Untouched regions stay byte-identical, comments and alignment included.
assert.ok(toml.text.startsWith(USER_TOML.slice(0, USER_TOML.indexOf("[keys]"))), "preamble rewritten");
assert.match(toml.text, /name = "nord"     # mine, hands off/, "the user's alignment and comment were lost");
assert.match(toml.text, /prefix     = "ctrl\+a"/, "a value the user set was overwritten");

// Missing tables and table arrays arrive whole, with the comment above them.
assert.match(toml.text, /# Launch pi in a new tab\.\n\[\[keys\.command\]\]/, "the entry lost its comment");
assert.match(toml.text, /# Inline images\.\n\[experimental\]\nkitty_graphics = true/, "the table lost its comment");
assert.match(toml.text, /\[ui\]\npane_scrollbars = false/, "[ui] was not created");
assert.doesNotThrow(() => parseTOML(toml.text), "the result is not valid TOML");

// Several keys landing in one table keep the reference order, not reverse.
const ordered = reconcileToml(`[keys]\nprefix = "ctrl+a"\n`, `[keys]\nprefix = "x"\nfirst = "1"\nsecond = "2"\n`, IDENTITY);
assert.match(ordered.text, /first = "1"\nsecond = "2"/, "inserted keys came out reversed");

const state = (findings: any[], path: string) => findings.find((f) => f.path.join(".") === path)?.state;
assert.equal(state(toml.findings, "keys.prefix"), "diverged");
assert.equal(state(toml.findings, "keys.new_tab"), "ok");
assert.equal(state(toml.findings, "ui.pane_scrollbars"), "missing");
assert.equal(state(toml.findings, "keys.command"), "missing");

// Second pass is a no-op: nothing to add, nothing rewritten.
const again = reconcileToml(toml.text, REFERENCE_TOML, IDENTITY);
assert.equal(again.text, toml.text, "applying twice is not idempotent");
assert.deepEqual(
  again.findings.filter((f) => f.state === "missing" || f.state === "incomplete"),
  [],
  "the second pass still wants to write",
);

// A table array entry present but edited counts as diverged, so it is left alone.
const edited = reconcileToml(`${USER_TOML}\n[[keys.command]]\nkey = "cmd+shift+i"\ncommand = 'mine'\n`, REFERENCE_TOML, IDENTITY);
assert.equal(state(edited.findings, "keys.command"), "diverged");
assert.match(edited.text, /command = 'mine'/);
assert.equal((edited.text.match(/\[\[keys\.command\]\]/g) ?? []).length, 1, "the entry was duplicated");

// Absent root keys land in the root table, not inside the last table.
const rootless = reconcileToml(`[keys]\nprefix = "ctrl+space"\n`, REFERENCE_TOML, IDENTITY);
assert.match(rootless.text, /^onboarding = false\n\[keys\]/, "a root key was written into a table");

// JSON: the reference adds keys and array members, never replaces what is set.
const userJson = `{\n  "defaultModel": "claude-opus-4-7",\n  "enabledModels": ["anthropic/claude-opus-4-7"]\n}\n`;
const reference = `{"defaultModel":"claude-opus-5","defaultThinkingLevel":"high","enabledModels":["anthropic/claude-opus-5"]}`;
const json = reconcileJson(userJson, reference);
assert.equal(state(json.findings, "defaultModel"), "diverged");
assert.equal(state(json.findings, "defaultThinkingLevel"), "missing");
assert.equal(state(json.findings, "enabledModels"), "incomplete");
const merged = JSON.parse(json.text);
assert.equal(merged.defaultModel, "claude-opus-4-7", "a value the user set was overwritten");
assert.equal(merged.defaultThinkingLevel, "high");
assert.deepEqual(merged.enabledModels, ["anthropic/claude-opus-4-7", "anthropic/claude-opus-5"]);
assert.equal(reconcileJson(json.text, reference).text, json.text, "applying twice is not idempotent");

// End to end on a bare machine: every target gets created, then nothing is left.
const home = mkdtempSync(join(tmpdir(), "wares-doctor-"));
const env = { ...process.env, PI_CODING_AGENT_DIR: join(home, "agent"), XDG_CONFIG_HOME: join(home, "config") };
const doctor = (...args: string[]) => execFileSync(join(import.meta.dirname, "wares-doctor"), args, { env, encoding: "utf-8" });

const bare = (() => {
  try {
    doctor();
    return null;
  } catch (err: any) {
    return err;
  }
})();
assert.ok(bare, "a bare machine exited 0 instead of reporting work");
assert.match(bare.stdout, /4 to add/, "a bare machine did not report every target");
// One line per file and a closing count, nothing per key.
assert.equal(bare.stdout.trim().split("\n").length, 6, "the report is no longer one line per file");

const applied = doctor("--apply");
assert.match(applied, /pi settings +created .*settings\.json {2}\(restart pi\)/, "apply lost the one-line shape");
assert.equal(applied.trim().split("\n").length, 4, "apply printed more than one line per file");
assert.doesNotMatch(doctor(), /add/, "the applied config still reports work");
const root = join(import.meta.dirname, "..");
for (const file of ["agent/settings.json", "agent/extensions/pi-model-shortcuts.json", "config/herdr/config.toml"]) {
  const reference = file.startsWith("agent/") ? `config/pi/${file.slice("agent/".length)}` : "config/herdr/config.toml";
  assert.equal(readFileSync(join(home, file), "utf-8"), readFileSync(join(root, reference), "utf-8"), `${file} is not the reference`);
}

console.log("wares-doctor: ok");
