# oauth-tool-alias

Renames extension tool names to `mcp__<namespace>__<name>` in the outgoing request, and renames them back before the harness resolves the call, so each extension's own `execute` runs untouched.

One provider validates tool names on its subscription OAuth transport (`/login`, not an API key) against the tool set of its own first-party client: those names pass as-is, anything else has to look like an MCP tool. Flat names from extensions (`spawn_agent`, `handoff`) fail that check. Only the name on the wire changes, live schemas, descriptions and `cache_control` markers pass through as-is.

The namespace comes from the tool's source package dir, `pi-` prefix stripped, sanitized to `[a-z0-9_]`, wrapper dirs (`extensions`, `dist`, `src`, `build`) skipped. `spawn_agent` from `pi-codex-subagents` becomes `mcp__codex_subagents__spawn_agent`. Tools with no source dir, the harness builtins, land in the `local` namespace.

Per request it rewrites:

- the `tools` array, a pinned `tool_choice`, and prior `tool_use` / `tool_reference` blocks in history, so activating mid-session leaves no mixed names;
- name references in tool descriptions and the system prompt, so the model is never told to call a name that is not on the wire. Backticked mentions are rewritten whatever the name; bare mentions only for identifier-shaped names (containing `_`), because a bare single-word tool name is also an English word and rewriting it corrupts the prose around it;
- mentions of the harness by name, neutralized to "the harness", for the same fingerprinting reason.

Never touched: names on the provider's allowlist, genuine `mcp__` tools from other extensions, and native server tools (entries carrying a `type`, like `web_search`). The allowlist is the provider's, not the harness's, so harness builtins outside it (`ls`, `find`) are aliased like any other tool.

Streaming tool calls are renamed back on `message_update` by mutating the shared block in place: the TUI resolves a tool row's custom renderer from the streamed name when the row is created, before `message_end` fires, so without this the row renders generically under the `mcp__` name instead of through the tool's own `renderCall` / `renderResult`. Alias maps are cleared on `session_start`.

Only fires when the model's provider reports OAuth credentials. API-key credentials and every other provider get their payloads unmodified.

No config. No commands. Self-check: `npx tsx extensions/oauth-tool-alias/test.ts`.
