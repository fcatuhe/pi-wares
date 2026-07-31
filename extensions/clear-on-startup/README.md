# clear-on-startup

Clears the terminal once on a fresh pi process, scrollback included, so the shell output from the command that launched pi is gone instead of sitting above the session.

It does this by forcing a full pi-tui redraw (`tui.requestRender(true)`) rather than writing escape codes itself. pi paints its first frame before `session_start` fires, and pi-tui only emits diffs against a shadow buffer, so a raw `\x1b[2J` would erase the prompt bars without the renderer knowing and they would never come back. The forced render path emits `\x1b[2J\x1b[H\x1b[3J` and repaints the whole UI. Getting the TUI handle needs a widget factory, so the extension registers a zero-height placeholder and removes it in a microtask, before the next paint.

Fires only on `session_start` with `reason: "startup"`, so `pi`, `pi -r`, `pi -c`, `pi --fork`. Not on `/reload`, `/new`, `/resume`, or `/fork`, which rebind extensions with other reasons and where clearing would destroy the visible conversation.

Skipped when stdout is not a TTY (piped or redirected) and when `ctx.hasUI` is false or `ctx.mode` is not `tui` (print, RPC, headless).

No config. No commands.
