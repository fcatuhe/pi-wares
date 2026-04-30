# sidequests — spec

> **Status:** draft, ready for implementation.
> **Implementer:** any pi-coding-agent worker. Read this end-to-end before writing code.

## What it is

A pi-wares extension that lets a parent pi session (or its LLM) spawn **N parallel pi sessions** to investigate or implement different angles of a problem at the same time. Each spawned session is a real, persistent pi session: its own JSONL file under `~/.pi/agent/sessions/`, fully resumable later with `pi --session <name>`. The parent collects structured results and may show them to its LLM for synthesis in a single turn.

Think: side-quests in an RPG. Independent missions, dispatched from one location, each tracked separately, return to any one whenever you like.

## Why it exists (the niche)

Three nearby tools already exist; none cover this exact gap.

| Tool | What it does | Why it doesn't cover us |
|---|---|---|
| `subagent` extension (already in `~/.pi/agent/extensions/subagent/`) | Spawns isolated subagents with role-based system prompts; **uses `--no-session`** | Sessions are throwaway; you can't resume one a turn later |
| `pi-side-agents` package | Spawns interactive `pi` in tmux + git worktree; merges back via `LGTM` | Outputs are scraped from tmux pane (text), not structured JSONL events; tmux + worktree machinery is heavy |
| `@feniix/pi-conductor` package | Full control plane: tasks/runs/gates/artifacts/DAGs/leases | ~12,700 LOC; massive cognitive surface |

`sidequests` is the **smallest possible thing** that gives a parent agent: parallel, resumable, structured-JSON-output sessions.

## Surface

### Folder

```
pi-wares/extensions/sidequests/
├── index.ts          ← entry point (this file is required by pi convention)
├── SPEC.md           ← this file
└── README.md         ← user-facing docs (write last, mirror SPEC)
```

### Tool

Register one tool:

- **Name (LLM-callable):** `sidequest`  (singular — each call is "kick off some side-quests"; the array is the batch)
- **Description:** must clearly state that each task spawns a real persistent pi session that survives the call; emphasize parallelism and resumability.

### Schema (use `typebox` like the rest of pi)

```ts
{
  tasks: Array<{
    prompt: string,                // required — the task for this sidequest
    name?: string,                  // optional — session name for `pi --session <name>` later
                                    //   default: auto-generated `sidequest-<slug>-<timestamp>`
    model?: string,                 // optional — model override for this task only
    cwd?: string,                   // optional — working directory for the spawned process
  }>,
  concurrency?: number,             // default 4, max 8
}
```

No `chain` mode. No `single` shortcut. Always an array. N=1 is a valid degenerate case.

### Slash command (optional, v1.5)

`/sidequest <prompt>` — convenience for spawning a single quick sidequest from the editor. Implement only if trivial. Skippable for v1.

## Spawn mechanism

Use the `subagent` extension's process-spawn machinery as the reference. Read it first: `~/.pi/agent/extensions/subagent/index.ts`. Specifically the `runSingleAgent` function and the `mapWithConcurrencyLimit` worker pool.

**Differences from `subagent`:**

| Aspect | `subagent` | `sidequests` |
|---|---|---|
| Session flag | `--no-session` | **`--session <name>`** ← the whole point |
| Identity | Loads agent definition (`scout`, `worker`, ...) | No agent layer; raw prompt + optional model |
| System prompt | Uses agent's `--append-system-prompt` | None (default pi prompt) |
| Tools | Per-agent `--tools` allowlist | Default pi tools |
| Modes | single / parallel / chain | Just parallel (array always) |

### Concrete subprocess call

```bash
pi \
  --mode json \
  -p \
  --session "<resolved-name>" \
  [--model "<model>"] \
  "<prompt>"
```

- `--mode json` — emits one JSON event per line on stdout. Required for parsing.
- `-p` (`--print`) — non-interactive, run prompt and exit.
- `--session <name>` — pin the session file so it's findable later by name.
- `cwd` is set on `child_process.spawn`'s options.

