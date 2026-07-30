# Git Policy

## Commits

- Conventional Commits, types `feat|fix|ui|content|refactor|infra|deps`.
- One concern per commit. Small, reviewable diffs.
- Never commit or push unless asked. The permission covers the next command only.

## Safety

- No destructive operation without consent: `reset --hard`, `clean`, `rm`, force push, branch deletion, history rewrite.
- Never push to `main`. Branch, then pull request. The owner merges.

## GitHub CLI

- `gh pr view` / `gh pr diff` for pull requests. `gh run list` / `gh run view` for CI. `gh api .../comments --paginate` for review comments.
- Given an issue or PR URL, use `gh`. Never web search for it.
- Red CI: fix, push, repeat until green.

## Pull request bodies

Writing a PR description: read the `pr-description` skill first.
