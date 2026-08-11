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
	return [...theirs, ours].filter((path): path is string => typeof path === "string").join(",");
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
