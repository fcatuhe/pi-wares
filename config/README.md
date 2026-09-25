# config

The pi and herdr configuration these wares assume, one reference file per target, laid out like the paths it lands in. [`/wares-doctor`](../extensions/wares-doctor/) reports how a machine differs, `:apply` adds what is missing, `:force` also overwrites what differs.

| Reference | Target | Why it is here |
|---|---|---|
| [`pi/settings.json`](./pi/settings.json) | `~/.pi/agent/settings.json` | House defaults. `enabledModels` also feeds `model-shortcuts` and subagent routing. |
| [`pi/model-shortcuts/config.json`](./pi/model-shortcuts/config.json) | `~/.pi/agent/model-shortcuts/config.json` | One slash shortcut per enabled model, in the order of `enabledModels`. |
| [`pi/pi-codex-subagents/config.json`](./pi/pi-codex-subagents/config.json) | `~/.pi/agent/pi-codex-subagents/config.json` | Without `modelsFromEnabledModels` the subagents extension silently drops its per-spawn `model` argument. Without `defaults.extensions` a spawn starts with `--no-extensions` and writes code under no house policy. |
| [`pi/pi-codex-subagents/agents/rails-review.md`](./pi/pi-codex-subagents/agents/rails-review.md) | `~/.pi/agent/pi-codex-subagents/agents/rails-review.md` | The `rails-review` subagent: read-only tools, the `rails-review` skill, its prompt, and Opus at high thinking. `model: opus` is a pattern pi resolves to the newest undated Opus, and a caller's own `model` and `thinking` still win. |
| [`herdr/config.toml`](./herdr/config.toml) | `~/.config/herdr/config.toml` | The keybindings every machine agrees on, omarchy's `prefix+` chords plus pane focus and resize, then two `[ui]` defaults. |

JSON and TOML targets are reconciled key by key. The markdown template is one unit: copied when missing, reported when it differs, overwritten by `:force`.

The herdr reference holds only the bindings shared with [omarchy's](https://github.com/basecamp/omarchy/blob/quattro/config/herdr/config.toml), so each machine keeps its own bindings beyond those. A list of chords is merged member by member, never replaced, so dropping a chord needs `herdr config reset-keys` first.

`~/.pi/agent` follows `PI_CODING_AGENT_DIR` and `~/.config` follows `XDG_CONFIG_HOME` when set. The extension paths inside the subagents config are values, not targets, so they spell out `~/.pi/agent/git/github.com/fcatuhe/pi-wares/...`: move the agent directory and edit them by hand, or a spawn fails naming the missing path.

Editing a reference changes what the doctor asks for on the next run. Adding a target is one entry in `targets()` in [`extensions/wares-doctor/doctor.ts`](../extensions/wares-doctor/doctor.ts).
