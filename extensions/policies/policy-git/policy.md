# Git policy

## Never commit or push unless told to

- Never `commit` or `push` unless the owner tells you to in the current turn. Passing tests, a finished feature or a clean tree do not count as permission. Stage the work as described below and say it is ready.
- Permission covers only the commits named in that instruction, not the next batch. If in doubt, ask in one line.
- One exception: when the owner asks you to fix CI, you may push as often as needed to make the run pass.

## Branch and staging

- If the repo asks for branches (AGENTS.md, CONTRIBUTING, protected branches), create one before the first edit, then open a pull request for the owner to merge. Otherwise, work on `main` and push to it.
- Name a branch `<type>-<slug>`, with no `/`, as in `feat-exempt-user-role`.
- Create a worktree with `git wt <type>-<slug> [base]` or with `herdr_worktree_jump`. Both put it in `~/fcode/worktrees/<repo>/<branch>`. Never use `git worktree add`.
- In a new worktree, run the repo's setup first, as its AGENTS.md describes. The setup links files that git does not track, such as `config/master.key`.
- If `git wt` is missing, ask the owner, then run `git config --global --add include.path ~/.pi/agent/git/github.com/fcatuhe/pi-wares/config/git/config`.
- When the first pass is done, stage the files you touched, and only those. Another agent may be working in the same tree. The staged state is a baseline for review, not a commit.
- Leave everything after that unstaged, such as follow-ups, review fixes and second thoughts. The unstaged diff shows the owner what changed since the baseline.
- Stage again only after the owner says they have seen the diff.

## Commits

- Write Conventional Commits with the types `feat|fix|ui|content|refactor|test|docs|perf|infra|deps`.
- Keep one concern per commit, in a small diff that is easy to review.
- Write everything in the repo and on GitHub in English, including commits, branches, PRs, issues and reviews. Keep translated site content in its own language.

## Safety

- Never run a destructive operation without consent, such as `reset --hard`, `clean`, `rm`, a force push, deleting a branch or rewriting history.

## GitHub

- For an issue, PR or CI run URL, use `gh`, never a web search. Read PR review comments with `gh api .../comments --paginate`.
- Before you open a PR or write its title or description, read the `pull-request` skill.
