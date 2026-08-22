# Code Comment Policy

Default: **no comments.** A comment explaining *what* code does is a smell. Fix the code, not the prose. The method with all the comments is the refactor target.

Budget: **one line, 25 words.** Past that it is documentation, and it goes where documentation lives: the README beside the file, the commit message, the test name. Where the `comment-check` extension is enabled, a write is refused rather than warned about, naming the line.

Ask what the comment explains, then kill that cause:

| Explains | Do instead |
|---|---|
| magic number/string | named constant, named for *why*, next to its user |
| what a block does | extract a function named after the comment |
| a condition | predicate: `if (gracePeriodExpired())` |
| a non-obvious pattern | wrong pattern, find the right primitive |
| a section of a file | split the file |
| how the module fits together | the README next to it |
| why this behavior is correct | a test whose name says it |
| a trap the next reader falls into | a test that fails when they do |

Where a test can hold the fact, the test holds it: prose in app code is read once, a test that fails is read the day it matters. A note is what survives when nothing executable can carry it.

```
no   // wait 30s for undo before destroying
     destroyLater(30_000)
yes  UNDO_GRACE_PERIOD = 30_000
     destroyLater(UNDO_GRACE_PERIOD)
```

```
no   // INFO: fc 09mar26 undici reports every transport failure as TypeError "fetch failed" and
     // hangs the reason off error.cause, so a DNS blip and an expired certificate both read as
     // two useless words, which is why the chain is walked down to a reason a reader can act on.
yes  // INFO: fc 09mar26 undici hides the transport failure on error.cause
     function transportFailureReason(error) { ... }
```

The paragraph was the README's, and its second sentence was a function name.

## Tagged notes

Prose in code is a tagged note or it does not ship: `TAG: initials DDmmmYY description`, one line, so it greps. Initials are the session owner's, agents included. Tests and infra, below, are the only untagged prose.

- `TODO:` not done yet. Names its blocker (URL, version) and what makes it removable, or it is a note to nobody.
- `FIXME:` known broken
- `OPTIMIZE:` known slow
- `INFO:` one fact code cannot express: an external constraint, a vendor bug, a spec ref, why an ugly thing is deliberate

```
# INFO: fc 09mar26 vendor API returns 200 on failure, we parse the body
# TODO: fc 25feb26 remove once litestream ships the layout fix (fractaledmind/litestream-ruby#72)
```

- The INFO test: would a competent reader delete this code as pointless? No, then no note. A note that only proves you read the docs fails it.
- An INFO is rare. Two in one file is a file that wanted a README, or code that wanted a name.
- A note that gains a reason appends a date, it is not rewritten: `# INFO: fc 02nov24 required by Action Policy | 17dec24 also by Ahoy`.

## Tests

A comment in a test is a test case that was not written. The framework already holds prose: the test name.

| Comment says | Do instead |
|---|---|
| what this sets up | named helper: `single_availability(9, 17)` |
| what is expected | the test name, or a second test |
| why an assertion could fail | assertion message, it prints when it matters |

Two comments survive, both untagged, both one line:

- Above the test: why it exists, when a reader would otherwise happily delete it. The regression's tombstone.
- Inside: the derivation of a non-obvious expected value, `# visible 0-60 + 300-360 = 120s`.

A disabled test is `skip` with a `TODO:`, never a commented-out block: commented out, the suite reports nothing and nobody notices.

## Infra

Config and infra (Terraform, Docker, CI, nginx, systemd, k8s, cron): one untagged line per block on why it deserves to be there. Write for the pager at 3 a.m. Repetition is fine.

Generated scaffolding (config templates, generator stubs, whatever `new` or `init` wrote) is inert: leave it, never add to it, delete it when you rewrite the block.

## Also comment

- **Public API docs** where the project's doc tooling expects them.
- **Security, crypto, money, concurrency**: one `INFO:` naming the invariant beats the incident.

## Never

- Commented-out code, yours. Delete it, git remembers.
- Section banners, in any language. Header changelogs, author tags.
- Restating the next line, or narrating your edit. That is the commit message.
- A second line of prose. It is the sign the note belongs in the README.
- Leaving a comment stale after changing the code beneath it. Update or delete.
- Mass-stripping comments from a file you are in for another reason. Inside a block you rewrite, its comments are yours: fix them, or delete what the rewrite made pointless.
- Touching a comment in code the project did not write. Not ours to budget, and the next update overwrites the edit anyway.
