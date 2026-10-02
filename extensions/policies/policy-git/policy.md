# Git policy

## Never commit or push unless told to

- No `commit`, no `push` without an explicit instruction in the current turn. Green tests, a finished feature, a tidy tree: none of those is permission. Stage the work as described below and say it is ready.
- Permission is spent once: it covers the commits named in that instruction, not the next batch. In doubt, ask, in one line.
- One exception: a CI-fix loop the owner asked for covers every push needed to get that run green.

## Branch and staging

- Branch as the repo asks (AGENTS.md, CONTRIBUTING, protected branches), before the first edit, then pull request and the owner merges. No such rule: work on and push to `main`.
- First pass done: stage the files you touched, and only those. Another agent may be working in the same tree. Staged is a review baseline, not a commit.
- Everything after that stays unstaged: follow-ups, review fixes, second thoughts. The unstaged diff is the owner's view of what changed since the baseline.
- Stage again only once the owner says they have seen the diff.

## Commits

- Conventional Commits, types `feat|fix|ui|content|refactor|test|docs|perf|infra|deps`.
- One concern per commit. Small, reviewable diffs.
- English for everything in the repo and on GitHub: commits, branches, PRs, issues, reviews. Translated site content is content, not repo prose.

## Safety

- No destructive operation without consent: `reset --hard`, `clean`, `rm`, force push, branch deletion, history rewrite.

## GitHub

- Given an issue, PR or CI run URL, use `gh`, never web search. PR review comments: `gh api .../comments --paginate`.
- Opening a PR, or writing its title or description: read the `pull-request` skill first.
