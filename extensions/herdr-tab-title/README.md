# herdr-tab-title

Keeps the herdr tab label and the pi session name in sync, both directions.

**pi -> herdr:** listens for `session_start` and `session_info_changed`, so the tab picks up the name on resume and follows `/name`, `pi.setSessionName()`, and `/rename-quit`. Renames via `tab.rename` on the herdr socket (`HERDR_SOCKET_PATH`, targeting `HERDR_TAB_ID`). A rename only counts as synced once herdr confirms it; an unconfirmed rename (herdr down, timeout) is retried on the next sync. Rapid renames coalesce to the latest.

**herdr -> pi:** holds a socket subscription to `tab.renamed`. Herdr replays a backlog of recent events on every subscribe, so event payloads are untrusted: a rename notification only triggers a re-read of the tab's current label, applied when it differs from the last synced label. That same dedupe breaks the echo loop for our own outbound renames. The subscription reconnects every 5s if the socket drops, and every (re)connect schedules a reconciliation sync to cover renames missed while disconnected.

The first successful label read is only a baseline, never adopted as session name: herdr's default numeric labels should not name sessions. Only renames after that flow inward.

**Lifecycle:** pi borrows the label and returns it. On `session_shutdown` (quit, `/new`, `/resume`, `/fork`, `/reload`) the pre-session label is restored, so a dead session's name never sticks to the tab; replacement flows then re-push the successor's name. Restore is skipped when the tab label is no longer ours (a last-second user rename wins) and when nothing was ever renamed. A crash or SIGKILL skips `session_shutdown`, leaving the label stale until the next rename: unfixable from inside pi.

Inert outside herdr (`HERDR_ENV != 1`) and in subagent sessions (no UI). All sockets and timers are unref'd and torn down on `session_shutdown`, so a stale instance never outlives its session or blocks process exit. Outbound labels are capped at 60 characters. A cleared session name leaves the tab label as-is.

No config. No commands.
