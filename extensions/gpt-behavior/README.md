# gpt-behavior

Appends a behavior guide to the system prompt, but only for GPT models.

`behavior.md` is vendored verbatim from Ogulcan Celik's gist:
<https://gist.github.com/ogulcancelik/b5bfd650acd7b93856fd20794c35db47>.
It is a set of communication/reasoning directives (concise prose, direct
instructions, non-sycophancy, ownership) that GPT models tend to need spelled
out more than Claude does — which is why it's gated rather than dropped into a
global `AGENTS.md`.

## How it works

On `before_agent_start`, the hook checks `ctx.model`. If the model is a GPT
model (`provider === "openai"`, or its id matches `/gpt/i`) it appends
`behavior.md` to the end of that turn's system prompt. Otherwise it returns
early and injects nothing.

The check runs every turn against the *current* model, so:

- **Pure GPT session** — appended every turn, consistently.
- **Pure non-GPT session** — never appended.
- **Switch mid-session** — toggles on/off starting the next turn. No residue:
  the injected text lives only in that turn's system prompt, never in history.
- **Resume (`pi -r`)** — extension reloads, evaluates the restored model on the
  next prompt.

## Caching

Cache-friendly. The text is appended to the *end* of the system prompt and is
byte-identical every turn, so within a stable-model session it's cached once and
reused. Switching models busts cache on its own (per-model cache), independent
of this ware. The only cold-every-turn case is switching models every single
turn, which is cold anyway.

## Caveats

Detection is `provider === "openai"` or an id containing `gpt`. A GPT model
served through a different provider (Azure, OpenRouter, a custom `models.json`
entry) is matched only if "gpt" appears in its id. Adjust `isGpt()` if you route
GPT through such a provider.

No config. No commands.
