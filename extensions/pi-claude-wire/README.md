# pi-claude-wire

Makes extension tools pass Anthropic's OAuth tool-name fingerprinting by aliasing them to `mcp__*` names on the wire, at request time only.

Anthropic OAuth (subscription `/login`, not API key) expects Claude Code's tool set: its core names (`read`, `bash`, `task`, ...) pass as-is, and anything else must look like an MCP tool, `mcp__<server>__<name>`. Flat names from pi extensions (`spawn_agent`, `handoff`) fail that check. This extension rewrites them to `mcp__<namespace>__<name>` in the outgoing payload, then reverses the rename on the assistant's tool calls before pi resolves them, so the original extension's `execute` runs untouched. Live schemas, descriptions and `cache_control` markers pass through as-is.

The namespace comes from the tool's source package dir: `pi-` prefix stripped, sanitized to `[a-z0-9_]`, wrapper dirs (`extensions`, `dist`, `src`, `build`) skipped. `spawn_agent` from `pi-codex-subagents` becomes `mcp__codex_subagents__spawn_agent`.

Per request it rewrites the `tools` array, a pinned `tool_choice`, and prior `tool_use` / `tool_reference` blocks in history, so mid-session activation leaves no mixed names. Core tools, genuine `mcp__` tools from other extensions, and native server tools (entries with a `type`, like `web_search`) are never touched. System prompt mentions of "pi itself" and "pi packages" are neutralized to "the cli" for the same fingerprinting reason.

Only fires for `provider === "anthropic"` when the model registry reports OAuth credentials. API-key Anthropic and every other provider get their payloads unmodified.

No config. No commands. Self-check: `npx tsx extensions/pi-claude-wire/test.ts`.
