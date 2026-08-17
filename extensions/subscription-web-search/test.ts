/** Self-check: npx tsx extensions/subscription-web-search/test.ts */
import assert from "node:assert/strict";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	authHeaders,
	formatResults,
	parseSearchResults,
	parseText,
	resolveWorker,
	searchRequest,
	summaryRequest,
	usageTokens,
} from "./anthropic.ts";
import {
	cachedPage,
	cachePage,
	capMarkdown,
	assertFetchable,
	clearPageCache,
	fetchPage,
	isSamePublisher,
	type Page,
	renderMarkdown,
	validateUrl,
	withoutTerminalOutput,
} from "./page.ts";

const searchResponse = {
	content: [
		{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "zig" } },
		{
			type: "web_search_tool_result",
			tool_use_id: "srvtoolu_1",
			content: [
				{ type: "web_search_result", title: "  0.16.0 Released  ", url: "https://ziglang.org/news/", page_age: "1 day" },
				{ type: "web_search_result", title: "Zig downloads", url: "https://ziglang.org/download/", page_age: null },
				{ type: "web_search_result", url: "https://no-title.example" },
			],
		},
		{ type: "text", text: "DONE" },
	],
	usage: { input_tokens: 9998, output_tokens: 68, cache_read_input_tokens: 12 },
};

// Only well-formed results survive, titles are trimmed, and a null page_age is dropped rather than printed.
const results = parseSearchResults(searchResponse);
assert.deepEqual(results, [
	{ title: "0.16.0 Released", url: "https://ziglang.org/news/", pageAge: "1 day" },
	{ title: "Zig downloads", url: "https://ziglang.org/download/" },
]);

const formatted = formatResults(results, 3210);
assert.match(formatted, /^2 results in 3\.2s$/m);
assert.match(formatted, /^ 1\. 0\.16\.0 Released \(1 day\)$/m);
assert.match(formatted, /^ {4}https:\/\/ziglang\.org\/news\/$/m);
assert.match(formatted, /^ 2\. Zig downloads$/m);
assert.match(formatted, /Read a result with webfetch\./);

// A turn that never called the server tool is a failure, not an empty result set: the caller must retry.
assert.throws(() => parseSearchResults({ content: [{ type: "text", text: "I cannot search." }] }), /without searching/);
// A max_tokens stop mid-arguments leaves the call with no result block, and reads as a length problem, not a refusal.
assert.throws(
	() => parseSearchResults({ content: [{ type: "server_tool_use", name: "web_search", input: {} }] }),
	/cut off before it ran/,
);
// The API reports search failures inside the result block, as an object where the list belongs.
assert.throws(
	() =>
		parseSearchResults({
			content: [{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }],
		}),
	/max_uses_exceeded/,
);
assert.throws(() => parseSearchResults({ content: [{ type: "web_search_tool_result", content: [] }] }), /no results/);

// Text blocks are concatenated, and a turn that produced none is an error rather than an empty summary.
assert.equal(parseText({ content: [{ type: "text", text: "a " }, { type: "thinking" }, { type: "text", text: "b" }] }), "a b");
assert.throws(() => parseText({ content: [{ type: "text", text: "   " }] }), /no text/);

// The search request carries the query verbatim and exactly one server tool. A quoted phrase is common in
// search terms, so the query is tag-delimited rather than wrapped in quotes it would close early.
const request = searchRequest("claude-haiku-4-5", 'zig "0.16"');
assert.equal(request.model, "claude-haiku-4-5");
assert.deepEqual(request.tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]);
assert.match(JSON.stringify(request.messages), /<query>zig \\"0\.16\\"<\/query>/);

// The summary request carries no tools, so it cannot search: it only reads what was fetched.
const summary = summaryRequest("claude-haiku-4-5", "https://x.example/a", "# Page\n\nbody", "List the prices.");
assert.equal(summary.tools, undefined);
assert.match(JSON.stringify(summary.messages), /<page url=\\"https:\/\/x\.example\/a\\">/);
assert.match(JSON.stringify(summary.messages), /Request: List the prices\./);

// OAuth access tokens are Bearer plus the OAuth beta, API keys go in x-api-key without it: the wrong pairing is a 401.
assert.deepEqual(authHeaders("sk-ant-oat01-abc"), {
	authorization: "Bearer sk-ant-oat01-abc",
	"anthropic-beta": "oauth-2025-04-20",
});
assert.deepEqual(authHeaders("sk-ant-api03-abc"), { "x-api-key": "sk-ant-api03-abc" });

const anthropicModel = (id: string, input: number) =>
	({
		id,
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com",
		cost: { input, output: input * 5, cacheRead: input / 10, cacheWrite: input * 1.25 },
	}) as Model<Api>;