### Session naming

If `task.name` provided: use `sidequest-<task.name>-<timestamp>` (or just `<task.name>` — pick one and document it).
Else: derive a kebab-case slug from the prompt's first ~30 chars + timestamp suffix.

Always include a timestamp suffix to avoid collisions on re-invocation. Example: `sidequest-auth-flow-20260430-181234`.

### Streaming + result parsing

Parse the JSONL stdout. Look for at least these event types (consult `pi-coding-agent/docs/json.md` for the full list):

- `message_end` with `message.role === "assistant"` → final assistant text + usage (input/output/cacheRead/cacheWrite/cost/totalTokens), `stopReason`, `model`
- `tool_result_end` → optional, for richer streaming UI
- `text_delta` / `tool_call` → optional, for live progress display

For each task, accumulate:
- `messages: Message[]` (collected from `message_end` and `tool_result_end`)
- `usage: { input, output, cacheRead, cacheWrite, cost, contextTokens, turns }`
- `stopReason`, `errorMessage`, `model`
- `exitCode` (from process close)
- `sessionId` / `sessionFile` — extract from the first `session_start` event (or whatever the json mode emits; verify in docs)

### Concurrency

Use the worker-pool pattern from `subagent`:

```ts
const limit = Math.max(1, Math.min(params.concurrency ?? 4, 8));
// N async workers pulling from a shared index counter
```

### Abort

Wire the tool's `signal: AbortSignal` to all child processes:
- `signal.addEventListener("abort", () => proc.kill("SIGTERM"))`
- `setTimeout(() => proc.kill("SIGKILL"), 5000)` if still alive
- Propagate "aborted" as the result `stopReason` for incomplete tasks

### Per-task streaming UI

Use `onUpdate` callback (provided by pi to `execute()`) to emit `AgentToolResult` partials as tasks progress:
- Initialize all task slots with `exitCode = -1` (running)
- On each per-task `message_end`, update that slot and re-emit the aggregate
- Aggregate text: `"sidequests: 2/3 done, 1 running..."`
- See subagent's `emitParallelUpdate` for the pattern

## Output shape

Tool returns an `AgentToolResult` with:

```ts
{
  content: [{ type: "text", text: <summary for parent LLM> }],
  details: {
    tasks: Array<{
      name: string,             // resolved session name
      sessionId: string,        // for pi --session <id>
      sessionFile: string,      // absolute path to JSONL
      prompt: string,           // echo of input
      model?: string,
      exitCode: number,         // 0 = success, -1 = still running (only in stream), >0 = failure
      stopReason?: string,
      errorMessage?: string,
      finalText: string,        // last assistant text
      usage: { input, output, cacheRead, cacheWrite, cost, contextTokens, turns },
      messages: Message[],      // full conversation, for richer rendering
    }>
  },
  isError: boolean              // true if all tasks failed; false if any succeeded
}
```

The `content[0].text` summary should be terse and parseable by the parent LLM. Format suggestion:

```
3/3 sidequests completed.

[auth] (sidequest-auth-20260430-181234) — <first 120 chars of finalText>...
[ratelimit] (sidequest-ratelimit-...) — <first 120 chars>...
[caching] (sidequest-caching-...) — <first 120 chars>...

Resume any with: pi --session <name>
```

## Rendering

Implement `renderCall` and `renderResult` mirroring `subagent`'s parallel mode:
- Collapsed: per-task icon + name + last few items, total usage line, "(Ctrl+O to expand)"
- Expanded: full container with each task as a section: tool calls list + final markdown output + per-task usage
- See `subagent/index.ts`'s `renderResult` for the exact pattern (Container, Spacer, Markdown, Text components from `@mariozechner/pi-tui`)

## Error handling

