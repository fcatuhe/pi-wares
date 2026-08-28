---
name: agent-browser
description: agent-browser CLI (browser automation) - drive headed Chrome on a shared logged-in profile, one pinned tab per agent. Use whenever a task needs a browser - opening a page, filling a form, clicking, screenshotting, extracting data from a site, or working on a site that requires being logged in.
---

# agent-browser

The CLI serves its own guide, and it is the reference for what the page commands do:

```bash
agent-browser skills get core          # the snapshot / @eN ref loop, extraction, waits, troubleshooting
agent-browser skills get core --full   # plus full command reference
```

Read `core` for *what to run*. This file overrides it on *how to launch and how to quit*.

Install: `npm i -g agent-browser && agent-browser install`.

## One Chrome, one tab per agent

Everything runs in one headed Chrome on the profile `agent-browser`, which holds the logins. Each agent works in its own tab, named after its task.

**1. Start the browser.** Safe to run whether or not it is already up: `tab list` navigates nothing, and a second call reuses the running browser instead of relaunching it.

```bash
cp <this skill's directory>/keeper.html ~/.agent-browser/keeper.html

agent-browser --session agent-browser \
  --profile ~/.agent-browser/profiles/agent-browser \
  --executable-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headed --pin-tab \
  --args "--disable-blink-features=AutomationControlled,--no-first-run,--no-default-browser-check,--hide-crash-restore-bubble,file://$HOME/.agent-browser/keeper.html" \
  tab list
```

It prints the tabs, so you also see who else is working. Chrome opens on `keeper.html`, the page that tells the user what this window is, and that tab is what keeps the window alive when every agent has left. Copy it every time, it is cheap and it keeps the installed copy current.

That `file://` URL is Chrome's startup URL, and it is what keeps the window at one tab: without a URL Chrome opens its new tab page, which agent-browser skips as an internal target and replaces with a blank tab of its own, so the window starts at two tabs and both outlive every agent. `--hide-crash-restore-bubble` drops the "Restore pages?" bubble that Chrome shows after the profile was killed rather than closed.

Chrome creates the profile directory on first use. That first run is logged out of every site: ask the user to log in in the visible window, once. It persists from then on.

**2. Attach on your own tab.** Only the first command needs `--cdp` and `--pin-tab`:

```bash
CDP=$(agent-browser --session agent-browser get cdp-url)
agent-browser --session <you> --cdp "$CDP" --pin-tab open https://example.com
agent-browser --session <you> snapshot -i
agent-browser --session <you> screenshot /tmp/page.png
```

`<you>` is your own name for this task, `hire-friedbert` or `docs-review`. **The session is what owns a tab**, one tab per session, so two agents sharing a session name share a tab and overwrite each other. Never reuse a name from `session list`.

`--pin-tab` is what gets you a tab of your own: a pinned session always starts on a fresh tab, an unpinned one adopts whichever tab is there, which is the keeper tab or another agent's page.

**3. Close your tab when the task ends.** Not optional, the browser is shared:

```bash
agent-browser --session <you> tab close
agent-browser --session <you> close
rm -f ~/.agent-browser/<you>.config ~/.agent-browser/<you>.target
```

That detaches you and leaves the window up for everyone else. `close` leaves those two files behind, and the stale `.target` makes a later command rebind to a tab that no longer exists.

## Rules

- Never `agent-browser close --all`, and never `close` a session you did not open.
- Never navigate with the `agent-browser` session (`open`, `click`, `fill`). It owns the window, and it follows whichever tab was opened last even under `--pin-tab`, so it can act on another agent's page. Reading it, `tab list` or `get cdp-url`, is safe.
- Never pass `--profile`, `--restore`, `--headed` or `--executable-path` on your own commands. A different flag set relaunches the browser under everyone.
- **Never `--restore` on a profile.** Two stores of auth, and the stale one overwrites the live cookies on launch, which logs the profile out.
- Headless works but do not use it: the UA says `HeadlessChrome`, `screen` is 800x600. Overriding `--user-agent` makes it worse, it empties `navigator.userAgentData.brands`, which no real Chrome does.
- Landing on a login page means the session expired. Ask the user to log in in the open window. Never ask for credentials, never type them.
- Launching steals macOS focus once. Later commands do not. Leave the window visible so the user can watch and take over.

## When something is off

- Two agents starting the browser in the same second both fail with a daemon startup error. Wait a second and retry, one of them will already have it up.
- `tab_gone`, or a CDP connect refused: your tab or the whole window went away under you. Re-run step 1, then `agent-browser --session <you> tab new <url>` to rebind.
- A tab in the window that you did not open belongs to another agent or to the user. Read `tab list` if you like, never close it.
- Tab ids (`t1`, `t2`) are session-local, the same tab has different ids in different agents' lists. To point at another agent's tab, use `targetId` from `tab list --json`.
- `read <url>` fetches outside the browser, so it never sends the profile's cookies and a logged-in site answers with a login page or an error (LinkedIn returns HTTP 999). On any site that needs the login, `open` then `get text` or `snapshot`.