const registryWith = (available: Model<Api>[]) =>
	({
		modelRegistry: {
			getAvailable: () => available,
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "sk-ant-oat01-x" }),
		},
	}) as unknown as ExtensionContext;

const haiku = anthropicModel("claude-haiku-4-5", 1);
const opus = anthropicModel("claude-opus-5", 15);
const sonnet = anthropicModel("claude-sonnet-5", 3);
const gpt = { id: "gpt-5.6-sol", provider: "openai-codex", cost: { input: 0.1 } } as Model<Api>;

// The worker is what gets billed: a preferred cheap model whenever one is available.
const preferred = await resolveWorker(registryWith([opus, haiku, sonnet]));
assert.equal(preferred.model.id, "claude-haiku-4-5");
// With no preferred model available, the cheapest anthropic model wins, never the first listed.
assert.equal((await resolveWorker(registryWith([opus, sonnet]))).model.id, "claude-sonnet-5");
// A cheaper model from another provider is not a candidate: only anthropic serves this server tool.
assert.equal((await resolveWorker(registryWith([gpt, opus]))).model.id, "claude-opus-5");
await assert.rejects(resolveWorker(registryWith([gpt])), /Run \/login anthropic/);
await assert.rejects(
	resolveWorker({
		modelRegistry: {
			getAvailable: () => [haiku],
			getApiKeyAndHeaders: async () => ({ ok: false, error: "token expired" }),
		},
	} as unknown as ExtensionContext),
	/token expired/,
);

// Token counts are read off the response; pi's calculateCost turns them into money, in index.ts.
const usage = usageTokens(searchResponse);
assert.deepEqual(usage, { input: 9998, output: 68, cacheRead: 12, cacheWrite: 0 });
assert.deepEqual(usageTokens({ content: [] }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

// Only http(s) is fetchable: file: and data: would turn a web tool into a local exfiltration path.
assert.equal(validateUrl("https://a.example/b?c=d#e").href, "https://a.example/b?c=d#e");
assert.throws(() => validateUrl("file:///etc/passwd"), /Only http and https/);
assert.throws(() => validateUrl("data:text/html,<b>x</b>"), /Only http and https/);
assert.throws(() => validateUrl("/relative/path"), /Not a URL/);
// The rest of the rules are Claude Code's: http is upgraded, credentials and single-label hosts refused, 2000 char ceiling.
assert.equal(validateUrl("http://a.example/x").href, "https://a.example/x");
assert.throws(() => validateUrl("https://user:pass@a.example/"), /carrying credentials/);
assert.throws(() => validateUrl("https://localhost:3000/admin"), /Not a public hostname/);
assert.throws(() => validateUrl(`https://a.example/${"q".repeat(2000)}`), /over the 2000 limit/);

// A redirect may not change publisher: same port, same host bar a leading www.
assert.equal(isSamePublisher(new URL("https://a.example/x"), new URL("https://www.a.example/y")), true);
assert.equal(isSamePublisher(new URL("https://www.a.example/x"), new URL("https://a.example/y")), true);
assert.equal(isSamePublisher(new URL("https://a.example/x"), new URL("https://b.example/y")), false);
assert.equal(isSamePublisher(new URL("https://a.example/x"), new URL("https://a.example:8443/y")), false);

// Taking the Claude-User name means keeping its policy: every hostname is cleared against Anthropic's
// can_fetch endpoint, and a publisher who opted out is refused rather than fetched under that name.
const realFetch = globalThis.fetch;
const stub = (handler: (url: string, init?: RequestInit) => Response) => {
	globalThis.fetch = async (input: unknown, init?: RequestInit) => handler(String(input), init);
};
const domainInfo = (canFetch: boolean) => new Response(JSON.stringify({ can_fetch: canFetch }), { status: 200 });
const isDomainCheck = (url: string) => url.startsWith("https://api.anthropic.com/api/web/domain_info");

try {
	// The check gets a deadline of its own: passing the caller's signal straight through would leave a
	// hung endpoint hanging the tool until the user aborts the turn.
	let checkSignal: AbortSignal | null | undefined;
	const caller = new AbortController().signal;
	stub((url, init) => {
		if (isDomainCheck(url)) checkSignal = init?.signal;
		return domainInfo(true);
	});
	await assertFetchable("deadline.example", caller);
	assert.notEqual(checkSignal, caller);

	stub((url) => (isDomainCheck(url) ? domainInfo(false) : new Response("body")));
	await assert.rejects(assertFetchable("opted-out.example"), /opted out of being fetched by Claude/);
	stub((url) => (isDomainCheck(url) ? new Response("nope", { status: 500 }) : new Response("body")));
	await assert.rejects(assertFetchable("unknown.example"), /Cannot verify whether unknown\.example/);

	// Redirects are followed by hand: counted, revalidated, and refused when they leave the publisher.
	let hops = 0;
	stub((url) => {
		if (isDomainCheck(url)) return domainInfo(true);
		hops++;
		return new Response(null, { status: 302, headers: { location: "https://a.example/next" } });
	});
	await assert.rejects(fetchPage("https://a.example/start"), /More than 10 redirects/);
	assert.equal(hops, 11);
	stub((url) =>
		isDomainCheck(url)
			? domainInfo(true)
			: new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } }),
	);
	await assert.rejects(fetchPage("https://a.example/start"), /Only http and https/);
	stub((url) =>
		isDomainCheck(url)
			? domainInfo(true)
			: new Response(null, { status: 302, headers: { location: "https://elsewhere.example/x" } }),
	);
	await assert.rejects(fetchPage("https://a.example/start"), /redirects to another site\. Fetch https:\/\/elsewhere\.example\/x/);
} finally {
	globalThis.fetch = realFetch;
	clearPageCache();
}

