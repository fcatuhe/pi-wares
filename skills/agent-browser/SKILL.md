---
name: agent-browser
description: "agent-browser CLI (browser automation) - drive headed Chrome on a shared logged-in profile, one pinned tab per agent. Use whenever a task needs a browser: opening a page, filling a form, clicking, screenshotting, extracting data, or any site that needs a login."
---

# agent-browser

```bash
agent-browser skills get core   # the snapshot / @eN ref loop, extraction, waits (--full adds every command)
```

`core` is the reference for *what to run*. This file overrides it on *how to launch and how to quit*.

## Setup, once per machine

```bash
mise use -g "npm:agent-browser@latest"
~/.pi/agent/git/github.com/fcatuhe/pi-wares/skills/agent-browser/setup.sh
```

`setup.sh` writes `~/.agent-browser/config.json`: the browser binary for this OS, the profile that holds the logins, headed, pinned tabs, and the launch args. Every `agent-browser` command on the machine reads that file, which is why no agent ever passes a launch flag. It also seeds the profile's `Preferences` with the settings that silence Chrome's own interruptions: no translation offer, no password manager, no autofill. Permission prompts are denied by `--deny-permission-prompts`, which covers every permission type, where a pref covers one type each.

Re-run it when the browser moves or the OS changes. It refuses to run while the browser is up, because Chrome rewrites `Preferences` on exit and the new config fingerprint relaunches Chrome under everyone. Close the browser first.

A nag that survives is a Chrome *setting*, so it belongs in that prefs block, not in `args`. `--disable-features=Translate` is on the command line and the translate bubble appears anyway, `translate.enabled` in the prefs is what stops it. `args` is split on commas as well as newlines, so a flag carrying a comma (`--disable-features=A,B`) cannot go there at all: the tail becomes a positional argument and Chrome opens it as a URL.

The profile starts logged out of every site. Ask the user to log in in the visible window, once, it persists.

On Linux the binary is `/usr/bin/chromium`, which reads `~/.config/chromium-flags.conf`, so the agent browser inherits the machine's chromium defaults (on Omarchy: Wayland, keyring, the omarchy extensions). The window's `app_id` is `agent-browser`, which keeps it out of the stock browser window rules and gives a placement rule something to match. Writing that rule is an Omarchy config change, see the `omarchy` skill.

## One browser, one tab per agent

Everything runs in one headed browser on the profile `agent-browser`, which holds the logins. Each agent works in its own tab.

**1. Get the CDP url. Cold, this launches the browser.**

```bash
CDP=$(agent-browser --session agent-browser get cdp-url)
```

Safe to re-run: warm it prints the url of the running browser and navigates nothing. Cold it opens Chrome on `keeper.html`, the tab that holds the window open once every agent has left.

**2. Work on your own tab. Every command carries `--cdp "$CDP"`.**

```bash
agent-browser --session <you> --cdp "$CDP" --pin-tab open https://example.com
agent-browser --session <you> --cdp "$CDP" snapshot -i
```

`<you>` is your own name for this task, `hire-friedbert` or `docs-review`, never one already in `session list`. **The session owns the tab**, one tab each, so two agents on one name overwrite each other.

`--pin-tab` on the first command starts you on a fresh tab. Unpinned, you adopt whichever tab is there: the keeper tab, or another agent's page.

Drop `--cdp` on a later command and it does not attach, it launches: the second Chrome collides with the locked profile, exits, and leaves a stray keeper tab in the shared window.

**3. Close your tab when the task ends.** Not optional, the browser is shared:

```bash
agent-browser --session <you> --cdp "$CDP" tab close
agent-browser --session <you> --cdp "$CDP" close
rm -f "$XDG_RUNTIME_DIR"/agent-browser/<you>.*
```

`close` detaches your session only, the shared browser and the other agents survive it. It leaves session state behind, and a stale `.target` rebinds your next command to a dead tab.

## Rules

- Never `close --all`, never close a session or a tab you did not open, keeper tab included.
- Never use the `agent-browser` session for anything but step 1. It owns the browser process, `--cdp` on it hangs, and navigating with it acts on whichever tab was opened last, another agent's page included.
- Never pass `--profile`, `--restore`, `--headed`, `--executable-path` or `--args`. They live in `config.json`, and a different flag set relaunches the browser under everyone.
- **Never `--restore` on a profile.** Two stores of auth, and the stale one overwrites the live cookies on launch, which logs the profile out.
- Never headless: the UA says `HeadlessChrome`, `screen` is 800x600, and a `--user-agent` override makes it worse, it empties `navigator.userAgentData.brands`, which no real Chrome does.
- A repo that ships its own `agent-browser.json` overrides the user config for commands run from that directory. Run from elsewhere, or read it first.
- Landing on a login page means the session expired. Ask the user to log in in the open window. Never ask for credentials, never type them.
- Launching steals focus once on macOS, later commands do not. Leave the window visible so the user can watch and take over.

## When something is off

- Two agents starting the browser in the same second both fail with a daemon startup error. Wait a second and retry, one of them will already have it up.
- `tab_gone`, or a CDP connect refused: your tab or the whole window went away under you. Re-run step 1, then `agent-browser --session <you> --cdp "$CDP" tab new <url>` to rebind.
- A command that hangs with no output: your session daemon is wedged. `kill $(cat "$XDG_RUNTIME_DIR"/agent-browser/<you>.pid)`, remove `"$XDG_RUNTIME_DIR"/agent-browser/<you>.*`, then redo step 2. Never kill another session's daemon.
- `read <url>` fetches outside the browser, no profile cookies, so a logged-in site answers a login page or an error (LinkedIn: HTTP 999). Use `open` then `get text` or `snapshot`.
