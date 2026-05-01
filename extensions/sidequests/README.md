# sidequests

Spawn N parallel **persistent, resumable** pi sessions from one — or follow up on existing ones. Each new session is a real pi session (its own JSONL under `~/.pi/agent/sessions/`), so you can return to any of them later with `pi --session <uuid-prefix>` or pick them from `pi -r`.

> Think: side-quests in an RPG. Independent missions, dispatched from one location, each tracked separately, return to any one whenever you like.

For the full design rationale and implementation tracker, see [`sidecar.md`](./sidecar.md).

## What it gives you

This ware registers three things on load:

| | What | Notes |
|---|---|---|
| Tool | `sidequests` | LLM-callable. Spawns each entry as either a new `pi --mode json -p --name <decorated> [...]` child or a `pi --mode json -p --session <uuid> [...]` follow-up turn. Parses JSONL output, returns a terse summary + per-entry details. |
| Flag | `--name <string>` | Generic CLI flag — also useful in any `pi -p` script. Sets the session's display name verbatim (visible in `pi -r` / `/resume`). No decoration, no slugging. |
| Hook | `session_start` | If `--name` was passed, calls `pi.setSessionName()` so the **child** writes its own display-name entry. Deterministic; no parent-side races. |

## Install

```bash
pi install ~/fcode/pi-wares
```

(Or whichever path/git source holds this repo.) Once installed, the `sidequests` tool, `--name` flag, and naming hook auto-load in every pi session.

## Tool schema

A single call takes a list of entries; each entry is either a **new session** or a **follow-up turn** on an existing one. Mix freely.

```ts
sidequests({
  sessions: [
    // new session — decorated to sq_auth_<DDmonYY>-<HHMM>-<tz> in pi -r
    { label: "auth",      prompt: "investigate auth flow" },
    { label: "ratelimit", prompt: "investigate ratelimit" },

    // follow-up turn on an existing session (UUID prefix from a prior call)
    { session: "019dd2af", prompt: "now write a summary" },

    // follow-up that also renames the session (label used verbatim, no decoration)
    { session: "019dd5b1", label: "auth-final-report", prompt: "produce the final report" },

    // model nickname resolved against your enabledModels scope
    { label: "spike",     prompt: "try option C", model: "sonnet" },

    // model with thinking level
    { label: "deep-dive", prompt: "think hard",   model: "opus:high" },

    // literal provider/id (bypasses scope lookup)
    { label: "raw",       prompt: "...",          model: "groq/qwen3-coder" },
  ],
})
```

| Field | Required | Notes |
|---|---|---|
| `sessions[]` | yes | 1–8 entries. Each spawns one pi child. |
| `sessions[].prompt` | yes | The user message sent to that child (literal — never slugged, prefixed, or wrapped). |
| `sessions[].label` | new: optional · follow-up rename: required for renaming | On a **new** session, becomes `sq_<slug>_<DDmonYY>-<HHMM>-<tz>` in `pi -r`. On a **follow-up**, is used **verbatim** as the new display name (no decoration). |
| `sessions[].session` | follow-up only | UUID (or 8+ char prefix) of an existing session. Presence of this field switches the entry from "new" to "follow-up". |
| `sessions[].model` | no | Model for the child session. Either a literal `provider/id` (e.g. `anthropic/claude-opus-4-7`) **or** a nickname matched case-insensitively as a substring against the user's `enabledModels` scope from `~/.pi/agent/settings.json` (e.g. `opus`, `sonnet`, `gpt`, `5.5`). Optional `:<thinkingLevel>` suffix sets thinking (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`). Ambiguous or missing matches are rejected at validation time. Omit to use pi's default. |
| `sessions[].args` | no | Extra pi flags appended verbatim, e.g. `["--skill", "brave-search"]`. **Rejected** if it contains `--session`, `--name`, `--model`, or `--thinking` — those are managed by dedicated fields. |
| `sessions[].cwd` | no | Working directory for the spawned process. Defaults to the parent's cwd. |

Validation also rejects duplicate `session` UUIDs in a single call (would produce racing writes to the same JSONL).

The whole batch is awaited together — `sidequests` returns when every entry has finished.

## Output

The tool returns:

- `content[0].text` — summary for the parent LLM. Each task's **full final assistant text** is included verbatim (no truncation — it's model-generated, so size is naturally bounded by the child). On failure, falls back to `errorMessage` or the last 500 chars of stderr.

  ```
  3/3 sidequests completed.

  --- [auth] ✦ (019dd2af) [ok] ---
  <full finalText from the auth child, verbatim>

  --- [ratelimit] ✦ (019dd5b1) [ok] ---
  <full finalText…>

  --- [019dd2af] ↻ (019dd2af) [ok] ---     ← follow-up
  <full finalText…>

  Follow up by passing `session: '<uuid-prefix>'` in a future sidequests call, or run `pi --session <uuid-prefix>` directly.
  ```

  `✦` marks new sessions, `↻` marks follow-up turns.

