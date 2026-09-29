# Code comment policy

Default: **no comments.** Fix the code instead: a named constant, an extracted function, a predicate, a test whose name holds the fact, or the README beside the file.

## Notes

The one comment code allows is a tagged note: one line, `TAG: initials DDmmmYY description`, at most 25 words of description. Initials are the session owner's, agents included.

```
# INFO: fc 09mar26 vendor API returns 200 on failure, we parse the body
```

- `TODO:` names its blocker (URL, version) and what makes it removable.
- `FIXME:` known broken. `OPTIMIZE:` known slow.
- `INFO:` a fact code cannot express: an external constraint, a vendor bug, a spec ref, why an ugly thing is deliberate. Only when a competent reader would otherwise delete the code. Rare: two in a file means it wanted a README.
- Security, crypto, money, concurrency: one `INFO:` naming the invariant.
- A note that gains a reason appends a date: `| 17dec24 also by Ahoy`.

Block comments and docstrings are for public API docs, where the project's tooling expects them.

## Tests

One untagged line is allowed: above a test, why it exists; inside, how a non-obvious expected value is derived. Anything else is a test name, a helper, or an assertion message. A disabled test is `skip` with a `TODO:`.

## Infra

Config and infra (Terraform, Docker, CI, nginx, systemd, k8s, cron): one untagged line per block on why it is there. Generated scaffolding comments: leave them, never add to them, drop them when you rewrite the block.

## Never

- Leave a comment stale after changing the code beneath it.
- Mass-strip comments from a file you are in for another reason. Inside a block you rewrite, its comments are yours.
- Touch comments in code the project did not write.