// HTML past 1MB used to be dropped inside the converter, where nothing could report it. One slice, one flag.
stub((url) =>
	isDomainCheck(url)
		? new Response(JSON.stringify({ can_fetch: true }), { status: 200 })
		: new Response(`<html><body><article><p>${"word ".repeat(300_000)}</p></article></body></html>`, {
				headers: { "content-type": "text/html" },
			}),
);
try {
	const big = await fetchPage("https://big.example/page");
	assert.equal(big.truncated, true);
	assert.ok(big.bytes > 1_048_576);
	assert.equal(big.cached, false);
	assert.ok(big.requestMs >= 0);
	// A second read of the same url is answered by the cache, and says so rather than repeating the first request's timing.
	assert.equal((await fetchPage("https://big.example/page")).cached, true);
} finally {
	globalThis.fetch = realFetch;
	clearPageCache();
}

assert.deepEqual(capMarkdown("short"), { markdown: "short", truncated: false });
const capped = capMarkdown("x".repeat(100_001));
assert.equal(capped.truncated, true);
assert.equal(capped.markdown.length, 100_000);

// A page is cached by url for 15 minutes, so a second question about it costs no second fetch.
clearPageCache();
const cachedSubject = { url: "https://a.example/p", bytes: 10, markdown: "body" } as Page;
cachePage("https://a.example/p", cachedSubject);
assert.equal(cachedPage("https://a.example/p"), cachedSubject);
assert.equal(cachedPage("https://a.example/other"), undefined);
// Eviction is by total bytes held, oldest first.
clearPageCache();
cachePage("https://a.example/1", { url: "https://a.example/1", bytes: 40_000_000 } as Page);
cachePage("https://a.example/2", { url: "https://a.example/2", bytes: 40_000_000 } as Page);
assert.equal(cachedPage("https://a.example/1"), undefined);
assert.ok(cachedPage("https://a.example/2"));
clearPageCache();

// One page per rule the conversion applies, since every one of them is a page a site really serves.
const html = `<!doctype html><html><head><title>Spec &amp; Sheet</title><base href="/reviews/"></head><body>
<nav><a href="/">home</a></nav>
<header role="banner"><a href="/account">Sign in</a></header>
<div role="navigation"><a href="/phones">Phones</a></div>
<aside><a href="/ads">Sponsored</a></aside>
<div hidden><p>cookie banner</p></div>
<div aria-hidden="true"><p>screen reader trap</p></div>
<article><h1>Pixel</h1>
<p>The chip is a <a href="../chips/tensor?v=6#specs">Tensor G6</a> built on a 2nm process, see
<a href="https://example.org/absolute">the note</a> and <a href="javascript:alert(1)">nothing</a>.</p>
<p><a href="/gallery"><img src="/img/pixel.png" alt="9"></a></p>
<p><img src="data:image/png;base64,AAAA" alt="Benchmark chart comparing both chips"></p>
<table><thead><tr><th>Model</th><th>Price</th></tr></thead><tbody><tr><td>Pro</td><td>$1,099</td></tr></tbody></table>
<pre><code>const trap = "](/not-a-link)";</code></pre>
<script>window.tracker = "should not survive";</script>
<form><button>Buy</button><label>Email</label><select><option>a</option></select></form>
</article><footer><a href="/tos">Terms</a></footer></body></html>`;
const markdown = await renderMarkdown(html, "https://example.com/reviews/pixel");

