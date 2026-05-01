# sidequests — handover

You're the next agent. README is for users; this file is for you.

## Where things stand

`index.ts` (~900 LOC), single file, no new runtime deps. Schema is v4 (`{ session?, label?, prompt, args?, cwd? }` per entry). Decoration of `label` → `sq_<slug>_<DDmonYY>-<HHMM>-<tz>` happens inside the tool; the `--name` flag and its `session_start` hook stay generic. Validation rejects duplicate sessions in one call and `--session`/`--name` smuggled into `args`. The JSONL parse / spawn / render pipeline is inherited from subagent and largely unchanged across versions.

**Tested live**: new sessions, follow-ups, follow-up renames all work end-to-end. Decorated `pi -r` names land correctly in `session_info` entries.

## First task: sync the README to v4

`README.md` still documents the v1 schema (`prompt`, `name`, `model` per task; `sidequest` singular tool name; auto-generated `sidequest-<slug>-<ts>` names; `concurrency` knob). All wrong now. Don't ship anything else until this is aligned — users following the README will hit validation errors immediately.

## Open question: parallel sidequest *tool calls*

Right now "parallel" means "one `sidequests` call with N entries in `sessions[]`, awaited as a batch". The tool blocks until all N children complete.

Two related questions worth answering before adding features:

1. **Can the parent agent issue two `sidequests({...})` tool calls in the same assistant turn?** Depends on pi-ai's tool dispatcher (does it run tool calls within one assistant message in parallel or serially?). If parallel: each tool call has its own independent batch, no shared state — they don't merge in the result row. If serial: the second batch waits for the first.
2. **Should we support background / fire-and-forget mode?** I.e., the tool returns immediately with handles `[{label, sessionId, status: "running"}, ...]`, and a sibling tool `sidequests_status({ sessions: [<uuid>, <uuid>] })` polls. This decouples "spawn" from "wait" and lets the agent keep working while children grind. Significant change to the abstraction; only do this if there's a real workflow that needs it.

Investigate (1) first — if pi already runs tool calls in parallel, the agent can already get fan-out by emitting multiple `sidequests` calls, and (2) becomes unnecessary.

## Evolution priorities

### 1. Refactor for simplification

The file works but has accumulated. Concrete cuts (no behavior change):

- **Split `runSingleSidequest`.** It owns spawn lifecycle, JSONL parsing, abort wiring, and result mutation in one ~120-line closure. Extract: `parseJsonlEvent(line, result)` (pure, testable), `spawnAndStream(invocation, cwd, onLine, signal)` (process plumbing), `runSingleSidequest` becomes ~30 lines of orchestration.
- **Collapse render duplication.** `renderCall` parses `sessions` (or its stringified fallback) defensively; `execute` does too via `normalizeSessions`. Hoist a single `parseSessionsField(raw)` helper. Same for the result-row `kind` glyph (`✦` / `↻`) computation, which appears in three places.
- **`renderResult` collapsed vs expanded** share 80% of their per-task formatting. Extract a `formatTaskBlock(r, theme, { expanded })` and have both paths call it.
- **`getDisplayItems` / `getFinalText` / `formatToolCall`** are copy-pasted from subagent. If subagent ever moves into `@mariozechner/pi-coding-agent` or a shared util, switch to that. Until then: leave them, but add a comment pointing at subagent so the next maintainer knows they're synced.

After this, target ~600 LOC. Don't sacrifice readability for line count.

### 2. Display improvements

The current renderer is functional but uninspiring. The user explicitly flagged this. Concrete weaknesses and suggestions:

- **Live progress is one line** ("3/4 done, 1 running"). With 8 parallel children doing different work, you want a per-child line during execution showing the child's last tool call or message preview. `onUpdate` already fires on every JSONL event we keep — just plumb it into a multi-line live render. The `Container` TUI primitive supports this.
- **Truncated previews lose context.** 120-char `SUMMARY_PREVIEW_CHARS` is fine for the LLM-facing summary; the TUI renderer can show much more. Currently both go through the same render. Split: terse for `content[0].text` (LLM), generous for `details` (TUI).
- **Tool-call list per child is a flat dump.** No grouping, no collapse, no per-child expansion. `Ctrl+O` toggles all-or-nothing. Per-child expand would be nicer; needs interactive TUI state, harder than it sounds within `renderResult`.
- **No syntax highlighting on prompt previews** even when they're code. `getMarkdownTheme()` is already imported but only used for `finalText`. Apply it to prompt fields too.
- **Failed sidequests show stderr verbatim**. Often noisy. Filter pi's startup chatter (the `Loading extensions…` lines etc.) before display.
- **Cost / token totals are dumped at the bottom**. Could be a per-child mini-bar showing relative spend, useful when one sidequest blew the budget.

Don't over-design. One good iteration of the live-progress multi-line render is worth more than five small polish passes.

### 3. User-side resume slash command

