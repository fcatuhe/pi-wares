import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commentMarker, existingLines, isTest, refusal, review } from "./comments.ts";

const reasons = (path: string, text: string, existing?: Set<string>) => review(path, text, existing).map((offence) => offence.reason);

test("a well-formed note under the budget is the one comment code is allowed", () => {
  assert.deepEqual(reasons("app/thing.ts", "// INFO: fc 22aug26 vendor API returns 200 on failure, we parse the body\nconst a = 1;"), []);
  assert.deepEqual(
    reasons("app/thing.rb", "# TODO: fc 25feb26 remove once litestream ships the fix (fractaledmind/litestream-ruby#72)"),
    [],
  );
});

test("untagged prose and a tag without initials and date are refused in code", () => {
  assert.deepEqual(reasons("app/thing.ts", "// vendor API returns 200 on failure"), [
    "untagged prose in code, so it is a tagged note, a name, or nothing",
  ]);
  assert.deepEqual(reasons("app/thing.ts", "// INFO: vendor API returns 200 on failure"), ["a tag without initials and a DDmmmYY date"]);
  assert.deepEqual(reasons("app/thing.ts", "// INFO: fc 22aug26"), ["a tag without initials and a DDmmmYY date"]);
});

test("the budget counts the description, so the tag, the initials and the date are free", () => {
  const long = `// INFO: fc 22aug26 ${"word ".repeat(26)}`;
  assert.deepEqual(reasons("app/thing.ts", long), ["26 words, over the 25-word budget"]);
  assert.deepEqual(reasons("app/thing.ts", `// INFO: fc 22aug26 ${"word ".repeat(25)}`), []);
});

test("a second comment line is refused, whoever owns the file", () => {
  assert.deepEqual(reasons("app/thing.ts", "// INFO: fc 22aug26 a real fact\n// and the rest of the paragraph"), [
    "a second comment line, so the note belongs in the README",
  ]);
  assert.deepEqual(reasons("extensions/thing/test.ts", "// why this test exists\n// and a second line"), [
    "a second comment line, so the note belongs in the README",
  ]);
});

test("tests keep one line of untagged prose, under the same budget", () => {
  assert.deepEqual(reasons("extensions/thing/test.ts", "// A token pasted over SSH wraps, newlines and all."), []);
  assert.deepEqual(reasons("spec/models/thing_spec.rb", `# ${"word ".repeat(30)}`), ["30 words, over the 25-word budget"]);
});

test("commented-out code is caught everywhere, including where untagged prose is allowed", () => {
  for (const line of ["// assert.equal(a, b);", "// const x = 1;", "// if (ready) {", "// }", "// destroyLater(30);"]) {
    assert.deepEqual(reasons("extensions/thing/test.ts", line), ["commented-out code, delete it, git remembers"], line);
  }
});

test("English that opens on a keyword or ends on a call is prose, not code", () => {
  assert.deepEqual(reasons("extensions/thing/test.ts", "// return values are compared by identity"), []);
  assert.deepEqual(reasons("extensions/thing/test.ts", "// class names carry the namespace"), []);
});

test("machine directives, a shebang and a triple-slash reference are not prose", () => {
  for (const line of ["// @ts-expect-error", "// biome-ignore lint: needed", '/// <reference types="node" />']) {
    assert.deepEqual(reasons("app/thing.ts", line), [], line);
  }
  assert.deepEqual(reasons("app/thing.py", "#!/usr/bin/env python3\n# INFO: fc 22aug26 the runner has no venv"), []);
});

test("only what the call adds is judged, but growing a legacy block by one line is still a block", () => {
  const existing = new Set(["// legacy prose nobody has cleaned up"]);
  assert.deepEqual(reasons("app/thing.ts", "// legacy prose nobody has cleaned up\nconst a = 1;", existing), []);
  assert.deepEqual(reasons("app/thing.ts", "// legacy prose nobody has cleaned up\n// a fresh line of prose", existing), [
    "a second comment line, so the note belongs in the README",
  ]);
});

test("a line repeated in one call is reported once", () => {
  assert.equal(review("app/thing.ts", "// prose\nconst a = 1;\n// prose").length, 1);
});

test("infra, docs, data and shell scripts carry their own comment rules, so the checker stays out", () => {
  for (const path of ["config/deploy.yml", "Dockerfile", "README.md", "config/pi/settings.json", "main.tf", "build.sh"]) {
    assert.equal(commentMarker(path), undefined, path);
    assert.deepEqual(reasons(path, "# whatever this block is for"), [], path);
  }
  assert.equal(commentMarker("app/models/thing.rb"), "#");
  assert.equal(commentMarker("db/migrate.sql"), "--");
});

test("isTest recognizes test files across languages and not words that merely end in test", () => {
  assert.equal(isTest("extensions/thing/test.ts"), true);
  assert.equal(isTest("app/thing.test.ts"), true);
  assert.equal(isTest("internal/thing_test.go"), true);
  assert.equal(isTest("spec/models/thing_spec.rb"), true);
  assert.equal(isTest("test/models/thing_test.rb"), true);
  assert.equal(isTest("billing/tests.py"), true);
  assert.equal(isTest("tests/test_thing.py"), true);
  assert.equal(isTest("app/services/contest.rb"), false);
  assert.equal(isTest("app/latest.ts"), false);
});

test("nothing to refuse is no verdict at all, so a clean call is never touched", () => {
  assert.equal(refusal("app/thing.ts", []), undefined);
});

test("the refusal names the file, quotes each line under its reason, and says what to do instead", () => {
  const blocked = refusal("app/thing.ts", review("app/thing.ts", "// vendor API returns 200 on failure"));
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /^Comment policy refused 1 comment in app\/thing\.ts:/);
  assert.match(blocked?.reason ?? "", /untagged prose in code[^\n]*:\n    \/\/ vendor API returns 200 on failure/);
  assert.match(blocked?.reason ?? "", /Send the call again without them\./);
});

test("past the five it lists, the rest are counted rather than dumped", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ line: `// prose ${i}`, reason: "untagged prose" }));
  assert.match(refusal("app/thing.ts", many)?.reason ?? "", /and 3 comments more\./);
});

test("a line longer than the clip is quoted with an ellipsis, so one runaway note cannot flood the turn", () => {
  assert.match(refusal("app/thing.ts", [{ line: `// ${"x".repeat(200)}`, reason: "long" }])?.reason ?? "", /x\.\.\.\n/);
});

test("existingLines reads a missing file as empty and a present one line by line", () => {
  const file = join(mkdtempSync(join(tmpdir(), "comment-check-")), "thing.ts");
  assert.deepEqual([...existingLines(file)], []);
  writeFileSync(file, "// legacy prose\nconst a = 1;\n");
  assert.equal(existingLines(file).has("// legacy prose"), true);
});
