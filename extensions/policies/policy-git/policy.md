# Git Policy

## Commits

- Conventional Commits, types `feat|fix|ui|content|refactor|test|docs|perf|infra|deps`.
- One concern per commit. Small, reviewable diffs.
- English for everything in the repo and on GitHub: commits, branches, PRs, issues, reviews. Translated site content is content, not repo prose.
- Never commit or push unless asked. The permission covers the next command only, except a CI-fix instruction, which covers every push in that loop.

## Safety

- No destructive operation without consent: `reset --hard`, `clean`, `rm`, force push, branch deletion, history rewrite.
- Never push to `main` on your own initiative. Branch, then pull request. The owner merges. An explicit owner instruction in the current turn overrides this.

## GitHub CLI

- `gh pr view` / `gh pr diff` for pull requests. `gh run list` / `gh run view` for CI. `gh api .../comments --paginate` for review comments.
- Given an issue or PR URL, use `gh`. Never web search for it.
- Red CI: fix, push, repeat until green.

## Pull request bodies

Writing a PR description: read the `pr-description` skill first.
