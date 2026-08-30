# usage-pace

Footer status showing the active subscription's usage as a bar with a **pace marker** and a reset countdown.

```
5h ━━━━╵───── 42% 3h    7d ━━━━━━─╵── 61% 2d
```

- Light gray `─` = the whole window's quota (the track).
- Thick `━` = quota used so far, one cell per tenth of the quota. Fill truncates, so colored ink never claims quota that is still available.
- The bar is 10 cells wide, so both windows plus their text run ~44 columns. In [`compact-footer`](../compact-footer/) the status competes with the path for width.
- `╵` = how far into the window we are (time elapsed). Half-height on purpose, so it never reads as fill.
- Thick bar short of the marker → under pace. Past it → burning quota faster than the clock.
- Trailing text = absolute usage percent + time until the window resets.
- `~` before the label (`~5h ━━━━╵───── 42% 3h`) = the numbers are older than two poll intervals (10 min), i.e. the endpoint has been failing. The countdown stays accurate, the percent does not.

## Rate-limited

While the endpoint is refusing the poll (see the 429 note below), the footer says so and says when it will try again:

```
no usage data until 00:17                              nothing cached, no bar to draw
~5h ━━━━╵───── 42% 3h  ~7d ...  no update until 00:17  the bars are the last good read
```

A clock time, not a countdown: the status is only repainted every 5 minutes, so `42m` would read minutes late, `00:17` never does. The wording keeps the subject on the reading rather than the quota, a footer saying "usage blocked" reads as a suspended account.

## Color = pace, not usage

Color answers "will I run out before this window resets?", so a high absolute percent is not red by itself:

| Condition | Color |
|---|---|
| at or under pace, plus 2pts of jitter slack | green |
| up to 10 points beyond that | yellow |
| further ahead than that | red |
| less than 10% of quota left (`used% ≥ 90`) | red, regardless of pace |

22% of the week burned by the end of day one is **yellow**: that pace empties it around day five. 40% on day one is **red**, it runs dry on day three. 92% used with 12 minutes left is **red** even though the pacing was perfect: there is no room left to spend at any rate.

## Providers

Whichever of these is the current model's provider:

| pi provider | Source |
|---|---|
| `anthropic` | `GET api.anthropic.com/api/oauth/usage`, `limits[]` kinds `session` (5h) and `weekly_all` (7d) |
| `openai-codex` | `GET chatgpt.com/backend-api/wham/usage` (primary + secondary windows) |

The weekly per-model cap (`weekly_scoped`, e.g. Opus) is **not** shown, two bars are all the footer fits: a green `7d` does not promise the model you are on has weekly quota left. The sibling `five_hour` / `seven_day` objects are ignored, their float `utilization` has no distinguishable unit below 1 (`0.6` is 0.6%, not 60%).

Any other provider clears the status. Tokens come from `~/.pi/agent/auth.json` and nowhere else: whatever pi is authenticated as is what the bar reports on, and a provider pi has no credential for shows no bar.

## Behavior

- Published with `ctx.ui.setStatus("usage", ...)`, so the built-in footer, [`compact-footer`](../compact-footer/) and any other footer render it without extra wiring.
- Polls every 5 minutes, plus immediately on session start (which pi also fires on `/new`, `/resume` and `/fork`) and on model change. The countdown text therefore lags by up to 5 minutes, and a re-render on `turn_end` is the fix if that ever reads as wrong.
- Last good snapshot per provider is written to `~/.pi/agent/usage-pace.json`, so a failed or timed-out (5s) request leaves the bar as-is instead of blanking it, and a new session shows a bar before its first poll. No auth, no status.
- **A 429 is obeyed.** `Retry-After` (delta seconds or HTTP date) is stored as `blockedUntil` in the same shared file and no session polls again before it. Without this the 5-minute tick spends the endpoint's hourly budget as fast as it frees, and the bar never comes back: it stays empty for hours. The Anthropic endpoint answers with a `Retry-After` around half an hour, pointing at a fixed deadline: successive 429s in one block name the same wall-clock time. A 429 without the header holds for one 5-minute interval, which is the cadence anyway, so it costs no freshness and gives the notice below something to print.
- **The hold is on screen, not only in the file.** An empty footer is indistinguishable from a broken extension, and that costs an evening of guessing. A successful poll clears the hold, so the notice cannot outlive the block.
- **One poll per 5 minutes machine-wide, not per session.** Each refresh reads the shared file, adopts it if newer than what it holds, and stakes `polledAt` before fetching, so sessions starting in the same second don't stampede. Whichever session wins the slot feeds every other one. This matters: the Anthropic endpoint answers 429 when polled hard.
- Windows whose reset time has already passed are dropped on load rather than shown stale.
- Both endpoints are unofficial. Failures are swallowed and hide the segment.

## Check

```bash
npx tsx extensions/usage-pace/test.ts
```

Covers the two payload parsers, pace math (including the two weekly examples above), bar cells, clamping and the countdown formatter.
