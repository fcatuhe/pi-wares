# agent-browser

House rules for the [`agent-browser`](https://github.com/vercel-labs/agent-browser) CLI, as defaults rather than prose: one browser session per pi process, one saved login per directory, headless without the headless tells, and credentials only ever typed by you.

Loads when the binary is on `PATH`, and contributes [`SKILL.md`](./SKILL.md) through `resources_discover`, so the skill appears exactly when the ware is enabled. Nothing is injected into the system prompt: the defaults are environment, and the skill is read on demand.

A session that never browses pays nothing. Setup costs three execs and four writes, and it is deferred until a `bash` tool call or a `!` command mentions `agent-browser`, or the agent calls `browser_login`, or you run one of the two commands. It is single-flight, so two agent commands arriving together still configure once, and a `/resume` into another directory re-derives the sessions on next use.

## Two sessions

| Session | Who drives it | Auth |
|---|---|---|
| `pi-<cwd hash>` | you, in a real Chrome window, via `browser_login` | starts from the saved state, the only writer of it |
| `pi-<cwd hash>-<pid>` | the agent, every command | starts from the saved state, never writes it |

The work session name is derived from the working directory (`agent-browser session id --scope cwd`), so it is stable across turns and works outside a git repo, plus the pi pid, so two pi instances in the same directory never share a browser. Nothing is claimed, locked or negotiated: agents never touch the login session, so it is free the moment you need it.

The agent's session cannot write the saved login even by accident: only `browser_login` writes that file, and the agent's own state is loaded, never saved. Cookies a site refreshes during a run live and die with that session. That is what lets four agents share one login without corrupting it.

Neither session carries an agent-browser `--restore` key. The saved login is handed to the login window with `--state`, so there is one cookie store, in one place, with one writer. A restore key would keep a second copy under `~/.agent-browser/sessions/` that nothing here manages, and would have every command on the session reload and rewrite it.

## Logging in

The agent hits a wall and calls the `browser_login` tool with that URL. A real Chrome window opens on your screen, headed, in the login session. You log in, paste from your password manager, take the 2FA code, then close the window. The tool returns to the agent by itself, naming the cookie count, the domains, and which cookies the saved state did not have before.

Headed, because the headless viewport in the dashboard takes neither a paste nor a password manager, which is the whole reason a human is doing this.

The close is detected on the DevTools HTTP endpoint of that browser, on the page targets rather than on the browser: on macOS Chrome outlives its last window, so `/json/version` answers long after you closed it, while `/json/list` going empty is the close, on every platform. The window is then closed for real, so nothing of the login is left on your screen.

That probe is plain HTTP once a second and touches nothing. An `agent-browser` command is not free: against a headed browser it materialises a page target and drops it ~150ms later, one window flashing open and shut with your focus in it. So the state is saved when the page set changes, which is what a login is, plus once when the window goes: the session cookie is the last thing a login sets, and a state saved before it is an anonymous state that looks like a success. The snapshots only matter where closing the window kills Chrome outright and the final save cannot happen.

So the capture is compared against what was already saved, by cookie name and domain. Gained a name, it is committed and the new names are in the answer. Gained nothing, it is still committed, since a renewed login writes the same names, and the answer says no name was gained so the agent knows to check the wall. Came back with fewer cookies than the saved state, the file is left alone: that is a failed restore, and the saved state holds every other site you ever logged into. Cookies and local storage land in `~/.pi/agent/extensions/agent-browser/<login session>.json`, mode 600, written by rename, and are loaded into the running work session.

A confirmation dialog runs alongside the window and is the fallback for the case where the port cannot be read. Confirm it when you would rather leave the window open, cancel it and the saved state is untouched. Either way the wait stops after 15 minutes.

SSO, 2FA and a mid-task expiry are all of them this one path. No credential reaches the model context or the shell history.

`/browser-forget` is the way back out, and the inventory of where credentials are lying. It lists every login on this machine, one line each: the directory it belongs to, the cookie count, the token count, how many browsers are open on it, the age of the state.

```
pi-b12d043de9ce  ~/fcode/pi-wares, here  22 cookies, 6 tokens, 2 open, 3h old
pi-9f3a1c2b7d10  ~/work/checkout         11 cookies, 0 tokens, 0 open, 6d old
```

The login you are working in is first, then whichever holds the most cookies, which is where a cleanup starts. A login id is a hash of the directory it is keyed on, so a directory index is written next to the state files. Without it the list is a wall of hashes, and cleaning up means guessing.

Deleting one takes two deliberate steps, and neither is the default: pick it out of the list, then confirm a dialog that names the login, the directory, and every browser about to be closed. Escape at either point leaves everything alone. The list is what makes the second directory reachable at all, which is the point, an old checkout is exactly where a forgotten login sits, but it is also why the confirmation names the directory: an agent working there loses its login the moment you say yes.

On yes the browsers holding those cookies in memory are closed first, then the files go. Cookies are only half of a login: a token-based app keeps its bearer token in local storage, so the count reports tokens separately, and a cookie-only count would read zero over a live session. The state file is not the only copy either, since every snapshot taken on the way to a login is a full state file in the scratch directory, so those go too.

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
