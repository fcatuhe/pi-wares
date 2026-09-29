# Code comment policy

Default: **no comments.** Say it in code or a test name.

## Notes

The one comment code allows is a tagged note, one line of at most 25 words, with the session owner's initials, agents included:

```
# INFO: fc 09mar26 vendor API returns 200 on failure, we parse the body
```

- Tags: `TODO:`, `FIXME:`, `OPTIMIZE:`, `INFO:`. A `TODO:` names its blocker and what makes it removable.
- `INFO:` only when a competent reader would otherwise delete the code. Rare: a fact that outgrows a note goes in the README beside the file.
- Security, crypto, money, concurrency: one `INFO:` naming the invariant.
- A note that gains a reason appends a date: `| 17dec24 also by Ahoy`.

Block comments and docstrings are for public API docs, where the project's tooling expects them.

## Tests

One untagged line is allowed: above a test, why it exists; inside, how a non-obvious expected value is derived. A disabled test is `skip` with a `TODO:`.

## Infra

Config and infra: one untagged line per block on why it is there. Never add to generated scaffolding comments; drop them when you rewrite the block.

## Never

- Leave a comment stale after changing the code beneath it.
- Mass-strip comments from a file you are in for another reason. Inside a block you rewrite, its comments are yours.
- Touch comments in code the project did not write.