- `details.results[*]` — full per-entry data (renderer-only, never reaches the LLM):
  `kind` (`"new" | "followup"`), `label`, `displayName` (decorated form for new sessions), `prompt`, `args`, `cwd`, `sessionId` (UUID), `sessionFile` (absolute path), `exitCode`, `stopReason`, `errorMessage`, `stderr`, `messages[]` (full conversation), `usage` (tokens + cost).

The TUI renderer (`renderCall` / `renderResult`) shows per-entry progress live, with a collapsed view of recent items + total usage and a Ctrl+O expanded view with each entry's tool calls and final markdown.

## Resuming a sidequest

Each new entry's session is a normal pi session:

```bash
pi --session 019dd…           # by UUID prefix (8 chars is usually enough)
pi -r                         # interactive picker; new sessions show under sq_<label>_<stamp>
```

Sessions persist forever (or until pruned via `pi -r` Ctrl+D), exactly like any other pi session.

To programmatically continue work on one, feed its UUID back to `sidequests` as a follow-up entry — the child resumes from its existing JSONL.

## Examples

**Multi-angle investigation** (the canonical use case):

```ts
sidequests({
  sessions: [
    { label: "auth-refresh",   prompt: "Read src/auth/* and summarize how token refresh works" },
    { label: "ratelimit-algo", prompt: "Read src/ratelimit/* and document the bucket algorithm" },
    { label: "cache-keys",     prompt: "Read src/cache/* and list every cache key produced" },
  ],
})
```

The parent LLM gets three short summaries; you can dive into any of the three sessions afterwards for the full investigation transcript — or feed their UUIDs back as follow-ups for a second round.

**Candidate implementations** with a cheaper model per entry, isolated worktrees:

```ts
sidequests({
  sessions: [
    { label: "opt-ws",   prompt: "Implement option A: WebSockets", model: "sonnet", cwd: "/path/to/wt-A" },
    { label: "opt-sse",  prompt: "Implement option B: SSE",        model: "sonnet", cwd: "/path/to/wt-B" },
    { label: "opt-poll", prompt: "Implement option C: long-poll",  model: "sonnet", cwd: "/path/to/wt-C" },
  ],
})
```

Parent compares the three `finalText`s and picks one.

**Iterating on a single sidequest** (round 2):

```ts
sidequests({
  sessions: [
    { session: "019dd2af3c", prompt: "Now refactor the implementation you proposed to remove the global state." },
  ],
})
```

## Standalone use of `--name`

Even outside the `sidequests` tool, the registered `--name` flag works for any `pi -p` invocation:

```bash
pi -p --name "release-notes-draft" "Draft release notes for v0.42"
```

The session shows up in `pi -r` under that exact label (no decoration — that's only applied by the `sidequests` tool to disambiguate sibling spawns).

## Caveats

- **Recursion.** A child sidequest can call `sidequests` itself (the tool is auto-loaded everywhere pi-wares is). Useful for hierarchical investigation; could fork-bomb if the LLM gets enthusiastic. The 8-entry hard cap keeps this bounded per call.
- **Cost.** Each child is a real pi process making real LLM calls. Use the `model` field (e.g. `"haiku"`, `"gpt:low"`) to put cheaper models on parallel branches.
- **Session file growth.** Sessions persist forever. Prune via `pi -r` → Ctrl+D, or write a cleanup script.
- **Worktree isolation.** Not handled here. If parallel entries could collide on the working tree (e.g., simultaneous edits), pass distinct `cwd`s or use the [`pi-side-agents`](https://github.com/badlogic/pi-side-agents) package — it adds tmux + git-worktree per task.
- **Whole-batch await.** The call blocks until every entry finishes. There is currently no fire-and-forget / polling mode (see `sidecar.md` § "Open question").

### Compatibility note: `pi-claude-code-use`

The [`pi-claude-code-use`](https://github.com/fcatuhe/pi-packages) extension (Anthropic OAuth via Claude Code) filters out non-Claude-Code tools when the active model is Anthropic + OAuth. To let `sidequests` through, register an MCP alias in its dedicated config file:

- Global: `~/.pi/agent/extensions/pi-claude-code-use.json`
- Project: `<repo>/.pi/extensions/pi-claude-code-use.json`

```json
{
  "toolAliases": [
    ["sidequests", "mcp__extension__sidequests"]
  ]
}
```

On the next session start, `pi-claude-code-use` re-registers the tool under the `mcp__extension__sidequests` name (alongside the original) so it survives the OAuth tool filter. Users on a direct Anthropic API key (or non-Anthropic providers) don't need this — the filter only runs under OAuth.

## Why this exists (vs. neighbors)

| Tool | Sidequests' niche relative to it |
|---|---|
| `subagent` extension | subagent uses `--no-session` (throwaway). Sidequests' new entries **persist** and are resumable, and follow-up turns let you iterate on one across calls. |
| `pi-side-agents` package | tmux + worktree machinery, scrapes text from panes. Sidequests parses structured JSONL and shares cwd by default — lighter weight. |
| `@feniix/pi-conductor` | Full DAG/gates/artifacts control plane (~12k LOC). Sidequests is the smallest possible thing: parallel + resumable + follow-ups + structured output. |
