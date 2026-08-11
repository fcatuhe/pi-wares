import {
	accessSync,
	chmodSync,
	constants,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { platform, release } from "node:os";
import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	getAgentDir,
	isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
	age,
	captureVerdict,
	cdpPort,
	chromeBinary,
	chromeVersion,
	clientHints,
	type Config,
	cookieKeys,
	cookieNames,
	guardViolation,
	type Identity,
	identity,
	initScripts,
	launchArgs,
	mentionsBinary,
	mergeConfig,
	parseVersion,
	readConfig,
	sessionFallback,
	stateSummary,
	userAgent,
	workSession,
} from "./browser.ts";
import { stealthScript } from "./stealth.ts";

const BINARY = "agent-browser";
const PREFIX = "pi";
const LOGIN_TIMEOUT_MS = 15 * 60_000;
// INFO: fc 11aug26 whatever happens between the last snapshot and the window closing is lost, and the session cookie lands
// last: at 5s a user who closed the window right after logging in got an anonymous state back. A save costs ~45ms.
const LOGIN_POLL_MS = 1_000;
const NAMED_COOKIES = 4;
const PROBE_TIMEOUT_MS = 1_500;
// INFO: fc 11aug26 not under tmpdir: the macOS cleaner deletes unused files there, and a launch with a missing --config aborts
const STATE_ROOT = join(getAgentDir(), "extensions", BINARY);
const SCRATCH_TTL_MS = 24 * 60 * 60 * 1000;
const OPEN_TIMEOUT_MS = 120_000;
const CLI_TIMEOUT_MS = 30_000;

