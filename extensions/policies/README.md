# policies

House rules appended to the system prompt, identical every turn so they cache once per session. How to write lives in [`output-style`](../output-style/), which can switch.

Each policy is its own extension, `policy-<name>/index.ts` plus its `policy.md`, so `pi config` turns them on and off one by one.

| Policy | Covers | Loaded when |
|---|---|---|
| `policy-code-comment/` | when a comment is allowed and its shape | always |
| `policy-engineering/` | correctness, failure handling, trust boundaries, tests, hygiene | always |
| `policy-git/` | commit and push permission, staging, commit format | `.git` exists |
| `policy-frontend/` | semantic markup, vanilla CSS and JS, `@layer`, tokens, no inline JS | a `.html`, `.erb` or `.slim` file is in the repository |
| `policy-rails/` | Rails conventions | `config/application.rb` exists, or the repository has one at its root or one directory down |

A path marker is searched in cwd and every directory above it, never below. A file marker matches the files `git ls-files` lists for the repository cwd is in, tracked or untracked but never gitignored, so build output and dependencies do not count. Outside a repository nothing is listed, so a workspace of sibling repos only sees what its own root declares: `cd` into the repo. A repository with a Rails app in a subdirectory, as `website/`, loads `policy-rails` from anywhere in it, firmware sessions included. If `$HOME` itself is a git repository, `policy-git` loads everywhere.

To add one, create `policy-<name>/` with a `policy.md` and an `index.ts` of `export default policy(import.meta.dirname)`, plus a `paths` or `files` marker if it is stack-specific. The `extensions/policies/policy-*` entry in the root `package.json` picks it up. `policies/` itself has no `index.ts`, so only the `policy-*` directories load.

A policy costs tokens every turn, so it holds repo-wide rules whose neglect breaks code or history. Task-shaped or bulky guidance is a skill, with a one-line pointer from the policy that covers its topic.

A policy is read, not enforced. Where a rule is mechanical, a checker at edit time holds it: [`comment-check`](../comment-check/) refuses comments that break `policy-code-comment`.

## Subagents

A spawned subagent starts with `--no-extensions`, so `subagent-policies/` loads every `policy-*` sibling through one path, named next to `comment-check` and `output-style` in [`config/pi/pi-codex-subagents/config.json`](../../config/pi/pi-codex-subagents/config.json). It matches neither manifest glob, so the parent never loads a policy twice. Naming any `defaults.extensions` there also stops the subagents extension passing the parent's tool list, so a child starts with pi's built-in tools.
