# subscription-usage-pace

Footer status showing the current provider's subscription usage per window, as a bar with a pace marker and a reset countdown.

```
5h ━━━━╵───── 42% 3h    7d ━━━━━━─╵── 61% 2d
```

The thick `━` is quota used, one cell per tenth, rounded down. `╵` marks how far into the window the clock is, so fill short of it is under pace and fill past it burns quota faster than time. The text is the percent used and the time until reset. A `~` before a label means the numbers are over 10 minutes old because polls are failing: the countdown is still right, the percent may not be.

Color is pace, not usage: green at or under pace plus 2 points of slack, yellow up to 10 points past that, red beyond, and red regardless of pace from 90% used. 22% of the week gone after day one is yellow, since that pace runs out around day five.

| pi provider | Source |
|---|---|
| `anthropic` | `GET api.anthropic.com/api/oauth/usage`, `limits[]` kinds `session` (5h) and `weekly_all` (7d) |
| `openai-codex` | `GET chatgpt.com/backend-api/wham/usage`, primary and secondary windows |

Both endpoints are unofficial. Tokens come from `~/.pi/agent/auth.json` only, and any other provider clears the status. The per-model weekly cap (`weekly_scoped`) is not shown, so a green `7d` does not promise the current model has weekly quota left.

It polls at session start, on model change and every 5 minutes, once per provider for the whole machine: sessions share the last good read in `~/.pi/agent/subscription-usage-pace/snapshot.json`, so a new session draws bars before its first poll. Windows past their reset are dropped.

A failed poll with no bars to draw shows the reason, where bars would show the `~` instead:

```
no usage data: not logged in
no usage data: endpoint answered 500
```

A 429 is obeyed, or the 5-minute tick keeps the endpoint refusing for hours. Its `Retry-After`, one interval when absent, goes into the snapshot, no session polls before it, and the footer leads with the time polls resume, so a narrow footer truncates the bars first:

```
no usage data until 00:17
no update until 00:17  ~5h ━━━━╵───── 42% 3h  ~7d ...
```

A [`subscription-switch`](../subscription-switch/) drops the bars, the snapshot and any hold, then polls the new account at once. The status key is `subscription-usage-pace`, which [`compact-footer`](../compact-footer/) pins rightmost with `token-rate`.
