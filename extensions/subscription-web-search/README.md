# subscription-web-search

Two tools, `websearch` and `webfetch`, backed by the Anthropic subscription token pi already holds (`/login`, `~/.pi/agent/auth.json`). No API key, no search vendor, no MCP server.

`websearch` returns titles and URLs, no page text. `webfetch` retrieves one URL, converts it to markdown and answers a question about it. Together they are one loop: search, pick a result, read it.

## Why a side call instead of the native server tool

The provider's `web_search_20250305` is a server-side tool: put it in the main request and the provider runs the search inside the assistant turn. That was the first design and it is worse in four ways. Carrying the tool costs about 2.8k input tokens on **every** request whether or not anything is searched, and each search bills its results as roughly 10k more into the main context. pi's response parser has no branch for `server_tool_use` or `web_search_tool_result`, so those blocks are dropped, and `convertMessages` never sends them back, which means the model silently searches again when a later turn questions an earlier answer. `pause_turn` maps to `stop`, ending the turn.

The provider's own client does not do that either. Its `WebSearch` is an ordinary client tool whose results come back carrying `srvtoolu_` ids, so it makes its own side call and pastes the results into a normal `tool_result`. This extension does the same. The tool schema costs a few hundred tokens, the 10k of search results is absorbed by a cheap side call, and what reaches the conversation is a link list the session stores and replays like any other tool result.

## Cost

Measured on `claude-haiku-4-5`, which is why it is the preferred worker: a search is around $0.010, dominated by the search results the worker has to read back. A page fetch is $0.001 for a small page and about $0.056 for a 286KB one, measured when Readability still trimmed the page, so read those as roughly a quarter less than a fetch costs now. That last number is the point of the design, not a flaw: the same page in an Opus context costs more than a dollar.

When neither preferred worker is on offer, the cheapest anthropic model wins by `cost.input`, never merely the first one, because a large page summarized on Opus costs dollars. The candidate list is pi's own `getAvailable()`, which is every catalogued model of a provider that has credentials, so being in it is the auth check.

## Behaviour worth knowing

Search needs no model of its own opinion, but a server tool only runs inside a model turn, so the query is wrapped in the shortest prompt that triggers exactly one search. The token budget for that turn has to outlast the tool arguments: cut it too fine and the turn stops mid-call with a `server_tool_use` block and no results, which is reported as "cut off before it ran" rather than a refusal. Queries are capped at 400 characters so the budget is provably enough.

`webfetch` summarizes rather than returning the page. That is what keeps a 400KB page out of context, and it means the tool answers questions instead of dumping content: ask for the facts you need. Pages that render their content in the browser return whatever the server sent, usually "Loading...", so use the `agent-browser` skill for those. PDFs and other binaries are refused by content type. JSON and plain text pass through unconverted.

Requests go out as `Claude-User (2.1.222; +https://support.anthropic.com/)`, the agent a site sees when a Claude model reads a page to answer someone's question, which is what this is: your Anthropic subscription, Anthropic's model, one page at a time. Claiming that name means keeping its policy, so every hostname is cleared against `api.anthropic.com/api/web/domain_info` first and a publisher who has opted out is refused here exactly as it would be in Claude Code. Redirects may not change publisher either: a hop to another host is reported so the caller fetches it knowingly, since that site has its own policy.

Limits, URL rules and caching are Claude Code 2.1.222's own, read out of its binary so a page reads the same here as there: 10MB response, 60s, at most 10 redirects, URLs up to 2000 characters with `http` upgraded to `https` and neither embedded credentials nor single-label hostnames accepted, 1MB of HTML into the converter, 100k characters of markdown to the model, and a 15 minute page cache capped at 50MB. Caching is by URL and not by prompt, so a second question about one page costs no second fetch. Ours additionally reads through the stream rather than buffering before the size check, and refuses non-text content types where Claude Code writes them to a file. The publisher check times out at 10s and the model call at 120s, each on a deadline of its own composed with the turn's signal, so a stalled endpoint cannot hold the tool open until the user aborts.