// The title comes from <title>, entities decoded, and heads the page the model reads.
assert.match(markdown, /^# Spec & Sheet\n/);
assert.match(markdown, /\| Model \| Price \|/);
assert.match(markdown, /```\nconst trap = "\]\(\/not-a-link\)";\n```/);
// Relative hrefs resolve against the page's own <base>, absolute ones are left alone, opaque ones lose the href.
assert.match(markdown, /\[Tensor G6\]\(https:\/\/example\.com\/chips\/tensor\?v=6#specs\)/);
assert.match(markdown, /\[the note\]\(https:\/\/example\.org\/absolute\)/);
assert.match(markdown, /(?<!\]\()nothing/);
assert.doesNotMatch(markdown, /javascript:/);
// An image is a src the model cannot see: only an alt that reads like a description survives.
assert.match(markdown, /\[image: Benchmark chart comparing both chips\]/);
assert.doesNotMatch(markdown, /base64|pixel\.png|image: 9/);
// An anchor emptied by its image would otherwise print as [](url).
assert.doesNotMatch(markdown, /\[\]\(/);
// Chrome goes by tag and by landmark role, since a page built out of divs only says nav with a role.
for (const gone of ["home", "Sign in", "Phones", "Sponsored", "cookie banner", "screen reader trap", "Terms", "should not survive", "Buy", "Email"]) {
	assert.doesNotMatch(markdown, new RegExp(gone), `chrome survived: ${gone}`);
}
assert.doesNotMatch(markdown, /\n{3,}/);

// Repetition is content in documentation, so nothing may deduplicate lines: docs.python.org says asyncio.run fifteen times.
const repeated = `<html><head><title>Docs</title></head><body><article>${"<p>call asyncio.run(main()) here</p>".repeat(5)}</article></body></html>`;
assert.equal((await renderMarkdown(repeated, "https://example.com/docs")).match(/asyncio\.run/g)?.length, 5);

// A link list is the content of an index page, so link-dense lines may not be dropped either.
const index = `<html><head><title>News</title></head><body><main><ul>${[1, 2, 3].map((n) => `<li><a href="/post-${n}">Post ${n}</a></li>`).join("")}</ul></main></body></html>`;
const listing = await renderMarkdown(index, "https://example.com/news");
for (const n of [1, 2, 3]) assert.match(listing, new RegExp(`\\[Post ${n}\\]\\(https://example\\.com/post-${n}\\)`));

// A page whose text is all chrome has nothing left to summarize, and that is an error, not an empty answer.
await assert.rejects(renderMarkdown("<html><body><nav><a href=\"/\">home</a></nav></body></html>", "https://example.com/empty"), /No readable text/);

// A converter writing to the process console lands on the terminal the TUI is drawing on, so conversion must
// reach it by no path at all: css-tree's own warning (lexer/match.js:528) is what this caught under jsdom.
const bomb = "all 1s ease 1s, ".repeat(300);
const noisy = `<html><head><style>.card { .title { color: red } }</style></head><body><article><p style="transition: ${bomb}all 1s">Body text long enough to be worth converting at all.</p></article></body></html>`;
const realConsole = { ...console };
const realStdout = process.stdout.write;
const realStderr = process.stderr.write;

async function heardWhile<T>(work: () => Promise<T> | T): Promise<{ heard: string[]; value: T }> {
	const heard: string[] = [];
	for (const method of ["log", "warn", "error", "info", "debug", "trace"] as const) {
		console[method] = (...args: unknown[]) => heard.push(`console.${method}: ${args.join(" ")}`);
	}
	process.stdout.write = ((chunk: unknown) => heard.push(`stdout: ${String(chunk)}`)) as typeof process.stdout.write;
	process.stderr.write = ((chunk: unknown) => heard.push(`stderr: ${String(chunk)}`)) as typeof process.stderr.write;
	try {
		return { heard, value: await work() };
	} finally {
		Object.assign(console, realConsole);
		process.stdout.write = realStdout;
		process.stderr.write = realStderr;
	}
}

const extraction = await heardWhile(() => renderMarkdown(noisy, "https://example.com/noisy"));
assert.deepEqual(extraction.heard, []);
assert.match(extraction.value, /Body text/);

// A library reaching past the console for the stream itself is held the same way.
const direct = await heardWhile(() =>
	withoutTerminalOutput(() => {
		console.warn("grumble");
		process.stdout.write("grumble");
		return "extracted";
	}),
);
assert.deepEqual(direct.heard, []);
assert.equal(direct.value, "extracted");

// The process is held for the extraction only, and given back even when it throws.
assert.throws(() => withoutTerminalOutput(() => {
	throw new Error("extraction failed");
}), /extraction failed/);
assert.equal(console.warn, realConsole.warn);
assert.equal(process.stdout.write, realStdout);

// A fragment Readability rejects still yields the body text instead of an empty page.
const bare = await renderMarkdown("<html><body><p>Just one line.</p></body></html>", "https://example.com/bare");
assert.match(bare, /Just one line\./);

await assert.rejects(renderMarkdown("<html><body></body></html>", "https://example.com/empty"), /No readable text/);
