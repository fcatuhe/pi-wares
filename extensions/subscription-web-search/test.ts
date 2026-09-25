import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
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
  transportReason,
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

const realFetch = globalThis.fetch;
const stub = (handler: (url: string, init?: RequestInit) => Response) => {
  globalThis.fetch = async (input: unknown, init?: RequestInit) => handler(String(input), init);
};
const domainInfo = (canFetch: boolean) => new Response(JSON.stringify({ can_fetch: canFetch }), { status: 200 });
const isDomainCheck = (url: string) => url.startsWith("https://api.anthropic.com/api/web/domain_info");
const transportFailure = (cause: Error) => Object.assign(new TypeError("fetch failed"), { cause });
const enotfound = Object.assign(new Error("getaddrinfo ENOTFOUND a.example"), { code: "ENOTFOUND" });

afterEach(() => {
  globalThis.fetch = realFetch;
  clearPageCache();
});

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

const bomb = "all 1s ease 1s, ".repeat(300);
const page = `<!doctype html><html><head><title>Spec &amp; Sheet</title><base href="/reviews/">
<style>.card { .title { color: red } }</style></head><body>
<nav><a href="/">home</a></nav>
<header role="banner"><a href="/account">Sign in</a></header>
<div role="navigation"><a href="/phones">Phones</a></div>
<aside><a href="/ads">Sponsored</a></aside>
<div hidden><p>cookie banner</p></div>
<div aria-hidden="true"><p>screen reader trap</p></div>
<article><h1>Pixel</h1>
<p style="transition: ${bomb}all 1s">The chip is a <a href="../chips/tensor?v=6#specs">Tensor G6</a> built on a 2nm
process, see <a href="https://example.org/absolute">the note</a> and <a href="javascript:alert(1)">nothing</a>.</p>
<p><a href="/gallery"><img src="/img/pixel.png" alt="9"></a></p>
<p><img src="data:image/png;base64,AAAA" alt="Benchmark chart comparing both chips"></p>
<table><thead><tr><th>Model</th><th>Price</th></tr></thead><tbody><tr><td>Pro</td><td>$1,099</td></tr></tbody></table>
<pre><code>const trap = "](/not-a-link)";</code></pre>
${"<p>call asyncio.run(main()) here</p>".repeat(5)}
<ul>${[1, 2, 3].map((n) => `<li><a href="/post-${n}">Post ${n}</a></li>`).join("")}</ul>
<script>window.tracker = "should not survive";</script>
<form><button>Buy</button><label>Email</label><select><option>a</option></select></form>
</article><footer><a href="/tos">Terms</a></footer></body></html>`;
let markdown = "";

test("only well-formed results survive, titles trimmed, and a null page_age dropped rather than printed", () => {
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
});

test("a turn that never called the server tool is a failure the caller must retry, not an empty result set", () => {
  assert.throws(() => parseSearchResults({ content: [{ type: "text", text: "I cannot search." }] }), /without searching/);
});

test("a max_tokens stop mid-arguments reads as a length problem, not a refusal", () => {
  assert.throws(
    () => parseSearchResults({ content: [{ type: "server_tool_use", name: "web_search", input: {} }] }),
    /cut off before it ran/,
  );
});

test("a search failure the API reports inside the result block is raised", () => {
  assert.throws(
    () =>
      parseSearchResults({
        content: [{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }],
      }),
    /max_uses_exceeded/,
  );
  assert.throws(() => parseSearchResults({ content: [{ type: "web_search_tool_result", content: [] }] }), /no results/);
});

test("text blocks are concatenated, and a turn that produced none is an error rather than an empty summary", () => {
  assert.equal(parseText({ content: [{ type: "text", text: "a " }, { type: "thinking" }, { type: "text", text: "b" }] }), "a b");
  assert.throws(() => parseText({ content: [{ type: "text", text: "   " }] }), /no text/);
});

test("the query is tag-delimited rather than quoted, since a quoted phrase in it would close the quote early", () => {
  const request = searchRequest("claude-haiku-4-5", 'zig "0.16"');
  assert.equal(request.model, "claude-haiku-4-5");
  assert.deepEqual(request.tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]);
  assert.match(JSON.stringify(request.messages), /<query>zig \\"0\.16\\"<\/query>/);
});

