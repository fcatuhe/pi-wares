# agent-browser

House rules for the [`agent-browser`](https://github.com/vercel-labs/agent-browser) CLI, as defaults rather than prose: one browser session per pi process, one saved login per directory, headless without the headless tells, and credentials only ever typed by you.

Loads when the binary is on `PATH`, and contributes [`SKILL.md`](./SKILL.md) through `resources_discover`, so the skill appears exactly when the ware is enabled. Nothing is injected into the system prompt: the defaults are environment, and the skill is read on demand.

A session that never browses pays nothing. Setup costs three execs and four writes, and it is deferred until a `bash` tool call or a `!` command mentions `agent-browser`, or the agent calls `browser_login`, or you run one of the two commands. It is single-flight, so two agent commands arriving together still configure once, and a `/resume` into another directory re-derives the sessions on next use.

## Two sessions

| Session | Who drives it | Auth |
|---|---|---|
| `pi-<cwd hash>` | you, in a real Chrome window, via `browser_login` | `--restore`, the only writer of the saved state |
| `pi-<cwd hash>-<pid>` | the agent, every command | starts from the saved state, never writes it |

The work session name is derived from the working directory (`agent-browser session id --scope cwd`), so it is stable across turns and works outside a git repo, plus the pi pid, so two pi instances in the same directory never share a browser. Nothing is claimed, locked or negotiated: agents never touch the login session, so it is free the moment you need it.

The agent's session cannot write the saved login even by accident, because it holds no restore key. Cookies a site refreshes during a run live and die with that session. That is what lets four agents share one login without corrupting it.

## Logging in

The agent hits a wall and calls the `browser_login` tool with that URL. A real Chrome window opens on your screen, headed, in the login session. You log in, paste from your password manager, take the 2FA code, then close the window. The tool returns to the agent by itself, naming the cookie count and the domains it saved.

Headed, because the headless viewport in the dashboard takes neither a paste nor a password manager, which is the whole reason a human is doing this.

The close is detected on the DevTools HTTP endpoint of that browser: every `agent-browser` command relaunches a browser it cannot reach, so the port is the only honest liveness signal, and it is also why the state is snapshotted every 5 seconds while the window lives. What survives your closing the window is that last snapshot. Cookies and local storage land in `~/.pi/agent/extensions/agent-browser/<login session>.json`, mode 600, and are loaded into the running work session.

A confirmation dialog runs alongside the window and is the fallback for the case where the port cannot be read. Confirm it when you would rather leave the window open, cancel it and the saved state is untouched. Either way the wait stops after 15 minutes.

`/browser-login [url]` is the same flow, started by you. SSO, 2FA and a mid-task expiry are all of them this one path. No credential reaches the model context or the shell history.

`/browser-status` prints both sessions, which are live, the age of the saved login, the Chrome version and the artifacts directory.

## Headless, without the tells

Chrome announces headless in three places. The preset closes all three, and [`test.ts`](./test.ts) pins the strings:

- `navigator.webdriver`, cleared by `--disable-blink-features=AutomationControlled`.
- `HeadlessChrome` in the user agent, replaced by the real Chrome string for the installed version and platform.
- the client hints that the user agent override then wipes: `Sec-CH-UA` comes back through a generated config file, and `navigator.userAgentData` through a generated init script, both built from the same identity so the headers and the page agree.

It runs your real Google Chrome when it is installed, headless, rather than the Chrome for Testing build agent-browser downloads. That build lacks the proprietary codecs and the Google Chrome brand, and both are fingerprint signal: `canPlayType('video/mp4; codecs="avc1..."')` comes back empty on Chromium and `probably` on Chrome. The real binary gets its own user data directory, so your logged-in Chrome is untouched and both run at the same time.

Version and platform are read from what will actually run, not hardcoded: `chrome --version` for the real binary, `~/.agent-browser/browsers` for the downloaded fallback, `sw_vers` for the macOS release, since Chrome reports 26 where the kernel says Darwin 25.

Passes every check on `bot.sannysoft.com`. Two things to know about the real binary: enterprise policy applies to it, so a managed device brings its forced extensions and proxies along, and it updates itself, which is why the version is read at every session start. Set `AGENT_BROWSER_EXECUTABLE_PATH` or `executablePath` in an agent-browser config to choose your own binary and the ware leaves it alone.

## What it sets

Everything is an environment variable, set on pi's own process, so `bash`, `!` commands and subagents inherit identical defaults and no command needs a flag:

`AGENT_BROWSER_SESSION`, `AGENT_BROWSER_CONFIG`, `AGENT_BROWSER_EXECUTABLE_PATH`, `AGENT_BROWSER_USER_AGENT`, `AGENT_BROWSER_ARGS`, `AGENT_BROWSER_INIT_SCRIPTS`, `AGENT_BROWSER_HIDE_SCROLLBARS`, `AGENT_BROWSER_SCREENSHOT_DIR`, `AGENT_BROWSER_DOWNLOAD_PATH`, and `PI_BROWSER_STATE`.

`AGENT_BROWSER_CONFIG` replaces config discovery rather than layering on it, so `~/.agent-browser/config.json` and a project `agent-browser.json` are read and carried into the generated file. Their `args` and init scripts are appended to ours, not replaced.

The last name is ours, not the CLI's, and that is deliberate. In 0.33.2 a state path passed through `AGENT_BROWSER_STATE` or a config file drops the navigation: `open` reports success and the page sits on `about:blank`, with no error anywhere. Only `--state` works. So the state is applied once, with that flag, on the first `agent-browser` command of the session, and the name the CLI would pick up is left unset.

## Guard

A `bash` command aimed at the login session, or carrying `close --all` or `--auto-connect`, is blocked with a reason pointing at `browser_login`. Those three are the ways an agent destroys your login or another agent's browser, and prose does not hold on the twentieth turn.

## Artifacts

`~/.pi/agent/extensions/agent-browser/<work session>/` holds the generated config, the init script, screenshots and downloads. Removed when pi quits, and directories left by a crashed run are pruned after a day. Not under `TMPDIR`: the macOS cleaner deletes files there, and a launch pointing at a missing config aborts.

## Requires

`npm i -g agent-browser && agent-browser install`. The second is still worth running: it is the fallback when no Google Chrome is installed. Keep the CLI current: the skill defers to `agent-browser skills get core --full` for usage, which always matches the installed version.
