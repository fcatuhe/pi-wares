# minimal-collapse

Makes pi's collapsed tool output more collapsed: each `read`, `bash`, `edit` and `write` call shows one line (`read ~/app/models/user.rb:10-40`, `$ npm test`, `write notes.md (12 lines)`) and no output, so the transcript reads as prompts and answers.

| Key | Does |
|---|---|
| `Ctrl+O` | pi's own toggle, collapsed and expanded, unchanged |
| `Alt+O` or `/minimal-collapse` | minimal collapse on or off, for every call already on screen too |

Minimal collapse is on at startup and replaces pi's collapsed view while on. Expanded is always pi's. A call that failed keeps its red background, and clicking a call expands it alone.

It re-registers the four tools from pi's own definitions (`createReadToolDefinition` and siblings), so the descriptions, system prompt snippets, guidelines and execution stay pi's, and only the collapsed rendering changes. Two limits follow from re-registering:

- `grep`, `find` and `ls` are left alone. pi activates every tool an extension registers, so wrapping them would switch on tools that `defaultTools` leaves off.
- The wrapped `bash` does not see the `shellCommandPrefix` or `shellPath` settings, which pi passes only to its own instance.

Started from pi's [`examples/extensions/minimal-mode.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/minimal-mode.ts), which replaced the renderers and descriptions wholesale.