test("the summary request carries no tools, so it only reads what was fetched", () => {
  const summary = summaryRequest("claude-haiku-4-5", "https://x.example/a", "# Page\n\nbody", "List the prices.");
  assert.equal(summary.tools, undefined);
  assert.match(JSON.stringify(summary.messages), /<page url=\\"https:\/\/x\.example\/a\\">/);
  assert.match(JSON.stringify(summary.messages), /Request: List the prices\./);
});

test("OAuth tokens go as Bearer with the OAuth beta and API keys in x-api-key, since the wrong pairing is a 401", () => {
  assert.deepEqual(authHeaders("sk-ant-oat01-abc"), {
    Authorization: "Bearer sk-ant-oat01-abc",
    "anthropic-beta": "oauth-2025-04-20",
  });
  assert.deepEqual(authHeaders("sk-ant-api03-abc"), { "x-api-key": "sk-ant-api03-abc" });
});

test("the billed worker is a preferred cheap model, else the cheapest anthropic one, never another provider", async () => {
  const preferred = await resolveWorker(registryWith([opus, haiku, sonnet]));
  assert.equal(preferred.model.id, "claude-haiku-4-5");
  assert.equal((await resolveWorker(registryWith([opus, sonnet]))).model.id, "claude-sonnet-5", "the first listed won over the cheapest");
  assert.equal((await resolveWorker(registryWith([gpt, opus]))).model.id, "claude-opus-5", "only anthropic serves this server tool");
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
});

test("token counts are read off the response, for pi's calculateCost to price", () => {
  const usage = usageTokens(searchResponse);
  assert.deepEqual(usage, { input: 9998, output: 68, cacheRead: 12, cacheWrite: 0 });
  assert.deepEqual(usageTokens({ content: [] }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
});

test("only http(s) is fetchable, since file: and data: would make a web tool a local exfiltration path", () => {
  assert.equal(validateUrl("https://a.example/b?c=d#e").href, "https://a.example/b?c=d#e");
  assert.throws(() => validateUrl("file:///etc/passwd"), /Only http and https/);
  assert.throws(() => validateUrl("data:text/html,<b>x</b>"), /Only http and https/);
  assert.throws(() => validateUrl("/relative/path"), /Not a URL/);
});

test("Claude Code's URL rules hold: http upgraded, credentials and single-label hosts refused, 2000 char ceiling", () => {
  assert.equal(validateUrl("http://a.example/x").href, "https://a.example/x");
  assert.throws(() => validateUrl("https://user:pass@a.example/"), /carrying credentials/);
  assert.throws(() => validateUrl("https://localhost:3000/admin"), /Not a public hostname/);
  assert.throws(() => validateUrl(`https://a.example/${"q".repeat(2000)}`), /over the 2000 limit/);
});

test("a redirect may not change publisher: same port, same host bar a leading www", () => {
  assert.equal(isSamePublisher(new URL("https://a.example/x"), new URL("https://www.a.example/y")), true);
  assert.equal(isSamePublisher(new URL("https://www.a.example/x"), new URL("https://a.example/y")), true);
  assert.equal(isSamePublisher(new URL("https://a.example/x"), new URL("https://b.example/y")), false);
  assert.equal(isSamePublisher(new URL("https://a.example/x"), new URL("https://a.example:8443/y")), false);
});

test("the domain check gets a deadline of its own, or a hung endpoint holds the tool until the user aborts", async () => {
  let checkSignal: AbortSignal | null | undefined;
  const caller = new AbortController().signal;
  stub((url, init) => {
    if (isDomainCheck(url)) checkSignal = init?.signal;
    return domainInfo(true);
  });
  await assertFetchable("deadline.example", caller);
  assert.notEqual(checkSignal, caller);
});

test("taking the Claude-User name keeps its policy: an opted-out or unverifiable publisher is refused", async () => {
  stub((url) => (isDomainCheck(url) ? domainInfo(false) : new Response("body")));
  await assert.rejects(assertFetchable("opted-out.example"), /opted out of being fetched by Claude/);
  stub((url) => (isDomainCheck(url) ? new Response("nope", { status: 500 }) : new Response("body")));
  await assert.rejects(assertFetchable("unknown.example"), /Cannot verify whether unknown\.example/);
});

test("redirects are followed by hand: counted, revalidated, and refused when they leave the publisher", async () => {
  let hops = 0;
  stub((url) => {
    if (isDomainCheck(url)) return domainInfo(true);
    hops++;
    return new Response(null, { status: 302, headers: { location: "https://a.example/next" } });
  });
  await assert.rejects(fetchPage("https://a.example/start"), /More than 10 redirects/);
  assert.equal(hops, 11);
  stub((url) => (isDomainCheck(url) ? domainInfo(true) : new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } })));
  await assert.rejects(fetchPage("https://a.example/start"), /Only http and https/);
  stub((url) =>
    isDomainCheck(url) ? domainInfo(true) : new Response(null, { status: 302, headers: { location: "https://elsewhere.example/x" } }),
  );
  await assert.rejects(fetchPage("https://a.example/start"), /redirects to another site\. Fetch https:\/\/elsewhere\.example\/x/);
});

