# subscription-web-search

Two tools, `websearch` and `webfetch`, backed by the Anthropic subscription token pi already holds (`/login`, `~/.pi/agent/auth.json`). No API key, no search vendor, no MCP server.

`websearch` returns titles and URLs, no page text. `webfetch` retrieves one URL, converts it to markdown and answers a question about it. Together they are one loop: search, pick a result, read it.

## Why a side call instead of the native server tool

The provider's `web_search_20250305` is a server-side tool: put it in the main request and the provider runs the search inside the assistant turn. That was the first design and it is worse in four ways. Carrying the tool costs about 2.8k input tokens on **every** request whether or not anything is searched, and each search bills its results as roughly 10k more into the main context. pi's response parser has no branch for `server_tool_use` or `web_search_tool_result`, so those blocks are dropped, and `convertMessages` never sends them back, which means the model silently searches again when a later turn questions an earlier answer. `pause_turn` maps to `stop`, ending the turn.

The provider's own client does not do that either. Its `WebSearch` is an ordinary client tool whose results come back carrying `srvtoolu_` ids, so it makes its own side call and pastes the results into a normal `tool_result`. This extension does the same. The tool schema costs a few hundred tokens, the 10k of search results is absorbed by a cheap side call, and what reaches the conversation is a link list the session stores and replays like any other tool result.

## Cost

Measured on `claude-haiku-4-5`, which is why it is the preferred worker: a search is around $0.010, dominated by the search results the worker has to read back. A page fetch is $0.001 for a small page and about $0.056 for a 286KB one. That last number is the point of the design, not a flaw: the same page in an Opus context costs more than a dollar.

When neither preferred worker is on offer, the cheapest anthropic model wins by `cost.input`, never merely the first one, because a large page summarized on Opus costs dollars. The candidate list is pi's own `getAvailable()`, which is every catalogued model of a provider that has credentials, so being in it is the auth check.

## Behaviour worth knowing

Search needs no model of its own opinion, but a server tool only runs inside a model turn, so the query is wrapped in the shortest prompt that triggers exactly one search. The token budget for that turn has to outlast the tool arguments: cut it too fine and the turn stops mid-call with a `server_tool_use` block and no results, which is reported as "cut off before it ran" rather than a refusal. Queries are capped at 400 characters so the budget is provably enough.

`webfetch` summarizes rather than returning the page. That is what keeps a 400KB page out of context, and it means the tool answers questions instead of dumping content: ask for the facts you need. Pages that render their content in the browser return whatever the server sent, usually "Loading...", so use the `agent-browser` skill for those. PDFs and other binaries are refused by content type. JSON and plain text pass through unconverted.

Requests go out as `Claude-User (2.1.222; +https://support.anthropic.com/)`, the agent a site sees when a Claude model reads a page to answer someone's question, which is what this is: your Anthropic subscription, Anthropic's model, one page at a time. Claiming that name means keeping its policy, so every hostname is cleared against `api.anthropic.com/api/web/domain_info` first and a publisher who has opted out is refused here exactly as it would be in Claude Code. Redirects may not change publisher either: a hop to another host is reported so the caller fetches it knowingly, since that site has its own policy.

Limits, URL rules and caching are Claude Code 2.1.222's own, read out of its binary so a page reads the same here as there: 10MB response, 60s, at most 10 redirects, URLs up to 2000 characters with `http` upgraded to `https` and neither embedded credentials nor single-label hostnames accepted, 1MB of HTML into the converter, 100k characters of markdown to the model, and a 15 minute page cache capped at 50MB. Caching is by URL and not by prompt, so a second question about one page costs no second fetch. Ours additionally reads through the stream rather than buffering before the size check, and refuses non-text content types where Claude Code writes them to a file. The publisher check times out at 10s and the model call at 120s, each on a deadline of its own composed with the turn's signal, so a stalled endpoint cannot hold the tool open until the user aborts.

One deliberate divergence: Claude Code converts the whole page, removing only `style`, `script`, `noscript` and `iframe`, while this runs Readability first. Measured on the same page, 406KB of HTML, that is 9.4k characters of markdown against roughly five times more, all of it navigation and footer that the summarizing model would be paid to read. Readability failing on an unusual page is the risk taken in exchange, and the body is used whenever it returns nothing.

Stylesheets are dropped before the HTML reaches jsdom. Extraction never reads CSS and external sheets are never fetched, so parsing it only bought two kinds of console noise on the terminal the TUI is drawing on: css-tree grammar warnings, and jsdom's "Could not parse CSS stylesheet" for any page using nesting. Byte-identical markdown on every page tried.

Both tools work under any active model, including non-anthropic ones, since the worker credential is resolved independently of `ctx.model`.

Neither name has an underscore, and that is load-bearing. pi-ai canonicalizes a tool whose name matches its first-party list case-insensitively, so `websearch` goes out as `WebSearch`. The subscription transport then takes it as one of its own, and the sibling `subscription-tool-alias` reads the same canonicalization as proof the transport accepted the name and leaves it unaliased. Naming them `web_search` and `web_fetch` matches nothing, and both go out as `mcp__subscription_web_search__*` instead. That still works, it is just a longer name for no gain.

Token use and cost of every side call are reported through the tool result, so they land in pi's totals instead of being spent invisibly.

Rows read as pi's own do, `websearch <query>` and `webfetch <url>`, bold tool name then the argument in accent, the fetch prompt appearing in tool colour only once the row is expanded. Neither tool renders its result: pi's fallback previews the text the model gets and offers `ctrl+o`, so what a reader wants about a fetch, size and HTTP status, is written into the first line of that text rather than into a renderer only the terminal sees. The size is pi's `formatSize`, the same string its own truncation notices print.

Against the `exa-search` and `brave-search` skills, which cover the same ground: those are prose the model reads and then drives a CLI or MCP endpoint with, one keyless and one needing `BRAVE_API_KEY`. These are tools, so they cost a schema rather than a skill file in the prompt, they bill to the subscription already paid for, and their output is shaped here instead of by whatever the vendor returns.

No config. No commands. Self-check: `npx tsx extensions/subscription-web-search/test.ts`.
