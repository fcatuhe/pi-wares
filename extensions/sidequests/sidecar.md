# sidequests — handover

You're the next agent. README is for users; this file is for you.

## Where things stand

`index.ts` (~1050 LOC), single file, no new runtime deps. Schema is v4 (`{ session?, label?, prompt, model?, args?, cwd? }` per entry). Decoration of `label` → `sq_<slug>_<DDmonYY>-<HHMM>-<tz>` happens inside the tool; the `--name` flag and its `session_start` hook stay generic. Validation rejects duplicate sessions in one call and `--session`/`--name`/`--model`/`--thinking` smuggled into `args` (each has its own dedicated field). The JSONL parse / spawn / render pipeline is inherited from subagent and largely unchanged across versions.

**Tested live**: new sessions, follow-ups, follow-up renames all work end-to-end. Decorated `pi -r` names land correctly in `session_info` entries.

### Recent changes (this session)

- **README synced to v4.** Was still documenting v1 (`sidequest` singular, `tasks[]`, `name`/`model`/`concurrency`). Now matches the live schema.
- **`content[0].text` returns full `finalText` per task.** Previously truncated to 120 chars (`SUMMARY_PREVIEW_CHARS`), which forced the parent agent to grep child JSONL by hand whenever a sidequest produced a document (refactor plan, essay, generated code) — the *common case*. Replaced the per-task preview with `--- [label] <kind> (<id>) [<status>] ---` header + verbatim `finalText.trim()`. Rationale: it's model output, naturally bounded; the alternative — agent silently can't see what it dispatched — is worse than burning some context.
- **`stderr` still capped** via new `STDERR_PREVIEW_CHARS = 500` (last-N), used only as a fallback when `finalText` is empty. stderr is process noise (pi startup chatter, stack traces), not model output.
- **`shortId` helper** replaces ad-hoc `sessionId.slice(0, 8)` in the summary row and renderer header. UUIDv7's first 8 hex chars are timestamp-high and collide across siblings spawned in the same ~65s bucket; we now show `slice(0, 18)` (through the third hyphenated group) so siblings render distinctly *and* the displayed string is a valid contiguous prefix for `pi --session`.
- **TUI collapsed view is now strictly less informative than what the parent receives.** The collapsed render still hides `finalText` behind `Ctrl+O`; the parent LLM gets it inline. Intentional asymmetry, worth noting if anyone wonders why.
- **`displayName` surfaced in summary rows + result header.** Each child writes a `session_info` line with its display name on every run (via the generic `--name` hook). New helper `readSessionDisplayName(file)` reads the latest from disk; `runSingleSidequest` populates `result.displayName` eagerly for follow-ups (so the live render shows it) and after spawn for new sessions (covers fresh + rename mid-run). `renderCall` (no result yet) uses `findSessionFileAcrossCwds` to read live from disk every paint. **Trap fixed mid-session**: the cwd-bound `findSessionFile` was the wrong lookup for follow-ups whose JSONL lives in a different cwd-encoded directory than the parent; both pre- and post-spawn populate now fall back to the cross-cwd scan. `renderResult` also drops the dim `(uuid)` suffix when `shown` is itself the UUID, to avoid `019de386-... (019de386-...)` duplication.
- **`model` field on each session entry**, with scope-resolved nicknames. Either a literal `provider/id[:level]` (passed through verbatim) or a bare nickname matched case-insensitively as a substring against the `enabledModels` array in `~/.pi/agent/settings.json`. Exactly one match required; ambiguity / no match / empty scope are rejected eagerly in `normalizeSessions` so errors surface before any spawn. **Decoupling choice**: read pi's own `settings.json` rather than another extension's config (`pi-model-shortcuts.json`). The `enabledModels` list is owned by pi-mono; users curate it via `--models`, `/scoped-models`, or the UI. Tied to pi's public surface, not a sibling extension. The `args` validator now also rejects `--model`/`--thinking` since both are managed by the resolved spec. See `resolveModel(spec)` and `loadEnabledModels()` for the implementation.
- **All four LLM-facing copy surfaces aligned.** Tool description, `model`/`args` schema descriptions, the outer `sessions` union description, and the non-array validation error all reference v4 + `model?` consistently. `--model` and `--thinking` are no longer suggested as `args` examples.

