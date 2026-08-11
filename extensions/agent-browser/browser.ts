import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Config = Record<string, unknown>;

export type Identity = {
	version: string;
	uaPlatform: string;
	platform: string;
	platformVersion: string;
	brands: { brand: string; version: string }[];
};

export const AUTOMATION_ARG = "--disable-blink-features=AutomationControlled";

export type Display = {
	width: number;
	height: number;
	availWidth: number;
	availHeight: number;
	scale: number;
	colorDepth: number;
};

// INFO: fc 11aug26 NSBitsPerPixelFromDepth answers 24 on the same panel Chrome reports 30 for, so the depth is taken from the
// backing scale instead: every Retina Mac ships a 10-bit wide-gamut display, and a non-Retina one is 8-bit sRGB
const WIDE_GAMUT_COLOR_DEPTH = 30;
const SRGB_COLOR_DEPTH = 24;

// NSScreen.frame is what window.screen must report and visibleFrame is the desktop minus the menu bar, which is the largest a
// window can honestly be. system_profiler is the wrong source: it prints the panel's native 2560x1664 , not the scaled size
// macOS presents to applications.
export function parseDisplay(json: string): Display | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== "object") return undefined;
	const { frame, visible, scale } = parsed as { frame?: unknown; visible?: unknown; scale?: unknown };
	const size = pixelPair(frame);
	if (!size) return undefined;
	const avail = pixelPair(visible) ?? size;
	const ratio = Math.round(Number(scale)) || 1;
	return {
		width: size[0],
		height: size[1],
		availWidth: avail[0],
		availHeight: avail[1],
		scale: ratio,
		colorDepth: ratio > 1 ? WIDE_GAMUT_COLOR_DEPTH : SRGB_COLOR_DEPTH,
	};
}

function pixelPair(value: unknown): [number, number] | undefined {
	if (!Array.isArray(value) || value.length < 2) return undefined;
	const [width, height] = value.map((n) => Math.round(Number(n)));
	return width > 0 && height > 0 ? [width, height] : undefined;
}

// INFO: fc 11aug26 --screen-info takes physical pixels and Chrome divides by devicePixelRatio to get window.screen, so a
// Retina display needs the presented size doubled. Only a size, an origin, colorDepth, devicePixelRatio and rotation parse:
// an unknown key (workArea, workAreaInsets, dpi) makes Chrome exit before it opens a page, with nothing on stderr. There is no
// work-area key, so screen.availWidth/availHeight always equal the screen size, 33px taller than the real desktop.
export function screenInfoArg({ width, height, scale, colorDepth }: Display): string {
	return `--screen-info={${width * scale}x${height * scale} colorDepth=${colorDepth} devicePixelRatio=${scale}}`;
}

export function windowSizeArg({ availWidth, availHeight }: Display): string {
	return `--window-size=${availWidth},${availHeight}`;
}

export function userAgentArg(ua: string): string {
	return `--user-agent=${ua}`;
}

