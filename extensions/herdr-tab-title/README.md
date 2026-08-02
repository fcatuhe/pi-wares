# herdr-tab-title

Keeps the herdr tab label and the pi session name in sync, both directions.

**pi -> herdr:** listens for `session_start` and `session_info_changed`, so the tab picks up the name on resume and follows `/name`, `pi.setSessionName()`, and `/rename-quit`. Renames via `tab.rename` on the herdr socket (`HERDR_SOCKET_PATH`, targeting `HERDR_TAB_ID`).

**herdr -> pi:** holds a socket subscription to `tab.renamed`. Herdr replays a backlog of recent events on every subscribe, so event payloads are untrusted: a rename notification only triggers a re-read of the tab's current label, applied when it differs from the last synced label. That same dedupe breaks the echo loop for our own outbound renames. The subscription reconnects every 5s if the socket drops.

At startup the current tab label is only a baseline, never adopted as session name: herdr's default numeric labels should not name sessions. Only live renames flow inward.

Inert outside herdr (`HERDR_ENV != 1`) and in subagent sessions (no UI). Outbound labels are capped at 60 characters. A cleared session name leaves the tab label as-is.

No config. No commands.
