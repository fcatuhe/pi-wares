# pi-wares

A small personal stash of extensions for [pi-coding-agent](https://github.com/badlogic/pi-mono) — slopware, forkware, freeware, all of the above.

Shipped as a single pi package. Install once, toggle individual wares on/off in `pi config`.

## Install

```bash
pi install ~/fcode/pi-wares          # local path, global
pi install ~/fcode/pi-wares -l        # local path, project-scoped
pi install git:github.com/<you>/pi-wares
pi -e ~/fcode/pi-wares                # try without installing (this run only)
```

Then `pi config` to enable/disable individual wares.

No `pi` manifest needed in `package.json` — pi auto-discovers everything in `extensions/` (and, when added later, `skills/`, `prompts/`, `themes/`).

## Wares

| Ware | What it does | Docs |
|---|---|---|
| `model-shortcuts` | Slash-command shortcuts for switching model + thinking level (`/opus`, `/glm:high`, ...) | [docs/model-shortcuts.md](./docs/model-shortcuts.md) |

More to come.

## Layout

```
pi-wares/
├── package.json              ← name: "pi-wares", no `pi` manifest (convention-based)
├── tsconfig.json
├── extensions/               ← pi auto-loads every .ts/.js file here
│   ├── model-shortcuts.ts
│   └── model-shortcuts.example.json   ← reference; pi ignores non-.ts files
└── docs/
    └── model-shortcuts.md    ← per-ware long-form docs
```

Adding a new ware = drop `extensions/<name>.ts` in. Optionally add `docs/<name>.md` and link it from the table above. That's it.

When a ware grows companion files that aren't extensions (skills, prompts, themes), add the matching convention dir (`skills/`, `prompts/`, `themes/`) — pi picks it up automatically. Switch to an explicit `pi` manifest in `package.json` only if you need non-default paths or filtering.

## License

MIT
