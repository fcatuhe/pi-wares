# minimal-mode

Collapsed, a built-in tool call shows its one-line header (`read ~/app/models/user.rb:10-40`, `$ npm test`) and no output, so the transcript reads as prompts and answers. `Ctrl+O` expands every call to its full output, and back.

It re-registers `read`, `bash`, `edit`, `write`, `find`, `grep` and `ls` with its own renderers and delegates execution to the built-in tools. Tools from other extensions, `radio_call` or the subagents for example, keep their own renderers.

Vendored verbatim from pi's [`examples/extensions/minimal-mode.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/minimal-mode.ts), identical at pi 0.87.1. Resync by copying that file out of the installed package.