// A DNS blip reached the model as undici's bare "fetch failed" and sent it to curl to find out what broke.
test("a transport failure names its cause, and a GET is retried once since a blip usually clears", async () => {
  let attempts = 0;
  stub((url) => {
    if (isDomainCheck(url)) return domainInfo(true);
    attempts++;
    throw transportFailure(enotfound);
  });
  await assert.rejects(fetchPage("https://a.example/x"), /Cannot reach a\.example: getaddrinfo ENOTFOUND a\.example \(ENOTFOUND\)/);
  assert.equal(attempts, 2, "the failure the model sees is not the second one");
  attempts = 0;
  stub((url) => {
    if (isDomainCheck(url)) return domainInfo(true);
    attempts++;
    if (attempts === 1) throw transportFailure(enotfound);
    return new Response("<html><body><p>second time</p></body></html>", { headers: { "content-type": "text/html" } });
  });
  assert.match((await fetchPage("https://blip.example/x")).markdown, /second time/);
  assert.equal(attempts, 2);
});

test("a deadline is not a blip, and is not retried since that would double the wait", async () => {
  let attempts = 0;
  stub((url) => {
    if (isDomainCheck(url)) return domainInfo(true);
    attempts++;
    throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  });
  await assert.rejects(fetchPage("https://slow.example/x"), /Cannot reach slow\.example: no response within 60s/);
  assert.equal(attempts, 1);
});

test("a domain check that cannot reach the endpoint names the transport cause", async () => {
  stub((url) => {
    if (isDomainCheck(url)) throw transportFailure(enotfound);
    return new Response("body");
  });
  await assert.rejects(
    fetchPage("https://unreachable.example/x"),
    /Cannot verify whether unreachable\.example allows fetching: getaddrinfo ENOTFOUND a\.example \(ENOTFOUND\)/,
  );
});

test("each deadline reports its own length, and an AggregateError's empty message is looked through", () => {
  const timedOut = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  assert.equal(transportReason(timedOut, 60_000), "no response within 60s");
  assert.equal(transportReason(timedOut, 10_000), "no response within 10s");
  const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" });
  assert.equal(
    transportReason(transportFailure(new AggregateError([refused])), 60_000),
    "connect ECONNREFUSED 127.0.0.1:443 (ECONNREFUSED)",
  );
});

test("an abort is the user cancelling the turn, so it passes through once for pi to render as cancellation", async () => {
  let attempts = 0;
  stub(() => {
    attempts++;
    throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
  });
  await assert.rejects(fetchPage("https://a.example/x"), { name: "AbortError" });
  assert.equal(attempts, 1);
});

// HTML past 1MB used to be dropped inside the converter, where nothing could report it.
test("HTML past 1MB is sliced and flagged, and a second read of the url is the cached page", async () => {
  stub((url) =>
    isDomainCheck(url)
      ? new Response(JSON.stringify({ can_fetch: true }), { status: 200 })
      : new Response(`<html><body><article><p>${"word ".repeat(300_000)}</p></article></body></html>`, {
          headers: { "content-type": "text/html" },
        }),
  );
  const big = await fetchPage("https://big.example/page");
  assert.equal(big.truncated, true);
  assert.ok(big.bytes > 1_048_576);
  assert.equal(await fetchPage("https://big.example/page"), big);
});

test("capMarkdown cuts markdown past 100k characters and flags it", () => {
  assert.deepEqual(capMarkdown("short"), { markdown: "short", truncated: false });
  const capped = capMarkdown("x".repeat(100_001));
  assert.equal(capped.truncated, true);
  assert.equal(capped.markdown.length, 100_000);
});

