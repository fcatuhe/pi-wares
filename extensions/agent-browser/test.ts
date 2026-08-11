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
	mergeConfig,
	parseVersion,
	sessionFallback,
	stateSummary,
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
