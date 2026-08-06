# Code Comment Policy

Default: **no comments.** A comment explaining *what* code does is a smell. Fix the code, not the prose. Comment density marks the weakest code: the method with all the comments is the refactor target.

Ask what the comment actually explains, then kill that cause:

| Explains | Do instead |
|---|---|
| magic number/string | named constant, named for *why*, next to its user |
| what a block does | extract a function named after the comment |
| a condition | predicate: `if (gracePeriodExpired())` |
| a non-obvious pattern | wrong pattern, find the right primitive |

```
✗  // wait 30s for undo before destroying
   destroyLater(30_000)
✓  UNDO_GRACE_PERIOD = 30_000
   destroyLater(UNDO_GRACE_PERIOD)
```

## Sanctioned comments

Tagged notes only, `TAG: initials DDmmmYY description`, so they're greppable. Initials are the session owner's, agents included:

- `TODO:` not done yet
- `FIXME:` known broken
- `OPTIMIZE:` known slow
- `INFO:` facts code cannot express: external constraints, vendor bugs, spec/regulatory refs, why an ugly thing is deliberate, a deliberate shortcut's ceiling and upgrade path

`# INFO: fc 09mar26 vendor API returns 200 on failure, we parse the body`

If the fact is expressible as a name, name it instead.

## Exempt (comment freely, be explicit)

- **Tests.** Specifications, so untagged prose is fine. Comment the scenario and *why*: setup that looks arbitrary but isn't, the boundary probed, the bug pinned down. Don't restate assertions; what's under test goes in the test name.
- **Config and infra** (Terraform, Docker, CI, nginx, systemd, k8s): one line per block on *why it deserves to be there*. Write for the 3-a.m. pager version of yourself. Repetition is fine here.
- **Public API docs** where the project's doc tooling expects them.
- **Security, crypto, money, concurrency**: an `INFO:` naming the invariant beats the incident.

## Never

- Commented-out code. Delete it, git remembers.
- Section banners, header changelogs, author tags.
- Restating the next line, or narrating your edit. That's the commit message.
- Leaving a comment stale after changing code beneath it. Update or delete.
- Mass-stripping comments from files you're in for another reason. Remove one when you refactor away what it compensated for, or when it's wrong.
