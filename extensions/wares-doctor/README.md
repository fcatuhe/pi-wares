# wares-doctor

`/wares-doctor` compares this machine against the reference files in [`config/`](../../config/README.md) and prints one line per file into the transcript.

```text
/wares-doctor         # report what differs
/wares-doctor:apply   # write what is missing, keep what you set
/wares-doctor:force   # write that, and overwrite what differs
```

| Target | Reference in `config/` | Path | After a write |
|---|---|---|---|
| pi settings | `pi/settings.json` | `~/.pi/agent/settings.json` | restart pi |
| model shortcuts | `pi/model-shortcuts/config.json` | `~/.pi/agent/model-shortcuts/config.json` | `/reload` |
| subagents | `pi/pi-codex-subagents/config.json` | `~/.pi/agent/pi-codex-subagents/config.json` | restart pi |
| rails-review agent | `pi/pi-codex-subagents/agents/rails-review.md` | `~/.pi/agent/pi-codex-subagents/agents/rails-review.md` | restart pi |
| herdr | `herdr/config.toml` | `~/.config/herdr/config.toml` | `herdr server reload-config` |

`~/.pi/agent` follows `PI_CODING_AGENT_DIR` and `~/.config` follows `XDG_CONFIG_HOME`. A missing file is copied. JSON and TOML are compared key by key and edited in place, comments and order kept. The `.md` template is compared whole.

`:apply` only adds. A value you set differently is `kept`, and `:force` replaces it. Keys and array members the reference does not list always stay. A reference array is members to add, so `new_tab = "ctrl+alt+t"` against `["prefix+c", "ctrl+alt+t"]` becomes `["ctrl+alt+t", "prefix+c"]`. `:force` keeps a trailing comment next to a value it replaces, which may then describe the old one.

```text
2 to add. /wares-doctor:apply writes them.
  pi settings treeFilterMode = "no-tools"
  pi settings showCacheMissNotices = true
1 kept as yours. /wares-doctor:force takes the reference instead.
  pi settings defaultThinkingLevel "low" -> "high"
```

Warning color marks what a command closes. Error color marks `manual`, a TOML key the doctor cannot place or pin down, such as an inline table, left for you to edit. A TOML table array (`[[keys.command]]`) in a reference fails the run.
