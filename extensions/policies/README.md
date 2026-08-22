# policies

House rules appended to the system prompt, byte-identical every turn so they cache once per session.

One policy is one extension, `policy-<name>/index.ts` plus its `policy.md`, so `pi config` enables and disables them one by one: keep the code ones, drop the writing style one, in any scope pi config offers. `policy.ts` holds the shared loader and `policies/` itself has no `index.ts`, so only the `policy-*` directories load.

| Policy | Loaded when |
|---|---|
| `policy-code-comment/` | always |
| `policy-engineering/` | always |
| `policy-writing-style/` | always |
| `policy-git/` | `.git` exists |
| `policy-frontend/` | a `.html`, `.erb` or `.slim` file exists in the project (vendored dirs excluded) |
| `policy-rails/` | `config/application.rb` exists |

Adding a policy: create `policy-<name>/` with a `policy.md` and an `index.ts` of `export default policy(import.meta.dirname)`, plus a marker argument if it is stack-specific. The `extensions/policies/policy-*` entry in the root `package.json` picks it up.

Markers are searched in cwd and every directory above it, never below. A workspace holding sibling repos sees only what its own root declares, so `cd` into the repo. One consequence of walking up: if `$HOME` is itself a repo, as with dotfiles, `policy-git` loads everywhere.

## Subagents

`subagent-policies/` loads every `policy-*` sibling through one entry point, because a spawned subagent starts with `--no-extensions --no-skills --no-context-files` and a 107-byte system prompt of its own. Its path, and [`comment-check`](../comment-check/)'s, are named in [`config/pi/pi-codex-subagents/config.json`](../../config/pi/pi-codex-subagents/config.json), so a spawn writes code under the same rules as the session that spawned it. Nothing loads this directory in the parent: it matches neither manifest glob, so no policy is injected twice.

One side effect, from the subagents extension: naming any `defaults.extensions` stops it passing the parent's tool list to the child, which then starts with pi's built-in tools instead of the inherited set.

## Injected, then enforced

A policy is read once per turn and enforced by nobody. Where a rule is mechanical, a checker at the moment of the edit does what a paragraph cannot: [`comment-check`](../comment-check/) blocks a write whose new comment lines break `policy-code-comment`.

## Inject or make it a skill

|  | Inject here | Skill |
|---|---|---|
| Trigger | repo-shaped, true for every edit in this repo | task-shaped, true a few times per feature |
| Cost of the model not reading it | silently wrong code, a force push | a mediocre draft you regenerate |
| Size | small, it is rent paid every turn | as big as it needs to be |

Anything bulky enough to be a skill gets a one-line pointer from the policy that covers its topic, which fixes skill discovery without paying for the skill.
