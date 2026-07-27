/**
 * Self-check for the parts that silently rot: process-group kill escalation,
 * cumulative-vs-delta token accounting, oversized-output spill, and the
 * background/timeout schema. Run: `bun test extensions/sidequests`.
 *
 * Requires the peer deps to be resolvable (they live in pi's global install):
 *   cd node_modules && ln -s $PI/node_modules/typebox typebox   # etc.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { afterAll, expect, test } from "bun:test";

const spilled: string[] = [];
afterAll(() => {
	for (const f of spilled) rmSync(f, { force: true });
});
import {
	applyJsonEvent,
	createInitialResult,
	killTree,
	normalizeSessions,
	resultBlock,
	runSingleSidequest,
} from "./index.ts";

const blank = () => createInitialResult({ prompt: "x", label: "t" }, process.cwd());

test("killTree reaps the whole process group, not just the direct child", async () => {
	// `sh -c 'sleep 60 & wait'` gives us a grandchild. Signalling the sh pid alone
	// leaves `sleep` orphaned — that was the leak.
	const proc = spawn("sh", ["-c", "sleep 60 & echo $! ; wait"], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
	const grandchildPid = await new Promise<number>((res) => proc.stdout.once("data", (d) => res(Number(d.toString().trim()))));
	expect(grandchildPid).toBeGreaterThan(0);

	killTree(proc, 200);
	await new Promise<void>((res) => proc.once("close", () => res()));
	await Bun.sleep(400); // let the SIGKILL escalation fire

	// process.kill(pid, 0) throws ESRCH once it is really gone.
	let grandchildAlive = true;
	try {
		process.kill(grandchildPid, 0);
	} catch {
		grandchildAlive = false;
	}
	expect(grandchildAlive).toBe(false);
});

test("SIGKILL escalation fires even though proc.killed is already true", async () => {
	// The bug: `if (!proc.killed) proc.kill("SIGKILL")` never ran, because .killed means
	// "a signal was sent", not "the process died". A child that ignores SIGTERM proves it.
	const proc = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], {
		detached: true,
		stdio: "ignore",
	});
	await Bun.sleep(300); // let the handler install

	// Pin the footgun: a plain SIGTERM flips `.killed` while the process lives on.
	proc.kill("SIGTERM");
	await Bun.sleep(150);
	expect(proc.killed).toBe(true);
	expect(proc.exitCode).toBeNull();
	expect(proc.signalCode).toBeNull();

	// killTree gates escalation on real liveness instead, so SIGKILL actually lands.
	killTree(proc, 250);
	const signal = await new Promise<string>((res) => {
		const t = setTimeout(() => res("NEVER_DIED"), 5000);
		proc.once("close", (_c, s) => {
			clearTimeout(t);
			res(String(s));
		});
	});
	expect(signal).toBe("SIGKILL");
});

test("a signalled child is scored as a failure, not exit 0", async () => {
	// Regression guard for `code ?? 0`: on SIGKILL, code is null and only `signal` is set.
	const proc = spawn("sh", ["-c", "sleep 60"], { detached: true, stdio: "ignore" });
	const [code, signal] = await new Promise<[number | null, string | null]>((res) => {
		proc.once("close", (c, s) => res([c, s as string | null]));
		killTree(proc, 100);
	});
	expect(code ?? (signal ? 1 : 0)).toBe(1);
});

test("cacheRead is a cumulative prefix and must not be summed", () => {
	const r = blank();
	const turn = (cacheRead: number, cacheWrite: number) =>
		applyJsonEvent(
			JSON.stringify({
				type: "message_end",
				message: { role: "assistant", content: [], usage: { input: 10, output: 5, cacheRead, cacheWrite } },
			}),
			r,
		);
	turn(0, 5000);
	turn(5000, 1000);
	turn(6000, 2000);
	expect(r.usage.cacheRead).toBe(6000); // peak, not 11000
	expect(r.usage.cacheWrite).toBe(8000); // genuine per-call delta, still summed
	expect(r.usage.input).toBe(30);
	expect(r.usage.turns).toBe(3);
});

test("oversized final text is truncated inline and spilled to a readable file", () => {
	const r = blank();
	r.sessionId = "selfcheck-spill";
	r.exitCode = 0;
	const huge = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
	r.messages.push({ role: "assistant", content: [{ type: "text", text: huge }] } as never);

	const block = resultBlock(r);
	expect(block).toContain("[ok]");
	expect(block).toContain("[truncated at ");
	expect(block.length).toBeLessThan(huge.length);

	const spillPath = /full output: (\S+)\]/.exec(block)?.[1];
	expect(spillPath).toBeTruthy();
	spilled.push(spillPath as string);
	expect(existsSync(spillPath as string)).toBe(true);
	expect(readFileSync(spillPath as string, "utf8")).toBe(huge);
});

test("small output passes through untouched", () => {
	const r = blank();
	r.exitCode = 0;
	r.messages.push({ role: "assistant", content: [{ type: "text", text: "done" }] } as never);
	expect(resultBlock(r)).toContain("\ndone");
	expect(resultBlock(r)).not.toContain("truncated");
});

test("malformed child lines are dropped, not propagated to the renderer", () => {
	const r = blank();
	// Every consumer iterates message.content; a non-array would crash at render time.
	expect(applyJsonEvent('{"type":"message_end","message":{"role":"assistant","content":"oops"}}', r)).toBe(false);
	expect(applyJsonEvent('{"type":"tool_result_end","message":{"role":"toolResult"}}', r)).toBe(false);
	expect(applyJsonEvent("not json at all", r)).toBe(false);
	expect(applyJsonEvent("", r)).toBe(false);
	expect(r.messages).toHaveLength(0);
	for (const m of r.messages) expect(Array.isArray(m.content)).toBe(true);
});

test("an already-aborted signal never spawns a process", async () => {
	// The batch worker dequeues tasks lazily; without this guard an aborted batch
	// still launches every queued child before noticing.
	const r = await runSingleSidequest(process.cwd(), { prompt: "never runs", label: "x" }, AbortSignal.abort(), undefined);
	expect(r.stopReason).toBe("aborted");
	expect(r.exitCode).toBe(1);
	expect(r.sessionId).toBe(""); // no child ever emitted a session event
});

test("background and timeoutMs normalize; bad timeoutMs is rejected", () => {
	const [bg, fg] = normalizeSessions([
		{ label: "long-build", prompt: "build", background: true, timeoutMs: 60000 },
		{ label: "quick", prompt: "read" },
	]);
	expect(bg.background).toBe(true);
	expect(bg.timeoutMs).toBe(60000);
	expect(fg.background).toBe(false);
	expect(fg.timeoutMs).toBeUndefined();
	expect(() => normalizeSessions([{ label: "a", prompt: "b", timeoutMs: 5 }])).toThrow(/timeoutMs/);
});

test("glyphs distinguish new / follow-up / background in the LLM-visible header", () => {
	const glyph = (r: Partial<ReturnType<typeof blank>>) => {
		const base = blank();
		Object.assign(base, { exitCode: 0, messages: [{ role: "assistant", content: [{ type: "text", text: "ok" }] }] }, r);
		return resultBlock(base as never).split("\n")[0];
	};
	expect(glyph({})).toContain("✦");
	expect(glyph({ followUp: true })).toContain("↻");
	expect(glyph({ background: true })).toContain("⇢");
});
