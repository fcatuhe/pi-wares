# Code comment policy

Write **no comments** by default. Say it in code or in a test name.

## Notes

The only comment allowed in code is a tagged note. Write it as one plain sentence of at most 25 words, with the session owner's initials, even when you are an agent:

```
# INFO: fc 09mar26 the vendor API returns 200 even on failure, so we read the error from the body
```

- The tags are `TODO:`, `FIXME:`, `OPTIMIZE:` and `INFO:`. In a `TODO:`, name what blocks it and what will let you remove it.
- Use `INFO:` rarely: only when a competent reader would otherwise delete the code.
- Write the note so a newcomer understands it on first read. If it needs more than one sentence, put it in the README beside the file.
- In code that handles security, crypto, money or concurrency, add one `INFO:` that names the rule the code must keep.
- When a note gains a new reason, append it with a date: `| 17dec24 also by Ahoy`.

Use block comments and docstrings only for public API docs, where the project's tooling expects them.

## Tests

A test may have one untagged comment line. Put it above the test to say why the test exists, or inside the test to explain how a non-obvious expected value is worked out. To disable a test, use `skip` with a `TODO:`.

## Infra

In config and infra files, you may add one untagged line per block to say why the block is there. Never add to the comments a generator wrote. Delete them when you rewrite the block.

## Existing comments

- Never leave a comment out of date after you change the code under it.
- Never strip all the comments from a file you opened for another reason. You may change the comments inside a block you rewrite.
- Never touch comments in code the project did not write.
