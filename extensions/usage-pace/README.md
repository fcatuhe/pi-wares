# usage-pace

Footer status showing the active subscription's usage as a bar with a **pace marker** and a reset countdown.

```
5h ━━━╵── 42% 3h    7d ━━━━╵─ 61% 2d
```

- Light gray `─` = the whole window's quota (the track).
- Thick `━` = quota used so far.
- `╵` = how far into the window we are (time elapsed).
- Thick bar short of the marker → under pace. Past it → burning quota faster than the clock.
- Trailing text = absolute usage percent + time until the window resets.

## Color = pace, not usage

Color answers "will I run out before this window resets?", so a high absolute percent is not red by itself:

| Condition | Color |
|---|---|
| at or under pace, plus 2pts of jitter slack | green |
| up to 10 points beyond that | yellow |
| further ahead than that | red |
| less than 10% of quota left (`used% ≥ 90`) | red, regardless of pace |

40% of the week burned on day one is **yellow** — that rate exhausts it by Thursday. 92% used with 12 minutes left is **red** even though the pacing was perfect: there is no room left to spend at any rate.

## Providers

Whichever of these is the current model's provider:

| pi provider | Source |
|---|---|
| `anthropic` | `GET api.anthropic.com/api/oauth/usage` (5h + 7d windows) |
| `openai-codex` | `GET chatgpt.com/backend-api/wham/usage` (primary + secondary windows) |

Any other provider clears the status. Tokens come from `~/.pi/agent/auth.json`, falling back to the Claude Code macOS keychain entry and `$CODEX_HOME/auth.json`.

## Behavior

- Set via `ctx.ui.setStatus("usage", …)`, so the built-in footer, [`compact-footer`](../compact-footer/) and any other footer render it without extra wiring. `compact-footer` folds it onto its single status/path line.
- Polls every 5 minutes, plus immediately on session start/switch and model change. The countdown text therefore lags by up to 5 minutes.
- Last good snapshot is kept per provider, so a failed or timed-out (5s) request leaves the bar as-is instead of blanking it. No auth, no status.
- Both endpoints are unofficial. Any failure is swallowed and simply hides the segment.

## Config

- `PI_USAGE_BAR_WIDTH` — bar cells per window, default `6`. Lower it on narrow terminals (the status competes with the path for width in `compact-footer`).
- `PI_USAGE_MARKER` — pace marker glyph, default `╵` (half-height, keeps the bar flat). Set to `│` or `┼` if your font renders it badly.

## Check

```bash
npx tsx extensions/usage-pace/test.ts
```

Asserts the two payload parsers, pace math, clamping and the countdown formatter against fixtures.

## Credit

Auth discovery and the two usage endpoints are adapted from [`@ogulcancelik/pi-minimal-footer`](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-minimal-footer) (MIT).
