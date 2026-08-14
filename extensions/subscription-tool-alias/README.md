# subscription-tool-alias

Renames extension tool names to `mcp__<namespace>__<name>` in the outgoing request, and renames them back before pi resolves the call, so each extension's own `execute` runs untouched. Schemas, `cache_control` markers and everything else about a tool are left alone.

One provider validates tool names on its subscription OAuth transport (`/login`, not an API key) against the tool set of its own first-party client. Names it knows pass as-is, anything else has to look like an MCP tool, so flat names from extensions (`spawn_agent`, `wait_agent`) are rejected.

Which names need an alias is derived per request instead of copied from the transport. The transport renames every tool it accepts as-is to its own casing (`read` -> `Read`) while building the payload, before this hook sees it, so a name still spelled exactly as pi registered it is one the transport left alone, and that is the one needing an alias. Mirroring the transport's list instead would put a private constant in two places, where a stale copy silently skips an alias and the request is rejected.

The namespace comes from the tool's source package dir, `pi-` prefix stripped, sanitized to `[a-z0-9_]`, wrapper dirs (`extensions`, `dist`, `src`, `build`) skipped. `spawn_agent` from `pi-codex-subagents` becomes `mcp__codex_subagents__spawn_agent`. Tools with no source dir, pi's builtins, land in the `local` namespace. Over the provider's 128-character name limit the namespace is truncated and the flat name kept whole, since the flat name is what routes the call back. Two tools whose names differ only in case keep separate aliases.

Mentions of pi by name in the system prompt are renamed to "the cli", matching what the transport's own first system block calls itself. The opening identity line drops the name instead (`operating inside pi, a coding agent harness`), since "the cli" reads badly right under the transport's own "Anthropic's official CLI for Claude". Six phrases in all, each carrying enough of the stock sentence around `pi` to belong to that prompt and nothing else: a bare `pi docs` or a line-anchored `Pi documentation` also matches what a user writes about a Raspberry Pi in project instructions, and a word-boundary pass mangles `calculate pi` on top. The cost is that upstream rewording stops matching, which changes nothing except that the prompt keeps its own wording.

Per request it renames the `tools` array, a pinned `tool_choice`, and prior `tool_use` / `tool_reference` blocks in history, so activating mid-session leaves no mixed names. In the system prompt it also renames the `- <name>: <snippet>` line pi writes under `Available tools`, because that line tells the model which tools this payload carries, and it would otherwise declare a name the payload no longer has.

Never renamed: prose, including tool descriptions and any sentence mentioning a tool. Names the transport already canonicalized, genuine `mcp__` tools from other extensions, native server tools (entries carrying a `type`, like `web_search`), and any name whose alias a real tool already advertises.

Streaming tool calls are renamed back on `message_update` by mutating the shared block in place: the TUI resolves a tool row's custom renderer from the streamed name when the row is created, before `message_end` fires, so without this the row renders generically under the `mcp__` name instead of through the tool's own `renderCall` / `renderResult`. Alias maps are cleared on `session_start`.

Only fires when the anthropic provider is on a subscription credential, composed the way pi's own `ModelRuntime.isUsingSubscription` composes it: OAuth, and the provider's OAuth config declaring `isSubscription`. pi exposes that on the runtime, not on the registry extensions get. For anthropic the two are the same set today, since its OAuth is always a subscription, and the guard names the transport the first-party tool list belongs to rather than the credential shape. API keys, and every other provider, get their payloads unmodified.

No config. No commands. Self-check: `npx tsx extensions/subscription-tool-alias/test.ts`.
