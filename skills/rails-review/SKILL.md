---
name: rails-review
description: Review Rails code the 37signals way, against evidence from the Fizzy, Campfire and Writebook sources, the Rails guides, and the installed gem source. Use when reviewing a Rails diff, PR, file or design, and when running as the rails-review subagent.
---

# Rails review

Cite a file for every finding: the repo under review, or a reference below. No citation, no finding.

## Source ranking

Higher rank wins.

| Rank | Source | Where |
|---|---|---|
| 1 | The repo under review | `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and the code around the diff. A pattern already used here beats every source below. |
| 2 | Rails itself, at the version in `Gemfile.lock` | `$(bundle show rails)`, `guides.rubyonrails.org/v<version>/`, `api.rubyonrails.org/v<version>/` |
| 3 | Fizzy | `$REFS/fizzy`. Newest 37signals app, closest to current taste. |
| 4 | Campfire, Writebook | `$REFS/once-campfire`, `$REFS/writebook`. Older and smaller, good for views and Turbo. |
| 5 | Gem behavior | `$(bundle show <gem>)`, then its `CHANGELOG.md`, then `rubydoc.info/gems/<gem>/<version>` |
| 6 | The unofficial 37signals guide | `$REFS/37signals-skills/guide/*.md`. A checklist, never a citation. Its README says an LLM wrote it, so confirm against rank 1 to 5 first. |

## Get the references

Run once per session. It clones what is missing, fast-forwards the rest, and never touches your own checkouts.

```bash
REFS="${XDG_CACHE_HOME:-$HOME/.cache}/pi-wares/rails-review"
for repo in basecamp/fizzy basecamp/once-campfire basecamp/writebook marckohlbrugge/37signals-skills; do
  dir="$REFS/${repo#*/}"
  git -C "$dir" pull -q --ff-only 2>/dev/null ||
    git clone -q --depth 1 --single-branch "https://github.com/$repo" "$dir"
  echo "$(git -C "$dir" log -1 --format='%h %ad' --date=short) $dir"
done
```

Grep them, do not read them whole: `rg -n "has_many :" "$REFS/fizzy/app/models"`.

## Anchor on the repo's own version

```bash
grep -E "^    rails \(" Gemfile.lock          # the version every rank 2 claim must match
bundle show rails                            # the source that decides behavior questions
git diff --stat "$BASE"...HEAD               # the scope under review
```

A guides page for another major version is not evidence. When guides and installed source disagree, the source wins.

## What to review

Work the diff, then the seams it touches. Check the references before commenting on:

- Where the logic landed: model, concern, controller, job, or a class invented to hold it.
- Routing: what the resource is, whether the action is CRUD on it.
- What the record represents, and whether state became a record or a boolean.
- Callbacks and transactions: what happens when the middle of the sequence fails.
- Queries: scopes, N+1 in the view they feed, indexes the migration needs.
- Migration safety against the running old code.
- Authorization at the boundary, scoped through the tenant or account.
- Turbo and Stimulus: stream targets, morphing, what a broadcast assumes about the DOM.
- Jobs: idempotence, retry, `_later` and `_now` naming.
- Tests: fixtures, one behavior per test, assertions through the public entry point.

## Reporting

Order by severity: correctness, security and data loss, then design, then taste. Each finding is three lines at most.

```
app/models/card.rb:42  Callback chain leaves the card without a column when the move fails.
Evidence: $REFS/fizzy/app/models/card/movable.rb:18 does it in one transaction.
Smaller change: move the two writes into Card#move! and drop the after_save.
```

Do not report: what the formatter or linter owns, an abstraction with no second caller, a preference you cannot cite. Say "no findings" when that is the answer.

## As a subagent

The `rails-review` template carries the model, the read-only tools, this skill and the prompt:

```
spawn_agent(agent_type: "rails-review", task_name: "rails-review/cards-move",
            message: "Review app/models/card*, app/controllers/cards* against main...HEAD.")
```

The message carries the scope. Without a base ref and paths, it asks for them.
