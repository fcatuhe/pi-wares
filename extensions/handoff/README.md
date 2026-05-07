# handoff

Transfer context to a new focused pi session via `/handoff <goal>`.

Unlike `/compact` (lossy, same session), `/handoff` uses the LLM to extract
what matters for your next task — decisions made, files touched, key
findings — and starts a **new session** (linked to the current one as a
parent) pre-filled with a focused prompt you can review/edit before
submitting.

## Usage

```
/handoff now implement this for teams as well
/handoff execute phase one of the plan
/handoff check other places that need this fix
```

Flow:

1. Gathers the current branch's messages (respects prior compactions —
   includes the compaction summary plus everything kept after it).
2. Asks the current model to produce a self-contained handoff prompt
   (context + files + next task).
3. Opens the result in the editor for review.
4. Spawns a new session with `parentSession` set to the current one and
   pre-fills its editor with the prompt.

Requires interactive mode and a selected model.

## Origin

Vendored verbatim from the pi-coding-agent examples:

- <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/handoff.ts>

No local modifications.
