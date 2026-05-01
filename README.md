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

| Ware | What it does |
|---|---|
| [`model-shortcuts/`](./extensions/model-shortcuts/) | Slash-command shortcuts for switching model + thinking level (`/opus`, `/glm:high`, ...) |
| [`compact-footer/`](./extensions/compact-footer/) | Squeezes pi's 3-line footer into 2 lines by merging statuses onto the path line. |
| [`clear-on-startup/`](./extensions/clear-on-startup/) | Clears the terminal (screen + scrollback) before pi's startup header. Fires once per pi process launch. |
| [`sidequests/`](./extensions/sidequests/) | Spawn N parallel, resumable pi sessions from one. Registers the `sidequest` tool, a generic `--name` flag, and a `session_start` naming hook. See [README](./extensions/sidequests/README.md) / [sidecar.md](./extensions/sidequests/sidecar.md). |
| [`skills/sidecar/`](./skills/sidecar/) | Skill: convention for `sidecar.md` handover notes — how the next agent reads them on arrival, when and what to write, how it differs from README and AGENTS. |

More to come.

## Layout

```
pi-wares/
├── package.json              ← name: "pi-wares", no `pi` manifest (convention-based)
├── tsconfig.json
├── extensions/               ← pi auto-loads every ware here
│   └── model-shortcuts/
│       ├── index.ts          ← entry point (required filename)
│       ├── example.json      ← reference; pi only loads index.ts
│       └── README.md         ← per-ware docs, co-located with code
└── skills/                   ← pi auto-loads every skill here
    └── sidecar/
        └── SKILL.md          ← skill entry (required filename)
```

**Discovery rules** (from pi-coding-agent's resource loader):

1. `extensions/*.ts` — flat file, loaded directly
2. `extensions/<name>/index.ts` — subfolder with `index.ts`, loaded as a single extension
3. `extensions/<name>/package.json` with `pi.extensions` — subfolder with explicit manifest

No recursion beyond one level. We use rule #2: each ware in its own folder, with `index.ts` as the entry. All other files in the folder (READMEs, example configs, sub-modules imported by `index.ts`) are ignored by discovery but live with the code.

**Adding a new ware** = `mkdir extensions/<name>`, add `extensions/<name>/index.ts`, add a row to the Wares table. That's it.

When a ware grows companion resource types (skills, prompts, themes), add the matching convention dir at the repo root (`skills/`, `prompts/`, `themes/`) — pi picks them up automatically. Switch to an explicit `pi` manifest in `package.json` only if you need non-default paths or filtering.

## License

MIT
