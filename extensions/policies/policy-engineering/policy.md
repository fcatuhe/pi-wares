# Engineering policy

## Before you write

First read the code the change touches and trace how it runs. Then stop at the first step below that works:

1. Does it need to exist? If the need is speculative, say so in one line and skip it.
2. Does the codebase already have it? Reuse the helper, type or pattern. Rewriting what already exists a few files away is the most common waste.
3. Does the standard library do it? Use it.
4. Does the platform do it natively? Prefer a database constraint to app code, and a native element to a library.
5. Does an installed dependency solve it? Use it. Never add a dependency for what a few lines can do.
6. Otherwise, write the smallest code that works.

- Add an abstraction only when a second caller needs it. Do not write an interface with one implementation, a factory for one product, or config for a value that never changes.
- Do not build scaffolding for later.

## Correctness

- Fix the root cause, not the symptom. A ticket describes a symptom, so find the code that every caller goes through.
- For a bug, write a regression test first, then the fix.
- If you find something broken, fix it or report it. Never work around it, and never skip the test that shows it.
- If unsure, read more code. If still stuck, ask with two or three short options.
- If instructions conflict, say so and take the safer path.
- If the tree has changes you do not recognize, assume another agent made them and leave them alone.

## Failure handling

- Fail loudly. Never write an empty `rescue`, `except: pass` or `catch {}`, and never return a default value in place of a call that failed.
- Handle an error that can lose data. Logging it is not enough.
- Retry only operations that are idempotent.

## Trust boundaries

- Validate input where it enters the system, not deeper inside.
- Never build SQL, shell commands or HTML by string interpolation. Use the parameterized or escaping API.
- Keep secrets and personal data out of code, committed config and logs.

## Data, time, money

- Store money as integer minor units, such as cents, or as a fixed-point decimal where the stack supports it natively. Never use floats. Rates and per-unit prices need more precision than a minor unit.
- Store times in UTC. Measure durations with a monotonic clock, not the wall clock.
- Make destructive schema or data changes in three steps: expand, migrate, contract. Never drop in place.

## Tests

- In unit tests, never sleep, use the network or depend on the wall clock.
- A flaky test is broken. Fix it.
- Test behavior through the public entry point, not through private internals.
- For new non-trivial logic, such as a branch, a loop, a parser, or a money or security path, add the smallest runnable check that fails if the logic breaks. A one-liner needs none.

## Running commands

- Wait for the process, not for the clock. Run it in the foreground with a generous tool timeout, or in the background and block on `wait`. Never guess with `sleep`.
- The exit status is the result. Do not grep a log for `error:` when `$?` already tells you. For CI, use `gh run watch --exit-status`.

## Hygiene

- Delete dead code. Git remembers it.
- Never edit generated files or lockfiles by hand. Regenerate them.
- Keep files under 500 lines. Split a longer file, unless the split would break up one cohesive unit. Generated and vendored files are exempt.
- Put callers above the methods they call, where the language allows.
- Name things after what they mean in the domain, not with a generic verb: `person.decease`, not `person.soft_delete`.
- Before adding a dependency, check its recent commits, how widely it is used and whether it is maintained.
- Before handoff, make the project's checks pass, as AGENTS.md or CI defines them. If there are none, run the test suite.