export default function (pi: ExtensionAPI) {
	if (!onPath(BINARY)) return;

	let login = "";
	let work = "";
	let baseline = "";
	let scratch = "";
	let me: Identity | undefined;
	let configured: Promise<void> | undefined;
	let setupCwd = "";
	let primed = false;

	// INFO: fc 11aug26 SKILL.md sits in the extension directory, not a skill/ below it: a consumer that names a skill after
	// its parent directory then reads agent-browser rather than "skill"
	pi.on("resources_discover", () => ({ skillPaths: [join(import.meta.dirname, "SKILL.md")] }));

	// INFO: fc 11aug26 a resumed or forked session can land in another directory, and the sessions are keyed on it
	pi.on("session_start", () => {
		setupCwd = "";
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event) || !mentionsBinary(event.input.command)) return undefined;
		await ensure(ctx.cwd);
		const reason = guardViolation(event.input.command, login);
		if (reason) return { block: true, reason };
		await prime(ctx.ui);
		return undefined;
	});

	// INFO: fc 11aug26 your own ! commands get the same defaults, and no guard: the login session is yours to drive
	pi.on("user_bash", async (event) => {
		if (mentionsBinary(event.command)) await ensure(event.cwd);
		return undefined;
	});

	pi.on("session_shutdown", async (event) => {
		if (event.reason !== "quit" || !work) return;
		await cli(["--session", work, "close"]);
		for (const key of Object.keys(process.env)) {
			if (key.startsWith("AGENT_BROWSER_") || key === "PI_BROWSER_STATE") delete process.env[key];
		}
		rmSync(scratch, { recursive: true, force: true });
	});

	pi.registerCommand("browser-login", {
		description: "Open a page in a Chrome window for you to authenticate, then save cookies for the agents",
		handler: async (args, ctx) => {
			await ensure(ctx.cwd);
			const report = await authenticate(args.trim(), ctx);
			ctx.ui.notify(report, "info");
			pi.sendMessage({ customType: BINARY, content: report, display: true }, { deliverAs: "nextTurn" });
		},
	});

	pi.registerTool({
		name: "browser_login",
		label: "Browser login",
		description:
			"Hand a login wall to the user. Opens a real Chrome window at the URL, waits until they have authenticated and " +
			"closed the window, then loads the cookies into your own browser session. Call it when an agent-browser page " +
			"wants credentials or a session expires, then navigate again. You never type the credentials yourself.",
		promptSnippet: "Open a Chrome window for the user to log in, and wait for them",
		promptGuidelines: [
			"Call browser_login with the URL that asked for credentials instead of trying to log in yourself, then retry the navigation.",
		],
		parameters: Type.Object({
			url: Type.String({ description: "URL to open for the login, usually the wall you hit" }),
		}),
		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			await ensure(ctx.cwd);
			onUpdate?.({ content: [{ type: "text", text: `Chrome is open at ${params.url}, waiting for you to log in` }] });
			return { content: [{ type: "text", text: await authenticate(params.url.trim(), ctx) }], details: {} };
		},
	});

	pi.registerCommand("browser-status", {
		description: "Show the agent-browser sessions, saved login state and Chrome version for this directory",
		handler: async (_args, ctx) => {
			await ensure(ctx.cwd);
			await status(ctx);
		},
	});

	// INFO: fc 11aug26 headed, because the dashboard viewport cannot take a paste, and a password manager needs a real window
	async function authenticate(url: string, ctx: ExtensionContext): Promise<string> {
		if ((await live()).has(login)) await cli(["--session", login, "close"]);
		const target = url || "about:blank";
		const opened = await openWindow(target);
		if (opened.code !== 0) return `${BINARY} open failed: ${output(opened)}`;
		const port = cdpPort((await cli(["--session", login, "get", "cdp-url"])).stdout);
		const snapshot = join(scratch, "login.json");
		rmSync(snapshot, { force: true });
		const before = cookieKeys(readConfig(baseline));
		const waited = await waitForLogin(ctx, port, snapshot, target);
		if (waited === "cancelled") return "Login cancelled, saved state unchanged";
		const captured = await capture(port, snapshot);
		if (!captured) return "Nothing saved: the window closed before any cookie could be read";
		const state = readConfig(captured);
		const after = cookieKeys(state);
		const { cookies, domains } = stateSummary(state);
		const verdict = captureVerdict(before, after);
		const carried = `${cookies} cookies for ${domains.join(", ") || "no domain"}`;
		if (verdict === "shrunk") {
			return (
				`Saved login kept: the window came back with ${carried}, fewer than the state already holds, so the login ` +
				"did not land. Log in until the page is past the wall, then close the window."
			);
		}
		commit(captured);
		const detail =
			verdict === "gained"
				? `${carried}, new: ${added(before, after)}`
				: `${carried}, but no cookie the state did not already have, so the login may not have landed`;
		if (!(await live()).has(work)) {
			primed = false;
			return `Login saved, ${detail}. Your next ${BINARY} command starts from it, so navigate again.`;
		}
		const loaded = await cli(["--session", work, "state", "load", baseline]);
		primed = true;
		return loaded.code === 0
			? `Login saved and applied to your session, ${detail}. Navigate again, and call this again if the wall is still there.`
			: `Login saved, ${detail}, but not applied: ${output(loaded)}. Retry with ${BINARY} state load "$PI_BROWSER_STATE"`;
	}

	// INFO: fc 11aug26 the first launch after the daemon went away fails with "Failed to connect", and closing the session is
	// what clears the endpoint it tried: one retry is the difference between the agent giving up and the user getting a window
	async function openWindow(target: string) {
		const args = ["--session", login, "--restore", login, "--headed", "open", target];
		const first = await cli(args, OPEN_TIMEOUT_MS);
		if (first.code === 0) return first;
		await cli(["--session", login, "close"]);
		return cli(args, OPEN_TIMEOUT_MS);
	}

	// INFO: fc 11aug26 the window closing is the signal, and the dialog is the fallback for a window we cannot probe
	async function waitForLogin(ctx: ExtensionContext, port: number | undefined, snapshot: string, url: string) {
		const watched = new AbortController();
		const asked = new AbortController();
		const watching = watchWindow(port, snapshot, watched.signal).then((outcome) => {
			asked.abort();
			return outcome;
		});
		if (!ctx.hasUI) return watching;
		const message = port
			? `Chrome is open at ${url}. Log in there, then close the window. Confirm here only if it stays open.`
			: `Chrome is open at ${url}. Log in there, then confirm here to save the cookies.`;
		const asking = ctx.ui
			.confirm("Browser login", message, { signal: asked.signal })
			.then((ok) => {
				watched.abort();
				return ok ? "confirmed" : "cancelled";
			})
			.catch(() => "cancelled" as const);
		return Promise.race([watching, asking]);
	}

	async function watchWindow(port: number | undefined, snapshot: string, signal: AbortSignal) {
		const probe = join(scratch, "probe.json");
		const deadline = Date.now() + LOGIN_TIMEOUT_MS;
		while (Date.now() < deadline) {
			await sleep(LOGIN_POLL_MS, signal);
			if (signal.aborted) return "abandoned" as const;
			if (!port) continue;
			if (!(await cdpAlive(port))) return "closed" as const;
			await cli(["--session", login, "state", "save", probe]);
			if (richest([probe, snapshot]) === probe) copyFileSync(probe, snapshot);
		}
		return "expired" as const;
	}

	// INFO: fc 11aug26 a command against a closed browser silently relaunches an empty one, so a save can come back anonymous
	// even from a live-looking port: the periodic snapshot is what survives the user closing the window
	async function capture(port: number | undefined, snapshot: string): Promise<string | undefined> {
		const fresh = join(scratch, "final.json");
		rmSync(fresh, { force: true });
		if (port && (await cdpAlive(port))) await cli(["--session", login, "state", "save", fresh]);
		return richest([fresh, snapshot]);
	}

	// The first path wins a tie, so callers list the freshest capture first: same cookie names, newer values.
	function richest(paths: string[]): string | undefined {
		let best: string | undefined;
		let most = 0;
		for (const path of paths) {
			const { cookies } = stateSummary(readConfig(path));
			if (cookies > most) [best, most] = [path, cookies];
		}
		return best;
	}

	function commit(captured: string) {
		const staging = `${baseline}.new`;
		copyFileSync(captured, staging);
		chmodSync(staging, 0o600);
		renameSync(staging, baseline);
	}

	// INFO: fc 11aug26 nothing but the skill until a browser is actually wanted: setup costs three execs and four writes,
	// and most sessions never browse. Every entry point that can precede a launch waits on this first.
	function ensure(cwd: string): Promise<void> {
		if (setupCwd !== cwd) {
			setupCwd = cwd;
			configured = configure(cwd);
		}
		return configured ?? Promise.resolve();
	}

	async function configure(cwd: string) {
		login = (await sessionId(cwd)) ?? sessionFallback(cwd, PREFIX);
		work = workSession(login, process.pid);
		baseline = join(STATE_ROOT, `${login}.json`);
		scratch = join(STATE_ROOT, work);
		mkdirSync(scratch, { recursive: true });
		pruneScratch();

		const theirs = userConfigs(cwd);
		const chrome = executable(theirs);
		if (chrome) process.env.AGENT_BROWSER_EXECUTABLE_PATH = chrome;
		me = identity(platform(), await osVersion(), await browserVersion(chrome));
		const stealth = join(scratch, "stealth.js");
		writeFileSync(stealth, stealthScript(me));
		const config = join(scratch, "config.json");
		writeFileSync(config, JSON.stringify(mergeConfig(theirs, { headers: JSON.stringify(clientHints(me)) }), null, 1));

		process.env.AGENT_BROWSER_SESSION = work;
		process.env.AGENT_BROWSER_CONFIG = config;
		process.env.AGENT_BROWSER_USER_AGENT = userAgent(me);
		process.env.AGENT_BROWSER_ARGS = launchArgs(theirs);
		process.env.AGENT_BROWSER_INIT_SCRIPTS = initScripts(theirs, stealth);
		process.env.AGENT_BROWSER_HIDE_SCROLLBARS = "false";
		process.env.AGENT_BROWSER_SCREENSHOT_DIR = scratch;
		process.env.AGENT_BROWSER_DOWNLOAD_PATH = scratch;
		// INFO: fc 11aug26 deliberately not AGENT_BROWSER_STATE: agent-browser 0.33.2 drops the navigation when the state path
		// arrives through the env or the config file, every open lands on about:blank. Only --state works, so the login state
		// is applied by priming below, and this name stays out of the CLI's reach.
		process.env.PI_BROWSER_STATE = baseline;
	}

	async function status(ctx: ExtensionCommandContext) {
		const running = await live();
		const saved = existsSync(baseline) ? `${age(Date.now() - statSync(baseline).mtimeMs)} old` : "none yet";
		ctx.ui.notify(
			[
				`work    ${work} ${running.has(work) ? "live" : "idle"}`,
				`login   ${login} ${running.has(login) ? "live" : "idle"}`,
				`state   ${saved}`,
				`chrome  ${me?.version ?? "unknown"}`,
				`scratch ${scratch}`,
			].join("\n"),
			"info",
		);
	}

	// INFO: fc 11aug26 the login state only applies through --state, so it is applied once, on a browser this session started
	async function prime(ui: ExtensionContext["ui"]) {
		if (primed) return;
		primed = true;
		if (!existsSync(baseline) || (await live()).has(work)) return;
		const applied = await cli(["--session", work, "--state", baseline, "get", "url"]);
		if (applied.code !== 0) ui.notify(`Login state not applied: ${applied.stderr.trim()}`, "warning");
	}

	async function live(): Promise<Set<string>> {
		const listed = await cli(["session", "list", "--json"]);
		return new Set(liveSessions(listed.stdout));
	}

	function pruneScratch() {
		for (const name of children(STATE_ROOT)) {
			const dir = join(STATE_ROOT, name);
			if (dir === scratch) continue;
			try {
				const stats = statSync(dir);
				if (stats.isDirectory() && Date.now() - stats.mtimeMs > SCRATCH_TTL_MS) rmSync(dir, { recursive: true, force: true });
			} catch {
				// INFO: fc 11aug26 another pi process pruning the same root is the expected race, not an error
			}
		}
	}

	function executable(theirs: Config[]): string | undefined {
		if (process.env.AGENT_BROWSER_EXECUTABLE_PATH || theirs.some((config) => config.executablePath)) return undefined;
		return chromeBinary(platform());
	}

	async function browserVersion(chrome: string | undefined): Promise<string> {
		if (!chrome) return chromeVersion();
		const result = await pi.exec(chrome, ["--version"], { timeout: CLI_TIMEOUT_MS });
		return (result.code === 0 ? parseVersion(result.stdout) : undefined) ?? chromeVersion();
	}

	// INFO: fc 11aug26 Chrome reports the macOS release, and Darwin 25 is macOS 26, so the kernel version cannot be mapped
	async function osVersion(): Promise<string> {
		if (platform() !== "darwin") return release();
		const result = await pi.exec("sw_vers", ["-productVersion"], { timeout: CLI_TIMEOUT_MS });
		return result.code === 0 ? result.stdout.trim() : release();
	}

	async function sessionId(cwd: string): Promise<string | undefined> {
		const result = await cli(["session", "id", "--scope", "cwd", "--prefix", PREFIX], CLI_TIMEOUT_MS, cwd);
		const id = result.stdout.trim();
		return result.code === 0 && id ? id : undefined;
	}

	function cli(args: string[], timeout = CLI_TIMEOUT_MS, cwd?: string) {
		return pi.exec(BINARY, args, { timeout, cwd });
	}
}

