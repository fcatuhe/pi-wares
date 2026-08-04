# pi-wares

A small personal stash of extensions and skills for [pi-coding-agent](https://github.com/earendil-works/pi-mono), plus the pi and herdr config they assume.

## Requirements

pi itself, and [herdr](https://herdr.dev) for the terminal side of the setup:

```bash
curl -fsSL https://pi.dev/install.sh | sh
curl -fsSL https://herdr.dev/install.sh | sh
```

Both self-update afterwards, `pi update` and `herdr update`.

### External CLIs

Some skills drive CLIs this package does not install:

- **`gog`**: the [`gog` CLI](https://github.com/openclaw/gogcli), install per its README.
- **`outline-cli`**: `npm install -g @doist/outline-cli`
- **`agent-browser`**: `npm install -g agent-browser && agent-browser install` (the second command downloads its own Chrome). The skill is a stub pointing at `agent-browser skills get core`, so keep the CLI current: `npm i -g agent-browser` again to update.

### Credentials

Everything works out of the box except three skills:

- **`brave-search`** needs `BRAVE_API_KEY` in your shell profile. Free tier at [api-dashboard.search.brave.com](https://api-dashboard.search.brave.com/register): create a "Free AI" subscription (card required, not charged), then an API key.
- **`gog`** needs your own Google Cloud OAuth client: create a project in the [Google Cloud console](https://console.cloud.google.com/), enable the APIs you'll use (Gmail, Calendar, Drive, ...), create an OAuth "Desktop app" client, download its `credentials.json`, then `gog auth credentials set credentials.json` and `gog auth add you@example.com`. No env var in normal use.
- **`outline-cli`** needs `ol auth login` (OAuth, tokens expire) or `ol auth token <token>` with a personal API token from your Outline instance's Settings > API (doesn't expire, better for agents).

The extensions that touch provider auth (`pi-claude-wire`, `usage-pace`) reuse pi's own credentials (`/login`, `~/.pi/agent/auth.json`) and need no setup.

## Install

```bash
pi install git:github.com/fcatuhe/pi-wares
```

One package, individual wares toggled in `pi config`.

## Settings

[`config/`](./config/README.md) holds the pi and herdr configuration the wares assume. `bin/wares-doctor` compares this machine against it:

```bash
~/.pi/agent/git/github.com/fcatuhe/pi-wares/bin/wares-doctor
~/.pi/agent/git/github.com/fcatuhe/pi-wares/bin/wares-doctor --apply
```

Reports by default, exits non-zero when something is missing. `--apply` only ever adds: a key you set differently comes back as `kept`, files are backed up first, and edits splice into the existing text so comments and formatting survive.

## Wares

| Ware | What it does |
|---|---|
| [`model-shortcuts/`](./extensions/model-shortcuts/) | Slash shortcuts for model + thinking level: `/opus`, `/opus:high`, `/high`. |
| [`compact-footer/`](./extensions/compact-footer/) | Folds pi's 3-line footer into 2 by merging statuses onto the path line. |
| [`usage-pace/`](./extensions/usage-pace/) | Footer status: subscription usage bar, pace marker, reset countdown. |
| [`pi-claude-wire/`](./extensions/pi-claude-wire/) | Aliases extension tool names to `mcp__*` in Anthropic OAuth payloads at request time, so live schemas pass through untouched. |
| [`clear-on-startup/`](./extensions/clear-on-startup/) | Clears screen and scrollback once per pi launch. |
| [`rename-quit/`](./extensions/rename-quit/) | `/rename-quit` names the session from its transcript, then exits. |
| [`herdr-tab-title/`](./extensions/herdr-tab-title/) | Syncs the herdr tab label and the pi session name, both directions. |
| [`handoff/`](./extensions/handoff/) | `/handoff <goal>` starts a new linked session with an LLM-written brief. |
| [`gpt-behavior/`](./extensions/gpt-behavior/) | Appends a behavior guide to the system prompt, GPT models only. |
| [`policies/`](./extensions/policies/) | House rules in the system prompt: `always/` everywhere, `when/` per marker file. |

## Skills

Loaded on demand rather than injected, so they can be as long as they need to be. The always-on policies point at them.

| Skill | What it does |
|---|---|
| [`pr-description/`](./skills/pr-description/SKILL.md) | Section structure for a feature pull request body. Cited from `policies/when/git.md`. |
| [`brave-search/`](./skills/brave-search/SKILL.md) | Web search and page-to-markdown extraction through the Brave Search API. Needs `BRAVE_API_KEY`. |
| [`exa-search/`](./skills/exa-search/SKILL.md) | Web search and content extraction via Exa's keyless MCP endpoint. No key or browser needed. |
| [`gog/`](./skills/gog/SKILL.md) | Safe [`gog`](https://github.com/openclaw/gogcli) Google Workspace automation: auth state, JSON output, scoped reads and writes. |
| [`outline-cli/`](./skills/outline-cli/SKILL.md) | Search and manage [Outline](https://www.getoutline.com) wiki documents and collections via the [`ol`](https://github.com/Doist/outline-cli) CLI. Needs `ol` installed. |
| [`agent-browser/`](./skills/agent-browser/SKILL.md) | Browser automation via the [`agent-browser`](https://github.com/vercel-labs/agent-browser) CLI. Needs `agent-browser` installed. |

### Vendored skills

Copies of upstream skills, so one install covers them. They drift, resync deliberately.

| Skill | Upstream | Copied at |
|---|---|---|
| `brave-search/` | [badlogic/pi-skills](https://github.com/badlogic/pi-skills) (MIT) | `90bb51c`, minus the `npm install` setup step |
| `gog/` | [openclaw/gogcli](https://github.com/openclaw/gogcli) `.agents/skills/gog/` (MIT) | `v0.34.1`, verbatim. Track the installed `gog --version`: the skill documents flags the CLI only gained in that release. |
| `outline-cli/` | [Doist/outline-cli](https://github.com/Doist/outline-cli) (MIT), embedded in the CLI, written by `ol skill install pi` | `v1.10.2`, verbatim. Resync after `ol update` when the skill drifts: `ol skill install pi` regenerates it into `~/.pi/skills/`, diff and copy. |
| `agent-browser/` | [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) `skills/agent-browser/` (Apache-2.0) | `v0.33.2`, verbatim, Claude Code frontmatter (`allowed-tools`, `hidden`) included. A version-stable discovery stub: usage content comes from `agent-browser skills get core` at runtime, so it only drifts when upstream edits the stub itself. After a CLI update, diff against `$(npm root -g)/agent-browser/skills/agent-browser/SKILL.md`. |

Runtime deps sit in this package's `dependencies` rather than next to what needs them, so pi's install covers them and Node resolves them from the package root: `jsdom`, `turndown`, `turndown-plugin-gfm` and `@mozilla/readability` for `brave-search`, `jsonc-parser` and `toml-eslint-parser` for `bin/wares-doctor`.

## Bundled extensions

Third-party pi extensions folded in as npm `dependencies` and exposed through the `pi` manifest, so one install covers them. They show up individually in `pi config`.

| Package | What it does |
|---|---|
| [`token-rate-pi`](https://www.npmjs.com/package/token-rate-pi) | Footer status showing average output tokens/sec. |
| [`@ogulcancelik/pi-codex-subagents`](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-codex-subagents) | Codex-shaped, session-scoped subagents: templates, waits, steering, live overlay, per-spawn model routing, the last one [ours](https://github.com/ogulcancelik/pi-extensions/pull/21) and upstream since `0.3.3`. |

Caret ranges, so unpinned. `legacy-peer-deps=true` in this repo's `.npmrc` covers the `@earendil-works/*` and `typebox` peers, which pi provides at runtime. pi only re-runs `npm install` on a fresh install or when this repo's default branch gets a new commit, not on every `pi update`. Push a commit here, then `pi update --extensions` picks up newer bundled releases within the major.

### Subagent model routing

The subagents extension offers its per-spawn `model` and `thinking` arguments only when `~/.pi/agent/pi-codex-subagents/config.json` allows models, and it can read pi's own list instead of a second one:

```json
{ "modelsFromEnabledModels": true }
```

So `/models` stays the single approval list, resolved and availability-checked by pi itself. Exact extra routes can sit next to it as `"models": ["provider/model-id"]`. [`config/`](./config/README.md) ships this file, `bin/wares-doctor` writes it.

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
├── bin/                      ← wares-doctor, the machine setup check
├── config/                   ← the pi and herdr config it compares against
├── extensions/               ← every local ware
│   └── model-shortcuts/
│       ├── index.ts          ← entry point (required filename)
│       └── README.md         ← per-ware docs, co-located with code
├── skills/                   ← one folder per skill, each a SKILL.md
├── herdr-app/                ← macOS app that launches herdr, not a ware
└── node_modules/             ← bundled external extensions (gitignored)
```

Each ware is a folder with `index.ts` as its entry. Everything else in the folder is invisible to discovery and lives with the code.

**A new ware** is `mkdir extensions/<name>`, an `index.ts`, and a row in the table above. The manifest's `"extensions"` entry picks it up, no manifest edit.

**A new bundled extension** goes in `dependencies`, then its entry file under `pi.extensions` as `node_modules/<pkg>/...`, plus a row in the table above. That path is the whole reason this package declares an explicit manifest instead of relying on convention discovery.

## Checks

`npm test` runs every self-check (`pi-claude-wire`, `policies`, `usage-pace`, `bin`); CI runs it after `npm ci`. A new self-check is a `test.ts` next to what it covers plus an entry in the `test` script.

## License

MIT
