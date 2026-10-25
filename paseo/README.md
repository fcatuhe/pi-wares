# Paseo

What runs inside [Paseo](https://paseo.sh), the app that hosts these pi sessions. pi loads `extensions/` with the rest of the package. Paseo loads `plugins/` only once each plugin is installed on its daemon.

| Ware | Runs in | What it does |
|---|---|---|
| [`extensions/loadout/`](./extensions/loadout/) | pi | Inside Paseo, declares Paseo's agent, workspace and browser tools, and drops the subagents, the worktree jump, the radio and the `agent-browser` skill they replace. |
| [`plugins/page-scroll/`](./plugins/page-scroll/OVERVIEW.md) | Paseo app | Page Up and Page Down scroll the agent chat, even while the message box has focus. |

## Install a plugin

Turn on plugins once, in Settings, Plugins. Then install each plugin from the pi package, so `pi update` brings its new versions:

```bash
paseo plugin install ~/.pi/agent/git/github.com/fcatuhe/pi-wares/paseo/plugins/page-scroll
```

Paseo runs the plugin from that folder. After `pi update`, run `paseo plugin reload page-scroll` to load the new version.

## Develop a plugin

Each plugin is its own npm project, as `paseo plugin init` makes it. Its `devDependencies` are only for type checking, since Paseo supplies the runtime modules. `OVERVIEW.md` describes the plugin to the people who would install it.

```
plugins/page-scroll/
  paseo-plugin.json     id and supported Paseo versions
  index.client.ts       entry point Paseo loads in the app
  client/               app code: web.ts for the DOM, plain modules for the logic
  test/                 self-checks, run by the root npm test
  OVERVIEW.md           what the plugin does, for the plugin page
```

Install it from the working copy while you change it, then reload after each edit:

```bash
cd paseo/plugins/page-scroll && npm install && npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload page-scroll
```
