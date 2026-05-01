# sidequests

Spawn N parallel **persistent, resumable** pi sessions from one. Each task becomes its own real pi session (its own JSONL under `~/.pi/agent/sessions/`), so you can return to any of them later with `pi --session <uuid-prefix>` or pick them from `pi -r`.

> Think: side-quests in an RPG. Independent missions, dispatched from one location, each tracked separately, return to any one whenever you like.

For the full design rationale and implementation tracker, see [`sidecar.md`](./sidecar.md).

## What it gives you

This ware registers three things on load:

| | What | Notes |
|---|---|---|
| Tool | `sidequest` | LLM-callable. Spawns each task as `pi --mode json -p --name <resolved> [...]`, parses JSONL output, returns a terse summary + per-task details. |
| Flag | `--name <string>` | Generic CLI flag — also useful in any `pi -p` script. Sets the session's display name (visible in `pi -r` / `/resume`). |
| Hook | `session_start` | If `--name` was passed, calls `pi.setSessionName()` so the **child** writes its own display-name entry. Deterministic; no parent-side races. |

## Install

```bash
pi install ~/fcode/pi-wares
```

(Or whichever path/git source holds this repo.) Once installed, the `sidequest` tool, `--name` flag, and naming hook auto-load in every pi session.

## Tool schema

```ts
sidequest({
  tasks: [
    { prompt: "investigate auth flow",     name: "auth"      },
    { prompt: "investigate ratelimit",     name: "ratelimit" },
    { prompt: "investigate caching",       name: "caching"   },
  ],
  concurrency: 4,   // optional, default 4, max 8
})
```

| Field | Required | Notes |
|---|---|---|
| `tasks[]` | yes | 1–8 tasks. Each spawns its own pi child. |
| `tasks[].prompt` | yes | The first user message sent to that child. |
| `tasks[].name` | no | Short label; becomes the session display name (`sidequest-<name>-<timestamp>`). Auto-derived from prompt if omitted. |
| `tasks[].model` | no | Model override for this task only (e.g. `anthropic/claude-sonnet-4-6`). |
| `tasks[].cwd` | no | Working directory for the spawned process. Defaults to the parent's cwd. |
| `concurrency` | no | Worker-pool size, 1–8 (default 4). Caps parallelism; remaining tasks queue. |

## Output

The tool returns:

- `content[0].text` — terse summary (≤ ~2 KB) for the parent LLM:

  ```
  3/3 sidequests completed.

  [sidequest-auth-…] (019dd…) [ok] — <first 120 chars of finalText>…
  [sidequest-ratelimit-…] (019dd…) [ok] — …
  [sidequest-caching-…] (019dd…) [ok] — …

  Resume any with: pi --session <uuid-prefix>   (or pick from `pi -r`)
  ```

- `details.results[*]` — full per-task data (renderer-only, never reaches the LLM):
  `name`, `prompt`, `model`, `cwd`, `sessionId` (UUID), `sessionFile` (absolute path), `exitCode`, `stopReason`, `errorMessage`, `stderr`, `messages[]` (full conversation), `usage` (tokens + cost).

The TUI renderer (`renderCall` / `renderResult`) shows per-task progress live ("2/3 done, 1 running…"), with a collapsed view of recent items + total usage and a Ctrl+O expanded view with each task's tool calls and final markdown.

## Resuming a sidequest

Each task's session is a normal pi session:

```bash
pi --session 019dd…           # by UUID prefix (8 chars is usually enough)
pi -r                         # interactive picker; sessions show under their `sidequest-<name>-<ts>` display name
```

Sessions persist forever (or until pruned via `pi -r` Ctrl+D), exactly like any other pi session.

## Examples

**Multi-angle investigation** (the canonical use case):

```ts
sidequest({
  tasks: [
    { prompt: "Read src/auth/* and summarize how token refresh works", name: "auth-refresh" },
    { prompt: "Read src/ratelimit/* and document the bucket algorithm", name: "ratelimit-algo" },
    { prompt: "Read src/cache/* and list every cache key produced",     name: "cache-keys"  },
  ],
})
```

The parent LLM gets three short summaries; you can dive into any of the three sessions afterwards for the full investigation transcript.

**Candidate implementations** with cheaper model per task:

```ts
sidequest({
  tasks: [
    { prompt: "Implement option A: WebSockets",      name: "opt-ws",   model: "anthropic/claude-sonnet-4-6" },
    { prompt: "Implement option B: SSE",             name: "opt-sse",  model: "anthropic/claude-sonnet-4-6" },
    { prompt: "Implement option C: long-poll",       name: "opt-poll", model: "anthropic/claude-sonnet-4-6" },
  ],
  concurrency: 3,
})
```

Each child writes to its own cwd checkout (use `cwd: "/path/to/worktree-A"` etc. if you want isolation). Parent compares the three `finalText`s and picks one.

## Standalone use of `--name`

Even outside the `sidequest` tool, the registered `--name` flag works for any `pi -p` invocation:

```bash
pi -p --name "release-notes-draft" "Draft release notes for v0.42"
```

The session shows up in `pi -r` under that label.

## Caveats

- **Recursion.** A child sidequest can call `sidequest` itself (the tool is auto-loaded everywhere pi-wares is). Useful for hierarchical investigation; could fork-bomb if the LLM gets enthusiastic. The 8-task hard cap and per-call concurrency cap keep this bounded.
- **Cost.** Each child is a real pi process making real LLM calls. 8 tasks × N turns = 8 × N LLM round-trips. Use `model:` overrides to put cheaper models on the parallel branches.
- **Session file growth.** Sessions persist forever. Prune via `pi -r` → Ctrl+D, or write a cleanup script.
- **Worktree isolation.** Not handled here. If parallel tasks could collide on the working tree (e.g., simultaneous edits), use the [`pi-side-agents`](https://github.com/badlogic/pi-side-agents) package instead — it adds tmux + git-worktree per task.

### Compatibility note: `pi-claude-code-use`

The [`pi-claude-code-use`](https://github.com/fcatuhe/pi-packages) extension (Anthropic OAuth via Claude Code) filters out non-Claude-Code tools when the active model is Anthropic + OAuth. To let `sidequest` through, register an MCP alias in its dedicated config file:

- Global: `~/.pi/agent/extensions/pi-claude-code-use.json`
- Project: `<repo>/.pi/extensions/pi-claude-code-use.json`

```json
{
  "toolAliases": [
    ["sidequest", "mcp__extension__sidequest"]
  ]
}
```

On the next session start, `pi-claude-code-use` re-registers the tool under the `mcp__extension__sidequest` name (alongside the original) so it survives the OAuth tool filter. Users on a direct Anthropic API key (or non-Anthropic providers) don't need this — the filter only runs under OAuth.

## Why this exists (vs. neighbors)

| Tool | Sidequests' niche relative to it |
|---|---|
| `subagent` extension | subagent uses `--no-session` (throwaway). Sidequests' children **persist** and are resumable. |
| `pi-side-agents` package | tmux + worktree machinery, scrapes text from panes. Sidequests parses structured JSONL and shares cwd by default — lighter weight. |
| `@feniix/pi-conductor` | Full DAG/gates/artifacts control plane (~12k LOC). Sidequests is the smallest possible thing: just parallel + resumable + structured output. |
