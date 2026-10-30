# pi-token-refresher

A systemd timer that refreshes pi's OAuth logins and MCP tokens 10 minutes before they expire, so the pi processes Paseo starts find valid tokens and never refresh one themselves.

OpenAI, badger and Outline rotate the refresh token on every refresh. A pi killed after the server rotated it, but before it saved the new pair, leaves the spent token on disk. The next pi sends it again and gets refused: badger also revokes the grant as a stolen token, and each needs a new sign-in. Every pi refreshes at startup: its provider logins with less than 5 minutes left, and its MCP tokens with less than 30 seconds. Paseo starts many short-lived pis, a probe before each agent it opens and the model catalog runs, and in a burst it SIGKILLs those that take more than two seconds to exit. [`pi-shutdown-workaround`](../paseo/extensions/pi-shutdown-workaround/) lets a pi finish its shutdown, but cannot outlast that SIGKILL. With this timer refreshing first, no pi has a token to refresh, and the one process that refreshes is never killed mid-refresh.

Every 3 minutes, `refresh.ts` does two things.

- **Provider logins** in `~/.pi/agent/auth.json`: an OAuth login that holds a refresh token and expires within 10 minutes is refreshed by pi itself, with `pi auth print-bearer-token --provider <id> --min-expiry 10m`, under pi's own lock. The token it prints is discarded. A long-lived token without a refresh token, such as Anthropic's `sk-ant-oat01`, is left alone.
- **MCP tokens** in `~/.pi/agent/mcp-auth.json`: pi has no command for these, so the script refreshes each entry that holds a refresh token and expires within 10 minutes as pi would: the same token endpoint, client, `resource` and scope. A server signed in with `"clientRegistration": "cimd"` refreshes as pi's client metadata document. It takes pi's own locks, `mcp-auth-refresh-<hash>.lock` around the refresh and `mcp-auth.json.lock` around each read and write, so it never refreshes alongside a pi.

A refused refresh keeps the stored tokens and fails the run: pi then refreshes or asks for sign-in as before, and `journalctl --user -u pi-token-refresher` says why.

The MCP half reads pi 1.4.0's storage: the `mcp__<server>|<url>` keys, `tokensExpireAt`, and the lock names. Check them again when pi changes its MCP OAuth code.

## Enable

```bash
cd ~/.pi/agent/git/github.com/fcatuhe/pi-wares/pi-token-refresher
systemctl --user link "$PWD/pi-token-refresher.service" "$PWD/pi-token-refresher.timer"
systemctl --user enable --now pi-token-refresher.timer
```

`pi update` keeps this path, so the timer runs the updated script.

## Check

```bash
systemctl --user list-timers pi-token-refresher.timer
journalctl --user -u pi-token-refresher -n 20
```
