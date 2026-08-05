# oauth-tool-alias

Renames extension tool names to `mcp__<namespace>__<name>` in the outgoing request, and renames them back before pi resolves the call, so each extension's own `execute` runs untouched. Schemas, `cache_control` markers and everything else about a tool are left alone.

One provider validates tool names on its subscription OAuth transport (`/login`, not an API key) against the tool set of its own first-party client. Names it knows pass as-is, anything else has to look like an MCP tool, so flat names from extensions (`spawn_agent`, `wait_agent`) are rejected.

Which names need an alias is derived per request instead of copied from the transport. The transport renames every tool it accepts as-is to its own casing (`read` -> `Read`) while building the payload, before this hook sees it, so a name still spelled exactly as pi registered it is one the transport left alone, and that is the one needing an alias. Mirroring the transport's list instead would put a private constant in two places, where a stale copy silently skips an alias and the request is rejected.

The namespace comes from the tool's source package dir, `pi-` prefix stripped, sanitized to `[a-z0-9_]`, wrapper dirs (`extensions`, `dist`, `src`, `build`) skipped. `spawn_agent` from `pi-codex-subagents` becomes `mcp__codex_subagents__spawn_agent`. Tools with no source dir, pi's builtins, land in the `local` namespace. Over the provider's 128-character name limit the namespace is truncated and the flat name kept whole, since the flat name is what routes the call back. Two tools whose names differ only in case keep separate aliases.

Mentions of pi by name in the system prompt are renamed to "the cli", matching what the transport's own first system block calls itself. Only phrases where a lowercase `pi` is unambiguously the product name (`pi itself`, `pi packages`, `pi docs`, `pi topics`, `pi .md files`) plus a line-anchored `Pi documentation` heading. A general word-boundary pass would also rename `Raspberry Pi` and `calculate pi` in project instructions, and a phrase quoting a whole upstream sentence breaks the day that sentence is reworded.

Per request it renames the `tools` array, a pinned `tool_choice`, and prior `tool_use` / `tool_reference` blocks in history, so activating mid-session leaves no mixed names. In the system prompt it also renames the `- <name>: <snippet>` line pi writes under `Available tools`, because that line tells the model which tools this payload carries, and it would otherwise declare a name the payload no longer has.

Never renamed: prose, including tool descriptions and any sentence mentioning a tool. The schema is what the model calls from, and a bare single-word tool name is an English word too, so rewriting mentions turned a guideline about the shell commands `ls` and `find` into one about `mcp__local__ls`. Also never renamed: names the transport already canonicalized, genuine `mcp__` tools from other extensions, native server tools (entries carrying a `type`, like `web_search`), and any name whose alias a real tool already advertises.

Streaming tool calls are renamed back on `message_update` by mutating the shared block in place: the TUI resolves a tool row's custom renderer from the streamed name when the row is created, before `message_end` fires, so without this the row renders generically under the `mcp__` name instead of through the tool's own `renderCall` / `renderResult`. Alias maps are cleared on `session_start`.

Only fires when the model's provider reports OAuth credentials. API-key credentials and every other provider get their payloads unmodified.

No config. No commands. Self-check: `npx tsx extensions/oauth-tool-alias/test.ts`.
