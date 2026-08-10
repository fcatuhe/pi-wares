# Code Comment Policy

Default: **no comments.** A comment explaining *what* code does is a smell. Fix the code, not the prose. The method with all the comments is the refactor target.

Ask what the comment explains, then kill that cause:

| Explains | Do instead |
|---|---|
| magic number/string | named constant, named for *why*, next to its user |
| what a block does | extract a function named after the comment |
| a condition | predicate: `if (gracePeriodExpired())` |
| a non-obvious pattern | wrong pattern, find the right primitive |
| a section of a file | split the file |

```
✗  // wait 30s for undo before destroying
   destroyLater(30_000)
✓  UNDO_GRACE_PERIOD = 30_000
   destroyLater(UNDO_GRACE_PERIOD)
```

## Tagged notes

The only untagged prose allowed is in tests and infra, below. Everything else is `TAG: initials DDmmmYY description`, so it greps. Initials are the session owner's, agents included.

- `TODO:` not done yet
- `FIXME:` known broken
- `OPTIMIZE:` known slow
- `INFO:` facts code cannot express: external constraints, vendor bugs, spec refs, why an ugly thing is deliberate, a shortcut's ceiling and upgrade path

```
# INFO: fc 09mar26 vendor API returns 200 on failure, we parse the body
# TODO: fc 25feb26 remove once litestream ships the layout fix (fractaledmind/litestream-ruby#72)
```

- The INFO test: would a competent reader delete this code as pointless? No, then no comment.
- A `TODO:` blocked on someone else names the blocker (URL, version) and what makes it removable. Without an exit condition it is a note to nobody.
- Multi-line: tag the first line, continuations are plain.
- A note that gains a reason appends a date, it is not rewritten: `# INFO: fc 02nov24 required by Action Policy | 17dec24 also by Ahoy`.
- Space after the comment marker: `// TODO:`, not `//TODO:`.

## Tests

A comment in a test is a test case that was not written. The framework already holds prose: the test name.

| Comment says | Do instead |
|---|---|
| what this sets up | named helper: `single_availability(9, 17)` |
| what is expected | the test name, or a second test |
| why an assertion could fail | assertion message, it prints when it matters |

Two comments survive, both untagged:

- Above the test: why it exists, when a reader would otherwise happily delete it. The regression's tombstone.
- Inside: the derivation of a non-obvious expected value, `# visible 0→60 + 300→360 = 120s`.

A disabled test is `skip` with a `TODO:`, never a commented-out block. Commented out, the suite reports nothing and nobody notices.

## Infra

Config and infra (Terraform, Docker, CI, nginx, systemd, k8s, cron): one untagged line per block on why it deserves to be there. Write for the pager at 3 a.m. Repetition is fine.

Generated scaffolding (`database.yml`, `deploy.yml`, generator stubs) is inert. Leave it, never add to it, delete it when you rewrite the block.

## Also comment

- **Public API docs** where the project's doc tooling expects them.
- **Security, crypto, money, concurrency**: an `INFO:` naming the invariant beats the incident.

## Never

- Commented-out code, yours. Delete it, git remembers.
- Section banners, in any language. Header changelogs, author tags.
- Restating the next line, or narrating your edit. That is the commit message.
- Leaving a comment stale after changing the code beneath it. Update or delete.
- Mass-stripping comments from a file you are in for another reason. Remove one when you refactor away what it compensated for, or when it is wrong.
