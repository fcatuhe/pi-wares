---
name: pull-request
description: Open a pull request, from the branch name to the title and the body. Use when creating a branch for a PR, opening a PR with gh, or writing or rewriting a PR title or description.
---

# Pull request

A branch, a PR titled in the convention below, then a body built from the sections further down. The owner merges.

## Branch

`<type>/<slug>`, the slug two to four lowercase words joined by hyphens, naming what the work changes, no issue number: `feat/exempt-user-role`, `refactor/delete-conversion-backfill`.

## Title

`<type>(<scope>): <description>`

The description is a verb in the imperative and what it acts on, lowercase, no closing period: what the PR changes for the person using the app or running it, not the files touched.

### Types

| Type | Usage |
| --- | --- |
| `feat` | New feature |
| `fix` | Bug fix |
| `ui` | Style, UX, no business logic |
| `content` | Copy and static pages |
| `refactor` | Restructuring without functional change |
| `test` | Tests only |
| `docs` | README, guides, agent skills |
| `perf` | Faster, same behavior |
| `infra` | CI, build, Kamal, servers, monitoring |
| `deps` | Dependency updates |

### Scopes

The domain the PR changes. Optional, recommended for `feat`, `fix`, `ui`, `refactor`, `perf`.

Take it from the repo's own list when it keeps one, in its README or AGENTS.md, else from the scopes in `gh pr list --state all` and `git log`. A new domain earns a new scope: name it after the model or the screen, plural like the controller.

### Examples

```
feat(auth): exempt a customer from the subscription
ui(calendar): even out the toolbars and lift the opening bar to the day
```

## Description

A fixed core, plus conditional sections only when they carry information. Omit an empty section, never leave a heading with "N/A" under it.

Order: Summary, User flow, Behavior changes, Visual changes, Implementation notes, Design decisions, Data and rollout, Risks and edge cases, Tests.

| Section | Include | Content |
| --- | --- | --- |
| Summary | Always | The user problem, the new capability, the outcome. One short paragraph. |
| User flow | Usually | How the user enters, completes and exits the feature, exceptional paths included. |
| Behavior changes | Always | Before and after, as a compact table. |
| Visual changes | Unless nothing is visible | Screenshots, see below. |
| Implementation notes | Always | The decisions behind the diff: data model, boundaries, framework mechanisms, integrations. Not a list of changed files. |
| Design decisions | When useful | Alternatives considered and why they lost. |
| Data and rollout | When applicable | Migrations, backfills, feature gates, configuration, compatibility, deployment order. |
| Risks and edge cases | Substantial features | Concurrency, permissions, failure behavior, recovery. |
| Tests | Always | Tested behavior by level, unit through system. |
| Screenshots footer | With images | The ref and folder the images live in. |

### Screenshots

Every PR a user can see gets screenshots: a screen, an email, a PDF, an error message. Only when nothing visible changed (a refactor, a job, infra) skip them, and say so in one line.

Capture what a reviewer needs without running the branch:

- A new flow: every step in order, entry to exit, plus its exceptional paths (empty, error, denied). It has no before.
- A changed screen: before and after, from the same data.
- Each viewport where the layout differs, phone included.

### Where the images live

On the ref `refs/assets/github`, never on a branch: `git clone` fetches only branches and tags, so the images stay out of everyone's clone, the branch list, and the PR base and compare pickers.

One folder per thread that reads the files, number first: `pr/<number>-<branch>/` with every `/` of the branch turned into `-` (`pr/12-feat-todays-meetings-home/`), or `issues/<number>-<title-slug>/`. Files are numbered in display order, `01-home.png`, `02-home-phone.png`. PDFs and other files go in the folder of the thread that links them.

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

Link each file through `/raw/` at the commit SHA, which pins the image to that PR: later pushes never change it, and it keeps rendering after the folder is deleted. Never link through `raw.githubusercontent.com`, which does not render in a private repository.

```
https://github.com/<owner>/<repo>/raw/<commit>/pr/<number>-<branch>/01-home.png
```

Footer: `Screenshots live on refs/assets/github under pr/<number>-<branch>/.`
