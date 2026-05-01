# sidequests — handover

You're the next agent. README is for users; this file is for you.

## Where things stand

`index.ts` (~1050 LOC), single file, no new runtime deps. Schema is v4 (`{ session?, label?, prompt, model?, args?, cwd? }` per entry). Decoration of `label` → `sq_<slug>_<DDmonYY>-<HHMM>-<tz>` happens inside the tool; the `--name` flag and its `session_start` hook stay generic. Validation rejects duplicate sessions in one call and `--session`/`--name`/`--model`/`--thinking` smuggled into `args` (each has its own dedicated field).

**Tested live**: new sessions, follow-ups, follow-up renames all work end-to-end. Decorated `pi -r` names land correctly in `session_info` entries.

### Recent changes (DHH-pass refactor, 3 waves)

Brought 1118 → 1050 LOC (-68) across three behavior-preserving waves, plus a micro-cleanup tail. Reviewed in parallel by Opus + GPT after; no regressions found, time-skew bug confirmed closed.

- **Wave 1 (deletions).** Pruned helpers carried over from a sibling extension (the prior "stay synced" constraint is **revoked** — sidequests evolves on its own merits now). Deleted `findSessionFile` + `encodeCwdForSessions` (only the cross-cwd lookup remains, since follow-up JSONL can live under any cwd-encoded directory). Deleted `THINKING_LEVEL_SET` and `SidequestDetails` interface (one-call indirections). Removed dead fields `piName` and `resumedSession` from `SidequestResult` (written, never read). Removed unused `AgentToolResult` import. Hoisted `FORBIDDEN_IN_ARGS` to module scope. Folded `shortenPath` into `formatToolCall` (its only caller). Trimmed stale top-of-file and `buildChildArgs` comments that still referenced `name` / `--model`-in-args.

- **Wave 2 (extractions).** Added `createInitialResult(task, cwd)` — dedupes the `SidequestResult` literal between `runSingleSidequest`'s opening and `execute`'s placeholder map. Added `parseSessionsField(raw)` — throws on malformed; `normalizeSessions` lets it propagate, `renderCall` wraps it in try/catch. Dropped per-entry stringified-JSON parsing (only the top-level `sessions` string fallback is a real compatibility case). Added `kindGlyph(r)` and `iconFor(r, theme)` for the duplicated glyph/icon ternaries. **Closed a real bug**: `derivePiName(task)` was being called twice per task (once for argv, once for the result literal) and could produce different stamps across minute boundaries. Now `normalizeSessions` computes `piName` exactly once and stores it on the `NormalizedSession`. Single model-resolution path via `NormalizedSession.resolvedModel` (was double-resolved in normalize *and* `buildChildArgs`).

