---
name: agent-browser
description: "Browser automation with the agent-browser CLI: headed Chrome on a shared logged-in profile, one pinned tab per agent. Use whenever a task needs a browser: opening a page, filling a form, clicking, screenshotting, extracting data, or any site that needs a login."
---

# agent-browser

```bash
agent-browser skills get core   # the snapshot / @eN ref loop, extraction, waits (--full adds every command)
```

`core` says what to run. This file overrides it on how to launch and how to quit.

## Setup, once per machine

```bash
mise use -g npm:agent-browser
~/.pi/agent/git/github.com/fcatuhe/pi-wares/skills/agent-browser/setup.sh
```

`setup.sh` writes `~/.agent-browser/config.json` (browser binary for this OS, the profile holding the logins, headed, pinned tabs, launch args), which every `agent-browser` command reads, so no agent passes a launch flag. It also seeds the profile's `Preferences` to silence translation offers, the password manager and autofill. `--deny-permission-prompts` denies every permission prompt.

Re-run it when the browser moves or the OS changes. Close the browser first: it refuses to run while the browser is up, since Chrome rewrites `Preferences` on exit and a new config relaunches Chrome under everyone.

A Chrome nag that survives belongs in the prefs block of `setup.sh`, not in `args`: `--disable-features=Translate` does not stop the translate bubble, `translate.enabled` does. `args` splits on commas as well as newlines, so a flag containing a comma cannot go there: its tail opens as a URL.

The profile starts logged out everywhere. Ask the user to log in once in the visible window, it persists.

On Linux the binary is `/usr/bin/chromium`, which reads `~/.config/chromium-flags.conf` and so inherits the machine's chromium defaults. The window's `app_id` is `agent-browser`, for window placement rules. Writing such a rule on Omarchy is a config change, see the `omarchy` skill.

## One browser, one tab per agent

Everything runs in one headed browser on the profile `agent-browser`. Each agent works in its own tab.

1. Get the CDP url. Cold, this launches the browser on `keeper.html`, the tab that holds the window open once every agent has left. Warm, it prints the running browser's url and navigates nothing, so re-running is safe.

   ```bash
   CDP=$(agent-browser --session agent-browser get cdp-url)
   ```

2. Work on your own tab, every command carrying `--cdp "$CDP"`:

   ```bash
   agent-browser --session <you> --cdp "$CDP" --pin-tab open https://example.com
   agent-browser --session <you> --cdp "$CDP" snapshot -i
   ```

   `<you>` is your own name for this task, `hire-friedbert` or `docs-review`, never one already in `session list`: the session owns the tab, so two agents on one name overwrite each other. `--pin-tab` on the first command starts a fresh tab. Without it you adopt whatever tab is there, the keeper or another agent's page. A later command without `--cdp` launches a second Chrome instead of attaching: it collides with the locked profile, exits, and leaves a stray keeper tab.

3. Close your tab when the task ends. Not optional, the browser is shared:

   ```bash
   agent-browser --session <you> --cdp "$CDP" tab close
   agent-browser --session <you> --cdp "$CDP" close
   rm -f "$XDG_RUNTIME_DIR"/agent-browser/<you>.*
   ```

   `close` detaches only your session, the browser and the other agents survive. The `rm` clears the session state it leaves, since a stale `.target` rebinds your next command to a dead tab.

## Rules

- Never `close --all`. Never close a session or tab you did not open, keeper tab included.
- Use the `agent-browser` session for step 1 only. It owns the browser process, `--cdp` on it hangs, and navigating with it acts on the last opened tab, possibly another agent's.
- Never pass `--profile`, `--restore`, `--headed`, `--executable-path` or `--args`. They live in `config.json`, and a different flag set relaunches the browser under everyone.
- **Never `--restore` on a profile.** The stale auth store overwrites the live cookies on launch and logs the profile out.
- Never headless: the UA says `HeadlessChrome`, `screen` is 800x600, and a `--user-agent` override empties `navigator.userAgentData.brands`, which no real Chrome does.
- A repo with its own `agent-browser.json` overrides the user config for commands run from that directory. Run from elsewhere, or read it first.
- A login page means the session expired. Ask the user to log in in the open window. Never ask for credentials, never type them.
- On macOS the launch steals focus once, later commands do not. Leave the window visible so the user can watch and take over.

## When something is off

- Two agents starting the browser in the same second both fail with a daemon startup error. Wait a second and retry, one of them has it up by then.
- `tab_gone`, or CDP connect refused: your tab or the window went away. Re-run step 1, then `agent-browser --session <you> --cdp "$CDP" tab new <url>` to rebind.
- A command hangs with no output: your session daemon is wedged. `kill $(cat "$XDG_RUNTIME_DIR"/agent-browser/<you>.pid)`, remove `"$XDG_RUNTIME_DIR"/agent-browser/<you>.*`, redo step 2. Never kill another session's daemon.
- `read <url>` fetches outside the browser with no profile cookies, so a logged-in site returns a login page or an error (LinkedIn: HTTP 999). Use `open`, then `get text` or `snapshot`.
