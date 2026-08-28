---
name: agent-browser
description: agent-browser CLI (browser automation) - drive headed Chrome on a shared logged-in profile, one pinned tab per agent. Use whenever a task needs a browser: opening a page, filling a form, clicking, screenshotting, extracting data, or any site that needs a login.
---

# agent-browser

```bash
agent-browser skills get core   # the snapshot / @eN ref loop, extraction, waits (--full adds every command)
```

`core` is the reference for *what to run*. This file overrides it on *how to launch and how to quit*.

Install: `npm i -g agent-browser && agent-browser install`.

## One Chrome, one tab per agent

Everything runs in one headed Chrome on the profile `agent-browser`, which holds the logins. Each agent works in its own tab.

**1. Start the browser.** Safe to re-run: `tab list` navigates nothing, and a second call reuses the running browser.

```bash
mkdir -p ~/.agent-browser && cp ~/.pi/agent/git/github.com/fcatuhe/pi-wares/skills/agent-browser/keeper.html ~/.agent-browser/keeper.html

agent-browser --session agent-browser \
  --profile ~/.agent-browser/profiles/agent-browser \
  --executable-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headed --pin-tab \
  --args "--disable-blink-features=AutomationControlled,--test-type,--no-first-run,--no-default-browser-check,--hide-crash-restore-bubble,file://$HOME/.agent-browser/keeper.html" \
  tab list
```

Run the block verbatim. Re-copy `keeper.html` every time, it is cheap and keeps the installed copy current. Chrome opens on it, the tab that holds the window open once every agent has left, and that `file://` startup URL is what keeps the window at one tab. `--disable-blink-features=AutomationControlled` keeps `navigator.webdriver` false, `--test-type` drops the yellow bad-flags bar that flag earns, `--hide-crash-restore-bubble` drops the "Restore pages?" bubble after a killed profile.

Chrome creates the profile directory on first use, logged out of every site. Ask the user to log in in the visible window, once, it persists.

**2. Attach on your own tab.** Only the first command needs `--cdp` and `--pin-tab`:

```bash
CDP=$(agent-browser --session agent-browser get cdp-url)
agent-browser --session <you> --cdp "$CDP" --pin-tab open https://example.com
agent-browser --session <you> snapshot -i
```

`<you>` is your own name for this task, `hire-friedbert` or `docs-review`, never one already in `session list`. **The session owns the tab**, one tab each, so two agents on one name overwrite each other.

`--pin-tab` starts you on a fresh tab. Unpinned, you adopt whichever tab is there: the keeper tab, or another agent's page.

**3. Close your tab when the task ends.** Not optional, the browser is shared:

```bash
agent-browser --session <you> tab close
agent-browser --session <you> close
rm -f ~/.agent-browser/<you>.config ~/.agent-browser/<you>.target
```

`close` leaves those two files behind, and a stale `.target` rebinds your next command to a dead tab.

## Rules

- Never `close --all`, never close a session or a tab you did not open, keeper tab included.
- Never navigate with the `agent-browser` session (`open`, `click`, `fill`). It follows whichever tab was opened last even under `--pin-tab`, so it can act on another agent's page. Reading it, `tab list` or `get cdp-url`, is safe.
- Never pass `--profile`, `--restore`, `--headed` or `--executable-path` on your own commands. A different flag set relaunches the browser under everyone.
- **Never `--restore` on a profile.** Two stores of auth, and the stale one overwrites the live cookies on launch, which logs the profile out.
- Never headless: the UA says `HeadlessChrome`, `screen` is 800x600, and a `--user-agent` override makes it worse, it empties `navigator.userAgentData.brands`, which no real Chrome does.
- Landing on a login page means the session expired. Ask the user to log in in the open window. Never ask for credentials, never type them.
- Launching steals macOS focus once, later commands do not. Leave the window visible so the user can watch and take over.

## When something is off

- Two agents starting the browser in the same second both fail with a daemon startup error. Wait a second and retry, one of them will already have it up.
- `tab_gone`, or a CDP connect refused: your tab or the whole window went away under you. Re-run step 1, then `agent-browser --session <you> tab new <url>` to rebind.
- `read <url>` fetches outside the browser, no profile cookies, so a logged-in site answers a login page or an error (LinkedIn: HTTP 999). Use `open` then `get text` or `snapshot`.