| Condition | Behavior |
|---|---|
| `exitCode != 0` | Mark task failed, capture stderr in `errorMessage` |
| `stopReason === "error"` | Propagate `errorMessage` from message |
| `stopReason === "aborted"` | Mark task aborted; throw if user-initiated, else continue with other tasks |
| All tasks failed | `isError: true`, summary lists failures |
| Some failed | `isError: false`, summary indicates partial success |
| `tasks.length > 8` | Reject with explanatory error |
| `tasks.length === 0` | Reject with explanatory error |

Never throw on a single task's failure if other tasks are still running. The whole point is parallel investigation — partial results are useful.

## Out of scope for v1 (deliberately)

- **Chain mode** with `{previous}` placeholder. May add later as `sidequest-chain` ware.
- **Resuming an existing sidequest** by passing a session name and a follow-up prompt. May add as a sibling `continue_sidequest` tool later.
- **Best-of-N voting / structured merging.** The parent LLM does that itself by reading `details.tasks[*].finalText`.
- **Worktree isolation.** That's `pi-side-agents`' job. We share cwd by default.
- **Gates / approvals / artifacts.** That's `pi-conductor`'s job.
- **Cleanup of session files.** Sessions persist forever (or until user prunes). Document this. Consider a `prune-sidequests` companion ware later.

## Implementation references (read these first)

1. **`~/.pi/agent/extensions/subagent/index.ts`** — the closest existing extension. Copy its process-spawn, JSONL-parsing, worker-pool, and rendering patterns. Adapt to drop the agent layer and switch `--no-session` → `--session <name>`.

2. **`@mariozechner/pi-coding-agent/docs/json.md`** — exact JSONL event schema (`message_end`, `tool_result_end`, `text_delta`, etc.) and event field shapes.

3. **`@mariozechner/pi-coding-agent/docs/sessions.md`** and **`docs/session-format.md`** — session file format, naming, and how `--session <name>` resolves.

4. **`@mariozechner/pi-coding-agent/docs/sdk.md`** — `ExtensionAPI`, `AgentToolResult`, `pi.registerTool()` types.

5. **`pi-wares/extensions/model-shortcuts/index.ts`** — already in this repo; example of a working pi-wares extension for typing/imports/peer-dependency style.

## Acceptance checklist

Implementation is done when:

- [ ] `extensions/sidequests/index.ts` exists and registers tool `sidequest`.
- [ ] `pi -e ~/fcode/pi-wares` loads the extension without errors.
- [ ] Tool with `tasks: [{prompt: "say hello"}]` spawns one pi session, returns its result, and the session is resumable: `pi --session <returned-name>` continues it.
- [ ] Tool with 3 tasks runs all in parallel up to `concurrency` limit; aggregate usage and per-task streaming UI works.
- [ ] Aborting the parent (Ctrl+C) kills all live child processes.
- [ ] Error in one task does not abort other tasks.
- [ ] `details.tasks[*].sessionId` and `sessionFile` are populated and correct.
- [ ] `README.md` written, mirrors SPEC at user level (install via `pi install ~/fcode/pi-wares`, what the tool does, schema, examples, "resume with pi --session ..." note).
- [ ] Root `pi-wares/README.md` Wares table has a `sidequests` row added.
- [ ] No new dependencies added to `pi-wares/package.json` beyond what `subagent` uses (which is just node built-ins + `typebox` + the existing peer deps).

## Open questions for the implementer to verify before coding

- **Does `pi --session <name>` accept arbitrary names, or only UUIDs/partial UUIDs?** If only UUIDs, we'll need to capture the auto-assigned UUID from the spawned session's first event and store our human-friendly name elsewhere. Read `docs/sessions.md` and `docs/session-format.md` to confirm.
- **What event in `--mode json` exposes the session id/file path?** Probably a `session_start` or similar at the top of the stream. Confirm by running `pi --mode json -p "hi"` once and inspecting stdout.
- **Does `--session <name>` create the session if it doesn't exist?** Likely yes (it's how new sessions get named via CLI), but verify.

These three are the only real unknowns. Resolve them by reading docs + a 30-second smoke test before writing real code.
