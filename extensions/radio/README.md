# radio

Calls another agent session running on this machine. `radio_agents` lists who is up, `radio_call` puts a message in that session's transcript, tagged with the caller's name and answerable.

Delivery is a mailbox under `~/.pi/agent/radio/<session-id>/`, watched by the session that owns it. `herdr agent prompt` was the alternative and it types into the recipient's editor: the message arrives as its owner, with no sender, no idle gate and no way back. A call here arrives as a custom message the model reads as peer data, and the reply lands back in the caller's own mailbox.

Herdr is not required, which is why the ware is not named after it. Sessions find each other through the mailbox registry, so two pi's in plain terminals can call each other. Where herdr is running, `agent.list` joins each station to its pane on the session file path and fills in what the registry cannot know: live status, the pane id that disambiguates two sessions sharing a name, and the Claude Code or Codex panes that have no mailbox at all.

**Sending.** `radio_call(to, text)` resolves the target by name, by pane id, or by the basename of its working directory, refusing an ambiguous match with the candidate list rather than guessing, and refusing to call the session it is running in. The envelope is written into the peer's inbox, and the tool waits up to 2.5s for the acknowledgement the receiver writes back, so the result says whether the call landed or is sitting in a mailbox nobody is reading. `wait_for_reply` holds the caller's turn until the answer arrives, up to two minutes; escape aborts it. That is the only correlated path: an answer carries `in_reply_to`, and the waiting tool call consumes it before the receiver's side would inject it.

**Receiving.** The session watches its own inbox and injects what arrives, wrapped in a `<radio-call>` block naming the caller, its pane and its cwd, followed by the line that says this is a colleague and not the owner, and by the exact `radio_call` call that answers it. The peer's text is sanitized first: ANSI and control characters out, 4000 characters max, and any `radio-call` tag of its own escaped, so a caller cannot close the wrapper and continue as if it were the framing.

| priority | peer idle | peer working |
|---|---|---|
| `normal` | injected, turn starts | `followUp`, lands when the run settles |
| `interrupt` | injected, turn starts | `steer`, lands between tool batches |
| `note` | `nextTurn`, read at the owner's next prompt | same |

Nothing is dropped for being busy, and nothing cuts into a running tool call: `steer` is delivered when the assistant's current batch finishes, so a 20s bash finishes first.

**Budget.** A thread counts hops and stops at 4, one peer takes 6 calls a minute, one turn places 8, and each refusal is a thrown tool error naming the limit, so the model reads it and stops rather than looping with a peer until someone notices. A call older than 15 minutes is dropped on arrival instead of surfacing whatever a dead session wanted.

**Presence.** A station is a directory holding `station.json` (session id, session file, name, cwd, pane, pid), an `inbox/` and an `ack/`. It is written on `session_start`, renamed with the session, and removed on `session_shutdown`, which covers quitting and closing the herdr tab: herdr hangs the pi up and the shutdown path runs. A kill that skips it leaves the directory behind, and the pid it carries is what removes it: every lookup drops the stations whose process is gone, and both tools look up before they do anything, so a ghost is never addressable. Pending calls die with the directory, which is right, since nobody was going to read them. A recycled pid is the one case that reads as alive, and a call to it comes back unacknowledged rather than silently lost. Sessions without UI, subagents among them, register nothing: they are transient and have no name worth addressing.

A herdr pane with no station is listed as unreachable. For those, `keys_fallback: true` types the call into the terminal with a `[radio from x]` prefix, which is how a Claude Code or Codex pane can be reached at all. It arrives as its owner and cannot answer, so it is opt-in per call.

**Config,** all optional, in `~/.pi/agent/radio.json`:

```json
{
  "incoming": "open",
  "presets": { "holding": "Are you holding {path}? I need to edit it within the next few minutes." }
}
```

`incoming` is `open` (default), `gated`, which turns every call into a `note`, or `off`, which declines and tells the caller so. `presets` adds to the four built in (`holding`, `status`, `pushed`, `handover`), called as `radio_call(to, preset, vars)`.

Self-check: `npx tsx extensions/radio/test.ts`.