// INFO: fc 11aug26 the UA has to reach the browser process. agent-browser overrides it per context over CDP, which service
// workers never see (they keep the real HeadlessChrome string) and which empties navigator.userAgentData everywhere. The
// launch flag fixes both and needs no page-side patching at all. It cannot go through --args: agent-browser drops
// --user-agent, and splits --args on every comma, which mangles --window-size and --screen-info. So Chrome is launched
// through a wrapper that appends the flags itself.
export function wrapperScript(chrome: string, flags: string[]): string {
	const appended = flags.map((flag) => ` \\\n\t${shellQuote(flag)}`).join("");
	return `#!/bin/sh\nexec ${shellQuote(chrome)} "$@"${appended}\n`;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

// INFO: fc 11aug26 GREASE token, servers must ignore it, so any plausible value passes
const GREASE = { brand: "Not=A?Brand", version: "99" };
// INFO: fc 11aug26 only reached when ~/.agent-browser/browsers holds nothing, which means agent-browser install never ran
const FALLBACK_VERSION = "151.0.7922.71";

const UA_PLATFORMS: Record<string, { ua: string; label: string }> = {
	darwin: { ua: "Macintosh; Intel Mac OS X 10_15_7", label: "macOS" },
	win32: { ua: "Windows NT 10.0; Win64; x64", label: "Windows" },
	linux: { ua: "X11; Linux x86_64", label: "Linux" },
};

// INFO: fc 11aug26 Chrome freezes these UA fragments, so a template is as accurate as asking the binary
export function identity(platform: string, osVersion: string, version: string): Identity {
	const major = version.split(".")[0];
	const { ua, label } = UA_PLATFORMS[platform] ?? UA_PLATFORMS.linux;
	return {
		version,
		uaPlatform: ua,
		platform: label,
		platformVersion: padVersion(osVersion),
		brands: [{ brand: "Chromium", version: major }, { brand: "Google Chrome", version: major }, GREASE],
	};
}

// INFO: fc 11aug26 the real Chrome carries the proprietary codecs and the Google Chrome brand that Chrome for Testing lacks
const CHROME_BINARIES: Record<string, string[]> = {
	darwin: [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
	],
	linux: ["/opt/google/chrome/chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"],
	win32: ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"],
};

export function chromeBinary(platform: string, exists = existsSync): string | undefined {
	return (CHROME_BINARIES[platform] ?? []).find((path) => exists(path));
}

// INFO: fc 11aug26 "Google Chrome 151.0.7922.77", and Chromium builds print their own name before the same field
export function parseVersion(output: string): string | undefined {
	return output.match(/(\d+(?:\.\d+){2,3})/)?.[1];
}

export function chromeVersion(browsersDir = defaultBrowsersDir()): string {
	let best = "";
	let bestKey = -1;
	for (const name of names(browsersDir)) {
		const version = name.startsWith("chrome-") ? name.slice("chrome-".length) : undefined;
		if (!version) continue;
		const key = sortKey(version);
		if (key > bestKey) [best, bestKey] = [version, key];
	}
	return best || FALLBACK_VERSION;
}

function defaultBrowsersDir(): string {
	return join(homedir(), ".agent-browser", "browsers");
}

function names(dir: string): string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

function sortKey(version: string): number {
	return version.split(".").reduce((key, part) => key * 100000 + (Number(part) || 0), 0);
}

// INFO: fc 11aug26 Chrome sends three components, sw_vers prints two on a .0 release
function padVersion(version: string): string {
	const parts = version.split(".");
	while (parts.length < 3) parts.push("0");
	return parts.slice(0, 3).join(".");
}

export function userAgent({ version, uaPlatform }: Identity): string {
	const major = version.split(".")[0];
	return `Mozilla/5.0 (${uaPlatform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

export function clientHints({ brands, platform }: Identity): Record<string, string> {
	return {
		"sec-ch-ua": brands.map(({ brand, version }) => `"${brand}";v="${version}"`).join(", "),
		"sec-ch-ua-mobile": "?0",
		"sec-ch-ua-platform": `"${platform}"`,
	};
}

export function sessionFallback(cwd: string, prefix: string): string {
	return `${prefix}-${createHash("sha256").update(cwd).digest("hex").slice(0, 12)}`;
}

export function workSession(login: string, pid: number): string {
	return `${login}-${pid}`;
}

// INFO: fc 11aug26 AGENT_BROWSER_CONFIG replaces config discovery instead of layering on it, so carry the user's keys over
export function mergeConfig(user: Config[], ours: Config): Config {
	const merged: Config = {};
	for (const config of [...user, ours]) {
		for (const [key, value] of Object.entries(config)) merged[key] = value;
	}
	return merged;
}

// INFO: fc 11aug26 ws://127.0.0.1:<port>/devtools/browser/<id>, and the DevTools HTTP endpoint on that port is the only
// way to tell a closed window from a live one: every agent-browser command relaunches the browser it cannot reach
export function cdpPort(cdpUrl: string): number | undefined {
	const port = Number(cdpUrl.trim().match(/^wss?:\/\/[^/]+:(\d+)\//)?.[1]);
	return port > 0 ? port : undefined;
}

// INFO: fc 11aug26 macOS keeps Chrome running with no window left, so /json/version still answers minutes after the user
// closed the login window. The page targets are the windows, and an empty list is the close signal on every platform.
// Chrome's own surfaces do not count: a launch leaves a New Tab page next to the login page, and a login is never one of them
const INTERNAL_SURFACE = /^(chrome|chrome-untrusted|devtools):/;

// INFO: fc 11aug26 url and title are all /json/list carries, and a login that never changes either is a login that cannot be
// snapshotted: a save costs a window flashing open on a headed browser, so it happens when this changes and not on a timer
export function pageSignatures(targets: unknown): string[] {
	if (!Array.isArray(targets)) return [];
	const pages: string[] = [];
	for (const target of targets) {
		if (!target || typeof target !== "object") continue;
		const { type, url, title } = target as { type?: unknown; url?: unknown; title?: unknown };
		if (type !== "page" || typeof url !== "string" || INTERNAL_SURFACE.test(url)) continue;
		pages.push(`${url}\t${typeof title === "string" ? title : ""}`);
	}
	return pages.sort();
}

// INFO: fc 11aug26 a headed launch gets no URL on the command line, so Chrome opens its New Tab page and agent-browser puts
// the login on a second target: the empty tab is the one the user lands on, in front of the page that wants the password
export function strayTargets(targets: unknown): string[] {
	if (!Array.isArray(targets)) return [];
	const stray: string[] = [];
	for (const target of targets) {
		if (!target || typeof target !== "object") continue;
		const { type, url, id } = target as { type?: unknown; url?: unknown; id?: unknown };
		if (type !== "page" || typeof url !== "string" || typeof id !== "string") continue;
		if (INTERNAL_SURFACE.test(url)) stray.push(id);
	}
	return stray;
}

export function stateSummary(state: Config | undefined): { cookies: number; domains: string[] } {
	const cookies = Array.isArray(state?.cookies) ? (state.cookies as { domain?: unknown }[]) : [];
	const domains = new Set<string>();
	for (const { domain } of cookies) {
		if (typeof domain === "string") domains.add(domain.replace(/^\.+/, ""));
	}
	return { cookies: cookies.length, domains: [...domains].sort() };
}

export function cookieKeys(state: Config | undefined): Set<string> {
	const cookies = Array.isArray(state?.cookies) ? (state.cookies as { domain?: unknown; name?: unknown }[]) : [];
	const keys = new Set<string>();
	for (const { domain, name } of cookies) {
		if (typeof domain === "string" && typeof name === "string") keys.add(`${domain}\t${name}`);
	}
	return keys;
}

// Web storage is where a token-based login keeps its bearer token, so a credential count that only sees cookies reads zero on
// an app that has your whole session in localStorage.
export function storedOrigins(state: Config | undefined): { origins: string[]; entries: number } {
	const listed = Array.isArray(state?.origins) ? (state.origins as Config[]) : [];
	const origins: string[] = [];
	let entries = 0;
	for (const { origin, localStorage } of listed) {
		if (typeof origin !== "string") continue;
		origins.push(origin);
		if (Array.isArray(localStorage)) entries += localStorage.length;
	}
	return { origins: origins.sort(), entries };
}

// INFO: fc 11aug26 every session on this login holds the same cookies in memory, so deleting the file while one is live leaves
// a logged-in browser behind: the work sessions are the login name plus the pid of the pi process that owns them
export function sessionsOn(names: string[], login: string): string[] {
	if (!login) return [];
	return names.filter((name) => name === login || name.startsWith(`${login}-`)).sort();
}

export function loginOf(session: string): string {
	return session.replace(/-\d+$/, "");
}

// The directories a login was last used from, so a saved login can be named by the work it belongs to rather than by its hash
export const LOGIN_INDEX = "directories.json";

// The login you are working in first, then whichever holds the most cookies: the heaviest of the others is where a cleanup
// starts, and an empty one is nothing to decide about.
export function ranked<T extends { name: string; cookies: number }>(rows: T[], current: string): T[] {
	const mine = (row: T) => Number(row.name === current);
	return [...rows].sort((a, b) => mine(b) - mine(a) || b.cookies - a.cookies || a.name.localeCompare(b.name));
}

// A login with no live session still has its cookies on disk, and a live session whose login was already forgotten still holds
// them in memory: both are things to clean up, so the inventory is the union.
export function savedLogins(entries: string[], sessions: string[]): string[] {
	const names = new Set<string>();
	for (const entry of entries) {
		if (entry === LOGIN_INDEX || !entry.endsWith(".json")) continue;
		names.add(entry.slice(0, -".json".length));
	}
	for (const session of sessions) names.add(loginOf(session));
	return [...names].sort();
}

export function cookieNames(keys: Set<string>): string[] {
	return [...new Set([...keys].map((key) => key.split("\t")[1]))].sort();
}

// INFO: fc 11aug26 the session cookie is the last thing a login sets, so what the capture gained over the saved state is the
// only honest signal that it landed. A capture that only loses cookies is a failed restore and must not replace the file:
// the saved state accumulates every site the user logged into, and one bad overwrite drops all of them.
export function captureVerdict(before: Set<string>, after: Set<string>): "gained" | "same" | "shrunk" {
	for (const key of after) {
		if (!before.has(key)) return "gained";
	}
	return after.size < before.size ? "shrunk" : "same";
}

export function readConfig(path: string): Config | undefined {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function launchArgs(user: Config[]): string {
	const theirs = user.map((config) => config.args).filter((args): args is string => typeof args === "string");
	return [...theirs, AUTOMATION_ARG].join(",");
}

export function initScripts(user: Config[], ours: string): string {
	const theirs = user.flatMap((config) => (Array.isArray(config.initScripts) ? config.initScripts : []));
	return [...theirs, ours].filter((path): path is string => typeof path === "string" && path !== "").join(",");
}

export function mentionsBinary(command: string): boolean {
	return /(^|[^\w-])agent-browser([^\w-]|$)/.test(command);
}

export function guardViolation(command: string, login: string): string | undefined {
	if (!login || !mentionsBinary(command)) return undefined;
	if (targetsLogin(command, login)) {
		return `${login} is the login session the human drives. Work in $AGENT_BROWSER_SESSION, and call browser_login when a page wants credentials.`;
	}
	if (/\bclose\b/.test(command) && /--all\b/.test(command)) {
		return "close --all kills the login session and every other agent's browser. Close your own session instead.";
	}
	if (/--auto-connect\b/.test(command)) {
		return "--auto-connect drives the human's own Chrome. Use browser_login for credentials.";
	}
	return undefined;
}

function targetsLogin(command: string, login: string): boolean {
	const flag = new RegExp(`--session[=\\s]+["']?${login}["']?(\\s|$|["'])`);
	const env = new RegExp(`AGENT_BROWSER_SESSION=["']?${login}["']?(\\s|$|["'])`);
	return flag.test(command) || env.test(command);
}

export function age(millis: number): string {
	const minutes = Math.floor(millis / 60000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
