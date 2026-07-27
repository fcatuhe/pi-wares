# usage-pace

Footer status showing the active subscription's usage as a bar with a **pace marker** and a reset countdown.

```
5h ━━┃─── 42% 3h    7d ━━━━┃─ 61% 2d
```

- `━` filled = percent of the window's quota used.
- `┃` = how far into the window we are (time elapsed).
- Fill **left** of the marker → under pace. Fill **past** it → burning quota faster than the clock.
- Trailing text = absolute usage percent + time until the window resets.

Bar color is pace, not absolute: green within 2 points of the clock, yellow up to 15 points ahead, red beyond. So 90% used with 10 minutes left is green; 30% used in the first 5 minutes is red.

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

`PI_USAGE_BAR_WIDTH` — bar cells per window, default `6`. Lower it on narrow terminals (the status competes with the path for width in `compact-footer`).

## Check

```bash
npx tsx extensions/usage-pace/test.ts
```

Asserts the two payload parsers, pace math, clamping and the countdown formatter against fixtures.

## Credit

Auth discovery and the two usage endpoints are adapted from [`@ogulcancelik/pi-minimal-footer`](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-minimal-footer) (MIT).
