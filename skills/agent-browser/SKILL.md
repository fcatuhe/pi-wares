---
name: agent-browser
description: agent-browser CLI (browser automation) - run headed Chrome and work in a session under ~/.agent-browser. Use whenever a task needs a browser - opening a page, filling a form, clicking, screenshotting, extracting data from a site, or working on a site that requires being logged in.
---

# agent-browser

The CLI serves its own guide:

```bash
agent-browser skills get core          # the snapshot / @eN ref loop, extraction, waits, troubleshooting
agent-browser skills get core --full   # plus full command reference
agent-browser skills list              # electron, slack, dogfood, derive-client, vercel-sandbox, agentcore
```

Read `core` first. The two rules below override it.

Install: `npm i -g agent-browser && agent-browser install`.

## Headed real Chrome

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_ARGS="--disable-blink-features=AutomationControlled"

agent-browser --executable-path "$CHROME" --headed --args "$CHROME_ARGS" ...
```

Headless is not an option: real Chrome refuses it ("Multiple targets are not supported in headless mode"), and agent-browser then falls back to its bundled Chrome for Testing, which announces `HeadlessChrome` to the server. Headed real Chrome reports a normal UA and screen size.

Leave the window visible so the run is watchable. Only launching steals macOS focus, later commands do not.

## Use an existing session

Sessions live in `~/.agent-browser`, and they are how a site stays logged in. Never the daily Chrome profile, never CDP `:9222`.

```bash
agent-browser session list            # running right now, attach to one of these
ls ~/.agent-browser/sessions          # saved logins, including sessions not running
```

Pick the one that matches the site and pass `--session <name>`. **If it is not obvious which one, ask.** Guessing wrong means either a logged-out browser or the wrong identity on the site. Only create a new session when the user says to.

`close` your own session when the task ends. Never `close --all`, it kills sessions you do not own.
