# herdr-tab-title

Keeps the herdr tab label and the pi session name in sync, both ways.

The session name goes to the tab at session start and on every rename, and renaming the tab in herdr renames the session. The label found at start is only a baseline, so herdr's numeric default never names a session. Herdr replays recent events on subscribe, so a `tab.renamed` event only triggers a re-read of the label, never a rename from its payload.

At session shutdown (quit, `/new`, `/resume`, `/fork`, `/reload`) a label you had given the tab comes back, and anything else is parenthesized, `oauth-rotation` becoming `(oauth-rotation)`. A tab you renamed since is left alone, and a crash or SIGKILL skips this. A numeric baseline is never restored, since herdr renumbers tabs by position and cannot clear a label.

Inert outside herdr (`HERDR_ENV=1`, `HERDR_SOCKET_PATH` and `HERDR_TAB_ID`) and without a UI. Labels are capped at 60 characters.
