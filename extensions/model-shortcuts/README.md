# model-shortcuts

Slash shortcuts for switching model and thinking level.

```
/off /minimal /low /medium /high /xhigh /max     Set thinking level
/opus  /sonnet  /glm  /kimi  ...                 Switch to a named model
/opus:high  /glm:off  /sonnet:medium             Switch model + thinking
```

Type `/glm:` and autocomplete lists the thinking levels that model actually supports.

## Configure

Shortcuts come from either file, project entries shallow-merging over global ones by name, same spirit as pi's `settings.json`:

- `~/.pi/agent/extensions/pi-model-shortcuts.json` global
- `<cwd>/.pi/extensions/pi-model-shortcuts.json` project-local

```jsonc
// global
{ "glm": { "provider": "fireworks", "model": "accounts/fireworks/models/glm-5p1" } }

// project: inherits provider and model, pins thinking only
{ "glm": { "thinkingLevel": "low" } }
```

Top-level keys are the shortcut names, each value `{ provider, model, thinkingLevel? }`. Copy [`example.json`](./example.json) to get started:

```json
{
  "opus":    { "provider": "anthropic",    "model": "claude-opus-4-7" },
  "gpt":     { "provider": "openai-codex", "model": "gpt-5.5" },
  "glm":     { "provider": "fireworks",    "model": "accounts/fireworks/models/glm-5p1", "thinkingLevel": "high" }
}
```

With `thinkingLevel` set, bare `/<name>` switches model and pins thinking. Explicit `/<name>:<level>` always wins. Names colliding with a thinking-level command (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) are ignored.

The config file keeps the `pi-model-shortcuts.json` name it had before this ware moved into `pi-wares`, so existing configs keep working. The filename is the config namespace, not the ware's identity.

## Behavior

- Loaded on every `session_start`, so `/reload` picks up edits.
- Combos come from `getSupportedThinkingLevels`, so `/glm:xhigh` is not offered when glm has no `xhigh`. A model the registry cannot resolve at `session_start` falls back to the full list, and its commands report the lookup failure when run.
- A thinking level the model does not support still clamps silently: `pi.setThinkingLevel` picks the nearest one.
- Lookups go through `ctx.modelRegistry`, so anything registered by pi or another extension is reachable.