function userConfigs(cwd: string): Config[] {
	const paths = [join(process.env.HOME ?? "", ".agent-browser", "config.json"), join(cwd, "agent-browser.json")];
	return paths.map(readConfig).filter((config): config is Config => config !== undefined);
}

async function cdpAlive(port: number): Promise<boolean> {
	try {
		return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })).ok;
	} catch {
		return false;
	}
}

function sleep(millis: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(done, millis);
		signal.addEventListener("abort", done, { once: true });
	});
}

function added(before: Set<string>, after: Set<string>): string {
	const names = cookieNames(new Set([...after].filter((key) => !before.has(key))));
	const rest = names.length - NAMED_COOKIES;
	return rest > 0 ? `${names.slice(0, NAMED_COOKIES).join(", ")} +${rest} more` : names.join(", ");
}

function output({ stderr, stdout }: { stderr: string; stdout: string }): string {
	return stderr.trim() || stdout.trim() || "no output";
}

function liveSessions(stdout: string): string[] {
	try {
		const { data } = JSON.parse(stdout);
		return Array.isArray(data?.sessions) ? data.sessions : [];
	} catch {
		return [];
	}
}

function children(dir: string): string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

function onPath(binary: string): boolean {
	return (process.env.PATH ?? "").split(":").some((dir) => {
		try {
			accessSync(join(dir, binary), constants.X_OK);
			return true;
		} catch {
			return false;
		}
	});
}
