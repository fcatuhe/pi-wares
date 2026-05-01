# clear-on-startup

Clears the visible terminal once on a fresh pi process. Scrollback is
preserved, so you can still scroll up to see whatever was in your shell
before pi launched.

Writes `\x1b[2J\x1b[H` (clear screen + cursor home) before pi-tui paints
its first frame. `\x1b[3J` (clear scrollback) is intentionally omitted.

Fires only on `session_start` with `reason: "startup"` — i.e. `pi`, `pi -r`,
`pi -c`, `pi --fork`, ... Does **not** fire for `/reload`, `/new`, `/resume`,
or `/fork` (those rebind extensions but with non-`startup` reasons, and
clearing the screen there would destroy the visible conversation history).

Skipped when stdout is not a TTY (piped/redirected output) and when
`ctx.hasUI` is false (print/RPC/headless modes).

Note: pi-tui itself may wipe scrollback on certain full re-render paths
(e.g. terminal width change). That is outside this extension's control.

No config. No commands.
