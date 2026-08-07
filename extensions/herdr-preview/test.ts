/** Self-check: npx tsx extensions/herdr-preview/test.ts */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	candidates,
	DEFAULTS,
	isMarkdown,
	matching,
	paneLabel,
	parseCommand,
	parseConfig,
	quote,
	remember,
	shortestPath,
	splitArgs,
	viewerCommand,
} from "./preview.ts";

const CWD = "/Users/x/code/app";
const HOME = "/Users/x";

// No argument opens the picker, a bare "auto" is the toggle, anything else is a path.
assert.deepEqual(parseCommand(""), { kind: "pick" });
assert.deepEqual(parseCommand("   "), { kind: "pick" });
assert.deepEqual(parseCommand("auto"), { kind: "auto" });
// A file actually named auto.md must still open rather than flip the toggle.
assert.deepEqual(parseCommand("auto.md"), { kind: "open", path: "auto.md" });
assert.deepEqual(parseCommand(" docs/a.md "), { kind: "open", path: "docs/a.md" });

assert.equal(isMarkdown("README.md"), true);
assert.equal(isMarkdown("A.MARKDOWN"), true);
assert.equal(isMarkdown("notes.mdx"), true);
assert.equal(isMarkdown("index.ts"), false);
// Not markdown just because the name contains it.
assert.equal(isMarkdown("md"), false);
assert.equal(isMarkdown("readme.md.bak"), false);

// Most recently touched comes first, and touching a known file moves it up instead of duplicating.
assert.deepEqual(remember(["a.md"], "b.md"), ["b.md", "a.md"]);
assert.deepEqual(remember(["a.md", "b.md"], "b.md"), ["b.md", "a.md"]);
// The list is capped, oldest dropped.
const many = Array.from({ length: 25 }, (_, i) => `f${i}.md`);
const capped = many.reduce(remember, [] as string[]);
assert.equal(capped.length, 20);
assert.equal(capped[0], "f24.md");

// Session files stay on top and are never listed twice when the repo also has them.
assert.deepEqual(candidates(["b.md"], ["a.md", "b.md", "c.md"]), ["b.md", "a.md", "c.md"]);
assert.deepEqual(candidates([], ["a.md"]), ["a.md"]);

assert.deepEqual(matching(["docs/a.md", "b.md"], "doc"), ["docs/a.md"]);
// Matching is a substring, so a bare filename finds it at any depth, and case does not matter.
assert.deepEqual(matching(["docs/deep/Notes.md", "b.md"], "notes"), ["docs/deep/Notes.md"]);
assert.deepEqual(matching(["a.md", "b.md"], ""), ["a.md", "b.md"]);

// Paths display shortest: relative inside the project, ~ inside home, absolute elsewhere.
assert.equal(shortestPath(`${CWD}/docs/a.md`, CWD, HOME), "docs/a.md");
assert.equal(shortestPath(`${HOME}/notes/a.md`, CWD, HOME), "~/notes/a.md");
assert.equal(shortestPath("/tmp/a.md", CWD, HOME), "/tmp/a.md");

// The pane label leads with the filename, since a narrow pane border truncates the tail.
assert.equal(paneLabel(`${CWD}/docs/a.md`, CWD, HOME), "a.md (docs/a.md)");
// A file at the project root would read as "a.md (a.md)", so the brackets are dropped.
assert.equal(paneLabel(`${CWD}/a.md`, CWD, HOME), "a.md");
assert.equal(paneLabel("/tmp/a.md", CWD, HOME), "a.md (/tmp/a.md)");

// The path reaches the viewer through a shell, so quoting has to survive spaces and apostrophes.
assert.equal(viewerCommand("/tmp/a.md"), "mdcat --watch '/tmp/a.md'");
const awkward = "/tmp/it's a doc.md";
assert.equal(
	execFileSync("/bin/sh", ["-c", `printf %s ${quote(awkward)}`], { encoding: "utf-8" }),
	awkward,
);

// A missing or empty config file leaves the defaults.
assert.deepEqual(parseConfig(undefined), DEFAULTS);
assert.deepEqual(parseConfig("  "), DEFAULTS);
assert.deepEqual(parseConfig("{}"), DEFAULTS);
// Corrupt JSON is a mistake worth reporting, so it reaches the caller instead of vanishing.
assert.throws(() => parseConfig("{ not json"));
assert.deepEqual(parseConfig('{"auto":true,"direction":"down","ratio":0.35}'), {
	auto: true,
	direction: "down",
	ratio: 0.35,
});
// A direction herdr does not accept, and a ratio outside the open unit interval, fall back.
assert.deepEqual(parseConfig('{"direction":"sideways"}'), DEFAULTS);
assert.deepEqual(parseConfig('{"ratio":0}'), DEFAULTS);
assert.deepEqual(parseConfig('{"ratio":1}'), DEFAULTS);
assert.deepEqual(parseConfig('{"ratio":"wide"}'), DEFAULTS);
assert.deepEqual(parseConfig('{"auto":"yes"}'), DEFAULTS);

// An unset ratio is left to herdr's own default rather than pinned by us.
assert.deepEqual(splitArgs("w1:p1", CWD, DEFAULTS), [
	"pane", "split", "--pane", "w1:p1", "--direction", "right", "--cwd", CWD, "--no-focus",
]);
assert.deepEqual(splitArgs("w1:p1", CWD, { auto: false, direction: "down", ratio: 0.4 }), [
	"pane", "split", "--pane", "w1:p1", "--direction", "down", "--ratio", "0.4", "--cwd", CWD, "--no-focus",
]);

console.log("herdr-preview: ok");
