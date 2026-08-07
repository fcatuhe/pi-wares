# model-shortcuts

Slash shortcuts for switching model and thinking level.

```
/off /minimal /low /medium /high /xhigh /max     Set thinking level
/opus  /sonnet  /glm  /kimi  ...                 Switch to a named model
/opus:high  /glm:off  /sonnet:medium             Switch model + thinking
```

Type `/glm:` and autocomplete lists the thinking levels that model actually supports.

## Configure

Shortcuts come from `~/.pi/agent/extensions/pi-model-shortcuts.json`. No project-local override: a repo that repointed `/opus` at a model of its choosing would be changing where your prompts go.

Top-level keys are the shortcut names, each value `{ provider, model, thinkingLevel? }`:

```json
{
  "opus": { "provider": "anthropic", "model": "claude-opus-5" },
  "gpt": { "provider": "openai-codex", "model": "gpt-5.6-sol" },
  "glm": { "provider": "fireworks", "model": "accounts/fireworks/models/glm-5p2", "thinkingLevel": "high" }
}
```

The set this repo runs with is [`config/pi/extensions/pi-model-shortcuts.json`](../../config/pi/extensions/pi-model-shortcuts.json), which `bin/wares-doctor` installs for you.

With `thinkingLevel` set, bare `/<name>` switches model and pins thinking. Explicit `/<name>:<level>` always wins. Names colliding with a thinking-level command (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) are ignored.

The config file keeps the `pi-model-shortcuts.json` name it had before this ware moved into `pi-wares`, so existing configs keep working. The filename is the config namespace, not the ware's identity.

## Behavior

- Loaded on every `session_start`, so `/reload` picks up edits.
- A missing config is normal and silent. A corrupt one logs the file and the parse error, then registers nothing: half your slash commands disappearing deserves a reason on the console.
- Parsing lives in [`shortcuts.ts`](./shortcuts.ts) with no pi imports, so [`test.ts`](./test.ts) exercises it without a session or a disk.
- Combos come from `getSupportedThinkingLevels`, so `/glm:xhigh` is not offered when glm has no `xhigh`. A model the registry cannot resolve at `session_start` falls back to the full list, and its commands report the lookup failure when run.
- A thinking level the model does not support clamps to the nearest one (`pi.setThinkingLevel`), and the notification reports the level that actually took effect: `/off` on a model that always thinks says `Thinking: minimal (off unsupported)`.
- Lookups go through `ctx.modelRegistry`, so anything registered by pi or another extension is reachable.