### Refactor planning (parallel sidequests, this session)

Two planning sidequests were spawned (Opus 4.7 + GPT 5.5) against the § "Evolution priorities → 1. Refactor for simplification" agenda below. Their full plans live in their session JSONLs:

- Opus plan: `pi --session 019de33a-3613-723c` (label `sq_refactor-plan-opus_*`)
- GPT 5.5 plan: `pi --session 019de33a-360e-7419` (label `sq_refactor-plan-gpt_*`)

Key agreement points (high confidence — safe to implement):
- One file stays one file; no class extraction; no module split.
- Six extractions: `parseSessionsField`, `kindGlyph`, `parseJsonlEvent` (returns `changed: boolean`), `spawnAndStream`, `formatTaskBlock` (or pair of expanded/collapsed helpers), `createInitialResult` to dedupe placeholder vs runtime result construction.
- `parseSessionsField` throws in `normalizeSessions`, best-effort try/catch in `renderCall`.
- All P0/P1 bugs from § 4 strictly out of scope for the refactor pass; behavior-preserving only.
- Realistic LOC landing: 620–720, not 600. Schema descriptions and validation messages drive the residual.

Key divergence (decide before executing):
- **`formatTaskBlock` shape.** Opus: one helper returning `Renderable[]`, caller stitches with `\n\n` (collapsed) vs `Spacer(1)` (expanded). GPT: two helpers (`formatExpandedTaskBlock` → `Container`, `formatCollapsedTaskBlock` → `string`); type-stable, easier to review. Pick GPT's pair.
- **Step granularity.** Opus 6 commits, GPT 10. Pick GPT's; smaller diffs, easier to bisect if anything regresses.
- **Hoisting `aggregateUsage`/`headerLineFor`.** GPT hoists, Opus keeps as local closures. Opus is right — single caller each, hoisting only adds a parameter list.
- **Stale `name`/`label` strings in error messages.** GPT fixes while in the area, Opus says don't touch. Fix them — they're misleading and the cost is zero.

Recommended hybrid plan: GPT's 10-step granularity + two-helper `formatTaskBlock`, Opus's specific traps (the `\n\n` vs `Spacer(1)` whitespace asymmetry, `slice(-limit)` last-N semantics, the deliberate `as any` in `renderCall` that should not be "fixed"). Cross-reference both sessions before starting Step 1.

## Status

For the duration of one editing session, the schema is stable and the agent-facing surface is consistent. Manual smoke-tested live for: new sessions, parallel new, follow-up by UUID prefix, follow-up rename, scope-resolved nicknames (`opus`, `sonnet`, `gpt`, `:high` suffix), literal `provider/id`, validation rejections (duplicate session, smuggled flags, ambiguous nickname). German + Spanish + Portuguese translations across two long-running follow-up sessions all round-tripped fully into `content[0].text`.

Known caveat: parallel + long-running batches will visibly fail if the user cancels the parent turn (Esc / new prompt). Children may continue and write their full output to disk after the parent has reported "aborted" — the data isn't lost, but the parent never sees it on stdout. Out of scope for this iteration; documented for the next maintainer.

## First task: execute the refactor

Follow the hybrid plan summarized in § "Refactor planning" above. Read both session transcripts in full first; they contain line-cited risks that don't fit in this handover. Do **not** mix in any § 4 bug fixes — those land afterward, on top of the new `spawnAndStream` / `parseJsonlEvent` (which is exactly why we're extracting them).

Definition of done: every smoke-matrix scenario from GPT's plan passes (new session, two parallel new, follow-up by UUID, follow-up rename, stringified `sessions`, duplicate-session rejection, smuggled-`--name`/`--session` rejection, invalid-child-arg failure path); `pi -r` shows decorated names for new sessions and verbatim labels for follow-up renames; `content[0].text` still returns full `finalText` per task; `Ctrl+O` toggle is visually identical to pre-refactor.

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
