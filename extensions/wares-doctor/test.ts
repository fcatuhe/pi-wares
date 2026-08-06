/** Self-check: npx tsx extensions/wares-doctor/test.ts */
import assert from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTOML } from "toml-eslint-parser";

import { APPLY, FORCE, report, runDoctor } from "./doctor.ts";
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
  again.findings.filter((f: any) => f.state === "missing" || f.state === "incomplete"),
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

// force: the reference wins on the keys it declares, and only those.
const forced = reconcileToml(USER_TOML, REFERENCE_TOML, IDENTITY, true);
assert.match(forced.text, /prefix = "ctrl\+space"/, "force left the diverged value alone");
assert.doesNotMatch(forced.text, /ctrl\+a/, "the old value survived a force");
assert.match(forced.text, /name = "nord"     # mine, hands off/, "force touched a key the reference never mentions");
assert.match(forced.text, /\[ui\]\npane_scrollbars = false/, "force stopped adding what is missing");
assert.doesNotThrow(() => parseTOML(forced.text), "the forced result is not valid TOML");
assert.equal(reconcileToml(forced.text, REFERENCE_TOML, IDENTITY, true).text, forced.text, "forcing twice is not idempotent");

// force replaces an edited table array entry in place rather than appending a second one.
const forcedEntry = reconcileToml(`${USER_TOML}\n[[keys.command]]\nkey = "cmd+shift+i"\ncommand = 'mine'\n`, REFERENCE_TOML, IDENTITY, true);
assert.match(forcedEntry.text, /command = 'herdr pane run pi'/, "the edited entry was not replaced");
assert.doesNotMatch(forcedEntry.text, /'mine'/, "the edited entry survived a force");
assert.equal((forcedEntry.text.match(/\[\[keys\.command\]\]/g) ?? []).length, 1, "force duplicated the entry");

// A key the reference sets inside a table the user never opened is still manual, force or not.
const unhoused = reconcileToml(`onboarding = false\n`, REFERENCE_TOML, IDENTITY, true);
assert.doesNotThrow(() => parseTOML(unhoused.text), "forcing onto a bare file is not valid TOML");

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

// JSON force: the reference value replaces the user's, extra array members are additions, not disagreements.
const forcedJson = reconcileJson(userJson, reference, {}, true);
const overwritten = JSON.parse(forcedJson.text);
assert.equal(overwritten.defaultModel, "claude-opus-5", "force left the diverged value alone");
assert.deepEqual(overwritten.enabledModels, ["anthropic/claude-opus-4-7", "anthropic/claude-opus-5"], "force dropped a model the user enabled");
assert.equal(reconcileJson(forcedJson.text, reference, {}, true).text, forcedJson.text, "forcing twice is not idempotent");

// End to end on a bare machine: every target gets created, then nothing is left.
function bareMachine(): string {
  const home = mkdtempSync(join(tmpdir(), "wares-doctor-"));
  process.env.PI_CODING_AGENT_DIR = join(home, "agent");
  process.env.XDG_CONFIG_HOME = join(home, "config");
  return home;
}

const home = bareMachine();
const bare = report("");
assert.match(bare.join("\n"), /4 to add/, "a bare machine did not report every target");
// One line per file, then the closing count, nothing per key.
assert.equal(bare.length, 5, "the report is no longer one line per file");
assert.match(bare[0], /^pi settings +create /, "the report lost its one-line shape");

const applied = report(APPLY);
assert.match(applied[0], /pi settings +created .*settings\.json {2}\(restart pi\)/, "apply lost the one-line shape");
assert.equal(applied.length, 4, "apply printed more than one line per file");
assert.doesNotMatch(report("").join("\n"), /add/, "the applied config still reports work");
const root = join(import.meta.dirname, "..", "..");
for (const file of ["agent/settings.json", "agent/extensions/pi-model-shortcuts.json", "config/herdr/config.toml"]) {
  const source = file.startsWith("agent/") ? `config/pi/${file.slice("agent/".length)}` : "config/herdr/config.toml";
  assert.equal(readFileSync(join(home, file), "utf-8"), readFileSync(join(root, source), "utf-8"), `${file} is not the reference`);
}

// A machine that diverged: the report offers force, force says what it replaced, and a second force is quiet.
const settings = join(home, "agent/settings.json");
writeFileSync(settings, readFileSync(settings, "utf-8").replace(`"high"`, `"low"`));
const diverging = report("");
assert.match(diverging.at(-1)!, new RegExp(`1 kept as yours\\. /wares-doctor ${FORCE}`), "the report never mentions force");
assert.match(diverging[0], /pi settings +kept 1, ok /, "a diverged key is no longer reported as kept");
const replaced = report(FORCE);
assert.match(replaced[0], /pi settings +replaced 1, ok .*\(restart pi\)/, "force did not report what it replaced");
assert.match(readFileSync(settings, "utf-8"), /"defaultThinkingLevel": "high"/, "force did not write the reference value");
assert.equal(report(FORCE).length, 4, "a forced machine still has work to do");

// The command itself: a report becomes one custom entry, and bad input touches nothing.
interface Run {
  entries: string[][];
  notices: [string, string | undefined][];
}

function command() {
  const run: Run = { entries: [], notices: [] };
  const pi = { appendEntry: (_customType: string, data: string[]) => run.entries.push(data) };
  const ctx = { ui: { notify: (message: string, type?: string) => run.notices.push([message, type]) } };
  return { run, call: (args: string) => runDoctor(pi as any, args, ctx as any) };
}

// The state column is what says whether a run wrote, so the entry carries no flag of its own.
bareMachine();
const reported = command();
reported.call("");
assert.deepEqual(reported.run.notices, [], "a clean report was reported as a failure");
assert.match(reported.run.entries[0][0], /^pi settings +create /, "the entry did not carry the report");

const applying = command();
applying.call(` ${APPLY} `);
assert.match(applying.run.entries[0][0], /created .*\(restart pi\)/, "apply left no trace in the report");

const unknown = command();
unknown.call("--apply");
assert.deepEqual(unknown.run.entries, [], "an unknown argument still ran the check");
assert.equal(unknown.run.notices[0][1], "warning");

// A machine where the target directory cannot exist: say so, never draw a blank card.
const file = join(home, "not-a-dir");
writeFileSync(file, "");
process.env.PI_CODING_AGENT_DIR = join(file, "agent");
const broken = command();
broken.call(APPLY);
assert.deepEqual(broken.run.entries, [], "a failed run still appended a report");
assert.equal(broken.run.notices[0][1], "error");
assert.match(broken.run.notices[0][0], /^wares-doctor failed: /);

console.log("wares-doctor: ok");
