# model-shortcuts

Slash commands that switch the thinking level, the model, or both.

```
/off /minimal /low /medium /high /xhigh /max     Set thinking level
/<name>                                          Switch to a named model
/<name>:<level>                                  Switch model and thinking
```

Type `/<name>:` and autocomplete lists the levels that model supports.

## Configure

Shortcuts come from `~/.pi/agent/model-shortcuts/config.json`, read at every session start, so `/reload` picks up edits. There is no project-level file, since a repo could otherwise repoint where your prompts go. Top-level keys are the shortcut names:

```json
{
  "<name>": { "provider": "<provider id>", "model": "<model id>" },
  "<other>": { "provider": "<provider id>", "model": "<model id>", "thinkingLevel": "high" }
}
```

The set this repo runs with is [`config/pi/model-shortcuts/config.json`](../../config/pi/model-shortcuts/config.json), installed by [`/wares-doctor`](../wares-doctor/).

With `thinkingLevel`, bare `/<name>` also sets thinking, and `/<name>:<level>` always wins. A name that is a thinking level (`off` through `max`) is ignored. A missing config registers nothing, silently. A corrupt one registers nothing and logs the file and the parse error.

## Behavior

A level the model does not support is clamped to the nearest one, and the notification names what took effect: `/off` on a model that always thinks says `Thinking: minimal (off unsupported)`. Models resolve through `ctx.modelRegistry`, so models registered by other extensions work. A model the registry cannot resolve at session start gets all seven level commands, and they report the lookup failure when run.
