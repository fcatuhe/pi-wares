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
import { homedir, platform, release } from "node:os";
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
	LOGIN_INDEX,
	mentionsBinary,
	mergeConfig,
	pageSignatures,
	parseVersion,
	ranked,
	readConfig,
	savedLogins,
	sessionFallback,
	sessionsOn,
	stateSummary,
	storedOrigins,
	strayTargets,
	userAgent,
	workSession,
} from "./browser.ts";
import { stealthScript } from "./stealth.ts";

const BINARY = "agent-browser";
const PREFIX = "pi";
const LOGIN_TIMEOUT_MS = 15 * 60_000;
// INFO: fc 11aug26 a DevTools HTTP read at this interval is free and has no effect on the page. An agent-browser command
// does: it materialises a page target and drops it ~150ms later, which on a headed browser is a window flashing open and
// shut in the user's face, so the state is saved on navigation rather than on every tick
const LOGIN_POLL_MS = 1_000;
// Every file authenticate() writes that holds cookies or tokens, next to the config and screenshots that do not
const SNAPSHOT = "login.json";
const PROBE = "probe.json";
const FINAL = "final.json";
const CAPTURES = [SNAPSHOT, PROBE, FINAL];
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

	pi.registerCommand("browser-forget", {
		description: "Delete the saved login for this directory, cookies and tokens, and close the browsers holding them",
		handler: async (_args, ctx) => {
			await ensure(ctx.cwd);
			ctx.ui.notify(await forget(ctx), "info");
		},
	});

	// INFO: fc 11aug26 headed, because the dashboard viewport cannot take a paste, and a password manager needs a real window
	async function authenticate(url: string, ctx: ExtensionContext): Promise<string> {
		if ((await live()).has(login)) await cli(["--session", login, "close"]);
		const target = url || "about:blank";
		const opened = await openWindow(target);
		if (opened.code !== 0) return `${BINARY} open failed: ${output(opened)}`;
		const port = cdpPort((await cli(["--session", login, "get", "cdp-url"])).stdout);
		if (port) await closeStrayTabs(port);
		const snapshot = join(scratch, SNAPSHOT);
		rmSync(snapshot, { force: true });
		const before = cookieKeys(readConfig(baseline));
		const waited = await waitForLogin(ctx, port, snapshot, target);
		const captured = waited === "cancelled" ? undefined : await capture(port, snapshot);
		// INFO: fc 11aug26 on macOS the browser outlives its last window, and a login session nobody watches pops a window back
		// up on the next command that touches it: closing the session is what takes it off the user's screen
		await cli(["--session", login, "close"]);
		if (waited === "cancelled") return "Login cancelled, saved state unchanged";
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
	// what clears the endpoint it tried: one retry is the difference between the agent giving up and the user getting a window.
	// The saved login is carried in with --state, not a --restore key: a restore key gives the session a second cookie store
	// under ~/.agent-browser/sessions that nothing here manages, and has every command reload and rewrite it
	async function openWindow(target: string) {
		const carried = existsSync(baseline) ? ["--state", baseline] : [];
		const args = ["--session", login, ...carried, "--headed", "open", target];
		const first = await cli(args, OPEN_TIMEOUT_MS);
		if (first.code === 0) return first;
		await cli(["--session", login, "close"]);
		return cli(args, OPEN_TIMEOUT_MS);
	}

	// INFO: fc 11aug26 the last window closing is the signal, and the dialog is the fallback for a window we cannot probe
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

	// INFO: fc 11aug26 the snapshots are the login: a save once the window is gone comes back without the session cookies, which
	// Chrome drops with the last window, and on Linux the browser dies with it. So each navigation gets one, and the richest wins
	async function watchWindow(port: number | undefined, snapshot: string, signal: AbortSignal) {
		const probe = join(scratch, PROBE);
		const deadline = Date.now() + LOGIN_TIMEOUT_MS;
		let snapshotted = "";
		while (Date.now() < deadline) {
			await sleep(LOGIN_POLL_MS, signal);
			if (signal.aborted) return "abandoned" as const;
			if (!port) continue;
			const open = await openPages(port);
			if (!open?.length) return "closed" as const;
			const here = open.join("\n");
			if (here === snapshotted) continue;
			snapshotted = here;
			await cli(["--session", login, "state", "save", probe]);
			if (richest([probe, snapshot]) === probe) copyFileSync(probe, snapshot);
		}
		return "expired" as const;
	}

	// INFO: fc 11aug26 a command against a closed browser silently relaunches an empty one, so a save can come back anonymous
	// even from a live-looking port: the snapshots are what survive the user closing the window
	async function capture(port: number | undefined, snapshot: string): Promise<string | undefined> {
		const fresh = join(scratch, FINAL);
		rmSync(fresh, { force: true });
		if (port && (await worthSaving(port, snapshot))) await cli(["--session", login, "state", "save", fresh]);
		return richest([fresh, snapshot]);
	}

	// INFO: fc 11aug26 a save with no page left materialises one, which is a window flashing open on a browser the user has just
	// closed, and Chrome dropped the session cookies with that window anyway: only worth it when no snapshot survived
	async function worthSaving(port: number, snapshot: string): Promise<boolean> {
		const open = await openPages(port);
		if (open === undefined) return false;
		return open.length > 0 || !richest([snapshot]);
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
		remember(cwd);

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

	// Every login on this machine, so you can see where credentials are lying, and none of them goes without being picked out of
	// a list and then confirmed by name: the other logins belong to other directories, where an agent may be mid-task.
	async function forget(ctx: ExtensionCommandContext): Promise<string> {
		const sessions = [...(await live())];
		const names = savedLogins(children(STATE_ROOT), sessions);
		if (!names.length) return "No saved login, no browser open";
		const rows = ranked(
			names.map((name) => tally(name, sessions)),
			login,
		);
		const lines = new Map(rows.map((row) => [inventory(row), row.name]));
		if (!ctx.hasUI) return ["Saved logins:", ...lines.keys()].join("\n");
		const picked = await ctx.ui.select("Forget which login?", [...lines.keys()]);
		const name = picked ? lines.get(picked) : undefined;
		if (!name) return ["Nothing deleted:", ...lines.keys()].join("\n");
		const held = sessionsOn(sessions, name);
		const warning = held.length ? `Closes ${plural(held.length, "browser")}: ${held.join(", ")}` : "No browser open on it";
		const prompt = `${picked}\n\n${warning}. Cookies and tokens deleted.`;
		if (!(await ctx.ui.confirm(`Forget ${name}?`, prompt))) return `Kept ${name}`;
		for (const session of held) await cli(["--session", session, "close"]);
		if (name === login) primed = false;
		return `Forgot ${name}: deleted ${plural(wipeCredentials(name), "file")}, closed ${plural(held.length, "browser")}`;
	}

	function tally(name: string, sessions: string[]) {
		const file = join(STATE_ROOT, `${name}.json`);
		const state = readConfig(file);
		return {
			name,
			cookies: stateSummary(state).cookies,
			tokens: storedOrigins(state).entries,
			open: sessionsOn(sessions, name).length,
			saved: state ? `${age(Date.now() - statSync(file).mtimeMs)} old` : "no state file",
		};
	}

	function inventory({ name, cookies, tokens, open, saved }: ReturnType<typeof tally>): string {
		return `${name}  ${directory(name)}  ${cookies} cookies, ${tokens} tokens, ${open} open, ${saved}`;
	}

	// The login id is a hash of the directory it is keyed on, so the index is the only thing that can name it back
	function directory(name: string): string {
		const known = readConfig(join(STATE_ROOT, LOGIN_INDEX))?.[name];
		if (typeof known !== "string") return "directory unknown";
		return `${known.replace(homedir(), "~")}${known === setupCwd ? ", here" : ""}`;
	}

	function remember(cwd: string) {
		const file = join(STATE_ROOT, LOGIN_INDEX);
		writeFileSync(file, JSON.stringify({ ...readConfig(file), [login]: cwd }, null, 1));
	}

	// INFO: fc 11aug26 the login state is not the only copy: authenticate() snapshots the window into the scratch directory on
	// every navigation, and each snapshot is a full state file. A forget that leaves those behind leaves the credentials behind
	function wipeCredentials(name: string): number {
		const file = join(STATE_ROOT, `${name}.json`);
		const paths = [file, `${file}.new`];
		for (const child of children(STATE_ROOT)) {
			if (!sessionsOn([child], name).length) continue;
			for (const capture of CAPTURES) paths.push(join(STATE_ROOT, child, capture));
		}
		let removed = 0;
		for (const path of paths) {
			if (!existsSync(path)) continue;
			rmSync(path, { force: true });
			removed += 1;
		}
		return removed;
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

// The pages the user has open, and undefined when the browser itself is gone: an empty list either way means the login is over.
async function openPages(port: number): Promise<string[] | undefined> {
	const listed = await devtools(port, "list");
	return listed === undefined ? undefined : pageSignatures(listed);
}

// Leaves the login tab alone: only Chrome's own surfaces match, and the watcher already ignores them, so the window the user
// sees ends up with the one tab that closing ends the login.
async function closeStrayTabs(port: number): Promise<void> {
	for (const id of strayTargets(await devtools(port, "list"))) {
		// INFO: fc 11aug26 /json/close answers "Target is closing" in plain text, which devtools() would read as a failure
		try {
			await fetch(`http://127.0.0.1:${port}/json/close/${id}`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
		} catch {
			return;
		}
	}
}

async function devtools(port: number, endpoint: string): Promise<unknown> {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/json/${endpoint}`, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		return response.ok ? await response.json() : undefined;
	} catch {
		return undefined;
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

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
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
