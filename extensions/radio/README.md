# radio

Lets agent sessions on this machine call each other: `radio_agents` lists who is up, `radio_call` puts a message in another session's transcript, tagged with the caller and answerable.

Each session with a UI keeps a station in `~/.pi/agent/radio/<session-id>/`, removed at shutdown, or at the next lookup once its process is gone, pending calls with it. Herdr is optional: where it runs, it adds live status, pane ids, and the Claude Code or Codex panes that have no station.

`radio_call(to, text)` finds `to` by pane id, name or cwd basename, and refuses an ambiguous match or its own session. It waits up to 2.5s for an acknowledgement, so the result says whether the call landed. `wait_for_reply: true` holds the turn up to two minutes for the answer.

A call arrives as a `<radio-call>` block naming the caller and saying it is a colleague, not the owner. Its text is stripped of control characters, capped at 4000 characters, and cannot close the block. A call leaves the inbox once handled, a failed injection is reported to you as an error, and a call older than 15 minutes is dropped.

| priority | peer idle | peer working |
|---|---|---|
| `normal` | starts a turn | `followUp`, when the run settles |
| `interrupt` | starts a turn | `steer`, between tool batches |
| `note` | at the owner's next prompt | same |

A thread stops at 4 hops, one peer takes 6 calls a minute, one turn places 8, and a refusal names the limit.

A pane without a station has no radio. `keys_fallback: true` types the call into its terminal as `[radio from <name>] ...`, arriving as the owner and unanswerable. A call refused for lacking it does not count against the limits.

Config is optional, in `~/.pi/agent/radio/config.json`:

```json
{
  "incoming": "open",
  "presets": { "holding": "Are you holding {path}? I need to edit it within the next few minutes." }
}
```

`incoming` is `open` (default), `gated`, which turns every call into a `note`, or `off`, which declines. `presets` adds to the built-in `holding`, `status`, `pushed` and `handover`, called as `radio_call(to, preset, vars)`.
