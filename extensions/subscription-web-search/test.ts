import assert from "node:assert";
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
import { capMarkdown, formatBytes, formatPage, type Page, renderMarkdown, validateUrl, withoutCssWarnings } from "./page.ts";

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

const formatted = formatResults("zig release", results);
assert.match(formatted, /^2 results for "zig release"$/m);
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

const registryWith = (available: Model<Api>[], configured: string[] = []) =>
	({
		modelRegistry: {
			find: (provider: string, id: string) =>
				available.find((model) => model.provider === provider && model.id === id),
			hasConfiguredAuth: (model: Model<Api>) => configured.includes(model.id),
			getAvailable: () => available,
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "sk-ant-oat01-x" }),
		},
	}) as unknown as ExtensionContext;

const haiku = anthropicModel("claude-haiku-4-5", 1);
const opus = anthropicModel("claude-opus-5", 15);
const sonnet = anthropicModel("claude-sonnet-5", 3);
const gpt = { id: "gpt-5.6-sol", provider: "openai-codex", cost: { input: 0.1 } } as Model<Api>;

// The worker is what gets billed: a preferred cheap model when it is authenticated.
const preferred = await resolveWorker(registryWith([opus, haiku, sonnet], ["claude-haiku-4-5"]));
assert.equal(preferred.model.id, "claude-haiku-4-5");
// With no preferred model authenticated, the cheapest anthropic model wins, never the first listed.
assert.equal((await resolveWorker(registryWith([opus, sonnet]))).model.id, "claude-sonnet-5");
// A cheaper model from another provider is not a candidate: only anthropic serves this server tool.
assert.equal((await resolveWorker(registryWith([gpt, opus]))).model.id, "claude-opus-5");
await assert.rejects(resolveWorker(registryWith([gpt])), /Run \/login anthropic/);
await assert.rejects(
	resolveWorker({
		modelRegistry: {
			find: () => haiku,
			hasConfiguredAuth: () => true,
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

assert.deepEqual(capMarkdown("short"), { markdown: "short", truncated: false });
const capped = capMarkdown("x".repeat(300_001));
assert.equal(capped.truncated, true);
assert.equal(capped.markdown.length, 300_000);

const html = `<!doctype html><html><head><title>Spec Sheet</title></head><body>
<nav><a href="/">home</a></nav>
<article><h1>Pixel</h1>
<p>The chip is a Tensor G6 built on a 2nm process, and this paragraph exists only so that the
extractor keeps the article rather than discarding it as boilerplate navigation chrome.</p>
<table><thead><tr><th>Model</th><th>Price</th></tr></thead><tbody><tr><td>Pro</td><td>$1,099</td></tr></tbody></table>
<pre><code>zig build</code></pre>
<script>window.tracker = "should not survive";</script>
</article></body></html>`;
const markdown = await renderMarkdown(html, "https://example.com/spec");
assert.match(markdown, /^# Spec Sheet/);
assert.match(markdown, /Tensor G6/);
assert.match(markdown, /\| Model \| Price \|/);
assert.match(markdown, /```\nzig build\n```/);
assert.doesNotMatch(markdown, /should not survive/);

// Regression: a page using CSS nesting made jsdom emit "Could not parse CSS stylesheet" through its
// default virtual console, which forwards to the process console and lands in the TUI mid-prompt.
const nested = "<html><head><style>.card { .title { color: red } }</style></head><body><article><p>Body text long enough that the extractor keeps this article rather than treating it as navigation chrome.</p></article></body></html>";
const quiet: unknown[] = [];
const realError = console.error;
const realWarn = console.warn;
console.error = (...args: unknown[]) => quiet.push(args);
console.warn = (...args: unknown[]) => quiet.push(args);
try {
	assert.match(await renderMarkdown(nested, "https://example.com/nested"), /Body text/);
} finally {
	console.error = realError;
	console.warn = realWarn;
}
assert.deepEqual(quiet, []);

// A fragment Readability rejects still yields the body text instead of an empty page.
const bare = await renderMarkdown("<html><body><p>Just one line.</p></body></html>", "https://example.com/bare");
assert.match(bare, /Just one line\./);

await assert.rejects(renderMarkdown("<html><body></body></html>", "https://example.com/empty"), /No readable text/);

// css-tree warnings would land in the TUI, and the original console must come back even when parsing throws.
const originalWarn = console.warn;
const seen: unknown[] = [];
console.warn = (...args: unknown[]) => seen.push(args);
assert.equal(
	withoutCssWarnings(() => {
		console.warn("[csstree-match] BREAK");
		return 7;
	}),
	7,
);
assert.deepEqual(seen, []);
assert.throws(() =>
	withoutCssWarnings(() => {
		throw new Error("parse blew up");
	}),
);
console.warn("restored");
assert.deepEqual(seen, [["restored"]]);
console.warn = originalWarn;

// Sizes read as a person would say them, and the same string is used in the TUI row and the model's text.
assert.equal(formatBytes(512), "512B");
assert.equal(formatBytes(39834), "38.9KB");
assert.equal(formatBytes(406494), "397KB");
assert.equal(formatBytes(5_000_000), "4.8MB");

const page = { url: "https://a.example", bytes: 4096, status: 200, statusText: "OK", truncated: false } as Page;
assert.equal(formatPage(page, "Answer."), "https://a.example (4.0KB, 200 OK)\n\nAnswer.");
assert.match(formatPage({ ...page, truncated: true }, "Answer."), /4\.0KB, 200 OK, truncated before reading/);

console.log("subscription-web-search: ok");
