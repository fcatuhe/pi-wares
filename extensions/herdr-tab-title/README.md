# herdr-tab-title

A pi extension that lets the agent label its own [Herdr](https://herdr.dev) tab, so a human scanning the workspace can tell tabs apart at a glance.

## Why

Herdr's built-in pi integration only shows agent *state* (working / idle / blocked dot). It doesn't tell you *what* a tab is working on. This adds a descriptive label the agent keeps in sync.

## Usage

Nothing to type. A system-prompt guideline asks the agent to call the `set_tab_title` tool at the start of a task and whenever the focus changes, with a 3–5 word phrase like `fixing auth bug`. You can also ask it directly ("set the tab to X").

No-op outside Herdr — gated on `HERDR_ENV` / `HERDR_PANE_ID`.

## How it works (v3 — back to basics)

A registered tool plus a `promptGuidelines` bullet, and two reset hooks. **No auto-naming, no extra model calls.**

- `set_tab_title(title)` → `herdr pane get $HERDR_PANE_ID` to resolve `tab_id` (cached for the process) → `herdr tab rename <tab_id> <title>`. Title sanitized to its first line, ≤32 chars.
- **Reset:** the title is cleared back to the tab number on `session_start` reason `new` and `session_shutdown` reason `quit` only (not `reload`/`resume`/`fork`).

## Not handled (intentional)

Relies on the agent calling the tool — labels can go stale if it forgets. Touches only the Herdr tab label, never the pi session name.
