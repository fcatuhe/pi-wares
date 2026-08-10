# Git Policy

## Never commit or push unless told to

- No `commit`, no `push` without an explicit instruction in the current turn. Green tests, a finished feature, a tidy tree: none of those is permission. Stage the work as described below and say it is ready.
- Permission is spent once: it covers the commits named in that instruction, not the next batch. In doubt, ask, in one line.
- One exception: a CI-fix loop the owner asked for covers every push needed to get that run green.

## Branch and staging

- Branch as the repo asks (AGENTS.md, CONTRIBUTING, protected branches), before the first edit. No such rule: work on `main`.
- First pass done: stage the files you touched, and only those. Another agent may be working in the same tree. Staged is a review baseline, not a commit.
- Everything after that stays unstaged: follow-ups, review fixes, second thoughts. The unstaged diff is the owner's view of what changed since the baseline.
- Stage again only once the owner says they have seen the diff.

## Commits

- Conventional Commits, types `feat|fix|ui|content|refactor|test|docs|perf|infra|deps`.
- One concern per commit. Small, reviewable diffs.
- English for everything in the repo and on GitHub: commits, branches, PRs, issues, reviews. Translated site content is content, not repo prose.

## Safety

- No destructive operation without consent: `reset --hard`, `clean`, `rm`, force push, branch deletion, history rewrite.
- Push to `main` unless the repo says otherwise, and then it is branch, pull request, owner merges. An explicit owner instruction in the current turn overrides this.

## GitHub CLI

- `gh pr view` / `gh pr diff` for pull requests. `gh run list` / `gh run view` for CI. `gh api .../comments --paginate` for review comments.
- Given an issue or PR URL, use `gh`. Never web search for it.
- Red CI: fix, push, repeat until green.

## Pull request bodies

Writing a PR description: read the `pr-description` skill first.
