# model-shortcuts

Slash-command shortcuts for switching model + thinking level in [pi-coding-agent](https://github.com/badlogic/pi-mono).

```
/off  /minimal  /low  /medium  /high  /xhigh     Set thinking level
/opus  /sonnet  /glm  /kimi  ...                  Switch to a named model
/opus:high  /glm:off  /sonnet:medium              Switch model + thinking
```

Type `/glm:` and the autocomplete shows every thinking-level combo. Enter submits.

## Install

Ships as part of [`pi-wares`](../../README.md). Install the parent package and enable `model-shortcuts` in `pi config`.

An example config is provided at [`example.json`](./example.json) — copy it to `~/.pi/agent/extensions/pi-model-shortcuts.json` and edit.

## Configure

Define shortcuts in either file:

- `~/.pi/agent/extensions/pi-model-shortcuts.json` — global
- `<cwd>/.pi/extensions/pi-model-shortcuts.json` — project-local

Project entries shallow-merge over global entries by name (same semantics as pi-core's `settings.json` deep-merge), so a project file can override just one field of a global shortcut:

```jsonc
// global
{ "glm": { "provider": "fireworks", "model": "accounts/fireworks/models/glm-5p1" } }

// project — inherits provider + model from global, just pins thinking
{ "glm": { "thinkingLevel": "low" } }
```

> **Note on the `pi-model-shortcuts.json` filename.** The config file keeps its old name even though this ware lives under `pi-wares`, so existing user configs continue to work. The filename is the config namespace, not the ware's identity.

Schema: top-level keys are the shortcut names. Each value is `{ provider, model, thinkingLevel? }`.

```json
{
  "opus":    { "provider": "anthropic",    "model": "claude-opus-4-7" },
  "sonnet":  { "provider": "anthropic",    "model": "claude-sonnet-4-6" },
  "gpt":     { "provider": "openai-codex", "model": "gpt-5.5" },
  "kimi":    { "provider": "fireworks",    "model": "accounts/fireworks/models/kimi-k2p5" },
  "glm":     { "provider": "fireworks",    "model": "accounts/fireworks/models/glm-5p1",  "thinkingLevel": "high" },
  "minimax": { "provider": "fireworks",    "model": "accounts/fireworks/models/minimax-m2p7" },
  "kimit":   { "provider": "fireworks",    "model": "accounts/fireworks/routers/kimi-k2p5-turbo" }
}
```

`thinkingLevel` is optional. When set, the bare `/<name>` form switches model **and** pins thinking. The explicit `/<name>:<level>` form always wins.

Shortcut names that collide with thinking-level commands (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) are ignored.

## Behavior

- Shortcuts are loaded on each `session_start` (so `/reload` picks up edits).
- Models that do not support `xhigh` silently fall back to `high` for the `:xhigh` form.
- Model lookups go through `ctx.modelRegistry`, so any provider/model registered by pi-core or by another extension is reachable.

## Migration from `models.json`

Earlier versions of this extension read `aliases` and per-model `alias` directly from `~/.pi/agent/models.json`. Move them out:

```jsonc
// before — ~/.pi/agent/models.json
{
  "aliases": { "opus": "anthropic:claude-opus-4-7" },
  "providers": {
    "fireworks": {
      "models": [
        { "id": "accounts/fireworks/models/glm-5p1", "alias": "glm", ... }
      ]
    }
  }
}

// after — ~/.pi/agent/extensions/pi-model-shortcuts.json
{
  "opus": { "provider": "anthropic", "model": "claude-opus-4-7" },
  "glm":  { "provider": "fireworks", "model": "accounts/fireworks/models/glm-5p1" }
}
```

Then drop `aliases` from `models.json` and remove every `alias` field from model entries.
