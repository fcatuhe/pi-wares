import { accessSync, chmodSync, constants, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { platform, release } from "node:os";
import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	getAgentDir,
	isToolCallEventType,
} from "@earendil-works/pi-coding-agent";

import {
	age,
	chromeBinary,
	chromeVersion,
	clientHints,
	type Config,
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
	userAgent,
	workSession,
} from "./browser.ts";
import { stealthScript } from "./stealth.ts";

const BINARY = "agent-browser";
const PREFIX = "pi";
const DASHBOARD_URL = "http://localhost:4848";
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

	pi.on("resources_discover", () => ({ skillPaths: [join(import.meta.dirname, "skill", "SKILL.md")] }));

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
		description: "Open a page in the login session for you to authenticate, then save cookies for the agents",
		handler: async (args, ctx) => {
			await ensure(ctx.cwd);
			await authenticate(args.trim(), ctx);
		},
	});

	pi.registerCommand("browser-status", {
		description: "Show the agent-browser sessions, saved login state and dashboard for this directory",
		handler: async (_args, ctx) => {
			await ensure(ctx.cwd);
			await status(ctx);
		},
	});

	async function authenticate(url: string, ctx: ExtensionCommandContext) {
		const opened = await cli(["--session", login, "--restore", login, "open", url || "about:blank"], OPEN_TIMEOUT_MS);
		if (opened.code !== 0) {
			ctx.ui.notify(`${BINARY} open failed: ${opened.stderr.trim() || opened.stdout.trim()}`, "error");
			return;
		}
		const dashboard = await cli(["dashboard", "start"]);
		if (dashboard.code !== 0) ctx.ui.notify(`dashboard start failed: ${dashboard.stderr.trim()}`, "warning");
		const done = await ctx.ui.confirm(
			"Browser login",
			`Log in at ${DASHBOARD_URL}, session ${login}, then confirm to save the cookies.`,
		);
		if (!done) {
			ctx.ui.notify("Login cancelled, saved state unchanged", "warning");
			return;
		}
		const saved = await cli(["--session", login, "state", "save", baseline]);
		if (saved.code !== 0) {
			ctx.ui.notify(`state save failed: ${saved.stderr.trim() || saved.stdout.trim()}`, "error");
			return;
		}
		chmodSync(baseline, 0o600);
		const loaded = (await live()).has(work) ? await cli(["--session", work, "state", "load", baseline]) : undefined;
		primed = true;
		ctx.ui.notify(`Login state saved for ${login}, ${cookieCount(baseline)} cookies`, "info");
		pi.sendMessage(
			{
				customType: BINARY,
				content: loaded?.code === 0
					? "The user logged in. Your browser session now holds those cookies: reload or navigate again, then carry on."
					: `The user logged in. Pick the cookies up with: ${BINARY} state load "$PI_BROWSER_STATE"`,
				display: true,
			},
			{ deliverAs: "nextTurn" },
		);
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

function cookieCount(path: string): number {
	const state = readConfig(path);
	return Array.isArray(state?.cookies) ? state.cookies.length : 0;
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
