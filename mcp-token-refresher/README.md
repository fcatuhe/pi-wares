# mcp-token-refresher

A systemd timer that refreshes pi's MCP OAuth tokens 10 minutes before they expire, so the pi processes Paseo starts find a valid token and never refresh one themselves.

badger and Outline rotate the refresh token on every refresh. A pi killed after the server rotated it, but before it saved the new pair, leaves the spent token in `~/.pi/agent/mcp-auth.json`. The next pi sends it again, badger revokes the grant as a stolen token, Outline refuses it, and both need a new sign-in. Paseo starts many short-lived pis, a probe before each agent it opens and the model catalog runs, and in a burst it SIGKILLs those that take more than two seconds to exit. [`pi-shutdown-workaround`](../paseo/extensions/pi-shutdown-workaround/) lets a pi finish its shutdown, but cannot outlast that SIGKILL. pi only refreshes in the last 30 seconds before expiry, so with this timer it no longer refreshes at all, and the one process that does is never killed mid-refresh.

Every 3 minutes, `refresh.ts` refreshes each entry of `mcp-auth.json` that holds a refresh token and expires within 10 minutes, as pi would: the same token endpoint, client, `resource` and scope. A server signed in with `"clientRegistration": "cimd"` refreshes as pi's client metadata document. It takes pi's own locks, `mcp-auth-refresh-<hash>.lock` around the refresh and `mcp-auth.json.lock` around each read and write, so it never refreshes alongside a pi. A refused refresh keeps the stored tokens and fails the run: pi then refreshes or asks for sign-in as before, and `journalctl --user -u mcp-token-refresher` says why.

It reads pi 1.4.0's storage: the `mcp__<server>|<url>` keys, `tokensExpireAt`, and the lock names. Check them again when pi changes its MCP OAuth code.

## Enable

```bash
cd ~/.pi/agent/git/github.com/fcatuhe/pi-wares/mcp-token-refresher
systemctl --user link "$PWD/mcp-token-refresher.service" "$PWD/mcp-token-refresher.timer"
systemctl --user enable --now mcp-token-refresher.timer
```

`pi update` keeps this path, so the timer runs the updated script.

## Check

```bash
systemctl --user list-timers mcp-token-refresher.timer
journalctl --user -u mcp-token-refresher -n 20
```