A failure names what a reader can act on. undici reports a DNS blip, a refused connection and an expired certificate identically, as `TypeError: fetch failed` with the reason buried on `error.cause`, so the chain is walked down to the bottom error and its `code`, and a deadline of ours, which arrives as a bare `TimeoutError` naming neither host nor limit, is reported as the seconds it waited. Both calls out are GETs, so a transport failure is retried once after 250ms: the first fetch of a page has come back `ENOTFOUND` here while the same URL answered in 1.3s moments later. A deadline or an abort is never retried, since a second wait doubles the first. An abort is the user cancelling the turn, and pi renders it as such, so only transport failures are rewritten.

## The conversion

Claude Code's own engine, read out of the same binary: turndown on domino, the whole page, no article extraction. Its `convertHtmlToMarkdown` is `turndown(html.slice(0, 1MB))` with default options, `remove(["style","script","noscript","iframe"])`, and raw HTML handed to the model if turndown throws. Readability and jsdom used to sit in front of that here, and the measurements that retired them, on a 24 page corpus of live sites: extraction cost 2028ms against 246ms, lost the content of index pages outright (github.blog, 1398 characters of a 35388 character listing), and saved 1.5x on tokens overall rather than the 5x one article had suggested.

Six additions to that engine, each earning its lines on the same corpus:

1. **Absolute links.** `domino.createWindow(html, url)` gives the document an address, so `element.href` resolves, honouring the page's own `<base href>`. Turndown reads the attribute rather than the property, so each one is written back before conversion. Claude Code ships `[Back](/)` to the model; this tool's whole loop is "read a result with webfetch", and a relative link is a dead end. Zero left on the corpus, against hundreds.
2. **Chrome removal**, one selector list: the structural tags plus the landmark roles, `[hidden]` and `[aria-hidden="true"]`, because a page built out of divs only says nav with a role. Worth 120k characters of the corpus.
3. **Images become an alt or nothing.** A `src` is unreadable to a text model and base64 costs thousands of tokens, so an image survives only as `[image: ...]` when its alt is three words or more, which drops `alt="9"` and keeps the description of a chart. Turndown's `remove(["img"])` is silently a no-op, its own image rule matching first, so the drop happens in the document and the survivors get a rule.
4. **Anchors emptied by their image are removed**, since turndown counts an anchor as meaningful when blank and would print `[](url)`.
5. **The `<title>` heads the page**, entity-decoded, unless the body already opens with it. Claude Code sends no title at all.
6. **GFM, atx headings, fenced code.** Claude Code uses turndown's defaults, so its tables flatten into running text.

Everything happens in the DOM rather than on the markdown, which is not a style preference: a page whose code sample contains `](/not-a-link)` is rewritten by a regex over markdown and untouched by a pass over the document. The test carries that page.

The result is 1.24x Readability's tokens for 806ms against 2028ms, on a corpus where the pages Readability was best at, nav-heavy marketing and reference sites, are the ones that stay bigger: github.blog 6.1x, sqlite.org 3.9x, apple.com 2.7x, caniuse 2.2x, en.wikipedia 1.6x for its infobox and references. Documentation, the reason the tool exists, is 1.0-1.2x.

Two passes were prototyped and rejected, both for the same reason, that they cannot tell chrome from content: dropping repeated lines cost `docs.python.org` half its `asyncio.run` occurrences, and dropping link-dense lines cost ziglang.org/news three quarters of its page and bbc.com/news half of its headlines. Both are in the test as fixtures that must survive.

## Keeping the page off the terminal

A fetched page is untrusted input parsed by a library, on the terminal pi's TUI is drawing, one row above the prompt box the user is typing in. Interactive mode leaves `process.stdout` alone (`takeOverStdout` runs only for the non-interactive modes), so whatever that library prints lands on that surface and mangles the frame.

