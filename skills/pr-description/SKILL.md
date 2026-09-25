---
name: pr-description
description: Structure for a feature pull request body. Use when writing or rewriting a PR description, a merge request body, or a release note for a feature branch, and when asked to open a PR with gh.
---

# PR description

Fixed core structure. Conditional sections only when they carry information. Omit empty sections, never leave a heading with "N/A" under it.

Order: **Summary -> User flow -> Behavior changes -> Visual changes -> Implementation notes -> Design decisions -> Data and rollout -> Risks and edge cases -> Tests**.

| Section | Include | Content |
| --- | --- | --- |
| Summary | Always | The user problem, the new capability, the outcome. One short paragraph. |
| User flow | Usually | How the user enters, completes and exits the feature, including the exceptional paths. |
| Behavior changes | Always | Before and after, as a compact table. |
| Visual changes | Unless nothing is visible | Screenshots, see below. |
| Implementation notes | Always | The decisions behind the diff: data model, boundaries, framework mechanisms, integrations. Not a list of changed files. |
| Design decisions | When useful | Alternatives considered and why they lost. |
| Data and rollout | When applicable | Migrations, backfills, feature gates, configuration, compatibility, deployment order. |
| Risks and edge cases | Substantial features | Concurrency, permissions, failure behavior, recovery. |
| Tests | Always | Tested behavior by level, unit through system. |
| Screenshots footer | With images | The ref and folder the images live in. |

## Screenshots

Take screenshots for every PR a user can see: a screen, an email, a PDF, an error message. Skip them only when nothing visible changed (a refactor, a job, infra), and say so in one line.

Capture what a reviewer needs to see without running the branch:

- A new flow: every step in order, entry to exit, plus its exceptional paths (empty, error, denied).
- A changed screen: before and after, taken from the same data.
- Each viewport where the layout differs, phone included.

Before and after only for what existed before. A new flow has no before, show its steps.

## Where the images live

On the ref `refs/assets/github`, never on a branch. `git clone` fetches only branches and tags, so the images never reach anyone's clone. The ref also stays out of the branch list and out of the PR base and compare pickers.

One folder per thread that reads the files, number first so the folder is found from the thread: `pr/<number>-<branch>/` with every `/` of the branch turned into `-` (`pr/12-feat-todays-meetings-home/`), `issues/<number>-<title-slug>/`. Files numbered in display order: `01-home.png`, `02-home-phone.png`. PDFs and other files go in the same folder as the thread that links them.

The folder needs the PR number, so open the PR first, then push the images, then `gh pr edit <number> --body-file`.

Push without touching the working tree or the index:

```sh
ref=refs/assets/github
dir=pr/<number>-$(git branch --show-current | tr / -)
export GIT_INDEX_FILE=$(mktemp -d)/index
git fetch -q origin "+$ref:$ref"
git read-tree "$ref"
for f in shots/*.png; do
  git update-index --add --cacheinfo 100644,"$(git hash-object -w "$f")","$dir/$(basename "$f")"
done
commit=$(git commit-tree "$(git write-tree)" -p "$ref" -m "docs: screenshots for pull request <number>")
git push -q origin "$commit:$ref"
unset GIT_INDEX_FILE
```

First time in a repository, create the ref: `git push origin "$(git commit-tree "$(git mktree </dev/null)" -m 'docs: assets root')":refs/assets/github`.

Link each file by the commit SHA, through `/raw/`:

```
https://github.com/<owner>/<repo>/raw/<commit>/pr/<number>-<branch>/01-home.png
```

The SHA pins the image to that PR, so later pushes to the ref never change it. It keeps rendering even after the folder is deleted in a later commit. Do not link through `raw.githubusercontent.com`, which does not render in a private repository.

Footer: `Screenshots live on refs/assets/github under pr/<number>-<branch>/.`
