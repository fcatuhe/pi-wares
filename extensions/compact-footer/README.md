# compact-footer

Folds pi's built-in 3-line footer into 2 by merging the status line onto the path line.

Wraps the built-in `FooterComponent`, truncates the path with an ellipsis to make room for the statuses, appends them right of it, then drops the now-empty third line. If the built-in footer ever renders fewer than 3 lines, its output passes through untouched.

Status order is its own rather than the built-in alphabetical: `usage` then `token-rate` pinned rightmost, every other status alphabetical to their left. Unknown or renamed keys fall back into the alphabetical group.

No config. No commands.
