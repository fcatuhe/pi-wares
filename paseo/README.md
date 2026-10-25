# Paseo

What runs inside [Paseo](https://paseo.sh), the app that hosts these pi sessions. pi loads `extensions/` with the rest of the package.

| Ware | Runs in | What it does |
|---|---|---|
| [`extensions/loadout/`](./extensions/loadout/) | pi | Inside Paseo, declares Paseo's agent, workspace and browser tools, and drops the subagents, the worktree jump and the `agent-browser` skill they replace. |
