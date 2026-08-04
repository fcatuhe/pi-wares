# config

The pi and herdr configuration these wares assume, one file per target, laid out like the paths it lands in. `../bin/wares-doctor` compares a machine against these and, with `--apply`, adds what is missing.

| Reference | Target | Why it is here |
|---|---|---|
| [`pi/settings.json`](./pi/settings.json) | `~/.pi/agent/settings.json` | `enabledModels` is the one list both `model-shortcuts` and subagent routing read, so an empty one makes both look broken. The model and thinking defaults are house taste. Add a model here and the doctor asks for it; anything extra you enabled yourself stays. |
| [`pi/extensions/pi-model-shortcuts.json`](./pi/extensions/pi-model-shortcuts.json) | `~/.pi/agent/extensions/pi-model-shortcuts.json` | `/fable`, `/opus`, `/sonnet`, `/gpt`, in the same order as `enabledModels`. |
| [`pi/pi-codex-subagents/config.json`](./pi/pi-codex-subagents/config.json) | `~/.pi/agent/pi-codex-subagents/config.json` | Without `modelsFromEnabledModels`, the subagents extension silently drops its per-spawn `model` argument. The failure mode that made this directory exist. |
| [`herdr/config.toml`](./herdr/config.toml) | `~/.config/herdr/config.toml` | The keybindings and the `cmd+shift+i` new-tab-running-pi command, plus `kitty_graphics` so pi can draw images. |

`~/.pi/agent` follows `PI_CODING_AGENT_DIR` and `~/.config` follows `XDG_CONFIG_HOME` when either is set.

Editing a reference here changes what the doctor asks for on the next run. Adding a target means one entry in `bin/wares-doctor`'s `TARGETS`, and a `[[keys.command]]`-style table array needs its identity field declared there too, the field that decides whether an entry already exists.

The doctor only ever adds. A key already set to something else is reported and kept, so taste in these files lands on a machine that has no opinion yet and nowhere else.
