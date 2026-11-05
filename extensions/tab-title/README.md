# tab-title

Carries the pi session name to the tab that shows the session: the herdr tab label, the Paseo agent name, or both. Each side is inert when pi does not run there.

## herdr

Keeps the herdr tab label and the pi session name in sync, both ways.

The session name goes to the tab at session start and on every rename, and renaming the tab in herdr renames the session. The label found at start is only a baseline, so herdr's numeric default never names a session. Herdr replays recent events on subscribe, so a `tab.renamed` event only triggers a re-read of the label, never a rename from its payload.

At session shutdown (quit, `/new`, `/resume`, `/fork`, `/reload`) a label you had given the tab comes back, and anything else is parenthesized, `oauth-rotation` becoming `(oauth-rotation)`. A tab you renamed since is left alone, and a crash or SIGKILL skips this. A numeric baseline is never restored, since herdr renumbers tabs by position and cannot clear a label.

Inert outside herdr (`HERDR_ENV=1`, `HERDR_SOCKET_PATH` and `HERDR_TAB_ID`) and without a UI.

## Paseo

Names the Paseo agent after the session, at session start and on every rename, with `paseo agent update $PASEO_AGENT_ID --name`. Only the latest of names set in a burst is sent. A failed rename shows a warning in Paseo, and the same name is tried again on the next rename.

It goes one way. Paseo tells pi nothing when you rename the agent in the app, so the session keeps its name.

Inert without `PASEO_AGENT_ID` and outside RPC mode, which Paseo always uses. A `pi` or `pi -p` that an agent starts from its shell inherits the variable but runs in another mode, so it never renames the agent.

Labels are capped at 60 characters on both sides.
