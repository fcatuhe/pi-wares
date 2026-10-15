# subscription-web-search

Two tools, `websearch` and `webfetch`, that run on the Anthropic subscription pi is logged in with. No API key, no search vendor, no MCP server.

`websearch` returns one `url title` line per result, no page text, and takes Claude Code's `allowed_domains` or `blocked_domains`, never both. `webfetch` fetches one URL, converts it to markdown and has a small model answer the prompt from it, so ask for the facts you need: the page itself never reaches the conversation. Both work whatever model the session runs.

Each call is a side request to `claude-haiku-5-5`, or the cheapest authenticated anthropic model by input cost when haiku is not on offer, and its tokens and cost are added to pi's totals. On the subscription, the system prompt opens with Claude Code's identity line, without which Haiku 5.5 and later answer a bare 429 `Error`, and thinking is off, as Claude Code sends both side calls. The search tool is forced, as there, so the model cannot answer without searching. A search costs about a cent, a large page a few cents, where the same page in a frontier model's context costs dollars. The native `web_search` server tool stays out of the main request on purpose: it adds about 2.8k input tokens to every request, and pi drops its result blocks, so the model searches again on later turns.

Fetching follows Claude Code 2.1.222's limits, so a page reads the same here as there:

- `http` upgraded to `https`, URLs up to 2000 characters, no embedded credentials, no single-label hostnames
- 10MB and 60s per response, at most 10 redirects, and a redirect to another host reported for the caller to fetch instead
- 1MB of HTML converted, 100k characters of markdown sent to the model
- a 15 minute, 50MB page cache keyed by URL, so a second question about a page costs no second fetch

Requests go out as `Claude-User (2.1.222; +https://support.anthropic.com/)`, and every hostname is first checked against `api.anthropic.com/api/web/domain_info`, so a publisher who opted out of Claude is refused here too. PDFs and other binaries are refused, JSON and plain text pass through unconverted. Pages that render in the browser come back as whatever the server sent, so use the `agent-browser` skill for those.

The conversion is Claude Code's, turndown on domino over the whole page, plus absolute links, chrome removal (nav, footer, landmark roles, hidden elements), images kept only as an alt of three words or more, the `<title>` as heading, and GFM tables. Every change is made on the DOM, never on the markdown, so a code sample containing `](/not-a-link)` survives. Article extraction (Readability) was removed because it lost index pages outright.

Interactive pi leaves stdout to its TUI, so any library printing during conversion would break the frame. `withoutTerminalOutput` silences `console` and both streams while the synchronous conversion runs. Call rows strip terminal sequences from their arguments, since pi sanitizes tool output but not the arguments a model wrote after reading a hostile page.

A transport failure names its cause (`ENOTFOUND`, a refused connection, an expired certificate) instead of undici's bare `fetch failed`, and is retried once after 250ms. Timeouts and aborts are never retried. The domain check times out at 10s, the model call at 120s. A model call refused with 429 or 529 is retried once, after the API's `retry-after` capped at 10s, else 500ms, and any other API error is reported with its own type, message and request id.

Only the model reads a result, so it carries what the model acts on and nothing else: no timing, no status, no counts. Claude Code's summary of the search results, its cite-your-sources reminder and its eight searches per call are left out for the same reason, since the model fetches what it needs and can search again. A page cut before reading opens with `[Page truncated before reading]`, and an answer that hits the 8192-token cap ends with a line saying so.

Neither name has an underscore: pi-ai canonicalizes `websearch` to the first-party `WebSearch`, which the subscription transport accepts as is, where `web_search` would go out aliased by [`subscription-tool-alias`](../subscription-tool-alias/).
