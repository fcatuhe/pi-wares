# gpt-behavior

Appends a behavior guide to the system prompt, for GPT models only.

`behavior.md` is vendored verbatim from [Ogulcan Celik's gist](https://gist.github.com/ogulcancelik/b5bfd650acd7b93856fd20794c35db47): communication and reasoning directives (concise prose, direct instructions, non-sycophancy, ownership) that GPT models need spelled out more than Claude does, which is why it is gated here instead of dropped into a global `AGENTS.md`.

The current model is checked every turn, so switching mid-session toggles the guide from the next turn with no residue: the text only ever lives in that turn's system prompt, never in history. It is appended at the end and byte-identical every turn, so a stable-model session caches it once.

Detection is `provider === "openai"` or an id matching `/gpt/i`. GPT served through Azure, OpenRouter or a custom `models.json` entry matches only if `gpt` appears in its id. Adjust `isGpt()` if you route that way.

No config. No commands.