test("a page is cached by url, so a second question about it costs no second fetch", () => {
  const cachedSubject = { url: "https://a.example/p", bytes: 10, markdown: "body" } as Page;
  cachePage("https://a.example/p", cachedSubject);
  assert.equal(cachedPage("https://a.example/p"), cachedSubject);
  assert.equal(cachedPage("https://a.example/other"), undefined);
});

test("cache eviction is by total bytes held, oldest first", () => {
  cachePage("https://a.example/1", { url: "https://a.example/1", bytes: 40_000_000 } as Page);
  cachePage("https://a.example/2", { url: "https://a.example/2", bytes: 40_000_000 } as Page);
  assert.equal(cachedPage("https://a.example/1"), undefined);
  assert.ok(cachedPage("https://a.example/2"));
});

// The style attribute is the css-tree bomb.
test("a page with one shape per conversion rule converts without a word reaching the terminal", async () => {
  const converted = await heardWhile(() => renderMarkdown(page, "https://example.com/reviews/pixel"));
  assert.deepEqual(converted.heard, []);
  markdown = converted.value;
});

test("the title comes from <title>, entities decoded, and heads the page, tables and code kept", () => {
  assert.match(markdown, /^# Spec & Sheet\n/);
  assert.match(markdown, /\| Model \| Price \|/);
  assert.match(markdown, /```\nconst trap = "\]\(\/not-a-link\)";\n```/);
});

test("relative hrefs resolve against the page's <base>, absolute ones are left alone, opaque ones lose the href", () => {
  assert.match(markdown, /\[Tensor G6\]\(https:\/\/example\.com\/chips\/tensor\?v=6#specs\)/);
  assert.match(markdown, /\[the note\]\(https:\/\/example\.org\/absolute\)/);
  assert.match(markdown, /(?<!\]\()nothing/);
  assert.doesNotMatch(markdown, /javascript:/);
});

test("an image survives only as an alt that reads like a description, and no anchor is left empty", () => {
  assert.match(markdown, /\[image: Benchmark chart comparing both chips\]/);
  assert.doesNotMatch(markdown, /base64|pixel\.png|image: 9|\[image: \]/);
  assert.doesNotMatch(markdown, /\[\]\(/, "an anchor emptied by its image printed as [](url)");
});

test("chrome goes by tag and by landmark role, since a page built out of divs only says nav with a role", () => {
  for (const gone of [
    "home",
    "Sign in",
    "Phones",
    "Sponsored",
    "cookie banner",
    "screen reader trap",
    "Terms",
    "should not survive",
    "Buy",
    "Email",
  ]) {
    assert.doesNotMatch(markdown, new RegExp(gone), `chrome survived: ${gone}`);
  }
  assert.doesNotMatch(markdown, /\n{3,}/);
});

// A dedup pass and a link-list pass each lost real pages.
test("repeated paragraphs and link lists are kept, since both are content", () => {
  assert.equal(markdown.match(/asyncio\.run/g)?.length, 5);
  for (const n of [1, 2, 3]) assert.match(markdown, new RegExp(`\\[Post ${n}\\]\\(https://example\\.com/post-${n}\\)`));
});

test("a page whose text is all chrome or nothing has nothing to summarize, and that is an error", async () => {
  await assert.rejects(
    renderMarkdown('<html><body><nav><a href="/">home</a></nav></body></html>', "https://example.com/empty"),
    /No readable text/,
  );
  await assert.rejects(renderMarkdown("<html><body></body></html>", "https://example.com/empty"), /No readable text/);
});

test("a library reaching past the console for the stream itself is held the same way", async () => {
  const direct = await heardWhile(() =>
    withoutTerminalOutput(() => {
      console.warn("grumble");
      process.stdout.write("grumble");
      return "extracted";
    }),
  );
  assert.deepEqual(direct.heard, []);
  assert.equal(direct.value, "extracted");
});

test("the process is held for the extraction only, and given back even when it throws", () => {
  assert.throws(
    () =>
      withoutTerminalOutput(() => {
        throw new Error("extraction failed");
      }),
    /extraction failed/,
  );
  assert.equal(console.warn, realConsole.warn);
  assert.equal(process.stdout.write, realStdout);
});

test("a fragment with no title and no article still converts, and gains no heading it did not have", async () => {
  assert.equal(await renderMarkdown("<html><body><p>Just one line.</p></body></html>", "https://example.com/bare"), "Just one line.");
});