The rule is: **during conversion the process writes nothing**. `withoutTerminalOutput` holds the six `console` methods and both stream `write` functions for the block that runs `createWindow` through `turndown`. That block is synchronous, so no other task can be trying to write while it is held, and a library's grumble is worth less than the frame it breaks. It covers any dependency, not the one that was caught.

The one that was caught was css-tree, under the previous jsdom pipeline: it calls `console.warn` directly from `lexer/match.js:528` when a declaration exhausts its match limit, jsdom's `VirtualConsole` never sees that write, and one `style` attribute was enough, since Readability reads every element's style to skip hidden nodes. `transition: all 1s ease 1s,` repeated 300 times printed `[csstree-match] BREAK after 15000 iterations` mid-frame. domino parses no CSS at all, so that particular exit is gone with jsdom, and the test still carries the page: the guarantee is the rule, not the bug.

The call rows sanitize their own arguments through pi-tui's `stripTerminalSequences` plus a control-character pass. pi strips ANSI and control bytes from tool *output* before rendering it (`core/tools/render-utils.js`), but call arguments are printed as the model wrote them, and here the model has just read a page that may have asked it for a cursor-moving query.

Audited by capturing every write and asserting there were none: `console`, `process.stdout`, `process.stderr` and `process.on("warning")` across twenty hostile pages (inline style bombs, unclosed `style`, canvas, iframes, meta refresh, malformed nesting, entity and NUL soup, 2000-row tables, 500-deep divs, ANSI escapes in text), sixty fetches sharing one abort signal and twenty aborted in flight. One leak, the css-tree one. The tree was grepped for direct writes too, and what is left of it after jsdom, turndown and domino, has none outside its own test files.

What this does not cover: a library writing after the synchronous block, from a timer or a microtask. Nothing in the tree does, page scripts never run, and the only airtight version is conversion in a worker thread whose stdio is not piped to the parent. That would also keep it off pi's event loop, where it now blocks the TUI for about 35ms a page. Not worth its plumbing.

Both tools work under any active model, including non-anthropic ones, since the worker credential is resolved independently of `ctx.model`.

Neither name has an underscore, and that matters. pi-ai canonicalizes a tool whose name matches its first-party list case-insensitively, so `websearch` goes out as `WebSearch`. The subscription transport then takes it as one of its own, and the sibling `subscription-tool-alias` reads the same canonicalization as proof the transport accepted the name and leaves it unaliased. Naming them `web_search` and `web_fetch` matches nothing, and both go out as `mcp__subscription_web_search__*` instead. That still works, it is just a longer name for no gain.

Token use and cost of every side call are reported through the tool result, so they land in pi's totals instead of being spent invisibly. The token counts are read off the response, and the money is pi's own `calculateCost`, which also applies tiered rates and the double charge on 1h cache writes.

Rows read as pi's own do, `websearch <query>` and `webfetch <url>`, bold tool name then the argument in accent, the fetch prompt appearing in tool colour only once the row is expanded. Neither tool renders its result: pi's fallback previews the text the model gets and offers `ctrl+o`, so what a reader wants is written into the first line of that text rather than into a renderer only the terminal sees. That line never repeats the query or the url, which the call row above it already shows: a search opens with `8 results in 3.2s`, a fetch with `Received 479.3KB (200 OK) in 24.1s`. Both durations are the whole tool call, credential resolution and the summarizing model read included, because the question a reader has in front of a slow row is what they waited for, not what one leg of it took. The first version timed the request alone and reported 0.4s of a 24 second wait. The size is pi's `formatSize`. The duration matches its bash tool's `(ms / 1000).toFixed(1)` but is our own copy, that one being private to `core/tools/bash.js`.

Against the `exa-search` and `brave-search` skills, which cover the same ground: those are prose the model reads and then drives a CLI or MCP endpoint with, one keyless and one needing `BRAVE_API_KEY`. These are tools, so they cost a schema rather than a skill file in the prompt, they bill to the subscription already paid for, and their output is shaped here instead of by whatever the vendor returns.

No config. No commands. Self-check: `npx tsx extensions/subscription-web-search/test.ts`.
