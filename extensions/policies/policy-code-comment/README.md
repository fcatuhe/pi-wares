# policy-code-comment

Appends [`policy.md`](./policy.md) to the system prompt, and refuses a `write` or `edit` whose new comment lines break it, telling the model why.

```text
Code comment policy refused 2 comments in extensions/thing/index.ts:
  untagged prose in code, so it is a tagged note, a name, or nothing:
    // walks the chain down to the reason a reader can act on
  38 words, over the 25-word budget:
    // INFO: fc 22aug26 undici reports every transport failure as TypeError "fetch failed" and hangs...
Send the call again without them. A fact code cannot express is one tagged line inside the budget, the rest is the README's.
```

The check refuses untagged prose, a malformed tag, a note over budget, a second consecutive comment line, and commented-out code. In a test file, one with `test` or `spec` in its directory or file name, one untagged line passes.

It never looks at:

- block comments and docstrings, only line comments (`//`, `#`, `--`) in the languages it knows by file extension, which leaves config and infra out
- lines the file already has, so a file the policy predates is not a fight
- machine directives: a shebang, a `///` reference, lint and coverage pragmas

Commented-out code is a line ending in `;`, `{` or `}`, an identifier directly followed by `(`, or a declaration keyword followed by an operator. Prose that opens on `return` or `class` passes.
