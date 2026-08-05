# oauth-tool-alias

Renames extension tool names to `mcp__<namespace>__<name>` in the outgoing request, and renames them back before pi resolves the call, so each extension's own `execute` runs untouched. Schemas, `cache_control` markers and everything else about a tool are left alone.

One provider validates tool names on its subscription OAuth transport (`/login`, not an API key) against the tool set of its own first-party client. Names it knows pass as-is, anything else has to look like an MCP tool, so flat names from extensions (`spawn_agent`, `wait_agent`) are rejected.

Which names need an alias is derived per request instead of copied from the transport. The transport renames every tool it accepts as-is to its own casing (`read` -> `Read`) while building the payload, before this hook sees it, so a name still spelled exactly as pi registered it is one the transport left alone, and that is the one needing an alias. Mirroring the transport's list instead would put a private constant in two places, where a stale copy silently skips an alias and the request is rejected.

The namespace comes from the tool's source package dir, `pi-` prefix stripped, sanitized to `[a-z0-9_]`, wrapper dirs (`extensions`, `dist`, `src`, `build`) skipped. `spawn_agent` from `pi-codex-subagents` becomes `mcp__codex_subagents__spawn_agent`. Tools with no source dir, pi's builtins, land in the `local` namespace.

Per request it renames the `tools` array, a pinned `tool_choice`, and prior `tool_use` / `tool_reference` blocks in history, so activating mid-session leaves no mixed names. Tool names mentioned in descriptions and in the system prompt are rewritten to match the wire, but only where the mention is unambiguous: backticked (`` `wait_agent` ``) whatever the name, bare only for identifier-shaped names containing `_`. A bare single-word name is an English word too, and rewriting those corrupted the prose around them.

Never renamed: names the transport already canonicalized, genuine `mcp__` tools from other extensions, native server tools (entries carrying a `type`, like `web_search`), and any name whose alias a real tool already advertises.

Streaming tool calls are renamed back on `message_update` by mutating the shared block in place: the TUI resolves a tool row's custom renderer from the streamed name when the row is created, before `message_end` fires, so without this the row renders generically under the `mcp__` name instead of through the tool's own `renderCall` / `renderResult`. Alias maps are cleared on `session_start`.

Only fires when the model's provider reports OAuth credentials. API-key credentials and every other provider get their payloads unmodified.

No config. No commands. Self-check: `npx tsx extensions/oauth-tool-alias/test.ts`.
