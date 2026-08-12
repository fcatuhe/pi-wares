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

**1. Start the browser, only if it is not already up.** Run it exactly like this, the `||` guard is load-bearing: a second `open about:blank` on a running browser blanks whatever tab is active, which may be another agent's page.

```bash
agent-browser session list | grep -q '^  agent-browser$' || \
agent-browser --session agent-browser \
  --profile ~/.agent-browser/profiles/agent-browser \
  --executable-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headed --pin-tab \
  --args "--disable-blink-features=AutomationControlled,--no-first-run,--no-default-browser-check" \
  open about:blank
```

Chrome creates the profile directory on first use. That first run is logged out of every site: ask the user to log in in the visible window, once. It persists from then on.

**2. Attach on your own tab.** Only the first command needs `--cdp` and `--pin-tab`:

```bash
CDP=$(agent-browser --session agent-browser get cdp-url)
agent-browser --session <tab> --cdp "$CDP" --pin-tab open https://example.com
agent-browser --session <tab> snapshot -i
agent-browser --session <tab> screenshot /tmp/page.png
```

`<tab>` is yours alone, named after the task. `--pin-tab` is what stops parallel agents from driving each other's page.

**3. Close your tab when the task ends.** Not optional, the browser is shared:

```bash
agent-browser --session <tab> tab close
agent-browser --session <tab> close
```

That detaches you and leaves the window up for everyone else.

## Rules

- Never `agent-browser close --all`, and never `close` a session you did not open.
- Never read or navigate with the `agent-browser` session. It owns the window, its `about:blank` tab keeps Chrome alive, and it follows whichever tab was opened last even under `--pin-tab`, so a command sent to it can land on another agent's page.
- Never pass `--profile`, `--restore`, `--headed` or `--executable-path` on your own commands. A different flag set relaunches the browser under everyone.
- **Never `--restore` on a profile.** Two stores of auth, and the stale one overwrites the live cookies on launch, which logs the profile out.
- Headless works but do not use it: the UA says `HeadlessChrome`, `screen` is 800x600. Overriding `--user-agent` makes it worse, it empties `navigator.userAgentData.brands`, which no real Chrome does.
- Landing on a login page means the session expired. Ask the user to log in in the open window. Never ask for credentials, never type them.
- Launching steals macOS focus once. Later commands do not. Leave the window visible so the user can watch and take over.

## When something is off

- Two agents starting the browser in the same second both fail with a daemon startup error. Wait a second and retry, one of them will already have it up.
- `tab_gone`: your tab was closed under you. `agent-browser --session <tab> tab new <url>` rebinds.
- Tab ids (`t1`, `t2`) are session-local, the same tab has different ids in different agents' lists. To point at another agent's tab, use `targetId` from `tab list --json`.
