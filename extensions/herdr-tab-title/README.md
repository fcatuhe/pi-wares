# herdr-tab-title

A pi extension that lets the agent label its own [Herdr](https://herdr.dev) tab, so a human scanning the workspace can tell tabs apart at a glance.

## Why

Herdr's built-in pi integration only shows agent *state* (working / idle / blocked dot). It doesn't tell you *what* a tab is working on. This adds a descriptive label the agent keeps in sync.

## Usage

Nothing to type. A system-prompt guideline asks the agent to call the `set_tab_title` tool at the start of a task and whenever the focus changes, with a 3–5 word phrase like `fixing auth bug`. You can also ask it directly ("set the tab to X").

No-op outside Herdr — gated on `HERDR_ENV` / `HERDR_PANE_ID`.

## How it works (v4)

A registered tool plus a `promptGuidelines` bullet, and two reset hooks. **No auto-naming, no extra model calls.**

- `set_tab_title(title)` → resolves `tab_id` from `$HERDR_TAB_ID` (falling back to `herdr pane get $HERDR_PANE_ID`, cached for the process) → `herdr tab rename <tab_id> <title>`. Title sanitized to its first line, ≤32 chars.
- **Reset:** the title is reverted to the tab number from `session_shutdown` for reasons `quit` and `new` only (not `reload`/`resume`/`fork`). It uses shutdown rather than the next `session_start` because on `/new` pi tears the old runtime down first, and the loader re-imports the module with no cache — so the in-memory ownership state (see below) only survives on the old instance's shutdown.

### Only the owning session touches the tab

Every rename/reset is gated on `ctx.mode === "tui"`. Sidequest and other children inherit `HERDR_ENV`/`HERDR_TAB_ID` and load this extension too, but they run headless in `json`/`print` (or `rpc`) mode — so they no longer fire a reset on shutdown that would flicker/clobber the parent tab's label.

### Never clobbers a manual rename

The extension remembers (in process memory) the last label it set. On reset it only reverts to the tab number if the current label still matches what it set; if you (or anything else) renamed the tab in the meantime — or Herdr reports no label — it leaves the tab alone, and it never reverts a tab it never labeled. Note: this memory is lost across `/reload`, so a title set before a reload won't be auto-reverted on the next quit.

## Not handled (intentional)

Relies on the agent calling the tool — labels can go stale if it forgets. Touches only the Herdr tab label, never the pi session name.
