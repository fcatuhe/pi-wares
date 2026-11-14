---
name: land
description: Land a pull request the owner merged. Watch the runs its merge commit started, deploys included, check the deployed app, clean up the worktree, the branch and the temp files, then close the Paseo session if all is green. Use when the owner says a PR is merged and asks to clean up, check the deploy, land it, or close the session.
---

# Land

The owner merges. You never merge here: you take over once the PR is merged.

## Run

1. Pick the PRs: the numbers the owner gave, else every PR this session opened or worked on that is now merged.
2. Run `./cli.ts <number>...` from this skill's folder, with the repository checkout as the working directory, and a tool timeout of 30 minutes. The deploy takes as long as it takes.

The script does the steps that need no judgement, one PR after another:

- It checks the PR is merged.
- It watches every run its merge commit started on a push, and reports the deploy and release jobs that ran.
- On green, it archives the PR's worktree through Paseo, or removes it with git outside Paseo, then deletes the local branch and prunes.
- It keeps a worktree with uncommitted changes, and a branch or worktree whose tip is not the PR head.
- On a failed run, it cleans up nothing.

Its exit status is the result. 0 means every PR landed, 1 means something stayed behind and its lines say what, and 2 means a command broke and its error is printed.

## After the script

- **Exit 1:** investigate before reporting. For a failed run, read `gh run view <id> --log-failed`. Leave everything in place, and keep the session open.
- **Exit 2:** report the error in full and keep the session open.
- **A deploy job ran:** check the app is up. Use the health check the repo documents, else `/up` on the host the deploy targets. Then look for new errors in the app's error tracker, when this session has its MCP.
- **Temp files:** delete what this session wrote under `/tmp`, such as PR body drafts and logs.

## Report

One line per PR: what ran on its merge commit, what deployed, what was cleaned. Then anything still open, such as follow-up issues or another session's work in the main checkout. Report before you close, since closing ends your turn.

## Close

Close only when the script exited 0, the app check passed and nothing is left to do. Inside Paseo, when `PASEO_AGENT_ID` is set, end with this last call:

```bash
paseo archive "$PASEO_AGENT_ID" --force
```

It archives this session, so its tab disappears. A tab still open after a land needs the owner. Outside Paseo, stop after the report.
