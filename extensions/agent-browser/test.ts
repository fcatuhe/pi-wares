/** Self-check: npx tsx extensions/agent-browser/test.ts */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	age,
	AUTOMATION_ARG,
	captureVerdict,
	cdpPort,
	chromeBinary,
	chromeVersion,
	clientHints,
	cookieKeys,
	cookieNames,
	guardViolation,
	identity,
	initScripts,
	launchArgs,
	loginOf,
	mergeConfig,
	pageSignatures,
	parseVersion,
	ranked,
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

const browsers = (versions: string[]) => {
	const dir = mkdtempSync(join(tmpdir(), "agent-browser-"));
	for (const version of versions) mkdirSync(join(dir, `chrome-${version}`));
	return dir;
};

// The real Chrome is preferred over the downloaded one, and its version comes from the binary itself.
assert.equal(
	chromeBinary("darwin", (path) => String(path).startsWith("/Applications")),
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
);
assert.equal(chromeBinary("linux", () => false), undefined);
assert.equal(chromeBinary("sunos", () => true), undefined);
assert.equal(parseVersion("Google Chrome 151.0.7922.77 "), "151.0.7922.77");
assert.equal(parseVersion("Chromium 148.0.7778.167"), "148.0.7778.167");
assert.equal(parseVersion("no version here"), undefined);

// Falling back to the downloaded browsers: highest wins, ordered by number, not by string.
assert.equal(chromeVersion(browsers(["chrome-9.0.0.0", "148.0.7778.167", "151.0.7922.71"])), "151.0.7922.71");
assert.equal(chromeVersion(browsers([])).split(".")[0], "151");

// Chrome sends three components, sw_vers prints two on a .0 release.
const many = identity("darwin", "15.3.0", "151.0.7922.71");
assert.equal(many.platformVersion, "15.3.0");
assert.equal(many.platform, "macOS");
assert.equal(identity("darwin", "26.6", "151.0.7922.71").platformVersion, "26.6.0");
assert.equal(identity("linux", "6.8.0", "151.0.7922.71").platformVersion, "6.8.0");

// The user agent must not name Chromium or Headless, and the hints must agree with it.
assert.equal(
	userAgent(many),
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
);
assert.equal(
	clientHints(many)["sec-ch-ua"],
	'"Chromium";v="151", "Google Chrome";v="151", "Not=A?Brand";v="99"',
);
assert.equal(clientHints(many)["sec-ch-ua-platform"], '"macOS"');
assert.match(userAgent(identity("win32", "10.0.26100", "151.0.7922.71")), /Windows NT 10\.0/);

