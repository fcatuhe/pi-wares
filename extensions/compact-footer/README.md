# compact-footer

Squeezes pi's built-in 3-line footer into 2 lines by merging extension statuses (line 3) onto the path line (line 1).

## Behavior

Reuses the built-in `FooterComponent` from `@earendil-works/pi-coding-agent`, then post-processes its output:

- Renders the built-in footer normally (3 lines: path, model/usage, statuses).
- Computes the visible width of the status line.
- Truncates the path with an ellipsis if needed to make room.
- Appends the status segment to the right side of the path line.
- Drops the now-empty third line.

If the built-in footer ever produces fewer than 3 lines, the extension passes through unchanged.

## Install

Ships as part of [`pi-wares`](../../README.md). Install the parent package and enable `compact-footer` in `pi config`.

No configuration file. No commands. Just enable and forget.
