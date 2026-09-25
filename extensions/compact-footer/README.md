# compact-footer

Folds pi's 3-line footer into 2 by moving the extension statuses onto the path line, the path truncated with an ellipsis to make room.

Statuses are alphabetical, except `subscription-usage-pace` then `token-rate`, pinned rightmost. If the built-in footer ever renders fewer than 3 lines, it passes through untouched.

The `(auto)` compaction indicator reads project settings over global ones when the footer is built, so a `/settings` toggle shows only after the next session start, because pi emits no event for it.