A user-facing `/sq <label-or-uuid>` command that looks up by label (matching the agent's `label`, not the decorated `sq_*_*` form) or UUID prefix and calls `ctx.switchSession(path)`. Three reasons this is cheap and worth doing:

- `ctx.switchSession` is on `ExtensionCommandContext` (only available in command handlers). Slash commands can use it natively — no re-exec hackery, none of the v1 `--session-name` pain.
- The user sees `[my-label]` in the sidequests result row but resuming requires copying the UUID. A slash command closes that ergonomic gap.
- It's ~30 LOC. Pattern to copy: `~/.pi/agent/extensions/subagent/index.ts`'s commands.

Match policy: exact label match wins; substring match falls back; ambiguity → show a picker via `ctx.ui.select`. UUID prefix is a separate code path.

### 4. Known correctness bugs (carried over from review)

These were found in the v3 review by the parallel Opus 4.7 + GPT 5.5 sidequests. They survived into v4 because they're in the JSONL/spawn pipeline, which v4 didn't touch.

| | Severity | Where | Fix |
|---|---|---|---|
| `proc.killed` semantics — SIGKILL escalation never fires | P0 | abort handler in `runSingleSidequest` | Track a local `closed` boolean from the `close` handler; gate SIGKILL on `!closed`, not `!proc.killed`. |
| `processLine` JSONL dispatch has no try/catch around field access | P0 | `processLine` inside spawn closure | Wrap each per-event-type block in try/catch; log to stderr on failure; don't crash the data handler. |
| Signal-killed children reported as `exitCode: 0` | P0 | `proc.on("close", code => resolve(code ?? 0))` | `close` receives `(code, signal)`; treat non-null `signal` as failure with `stopReason: signal`. |
| UTF-8 stream split mid-codepoint | P1 | `proc.stdout.on("data", ...)` | Use `new StringDecoder("utf8")` per child. |
| Worker pool keeps spawning post-abort | P1 | `mapWithConcurrencyLimit` workers | Check `signal.aborted` at dequeue time; return aborted result without spawning. |
| AbortSignal listener leak | P1 | abort handler | Remove the listener on normal completion. |

The same bugs exist in `subagent`. Worth fixing in both at once.

### 5. Per-task abort

Today, `signal` aborts the entire batch. The agent has no way to say "this one is hanging, kill just it". Would need either:
- Distinct AbortControllers per task, exposed via the result UI for user-driven kill, or
- An `args: ["--max-runtime", "60s"]` convention if pi grows runtime caps.

Low priority but worth noting.

## Immutable design constraints (don't undo)

These were arrived at through several iterations. If you find yourself wanting to "improve" any of these, re-read the conversation in this branch's history first — there's reasoning behind each.

- **No DSL transformation on `prompt`.** It's a literal user message, passed verbatim as the trailing positional. Don't slug it, prefix it, wrap it.
- **No `--session-name` flag.** v1 had it; killed for fragility (factory-time argv scanning, re-exec). UUIDs are the machine handle; `pi -r` is the human handle.
- **No name-based resume from the tool layer.** Same reasoning. UUIDs are returned in result rows; that's the resumption affordance.
- **No re-exec.** Anywhere. The factory should never spawn a child pi to replace itself.
- **No mutation of pi-mono.** Everything lives in this extension. The `--name` flag and its 3-line `session_start` hook are the only cross-cutting touches.
- **No non-pi commands.** The value-add (session UUIDs, JSONL parsing, follow-up affordance) is pi-specific. For arbitrary parallel commands the agent uses `bash` with `&` + `wait`. If a second agent CLI emerges with comparable JSONL semantics, add a discriminated `kind` field — but that's the only justifiable expansion.
- **Decoration only on new sessions.** `label` is passed verbatim on follow-up renames because the agent's intent is specific. Auto-mangling would corrupt it.
- **`--name` flag stays generic.** Decoration logic lives in `derivePiName(task)` inside sidequests, not in the flag's hook. The flag is reusable for any `pi -p` invocation; the tool owns the spawn-many-siblings disambiguation problem.

## Things to consult

- `pi-coding-agent/docs/json.md` — JSONL event schema. If pi ever changes `tool_result_end` → `tool_execution_end` (or similar), our parser will silently miss tool results.
- `pi-coding-agent/docs/extensions.md` — `ExtensionAPI`, `session_start`, `setSessionName`. Note that `ctx.switchSession` is on `ExtensionCommandContext` (commands only), not on the base context (events).
- `pi-coding-agent/docs/sessions.md` + `session-format.md` — how sessions are stored, how `session_info` entries layer.
- `~/.pi/agent/extensions/subagent/index.ts` — sibling extension. JSONL parse / worker-pool / render patterns originated there. Worth diffing if you suspect drift.

## Version history (in case you wonder why)

- **v1** (gone): `sidequest` (singular), `tasks: [{ prompt, name?, model?, cwd? }]`, auto-generated `sidequest-<slug>-<ts>` names, `--session-name` flag with factory-time re-exec. Killed for argv-scanning fragility.
- **v2** (gone): "no DSL" reframe — `tasks: [{ name, args, cwd? }]` where `args` was literal pi argv. Forced the agent to construct `["-p", "<prompt>"]` every call. Verbose for the common case.
- **v3** (gone): `sidequests` (plural), `sessions: [{ name?, session?, prompt, args?, cwd? }]`. Promoted `prompt` and `session` to first-class. Right shape, wrong field name.
- **v4** (current): renamed `name` → `label`, fields reordered to `{ session, label, prompt, args, cwd }`. Decoration logic moved into sidequests (`sq_<slug>_<stamp>`); `--name` flag stays generic verbatim.
