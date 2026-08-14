# handoff

`/handoff <goal>` starts a new session, linked to the current one as its parent, pre-filled with an LLM-written brief: decisions made, files touched, findings, next task. `/compact` is the lossy alternative that keeps you in the same session.

```
/handoff now implement this for teams as well
/handoff execute phase one of the plan
/handoff check other places that need this fix
```

The brief covers the current branch, prior compactions included, and opens in your editor for review before the new session spawns. Requires interactive mode and a selected model.

Vendored verbatim, no local changes, from the [pi examples](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/handoff.ts), at pi `0.84.2`. Resync by copying `examples/extensions/handoff.ts` out of the installed package.