- **Wave 3 (plumbing).** Renamed `mapWithConcurrencyLimit` → `runWithConcurrencyLimit`, returns `Promise<void>`, dropped the unused result-array generic. Inlined `derivePiName` (now one call site, the indirection earned nothing). Dropped redundant post-await `allResults[index] = r; emitUpdate();` (the closure's prior `onTaskUpdate` already mirrors the final state). Extracted `applyJsonEvent(line, result): boolean` — only JSON parse + dispatch + mutation. Spawn lifecycle, abort wiring, chunking, close handler all stay inline (entangled with the §4 bugs; will be reshaped when those land).

- **Micro-cleanup tail.** Added `populateDisplayName(result, idOrPrefix)` to dedupe the pre-spawn (follow-up) and post-spawn display-name lookups. Fixed stale `"tasks"` references in a comment. Updated README's stale `args: ["--model", ...]` example to use the `model` field.

### Refactor agenda (next pass)

These were either explicitly deferred from the DHH pass or surfaced by reviewers as load-bearing-but-not-yet-irreducible:

- **Per-task render block extraction** (`formatExpandedTaskBlock` / `formatCollapsedTaskBlock`). The collapsed and expanded paths in `renderResult` still share ~80% of their per-task formatting (header, prompt preview, items, finalText, usage). Worth ~30–60 LOC. Use the GPT-style two-helper shape (one returns `Container` children, one returns string), not one polymorphic helper — type stability matters more than cleverness here.
- **`spawnAndStream` extraction** from `runSingleSidequest`. **Defer until after the §4 bug fixes land** — extracting the buggy shape into a function signature first would force a re-design after the fixes. Right ordering: fix bugs in place, then extract the now-correct shape.

## Status

Schema is v4-stable. Manual smoke matrix: new sessions, parallel new, follow-up by UUID prefix, follow-up rename, scope-resolved nicknames (`opus`, `sonnet`, `gpt`, `:high` suffix), literal `provider/id`, validation rejections (duplicate session, smuggled flags, ambiguous nickname). German + Spanish + Portuguese translations across two long-running follow-up sessions all round-tripped fully into `content[0].text`.

Known caveat: parallel + long-running batches will visibly fail if the user cancels the parent turn (Esc / new prompt). Children may continue and write their full output to disk after the parent has reported "aborted" — the data isn't lost, but the parent never sees it on stdout. Out of scope for this iteration.

## Open question: parallel sidequest *tool calls*

Right now "parallel" means "one `sidequests` call with N entries in `sessions[]`, awaited as a batch". The tool blocks until all N children complete.

Two related questions worth answering before adding features:

1. **Can the parent agent issue two `sidequests({...})` tool calls in the same assistant turn?** Depends on pi-ai's tool dispatcher (does it run tool calls within one assistant message in parallel or serially?). If parallel: each tool call has its own independent batch, no shared state — they don't merge in the result row. If serial: the second batch waits for the first.
2. **Should we support background / fire-and-forget mode?** I.e., the tool returns immediately with handles `[{label, sessionId, status: "running"}, ...]`, and a sibling tool `sidequests_status({ sessions: [<uuid>, <uuid>] })` polls. This decouples "spawn" from "wait" and lets the agent keep working while children grind. Significant change to the abstraction; only do this if there's a real workflow that needs it.

Investigate (1) first — if pi already runs tool calls in parallel, the agent can already get fan-out by emitting multiple `sidequests` calls, and (2) becomes unnecessary.

## Evolution priorities

### 1. Display improvements

The current renderer is functional but uninspiring. Concrete weaknesses:

- **Live progress is one line** ("3/4 done, 1 running"). With 8 parallel children doing different work, you want a per-child line during execution showing the child's last tool call or message preview. `onUpdate` already fires on every JSONL event we keep — just plumb it into a multi-line live render. The `Container` TUI primitive supports this.
- **Truncated previews lose context.** 120-char previews are fine for the LLM-facing summary; the TUI renderer can show much more. Currently both go through the same render. Split: terse for `content[0].text` (LLM), generous for `details` (TUI).
- **Tool-call list per child is a flat dump.** No grouping, no collapse, no per-child expansion. `Ctrl+O` toggles all-or-nothing. Per-child expand would be nicer; needs interactive TUI state.
- **No syntax highlighting on prompt previews** even when they're code. `getMarkdownTheme()` is already imported but only used for `finalText`. Apply it to prompt fields too.
- **Failed sidequests show stderr verbatim**. Often noisy. Filter pi's startup chatter (the `Loading extensions…` lines) before display.
- **Cost / token totals are dumped at the bottom**. Could be a per-child mini-bar showing relative spend.

Don't over-design. One good iteration of the live-progress multi-line render is worth more than five small polish passes.

### 2. User-side resume slash command

A user-facing `/sq <label-or-uuid>` command that looks up by label (matching the agent's `label`, not the decorated `sq_*_*` form) or UUID prefix and calls `ctx.switchSession(path)`. Three reasons this is cheap and worth doing:

- `ctx.switchSession` is on `ExtensionCommandContext` (only available in command handlers). Slash commands can use it natively — no re-exec hackery.
- The user sees `[my-label]` in the sidequests result row but resuming requires copying the UUID. A slash command closes that ergonomic gap.
- It's ~30 LOC. Pattern to copy: any pi extension exposing a slash command.

Match policy: exact label match wins; substring match falls back; ambiguity → show a picker via `ctx.ui.select`. UUID prefix is a separate code path.

### 3. Known correctness bugs (from v3 review, still live)

These were found in the v3 review by parallel Opus 4.7 + GPT 5.5 sidequests. They survived the DHH refactor because that refactor was strictly behavior-preserving and these are in the JSONL/spawn pipeline.

| | Severity | Where | Fix |
|---|---|---|---|
| `proc.killed` semantics — SIGKILL escalation never fires | P0 | abort handler in `runSingleSidequest` | Track a local `closed` boolean from the `close` handler; gate SIGKILL on `!closed`, not `!proc.killed`. |
| `applyJsonEvent` JSONL dispatch has no try/catch around field access | P0 | `applyJsonEvent` body | Wrap each per-event-type block in try/catch; log to stderr on failure; don't crash the data handler. |
| Signal-killed children reported as `exitCode: 0` | P0 | `proc.on("close", code => resolve(code ?? 0))` | `close` receives `(code, signal)`; treat non-null `signal` as failure with `stopReason: signal`. |
| UTF-8 stream split mid-codepoint | P1 | `proc.stdout.on("data", ...)` | Use `new StringDecoder("utf8")` per child. |
| Worker pool keeps spawning post-abort | P1 | `runWithConcurrencyLimit` workers | Check `signal.aborted` at dequeue time; return aborted result without spawning. |
| AbortSignal listener leak | P1 | abort handler | Remove the listener on normal completion. |

Fix these, *then* extract `spawnAndStream` (see "next pass" agenda above).

### 4. Per-task abort

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
- **`--name` flag stays generic.** Decoration logic lives in `decorateLabel(label)` inside sidequests, not in the flag's hook. The flag is reusable for any `pi -p` invocation; the tool owns the spawn-many-siblings disambiguation problem.
- **Summary/header prefer `r.label || r.displayName`.** The agent-supplied label is more meaningful than the decorated stamp; the stamp is for `pi -r` disambiguation, not for the parent agent's result row. Don't flip the priority.

## Things to consult

- `pi-coding-agent/docs/json.md` — JSONL event schema. If pi ever changes `tool_result_end` → `tool_execution_end` (or similar), our parser will silently miss tool results.
- `pi-coding-agent/docs/extensions.md` — `ExtensionAPI`, `session_start`, `setSessionName`. Note that `ctx.switchSession` is on `ExtensionCommandContext` (commands only), not on the base context (events).
- `pi-coding-agent/docs/sessions.md` + `session-format.md` — how sessions are stored, how `session_info` entries layer.

## Version history (in case you wonder why)

- **v1** (gone): `sidequest` (singular), `tasks: [{ prompt, name?, model?, cwd? }]`, auto-generated `sidequest-<slug>-<ts>` names, `--session-name` flag with factory-time re-exec. Killed for argv-scanning fragility.
- **v2** (gone): "no DSL" reframe — `tasks: [{ name, args, cwd? }]` where `args` was literal pi argv. Forced the agent to construct `["-p", "<prompt>"]` every call. Verbose for the common case.
- **v3** (gone): `sidequests` (plural), `sessions: [{ name?, session?, prompt, args?, cwd? }]`. Promoted `prompt` and `session` to first-class. Right shape, wrong field name.
- **v4** (current): renamed `name` → `label`, fields reordered to `{ session, label, prompt, model, args, cwd }`. Decoration logic moved into sidequests (`sq_<slug>_<stamp>`); `--name` flag stays generic verbatim. DHH-pass refactor (3 waves) brought the file from 1118 → 1050 LOC and closed the `derivePiName` time-skew bug.
