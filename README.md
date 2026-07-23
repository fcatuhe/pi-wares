# pi-wares

A small personal stash of extensions for [pi-coding-agent](https://github.com/earendil-works/pi-mono) — slopware, forkware, freeware, all of the above.

Shipped as a single pi package. Install once, toggle individual wares on/off in `pi config`.

## Install

```bash
pi install ~/fcode/pi-wares          # local path, global
pi install ~/fcode/pi-wares -l        # local path, project-scoped
pi install git:github.com/<you>/pi-wares
pi -e ~/fcode/pi-wares                # try without installing (this run only)
```

Then `pi config` to enable/disable individual wares.

Installing pi-wares also pulls in a couple of external pi extensions (see [Bundled extensions](#bundled-extensions)) so a single install sets up the whole config.

## Wares

| Ware | What it does |
|---|---|
| [`model-shortcuts/`](./extensions/model-shortcuts/) | Slash-command shortcuts for switching model + thinking level (`/opus`, `/glm:high`, ...) |
| [`compact-footer/`](./extensions/compact-footer/) | Squeezes pi's 3-line footer into 2 lines by merging statuses onto the path line. |
| [`clear-on-startup/`](./extensions/clear-on-startup/) | Clears the terminal (screen + scrollback) before pi's startup header. Fires once per pi process launch. |
| [`gpt-behavior/`](./extensions/gpt-behavior/) | Appends a behavior guide to the system prompt, but only for GPT models. Vendored from [this gist](https://gist.github.com/ogulcancelik/b5bfd650acd7b93856fd20794c35db47). |
| [`handoff/`](./extensions/handoff/) | `/handoff <goal>` — LLM-summarize the current branch and start a new linked session pre-filled with a focused prompt. Vendored from [pi examples](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/handoff.ts). |
| [`sidequests/`](./extensions/sidequests/) | Spawn N parallel, resumable pi sessions from one (with follow-up turns on existing ones). Registers the `sidequests` tool, a generic `--name` flag, and a `session_start` naming hook. See [README](./extensions/sidequests/README.md) / [sidecar.md](./extensions/sidequests/sidecar.md). |

More to come.

## Bundled extensions

pi-wares folds in a couple of third-party pi extensions as npm `dependencies`, exposed through the `pi` manifest's `node_modules/…` paths. They install automatically with pi-wares and show up individually in `pi config`.

| Package | What it does |
|---|---|
| [`@benvargas/pi-claude-code-use`](https://www.npmjs.com/package/@benvargas/pi-claude-code-use) | Patch Anthropic OAuth payloads for Claude Code-style subscription use. |
| [`token-rate-pi`](https://www.npmjs.com/package/token-rate-pi) | Footer status showing average output tokens/sec. |

Versions use caret ranges (`^1.0.0`), so they are **not** pinned. Because pi-wares is installed as an unpinned git package, pi only re-runs `npm install` (and therefore re-resolves these ranges to the latest matching release) on a fresh install **or when this repo's default branch gets a new commit** — not on every `pi update`. Push any commit here, then `pi update --extensions` picks up newer bundled releases within the major.

To publish pi-wares to npm instead of git, add these to `bundledDependencies` so they ship inside the tarball.

## Layout

```
pi-wares/
├── package.json              ← `pi` manifest + bundled npm dependencies
├── extensions/               ← every local ware, listed via the manifest
│   └── model-shortcuts/
│       ├── index.ts          ← entry point (required filename)
│       ├── example.json      ← reference; pi only loads index.ts
│       └── README.md         ← per-ware docs, co-located with code
└── node_modules/             ← bundled external extensions (gitignored)
```

We use an explicit `pi` manifest because we reference bundled extensions by `node_modules/…` path. A manifest directory entry (e.g. `"extensions"`) still gets the same smart discovery as convention mode:

1. `extensions/*.ts` — flat file, loaded directly
2. `extensions/<name>/index.ts` — subfolder with `index.ts`, loaded as a single extension
3. `extensions/<name>/package.json` with `pi.extensions` — subfolder with explicit manifest

No recursion beyond one level. We use rule #2: each ware in its own folder, with `index.ts` as the entry. All other files in the folder (READMEs, example configs, sub-modules imported by `index.ts`) are ignored by discovery but live with the code.

**Adding a new ware** = `mkdir extensions/<name>`, add `extensions/<name>/index.ts`, add a row to the Wares table. The `"extensions"` manifest entry picks it up — no manifest edit needed.

**Adding a bundled external extension** = add it to `dependencies`, then add its entry file path under `pi.extensions` as `node_modules/<pkg>/…`, and a row to the Bundled extensions table.

## License

MIT
