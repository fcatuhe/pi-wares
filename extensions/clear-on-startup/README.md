# clear-on-startup

Clears the terminal once on a fresh pi process, scrollback included, so the shell output from the command that launched pi does not sit above the session.

Fires only on `session_start` with `reason: "startup"`, so `pi`, `pi -r`, `pi -c`, `pi --fork`. Not on `/reload`, `/new`, `/resume` or `/fork`, where clearing would destroy the visible conversation. Skipped when stdout is not a TTY, or outside interactive TUI mode.

The clear runs as a forced pi-tui redraw rather than a raw `\x1b[2J`, which would desync the renderer and cost you the prompt bars. See the `INFO` notes in `index.ts`.

No config. No commands.
