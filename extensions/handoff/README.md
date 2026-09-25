# handoff

`/handoff <goal>` starts a new session, linked to the current one as its parent, with an LLM-written brief of the decisions, files, findings and next task. `/compact` is the lossy alternative that stays in the same session.

```
/handoff now implement this for teams as well
/handoff execute phase one of the plan
/handoff check other places that need this fix
```

The brief covers the current branch, prior compactions included, and opens in your editor before the new session starts. It needs interactive mode and a selected model.

Vendored verbatim from pi's [`examples/extensions/handoff.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/handoff.ts), identical at pi 0.87.1. Resync by copying that file out of the installed package.
