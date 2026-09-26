# pi-wares

A personal toolkit of extensions and skills for [pi-coding-agent](https://github.com/earendil-works/pi), plus the pi and herdr config they run on.

## Prerequisites

Node, pi and herdr (the terminal multiplexer pi runs in) all come from the mise registry:

```bash
mise use -g node pi herdr
```

## Install

```bash
pi install git:github.com/fcatuhe/pi-wares
```

One package, each ware toggled on or off in `pi config`. Update with `mise up`, then `pi update --all`.

Some skills drive CLIs this package does not install:

| CLI | Install | Then |
|---|---|---|
| [`agent-browser`](https://agent-browser.dev) | `mise use -g npm:agent-browser` | `~/.pi/agent/git/github.com/fcatuhe/pi-wares/skills/agent-browser/setup.sh`, which points it at the system Chrome or Chromium. |
| [`gog`](https://github.com/openclaw/gogcli) | `mise use -g github:openclaw/gogcli` | Create a Google Cloud OAuth "Desktop app" client, download its `credentials.json`, then `gog auth credentials set credentials.json` and `gog auth add you@example.com`. |
| [`ol`](https://github.com/Doist/outline-cli) | `mise use -g npm:@doist/outline-cli` | `ol auth token <token>` with a personal token from Outline's Settings > API. `ol auth login` works too, but its tokens expire. |

## Keys

`brave-search`, if you switch it on, needs `npm install` in its folder once and `BRAVE_API_KEY` in your shell profile: create a "Free AI" subscription at [api-dashboard.search.brave.com](https://api-dashboard.search.brave.com/register) (card required, not charged), then an API key.

## Configuration

[`config/`](./config/README.md) holds the reference pi and herdr config, and [`/wares-doctor`](./extensions/wares-doctor/) compares this machine against it:

```text
/wares-doctor         # report what is missing
/wares-doctor:apply   # add it, keeping the values you set
/wares-doctor:force   # add it, and overwrite what you set differently
```

A ware keeps its own config and state under `~/.pi/agent/<ware>/`.

## Login on a VPS

On a machine with no browser, [`subscription-token-login/`](./extensions/subscription-token-login/) adds a `Long-lived token (1 year, headless)` method to Anthropic's `/login`. Mint the token with `npx -y @anthropic-ai/claude-code@latest setup-token` on any machine that has Claude Code, then paste it.

## macOS app

[`herdr-app/`](./herdr-app/) builds `~/Applications/Herdr.app`, a Ghostty bundle rebranded as Herdr that opens straight into the herdr session. pi loads nothing from it: run `./herdr-app/build.sh` once per Mac, and again when the launcher or the logo changes.

## Wares

Each ware has a README beside its code.

### Footer

| Ware | What it does |
|---|---|
| [`compact-footer/`](./extensions/compact-footer/) | Folds pi's 3-line footer into 2 by merging statuses onto the path line. |
| [`subscription-usage-pace/`](./extensions/subscription-usage-pace/) | Footer status: subscription usage bar, pace marker, reset countdown. |
| [`token-rate/`](./extensions/token-rate/) | Footer status: output tokens per second of streaming, over the last 5 messages. |

### Subscription

| Ware | What it does |
|---|---|
| [`subscription-tool-alias/`](./extensions/subscription-tool-alias/) | Renames extension tools to `mcp__*` on the wire for OAuth subscription transports, and back before they execute. |
| [`subscription-web-search/`](./extensions/subscription-web-search/) | `websearch` and `webfetch` on the subscription token: search returns links, fetch reads one page and answers about it. |
| [`subscription-token-login/`](./extensions/subscription-token-login/) | Adds a `sk-ant-oat01` token method to Anthropic's `/login`: one paste, good for a year. |
| [`subscription-switch/`](./extensions/subscription-switch/) | `/subscription-switch` moves pi between Anthropic subscriptions, picked by email. |

### Herdr and sessions

| Ware | What it does |
|---|---|
| [`herdr-tab-title/`](./extensions/herdr-tab-title/) | Syncs the herdr tab label and the pi session name, both directions. |
| [`auto-session-name/`](./extensions/auto-session-name/) | Names an unnamed session `two-words` with haiku after the first turn, once. |
| [`radio/`](./extensions/radio/) | `radio_call` calls another agent session on this machine: the message lands in its transcript as a named peer, not as its owner typing. |
| [`model-shortcuts/`](./extensions/model-shortcuts/) | Slash shortcuts for model and thinking level: `/<name>`, `/<name>:high`, `/high`. |
| [`bang-zsh/`](./extensions/bang-zsh/) | Runs `!` commands in an interactive zsh, so your functions and aliases resolve. |

### Transcript

| Ware | What it does |
|---|---|
| [`minimal-collapse/`](./extensions/minimal-collapse/) | Collapsed tool calls shrink to one line with no output. `Alt+O` or `/minimal-collapse` switches it, `Ctrl+O` stays pi's expand. |

### Policies and style

| Ware | What it does |
|---|---|
| [`policies/`](./extensions/policies/) | House rules in the system prompt, one extension per policy so `pi config` toggles them one by one. |
| [`output-style/`](./extensions/output-style/) | `/output-style` switches the writing shape, Default for code and chat, Prose for content. |
| [`comment-check/`](./extensions/comment-check/) | Blocks a write or edit whose new comment lines break the code comment policy. |

### Doctor

| Ware | What it does |
|---|---|
| [`wares-doctor/`](./extensions/wares-doctor/) | `/wares-doctor` checks this machine against `config/`, `:apply` writes what is missing, `:force` also overwrites what differs. |

## Skills

Loaded on demand rather than injected, so they can be as long as they need. The policies point at them.

| Skill | What it does |
|---|---|
| [`pr-description/`](./skills/pr-description/SKILL.md) | Section structure for a feature pull request body. |
| [`agent-browser/`](./skills/agent-browser/SKILL.md) | Headed Chrome on a shared logged-in profile, one tab per agent, for the `agent-browser` CLI. |
| [`rails-review/`](./skills/rails-review/SKILL.md) | Rails review that cites the repo's own patterns, the gem source for the version in `Gemfile.lock`, and Fizzy, Campfire and Writebook. |

The [`/rails-review [base ref or paths]`](./prompts/rails-review.md) prompt sends a resolved scope, by default the uncommitted changes, to the [`rails-review`](./config/pi/pi-codex-subagents/agents/rails-review.md) subagent and reports what it found.

## Skills available

`skills-available/` sits outside the `pi` manifest, so nothing loads it. [`exa-search/`](./skills-available/exa-search/SKILL.md) (keyless Exa web search and extraction) and `brave-search/` (below) wait there as a second opinion to `subscription-web-search`, or for when it hits a rate limit.

Switch one on by naming its path in settings, since a `+` force-include in the package filter cannot reach a folder the manifest never lists:

```json
{
  "skills": ["~/.pi/agent/git/github.com/fcatuhe/pi-wares/skills-available/exa-search/SKILL.md"]
}
```

`pi --skill <path>` does the same for a single run.

## Vendored

Upstream copies, so one install covers them. They drift: resync deliberately.

| Ware | What it does | Upstream, copied at |
|---|---|---|
| [`extensions/handoff/`](./extensions/handoff/) | `/handoff <goal>` starts a new linked session with an LLM-written brief. | pi's [`examples/extensions/handoff.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/handoff.ts), verbatim, at pi `0.87.1`. |
| [`skills/gog/`](./skills/gog/SKILL.md) | Google Workspace automation through `gog`: auth state, JSON output, scoped reads and writes. | [openclaw/gogcli](https://github.com/openclaw/gogcli) `.agents/skills/gog/SKILL.md` (MIT), verbatim, at `v0.41.0`. Resync when `gog --version` moves. |
| [`skills/outline-cli/`](./skills/outline-cli/SKILL.md) | Search and manage [Outline](https://www.getoutline.com) documents and collections through `ol`. | [Doist/outline-cli](https://github.com/Doist/outline-cli) `skills/outline-cli/SKILL.md` (MIT), verbatim, at `v2.1.3`. Resync when `ol --version` moves. |
| [`skills-available/brave-search/`](./skills-available/brave-search/SKILL.md) | Web search and page-to-markdown extraction through the Brave Search API. | [badlogic/pi-skills](https://github.com/badlogic/pi-skills) `brave-search/` (MIT), verbatim, at `90bb51c`. Its own `package.json`: run `npm install` in the folder once before switching it on. |

## Bundled extensions

Third-party pi extensions installed as npm `dependencies` and listed in the `pi` manifest, each toggled on its own in `pi config`.

| Package | What it does |
|---|---|
| [`@ogulcancelik/pi-codex-subagents`](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-codex-subagents) | Session-scoped subagents: templates, waits, steering, live overlay, per-spawn model routing. |
| [`@ogulcancelik/pi-herdr-worktree-jump`](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-herdr-worktree-jump) | `herdr_worktree_jump` forks the session into a new herdr worktree, or back into the main checkout, in a pane of its own. |

Ranges are carets, and pi re-runs `npm install` only on a fresh install or a new commit on this repo's default branch: push one, then `pi update --extensions` picks up newer releases within the major.

The subagents' config and the `rails-review` template are machine state, shipped in [`config/`](./config/README.md) and written by `/wares-doctor`.

The worktree jump needs herdr 0.8.0, a herdr pane and a persisted session, and registers nothing otherwise. It moves only on request, since uncommitted changes stay behind in the old checkout.

## Development

Shared helpers live in `lib/`: pi does not load it, the wares import from it. Code is formatted by biome with 2-space indents (`npm run format`, checked in CI), and `npm test` runs every test.

```
pi-wares/
  package.json          pi manifest, bundled npm dependencies, scripts
  biome.json            formatter config
  config/               reference config wares-doctor compares against
  extensions/
    model-shortcuts/
      index.ts          entry point (required filename), pi API and fs
      shortcuts.ts      pure logic, no pi imports
      test.ts           self-check, run by npm test
      README.md         the ware's docs
  lib/                  shared helpers imported by the wares
  prompts/              one .md per slash command, filename is the command
  skills/               one folder per skill, each a SKILL.md
  skills-available/     same shape, unlisted: opt in by path
  herdr-app/            macOS app that launches herdr, not a ware
  node_modules/         bundled external extensions (gitignored)
```

`.npmrc` sets `legacy-peer-deps=true` because pi provides the `@earendil-works/*` and `typebox` peers at runtime.

## License

MIT
