# pi-wares

A personal toolkit of extensions and skills for [pi-coding-agent](https://github.com/earendil-works/pi-mono), plus the pi and herdr config they run on.

## Pre-requisites

```bash
curl -fsSL https://pi.dev/install.sh | sh     # pi
curl -fsSL https://herdr.dev/install.sh | sh  # herdr, the terminal multiplexer we run pi in
```

Update: `pi update --all`, `herdr update`.

## Install

```bash
pi install git:github.com/fcatuhe/pi-wares
```

One package, individual wares toggled in `pi config`.

## Configuration

[`config/`](./config/README.md) holds the pi and herdr configuration. [`/wares-doctor`](./extensions/wares-doctor/) compares this machine against it:

```text
/wares-doctor         # report what is missing
/wares-doctor:apply   # add it
/wares-doctor:force   # add it, and overwrite what you set differently
```

`:apply` only ever adds: a key you set differently comes back as `kept`, and every run names which ones. `:force` is the one that takes the reference over your value, key by key, leaving keys the reference never mentions alone. Edits splice into the existing text so comments and formatting survive. No backups, git holds the reference.

## macOS App

[`herdr-app/`](./herdr-app/) builds `~/Applications/Herdr.app`: a Ghostty bundle rebranded as Herdr, opening straight into the herdr session, with its own Dock icon and name.

pi loads nothing from it. One `./herdr-app/build.sh` per machine, and again only when the launcher or the logo changes, not on Ghostty updates.

## Login on VPS

Anthropic's `/login` has a second method here, `Long-lived token (1 year, headless)`, from [`anthropic-token-login/`](./extensions/anthropic-token-login/). One paste instead of an authorization round trip, and it lasts a year. Mint the [token](https://code.claude.com/docs/en/authentication) on any machine that has Claude Code:

```bash
npx -y @anthropic-ai/claude-code@latest setup-token
```

Then `/login`, Anthropic, that method, paste, and take or edit the offered rotation date, a year less a week. pi stores it as its own OAuth credential, so the usage bar and the wire aliasing behave as they do after a browser login, and the rotation date arrives as an error naming the mint command rather than an opaque 401.

One token can be pasted into as many boxes as you like, and the method works the same on a laptop.

## External CLIs

Some skills drive CLIs this package does not install:

- **`gog`**: the [`gog` CLI](https://github.com/openclaw/gogcli), install per its README. Needs your own Google Cloud OAuth "Desktop app" client: download its `credentials.json`, then `gog auth credentials set credentials.json` and `gog auth add you@example.com`.
- **`outline-cli`**: `npm i -g @doist/outline-cli`, then `ol auth token <token>` with a personal token from Settings > API. `ol auth login` also works, but those tokens expire.
- **`agent-browser`**: `npm i -g agent-browser && agent-browser install` (the second downloads its own Chrome).
- **`mdcat`**: `brew install mdcat`, the renderer [`herdr-preview`](./extensions/herdr-preview/) runs in its split.

## Keys

- **`brave-search`** needs `BRAVE_API_KEY` in your shell profile. Free tier at [api-dashboard.search.brave.com](https://api-dashboard.search.brave.com/register): create a "Free AI" subscription (card required, not charged), then an API key.

## Wares

| Ware | What it does |
|---|---|
| [`model-shortcuts/`](./extensions/model-shortcuts/) | Slash shortcuts for model + thinking level: `/opus`, `/opus:high`, `/high`. |
| [`compact-footer/`](./extensions/compact-footer/) | Folds pi's 3-line footer into 2 by merging statuses onto the path line. |
| [`usage-pace/`](./extensions/usage-pace/) | Footer status: subscription usage bar, pace marker, reset countdown. |
| [`token-rate/`](./extensions/token-rate/) | Footer status: output tokens per second of streaming, over the last 5 messages. |
| [`subscription-tool-alias/`](./extensions/subscription-tool-alias/) | Renames extension tools to `mcp__*` on the wire for OAuth subscription transports, and back before they execute. |
| [`subscription-web-search/`](./extensions/subscription-web-search/) | `websearch` and `webfetch` on the subscription token: search returns links, fetch reads one page and answers about it. |
| [`rename-quit/`](./extensions/rename-quit/) | `/rename-quit` names the session from its transcript, then exits. |
| [`bang-zsh/`](./extensions/bang-zsh/) | Runs `!` commands in an interactive zsh, so your functions and aliases resolve. |
| [`herdr-tab-title/`](./extensions/herdr-tab-title/) | Syncs the herdr tab label and the pi session name, both directions. |
| [`herdr-preview/`](./extensions/herdr-preview/) | `/preview:md` previews a markdown file in a herdr split, rendered and live. |
| [`handoff/`](./extensions/handoff/) | `/handoff <goal>` starts a new linked session with an LLM-written brief. |
| [`gpt-behavior/`](./extensions/gpt-behavior/) | Appends a behavior guide to the system prompt, GPT models only. |
| [`policies/`](./extensions/policies/) | House rules in the system prompt, one extension per policy so `pi config` toggles them one by one. |
| [`wares-doctor/`](./extensions/wares-doctor/) | `/wares-doctor` runs the machine setup check in-session, `/wares-doctor:apply` writes what is missing, `/wares-doctor:force` also overwrites what differs. |
| [`anthropic-token-login/`](./extensions/anthropic-token-login/) | Adds a `sk-ant-oat01` token method to Anthropic's `/login`: one paste, good for a year. |

## Skills

Loaded on demand rather than injected, so they can be as long as they need to be. The always-on policies point at them.

| Skill | What it does |
|---|---|
| [`pr-description/`](./skills/pr-description/SKILL.md) | Section structure for a feature pull request body. Cited from `policies/policy-git/`. |
| [`brave-search/`](./skills/brave-search/SKILL.md) | Web search and page-to-markdown extraction through the Brave Search API. Needs `BRAVE_API_KEY`. |
| [`exa-search/`](./skills/exa-search/SKILL.md) | Web search and content extraction via Exa's keyless MCP endpoint. No key or browser needed. |
| [`gog/`](./skills/gog/SKILL.md) | Safe [`gog`](https://github.com/openclaw/gogcli) Google Workspace automation: auth state, JSON output, scoped reads and writes. |
| [`outline-cli/`](./skills/outline-cli/SKILL.md) | Search and manage [Outline](https://www.getoutline.com) wiki documents and collections via the [`ol`](https://github.com/Doist/outline-cli) CLI. |
| [`agent-browser/`](./skills/agent-browser/SKILL.md) | Headed Chrome and an existing `~/.agent-browser` session for the [`agent-browser`](https://agent-browser.dev) CLI, which serves the usage guide itself. |

## Vendored skills

Copies of upstream skills, so one install covers them. They drift, resync deliberately.

| Skill | Upstream | Copied at |
|---|---|---|
| `brave-search/` | [badlogic/pi-skills](https://github.com/badlogic/pi-skills) (MIT) | `90bb51c`, minus the `npm install` setup step |
| `gog/` | [openclaw/gogcli](https://github.com/openclaw/gogcli) `.agents/skills/gog/` (MIT) | `v0.34.1`, verbatim. Documents flags the CLI only gained in that release, so track `gog --version`. |
| `outline-cli/` | [Doist/outline-cli](https://github.com/Doist/outline-cli) (MIT) | `v1.10.2`, verbatim. After `ol update`, `ol skill install pi` regenerates it into `~/.pi/skills/`: diff and copy. |

## Bundled extensions

Third-party pi extensions folded in as npm `dependencies` and exposed through the `pi` manifest, so one install covers them. They show up individually in `pi config`.

| Package | What it does |
|---|---|
| [`@ogulcancelik/pi-codex-subagents`](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-codex-subagents) | Codex-shaped, session-scoped subagents: templates, waits, steering, live overlay, per-spawn model routing, the last one [ours](https://github.com/ogulcancelik/pi-extensions/pull/21) and upstream since `0.3.3`. |

Caret ranges, so unpinned. pi only re-runs `npm install` on a fresh install or when this repo's default branch gets a new commit: push a commit here, then `pi update --extensions` picks up newer releases within the major. `.npmrc` sets `legacy-peer-deps=true` for the `@earendil-works/*` and `typebox` peers pi provides at runtime.

The subagents extension offers its per-spawn `model` and `thinking` arguments only when `~/.pi/agent/pi-codex-subagents/config.json` sets `"modelsFromEnabledModels": true`, which points it at pi's own list. So `/models` stays the single approval list. [`config/`](./config/README.md) ships that file, `/wares-doctor` writes it.

## Layout

```
pi-wares/
├── package.json              ← `pi` manifest + bundled npm dependencies
├── config/                   ← the pi and herdr config wares-doctor compares against
├── extensions/               ← every local ware
│   └── model-shortcuts/
│       ├── index.ts          ← entry point (required filename), pi API and fs live here
│       ├── shortcuts.ts      ← the pure half: parsing and formatting, no pi imports
│       ├── test.ts           ← `npx tsx extensions/<ware>/test.ts`, runs off the pure half
│       │                       `npm test` runs every extensions/*/test.ts, no registration
│       └── README.md         ← per-ware docs, co-located with code
├── skills/                   ← one folder per skill, each a SKILL.md
├── herdr-app/                ← macOS app that launches herdr, not a ware
└── node_modules/             ← bundled external extensions (gitignored)
```

## License

MIT