// The page-side object has to carry the same brands as the headers, and the GREASE brand keeps its own version.
const script = stealthScript(many);
assert.match(script, /"Google Chrome","version":"151"/);
assert.match(script, /"Not=A\?Brand","version":"99\.0\.0\.0"/);
assert.match(script, /"uaFullVersion":"151.0.7922.71"/);
assert.match(script, /^\(\(\) => \{/);

// One work session per pi process per directory, and the same directory always resolves the same login session.
assert.equal(sessionFallback("/tmp/repo", "pi"), sessionFallback("/tmp/repo", "pi"));
assert.notEqual(sessionFallback("/tmp/repo", "pi"), sessionFallback("/tmp/other", "pi"));
assert.match(sessionFallback("/tmp/repo", "pi"), /^pi-[0-9a-f]{12}$/);
assert.equal(workSession("pi-abc", 4242), "pi-abc-4242");

// A generated config replaces the user's config discovery, so their keys have to survive it.
assert.deepEqual(mergeConfig([{ headed: true }, { proxy: "http://p" }], { headers: "{}" }), {
	headed: true,
	proxy: "http://p",
	headers: "{}",
});
assert.deepEqual(mergeConfig([{ headers: "theirs" }], { headers: "ours" }), { headers: "ours" });

// Launch args and init scripts add to the user's, they do not replace them.
assert.equal(launchArgs([{ args: "--no-sandbox" }]), `--no-sandbox,${AUTOMATION_ARG}`);
assert.equal(launchArgs([{ args: 42 }]), AUTOMATION_ARG);
assert.equal(initScripts([{ initScripts: ["/a.js"] }], "/s.js"), "/a.js,/s.js");
assert.equal(initScripts([{}], "/s.js"), "/s.js");

// The login session holds the user's cookies: an agent reaching for it, for every other session at once,
// or for the user's own Chrome, is the one mistake that costs a real login.
const LOGIN = "pi-abc";
assert.ok(guardViolation("agent-browser --session pi-abc open https://x", LOGIN));
assert.ok(guardViolation("agent-browser --session=pi-abc open https://x", LOGIN));
assert.ok(guardViolation('AGENT_BROWSER_SESSION="pi-abc" agent-browser open https://x', LOGIN));
assert.ok(guardViolation("agent-browser close --all", LOGIN));
assert.ok(guardViolation("agent-browser --auto-connect state save ./auth.json", LOGIN));
assert.equal(guardViolation("agent-browser open https://x", LOGIN), undefined);
assert.equal(guardViolation("agent-browser --session pi-abc-4242 open https://x", LOGIN), undefined);
assert.equal(guardViolation("agent-browser --session pi-abcdef open https://x", LOGIN), undefined);
assert.equal(guardViolation("echo agent-browserish --session pi-abc", LOGIN), undefined);
assert.equal(guardViolation("agent-browser close", LOGIN), undefined);
// Before the first session_start there is no login session to protect, and no name to match against.
assert.equal(guardViolation("agent-browser close --all", ""), undefined);

// The DevTools port is how a window the user closed is told apart from a live one, and a miss must not read as port 0.
assert.equal(cdpPort("ws://127.0.0.1:63923/devtools/browser/61141a9d-5345-4f3f-b2c2-ad199633509c\n"), 63923);
assert.equal(cdpPort("wss://localhost:9222/devtools/browser/abc"), 9222);
assert.equal(cdpPort(""), undefined);
assert.equal(cdpPort("✗ no browser running"), undefined);

// macOS keeps Chrome running with no window left, so the DevTools port answers long after the user closed the login window:
// only the page targets say whether a window is still there, and every command against a windowless browser flashes one open.
assert.deepEqual(
	pageSignatures([
		{ type: "page", url: "https://app.example.com/login", title: "Log in" },
		{ type: "page", url: "chrome://newtab/", title: "New Tab" },
		{ type: "iframe", url: "chrome-untrusted://new-tab-page/one-google-bar" },
		{ type: "background_page", url: "chrome-extension://nkeimhog/x.html" },
		{ type: "service_worker", url: "chrome-extension://fignfifo/sw.js" },
	]),
	["https://app.example.com/login\tLog in"],
);
assert.deepEqual(pageSignatures([{ type: "page", url: "chrome-untrusted://new-tab-page/" }]), []);
assert.deepEqual(pageSignatures([{ type: "page", url: "devtools://devtools/bundled/x.html" }]), []);
assert.deepEqual(pageSignatures([{ type: "page", url: "about:blank" }]), ["about:blank\t"]);
assert.deepEqual(pageSignatures([]), []);
assert.deepEqual(pageSignatures([{ type: "page" }, null, 1, "page"]), []);
assert.deepEqual(pageSignatures(undefined), []);
// A save happens when this list changes, so two tabs reported in another order must not read as a navigation, while an
// SPA that swaps the title without touching the URL must.
assert.deepEqual(
	pageSignatures([{ type: "page", url: "https://b.com/", title: "B" }, { type: "page", url: "https://a.com/", title: "A" }]),
	pageSignatures([{ type: "page", url: "https://a.com/", title: "A" }, { type: "page", url: "https://b.com/", title: "B" }]),
);
assert.notDeepEqual(
	pageSignatures([{ type: "page", url: "https://a.com/", title: "Log in" }]),
	pageSignatures([{ type: "page", url: "https://a.com/", title: "Dashboard" }]),
);

// The tab Chrome opens for itself is closed so the login window has one tab, and the login page can never be mistaken for it.
assert.deepEqual(
	strayTargets([
		{ type: "page", url: "https://app.example.com/login", id: "A1" },
		{ type: "page", url: "chrome://newtab/", id: "B2" },
		{ type: "page", url: "devtools://devtools/bundled/x.html", id: "C3" },
		{ type: "iframe", url: "chrome-untrusted://new-tab-page/one-google-bar", id: "D4" },
		{ type: "page", url: "chrome://newtab/" },
		{ type: "page", id: "E5" },
		null,
	]),
	["B2", "C3"],
);
assert.deepEqual(strayTargets([{ type: "page", url: "about:blank", id: "A1" }]), []);
assert.deepEqual(strayTargets([]), []);
assert.deepEqual(strayTargets(undefined), []);

// What the saved login carries, reported back to the agent: cookie count, and the domains without the leading dot.
assert.deepEqual(stateSummary({ cookies: [{ domain: ".linkedin.com" }, { domain: ".www.linkedin.com" }] }), {
	cookies: 2,
	domains: ["linkedin.com", "www.linkedin.com"],
});
assert.deepEqual(stateSummary({ cookies: [{ domain: "a.com" }, { domain: "a.com" }, {}] }), {
	cookies: 3,
	domains: ["a.com"],
});
assert.deepEqual(stateSummary(undefined), { cookies: 0, domains: [] });

// A token-based login keeps nothing in its cookies, so forget has to count web storage too or it reports an empty state file
// over a bearer token that is still there.
assert.deepEqual(
	storedOrigins({
		origins: [
			{ origin: "https://b.example.com", localStorage: [{ name: "authToken" }] },
			{ origin: "https://a.example.com", localStorage: [{ name: "a" }, { name: "b" }] },
			{ localStorage: [{ name: "orphan" }] },
			{ origin: "https://c.example.com" },
		],
	}),
	{ origins: ["https://a.example.com", "https://b.example.com", "https://c.example.com"], entries: 3 },
);
assert.deepEqual(storedOrigins({}), { origins: [], entries: 0 });
assert.deepEqual(storedOrigins(undefined), { origins: [], entries: 0 });

// Deleting the state file is half a forget: every session on that login still holds the same cookies in memory. The work
// sessions are the login plus a pid, and a login that is a prefix of another must not drag that other one in.
assert.deepEqual(sessionsOn(["pi-abc-7177", "pi-abc", "pi-abcdef", "pi-abcdef-42", "other"], "pi-abc"), [
	"pi-abc",
	"pi-abc-7177",
]);
assert.deepEqual(sessionsOn(["pi-abc-7177"], ""), []);
assert.deepEqual(sessionsOn([], "pi-abc"), []);
assert.equal(loginOf("pi-abc-7177"), "pi-abc");
assert.equal(loginOf("pi-abc"), "pi-abc");
assert.equal(loginOf("pi-9f3a1c2b"), "pi-9f3a1c2b");

// The inventory is the union: a state file with no browser open is credentials at rest, a live session whose login was already
// forgotten still holds them in memory, and the directory index is not one of the logins.
assert.deepEqual(
	savedLogins(["pi-abc.json", "pi-def.json", "directories.json", "pi-abc.json.new", "pi-abc-7177", "stealth.js"], [
		"pi-def-42",
		"pi-ghi-99",
		"pi-ghi",
	]),
	["pi-abc", "pi-def", "pi-ghi"],
);
assert.deepEqual(savedLogins([], []), []);

// The login you are working in stays at the top however light it is, the rest sort by what they are holding.
assert.deepEqual(
	ranked(
		[
			{ name: "pi-b", cookies: 0 },
			{ name: "pi-c", cookies: 40 },
			{ name: "pi-a", cookies: 40 },
			{ name: "pi-here", cookies: 1 },
		],
		"pi-here",
	).map((row) => row.name),
	["pi-here", "pi-a", "pi-c", "pi-b"],
);
assert.deepEqual(
	ranked([{ name: "pi-a", cookies: 1 }], "gone").map((row) => row.name),
	["pi-a"],
);

// A login is only saved when the capture gained a cookie the state lacked: a window closed too early comes back with the
// anonymous cookies the wall itself sets, and reporting that as a saved login is what sent an agent back into the wall.
const anonymous = cookieKeys({ cookies: [{ domain: ".x.com", name: "visitor" }] });
const signedIn = cookieKeys({ cookies: [{ domain: ".x.com", name: "visitor" }, { domain: ".x.com", name: "session" }] });
assert.equal(captureVerdict(anonymous, signedIn), "gained");
assert.equal(captureVerdict(anonymous, anonymous), "same");
assert.equal(captureVerdict(signedIn, anonymous), "shrunk");
// Re-logging into the same site renews the values under the same names, so "same" cannot mean "refuse to save".
const renewed = cookieKeys({
	cookies: [{ domain: ".x.com", name: "visitor", value: "2" }, { domain: ".x.com", name: "session", value: "fresh" }],
});
assert.equal(captureVerdict(signedIn, renewed), "same");
assert.equal(captureVerdict(new Set(), new Set()), "same");
assert.deepEqual(cookieNames(signedIn), ["session", "visitor"]);
// The same name on two hosts is one cookie to report, and two keys to compare.
const twoHosts = cookieKeys({ cookies: [{ domain: "a.com", name: "s" }, { domain: "b.com", name: "s" }] });
assert.equal(twoHosts.size, 2);
assert.deepEqual(cookieNames(twoHosts), ["s"]);
assert.equal(cookieKeys({ cookies: [{ domain: "a.com" }, { name: "s" }, 1] }).size, 0);
assert.equal(cookieKeys(undefined).size, 0);

assert.equal(age(90_000), "1m");
assert.equal(age(3 * 3600_000), "3h");
assert.equal(age(72 * 3600_000), "3d");

console.log("agent-browser: ok");
