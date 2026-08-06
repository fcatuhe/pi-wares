/** Self-check: npx tsx extensions/wares-doctor/test.ts */
import assert from "node:assert/strict";

import { type Report, runDoctor } from "./doctor.ts";

interface Run {
	execArgs: string[][];
	entries: Report[];
	notices: [string, string | undefined][];
}

function doctor(exec: { stdout: string; stderr: string; code: number }) {
	const run: Run = { execArgs: [], entries: [], notices: [] };
	const pi = {
		appendEntry: (_customType: string, data: Report) => run.entries.push(data),
		exec: async (_command: string, args: string[]) => {
			run.execArgs.push(args.slice(1));
			return { ...exec, killed: false };
		},
	};
	const ctx = {
		ui: { notify: (message: string, type?: string) => run.notices.push([message, type]) },
	};
	return { run, call: (args: string) => runDoctor(pi as any, args, ctx as any) };
}

// A report with work pending exits 1, which must render as a report, not as a crash.
const pending = doctor({
	stdout: "pi settings  add 1  ~/.pi/agent/settings.json\n\n1 to add. Re-run with --apply to write them.\n",
	stderr: "",
	code: 1,
});
await pending.call("");
assert.deepEqual(pending.run.execArgs, [[]], "report mode passed a flag");
assert.deepEqual(pending.run.notices, [], "a pending report was reported as a failure");
assert.equal(pending.run.entries[0].applied, false);
assert.equal(pending.run.entries[0].lines.length, 3, "the blank line before the count was dropped");

const apply = doctor({ stdout: "pi settings  added 1  ~/.pi/agent/settings.json  (restart pi)\n", stderr: "", code: 0 });
await apply.call(" apply ");
assert.deepEqual(apply.run.execArgs, [["--apply"]], "apply did not reach the script");
assert.equal(apply.run.entries[0].applied, true);

// The script's own usage error is exit 2 with empty stdout: say so instead of drawing a blank card.
const broken = doctor({ stdout: "", stderr: "wares-doctor: boom", code: 2 });
await broken.call("");
assert.deepEqual(broken.run.entries, [], "a failed run still appended a report");
assert.deepEqual(broken.run.notices, [["wares-doctor failed: wares-doctor: boom", "error"]]);

const unknown = doctor({ stdout: "unreachable", stderr: "", code: 0 });
await unknown.call("--apply");
assert.deepEqual(unknown.run.execArgs, [], "an unknown argument reached the script");
assert.equal(unknown.run.notices[0][1], "warning");

console.log("wares-doctor command: ok");
