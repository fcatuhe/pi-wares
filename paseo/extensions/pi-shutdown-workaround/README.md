# pi-shutdown-workaround

A temporary workaround for a pi bug. In RPC mode, it lets pi finish a shutdown it has started, so a token refresh in flight is saved and the MCP server does not revoke the connection.

Paseo stops a pi process by closing its stdin and sending SIGTERM in the same tick, then SIGKILL two seconds later. A daemon restart does the reverse: systemd sends SIGTERM to every process, and stdin closes when the daemon dies. pi 1.4.0 starts its shutdown on the first trigger, and its `dispose()` waits for MCP token refreshes. The second trigger then ends the process at once: after stdin EOF, pi has already dropped its SIGTERM handler, so the signal kills it, and after SIGTERM, a second `shutdown()` call runs `process.exit()`.

A refresh is often in flight at that moment. Paseo starts a pi to probe its commands before it creates or resumes each agent, then closes it within a second, and that pi refreshes every MCP token that expired. Badger and Outline tokens last an hour. When pi dies mid-refresh, the server has already rotated the refresh token, the next pi sends the old one, badger revokes the grant as a stolen token, and Outline refuses it. Both then need a new sign-in.

Once stdin closes or SIGTERM arrives, the extension ignores the other trigger and later SIGTERMs, so `dispose()` finishes and pi exits by itself. Paseo's SIGKILL still ends a pi that hangs.

Delete it once pi's RPC mode lets a started shutdown finish (`packages/coding-agent/src/modes/rpc/rpc-mode.ts`, `shutdown()`).

`test.ts` drives `fixture.ts`, a copy of that shutdown, through both orders.

Inert outside RPC mode.
