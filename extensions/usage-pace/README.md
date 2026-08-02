# usage-pace

Footer status showing the active subscription's usage as a bar with a **pace marker** and a reset countdown.

```
5h ━━━━╵───── 42% 3h    7d ━━━━━━─╵── 61% 2d
```

- Light gray `─` = the whole window's quota (the track).
- Thick `━` = quota used so far, `╾` = a half-filled cell, so the default 10-wide bar moves every 5%.
- `╵` = how far into the window we are (time elapsed).
- Thick bar short of the marker → under pace. Past it → burning quota faster than the clock.
- Trailing text = absolute usage percent + time until the window resets.
- `~` before the label (`~5h ━━━━╵───── 42% 3h`) = the numbers are older than two poll intervals (10 min), i.e. the endpoint has been failing. The countdown stays accurate, the percent does not.

## Color = pace, not usage

Color answers "will I run out before this window resets?", so a high absolute percent is not red by itself:

| Condition | Color |
|---|---|
| at or under pace, plus 2pts of jitter slack | green |
| up to 10 points beyond that | yellow |
| further ahead than that | red |
| less than 10% of quota left (`used% ≥ 90`) | red, regardless of pace |

40% of the week burned on day one is **yellow**: that rate exhausts it by Thursday. 92% used with 12 minutes left is **red** even though the pacing was perfect: there is no room left to spend at any rate.

## Providers

Whichever of these is the current model's provider:

| pi provider | Source |
|---|---|
| `anthropic` | `GET api.anthropic.com/api/oauth/usage` (5h + 7d windows) |
| `openai-codex` | `GET chatgpt.com/backend-api/wham/usage` (primary + secondary windows) |

Any other provider clears the status. Tokens come from `~/.pi/agent/auth.json`, falling back to the Claude Code macOS keychain entry and `$CODEX_HOME/auth.json`.

## Behavior

- Published with `ctx.ui.setStatus("usage", ...)`, so the built-in footer, [`compact-footer`](../compact-footer/) and any other footer render it without extra wiring.
- Polls every 5 minutes, plus immediately on session start (which pi also fires on `/new`, `/resume` and `/fork`) and on model change. The countdown text therefore lags by up to 5 minutes.
- Last good snapshot per provider is written to `~/.pi/agent/usage-pace.json`, so a failed or timed-out (5s) request leaves the bar as-is instead of blanking it, and a new session shows a bar before its first poll. No auth, no status.
- **One poll per 5 minutes machine-wide, not per session.** Each refresh reads the shared file, adopts it if newer than what it holds, and stakes `polledAt` before fetching, so sessions starting in the same second don't stampede. Whichever session wins the slot feeds every other one. This matters: the Anthropic endpoint answers 429 when polled hard.
- Windows whose reset time has already passed are dropped on load rather than shown stale.
- Both endpoints are unofficial. Failures are swallowed and hide the segment.

## Config

- `PI_USAGE_BAR_WIDTH`: bar cells per window, default `10`, i.e. 20 half-steps of 5% each, both bars plus their text running ~44 columns. Lower it on narrow terminals (the status competes with the path for width in `compact-footer`): `4` still reads fine at 12.5% steps. Below `4` the bar stops carrying signal, at `1` the marker is the whole bar. Raising it also shrinks the blind span under the marker cell, which hides one cell of fill.
- `PI_USAGE_MARKER`: pace marker glyph, default `╵` (half-height, keeps the bar flat). Set to `│` or `┼` if your font renders it badly.

## Check

```bash
npx tsx extensions/usage-pace/test.ts
```

Covers the two payload parsers, pace math, clamping and the countdown formatter.

## Credit

Auth discovery and the two usage endpoints are adapted from [`@ogulcancelik/pi-minimal-footer`](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-minimal-footer) (MIT).
