# comment-check

Blocks a `write` or `edit` whose new comment lines break the [code comment policy](../policies/policy-code-comment/policy.md).

```text
Comment policy refused 2 comments in extensions/thing/index.ts:
  untagged prose in code, so it is a tagged note, a name, or nothing:
    // walks the chain down to the reason a reader can act on
  38 words, over the 25-word budget:
    // INFO: fc 22aug26 undici reports every transport failure as TypeError "fetch failed" and hangs...
Send the call again without them. A fact code cannot express is one tagged line inside the budget, the rest is the README's.
```

The policy sits in the system prompt, hundreds of turns from the edit it governs. This is the same rule at the moment the comment is written, which is the only moment it costs anything to follow. It blocks rather than warns: a warning that can be ignored is the state that made this extension necessary.

## What it refuses

| In code | In tests, by `test` or `spec` in the directory or the filename |
|---|---|
| untagged prose | allowed, one line of it |
| `INFO:` without initials and a `DDmmmYY` date | same |
| a note over 25 words of description | same |
| a second consecutive comment line | same |
| commented-out code | same |

Two tagged notes on adjacent lines read as one block, which is the intended answer: separate them, or the file wanted a README.

## What it never looks at

- Anything but a line comment, by file extension: `//`, `#` and `--`. A block comment, a docstring and a JSDoc header pass, and so does every extension it does not know, config and infra with them. Infra has its own rule, one untagged line per block, and no checker reads intent that well.
- Lines the file already has. Only what the call adds is judged, so rewriting a file the policy predates is not a fight, and moving a legacy comment is not either.
- Code the project did not write, because nobody hand-writes it: a dependency is installed, a generated file is regenerated, a vendored copy is `cp`. None of those is a `write` or an `edit`, so the checker never meets one. The policy is what says leave their comments alone.
- Machine directives, a shebang, a `///` reference.

Prose that opens on `return` or `class` is prose. Commented-out code is a line ending in `;`, `{` or `}`, an identifier followed directly by `(`, or a declaration keyword with an operator after it.

No config. No commands. Uninstalling is `pi config`, and the offending edit goes through on the next attempt.

## Check

```bash
npx tsx extensions/comment-check/test.ts
```

Covers each rule, the two file classes, the skipped extensions and directives, the existing-line exemption, and the shape of the refusal.
