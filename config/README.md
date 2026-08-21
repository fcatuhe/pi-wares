# config

The pi and herdr configuration these wares assume, one file per target, laid out like the paths it lands in. [`/wares-doctor`](../extensions/wares-doctor/) compares a machine against these and, with `:apply`, adds what is missing, or with `:force`, also overwrites what differs.

| Reference | Target | Why it is here |
|---|---|---|
| [`pi/settings.json`](./pi/settings.json) | `~/.pi/agent/settings.json` | House defaults. `enabledModels` also feeds `model-shortcuts` and subagent routing. |
| [`pi/extensions/pi-model-shortcuts.json`](./pi/extensions/pi-model-shortcuts.json) | `~/.pi/agent/extensions/pi-model-shortcuts.json` | `/fable`, `/opus`, `/sonnet`, `/gpt`, in the same order as `enabledModels`. |
| [`pi/extensions/herdr-preview.json`](./pi/extensions/herdr-preview.json) | `~/.pi/agent/extensions/herdr-preview.json` | `auto`, so markdown pi writes takes over the `herdr-preview` split by itself. The extension defaults it off without this file, which is the right default for a machine that never met the doctor and the wrong one for ours. `direction` and `ratio` stay out, the extension's own defaults are the house ones. |
| [`pi/pi-codex-subagents/config.json`](./pi/pi-codex-subagents/config.json) | `~/.pi/agent/pi-codex-subagents/config.json` | Without `modelsFromEnabledModels`, the subagents extension silently drops its per-spawn `model` argument. The failure mode that made this directory exist. |
| [`herdr/config.toml`](./herdr/config.toml) | `~/.config/herdr/config.toml` | The keybindings and the `ctrl+alt+i` new-tab-running-pi command, plus `kitty_graphics` so pi can draw images. |

The herdr `[keys]` table is [omarchy's](https://github.com/basecamp/omarchy/blob/quattro/config/herdr/config.toml), which is itself omarchy's tmux config transposed, so one file serves both machines. It carries three layers: omarchy's `prefix+` chords, which work anywhere, omarchy's `alt+` chords, and a `ctrl+alt+` chord for each action macOS cannot reach through `alt`. No `cmd`, since Hyprland owns every super chord, and macOS Ghostty binds nothing at all on `ctrl+alt`.

Three things stand between Option and herdr on macOS. Ghostty turns `alt+left/right` into `esc:b` and `esc:f`, shell word motion, so they never arrive. Option composes a character out of every letter and digit, so `alt+1..9` never arrives either. Everything else composes nothing and does arrive: `alt+enter`, `alt+esc`, `alt+up/down`, `alt+shift+arrows` behave here exactly as on omarchy. The `ctrl+alt` layer covers the gap. Arrows are pane focus and resize on both machines, so what omarchy reaches with `alt+arrows` is `ctrl+alt` plus `hjkl` here: `h`/`l` walk the tabs, `k`/`j` the workspaces, `shift` moves the tab instead of walking to it. Creating, renaming and closing take the letter of the thing, `ctrl+alt+t/r/w` for a tab and the same with `shift` for a workspace, and `ctrl+alt+i` opens a new tab running pi.

Every scalar here holds omarchy's own value and every list holds its chords, so on an omarchy machine this reference only ever adds, `:force` included: a list of chords is merged member by member, never replaced. The same mechanism is why dropping a chord needs `herdr config reset-keys` first. It also means `~/.config/ghostty/config` no longer has to unbind anything for herdr, since nothing here rides on `cmd`.

`~/.pi/agent` follows `PI_CODING_AGENT_DIR` and `~/.config` follows `XDG_CONFIG_HOME` when either is set.

Editing a reference here changes what the doctor asks for on the next run. Adding a target means one entry in [`extensions/wares-doctor/doctor.ts`](../extensions/wares-doctor/doctor.ts)'s `targets()`, and a `[[keys.command]]`-style table array needs its identity field declared there too, the field that decides whether an entry already exists.

The doctor only ever adds. A key already set to something else is reported and kept, so taste in these files lands on a machine that has no opinion yet and nowhere else.
