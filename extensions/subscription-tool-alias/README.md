# subscription-tool-alias

Gets extension tools past Anthropic's subscription transport by renaming them to `mcp__<namespace>__<name>` in the outgoing request, and back before pi runs the call.

On a subscription credential Anthropic accepts its own client's tool names and MCP-shaped ones, and rejects flat names like `spawn_agent`. The namespace is the tool's package directory without its `pi-` prefix, so `spawn_agent` from `pi-codex-subagents` goes out as `mcp__codex_subagents__spawn_agent`, and pi's builtins land in `local`. API keys and other providers are left untouched.

The rename covers `tools`, a pinned `tool_choice`, `tool_use` and `tool_reference` blocks in history, and the `- <name>:` lines under `Available tools` in the system prompt. Prose, tool descriptions, existing `mcp__` tools and server tools are left alone. Streamed tool calls are renamed back as they arrive, so each row renders through its own tool's renderer.

Which names need an alias is read off each request: a name still spelled as pi registered it is one the transport did not canonicalize (`read` becomes `Read`). A copy of the transport's list would go stale and get requests rejected.

Six stock phrases naming pi in the system prompt become "the cli", as the transport's own system block calls itself. Each is long enough that a user's "Raspberry Pi" never matches.
