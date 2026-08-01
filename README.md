# pi-wares

A small personal stash of extensions for [pi-coding-agent](https://github.com/earendil-works/pi-mono).

## Install

```bash
pi install git:github.com/<you>/pi-wares
pi install ~/fcode/pi-wares           # local path, global
pi install ~/fcode/pi-wares -l        # local path, project-scoped
pi -e ~/fcode/pi-wares                # this run only, no install
```

One package, individual wares toggled in `pi config`.

## Wares

| Ware | What it does |
|---|---|
| [`model-shortcuts/`](./extensions/model-shortcuts/) | Slash shortcuts for model + thinking level: `/opus`, `/glm:high`, `/high`. |
| [`compact-footer/`](./extensions/compact-footer/) | Folds pi's 3-line footer into 2 by merging statuses onto the path line. |
| [`usage-pace/`](./extensions/usage-pace/) | Footer status: subscription usage bar, pace marker, reset countdown. |
| [`clear-on-startup/`](./extensions/clear-on-startup/) | Clears screen and scrollback once per pi launch. |
| [`rename-quit/`](./extensions/rename-quit/) | `/rename-quit` names the session from its transcript, then exits. |
| [`handoff/`](./extensions/handoff/) | `/handoff <goal>` starts a new linked session with an LLM-written brief. |
| [`gpt-behavior/`](./extensions/gpt-behavior/) | Appends a behavior guide to the system prompt, GPT models only. |
| [`policies/`](./extensions/policies/) | House rules in the system prompt: `always/` everywhere, `when/` per marker file. |

## Skills

Loaded on demand rather than injected, so they can be as long as they need to be. The always-on policies point at them.

| Skill | What it does |
|---|---|
| [`pr-description/`](./skills/pr-description/SKILL.md) | Section structure for a feature pull request body. Cited from `policies/when/git.md`. |
| [`brave-search/`](./skills/brave-search/SKILL.md) | Web search and page-to-markdown extraction through the Brave Search API. Needs `BRAVE_API_KEY`. |
| [`gog/`](./skills/gog/SKILL.md) | Safe [`gog`](https://github.com/openclaw/gogcli) Google Workspace automation: auth state, JSON output, scoped reads and writes. |

### Vendored skills

Copies of upstream skills, so one install covers them. They drift, resync deliberately.

| Skill | Upstream | Copied at |
|---|---|---|
| `brave-search/` | [badlogic/pi-skills](https://github.com/badlogic/pi-skills) (MIT) | `90bb51c`, minus the `npm install` setup step |
| `gog/` | [openclaw/gogcli](https://github.com/openclaw/gogcli) `.agents/skills/gog/` (MIT) | `v0.34.1`, verbatim. Track the installed `gog --version`: the skill documents flags the CLI only gained in that release. |

`brave-search`'s runtime deps (`jsdom`, `turndown`, `@mozilla/readability`) sit in this package's `dependencies` instead of its own `package.json`, so pi's install covers them and Node resolves them from the package root.

## Bundled extensions

Third-party pi extensions folded in as npm `dependencies` and exposed through the `pi` manifest, so one install sets up the whole config. They show up individually in `pi config`.

| Package | What it does |
|---|---|
| [`@benvargas/pi-claude-code-use`](https://www.npmjs.com/package/@benvargas/pi-claude-code-use) | Patches Anthropic OAuth payloads for Claude Code-style subscription use. Re-exported from [`extensions/claude-code-use/`](./extensions/claude-code-use/) so `pi config` labels it by name instead of `index.ts`. |
| [`token-rate-pi`](https://www.npmjs.com/package/token-rate-pi) | Footer status showing average output tokens/sec. |

Caret ranges, so unpinned. pi only re-runs `npm install` on a fresh install or when this repo's default branch gets a new commit, not on every `pi update`. Push a commit here, then `pi update --extensions` picks up newer bundled releases within the major.

## Terminal

We run pi through [herdr](https://herdr.dev), so the terminal is part of the setup rather than scenery around it.

| Folder | What it does |
|---|---|
| [`herdr-app/`](./herdr-app/) | Builds `~/Applications/Herdr.app`: a Ghostty bundle rebranded as Herdr, opening straight into the herdr session, with its own Dock icon and name. |

pi loads nothing from it. One `./herdr-app/build.sh` per machine, and again only when the launcher or the logo changes, not on Ghostty updates.

## Layout

```
pi-wares/
├── package.json              ← `pi` manifest + bundled npm dependencies
├── extensions/               ← every local ware
│   └── model-shortcuts/
│       ├── index.ts          ← entry point (required filename)
│       ├── example.json      ← reference; pi only loads index.ts
│       └── README.md         ← per-ware docs, co-located with code
├── herdr-app/                ← macOS app that launches herdr, not a ware
└── node_modules/             ← bundled external extensions (gitignored)
```

Each ware is a folder with `index.ts` as its entry. Everything else in the folder is invisible to discovery and lives with the code.

**A new ware** is `mkdir extensions/<name>`, an `index.ts`, and a row in the table above. The manifest's `"extensions"` entry picks it up, no manifest edit.

**A new bundled extension** goes in `dependencies`, then its entry file under `pi.extensions` as `node_modules/<pkg>/...`, plus a row in the table above. That path is the whole reason this package declares an explicit manifest instead of relying on convention discovery.

## License

MIT
