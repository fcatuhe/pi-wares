# Engineering Policy

Language and framework agnostic. Stack rules live in their own policy.

## Before you write

Read the code the change touches and trace the real flow first, then take the highest rung that holds:

1. Does it need to exist at all? Speculative need, say so in one line and skip it.
2. Already in this codebase? Reuse the helper, type, or pattern. Re-implementing what lives a few files over is the most common waste.
3. Stdlib does it? Use it.
4. Native platform feature covers it? `<input type="date">` over a picker library, CSS over JS, a DB constraint over app code.
5. An installed dependency solves it? Use it. Never add one for what a few lines do.
6. Then the smallest code that works.

- No abstraction without a second caller: no interface with one implementation, no factory for one product, no config for a value that never changes.
- No scaffolding for later. Later can scaffold for itself.
- The smallest diff in the wrong place is a second bug, not laziness. Comprehension is never the thing you skip.

## Correctness

- Fix the root cause, not the symptom. A ticket names a symptom; find where every caller routes through.
- Bug means regression test first, then the fix.
- Unsure: read more code. Still stuck: ask, with 2-3 short options.
- Instructions conflict: say so, take the safer path.
- Changes you do not recognize in the tree: assume another agent, stay in your lane.

## Failure handling

- Fail loudly. No empty `rescue` / `except: pass` / `catch {}`, no default value standing in for a call that failed.
- An error that can lose data gets handled, not logged.
- Retries only where the operation is idempotent.

## Trust boundaries

- Validate at the boundary, never in the interior.
- Never build SQL, shell, or HTML by string interpolation. Use the parameterized or escaping API.
- No secrets or PII in code, committed config, or logs.

## Data, time, money

- Money in integer minor units. Never float.
- Store UTC. Durations use a monotonic clock, not wall time.
- Destructive schema or data changes go expand, migrate, contract. Never drop in place.

## Tests

- No sleeps, no network, no wall-clock dependence in unit tests.
- A test that fails one run in twenty is a broken test, not a flaky one.
- Test behavior through the public entry point, not private internals.
- New non-trivial logic (a branch, a loop, a parser, a money or security path) leaves one runnable check behind: the smallest thing that fails if the logic breaks. A one-liner needs none.

## Hygiene

- Delete dead code. Git remembers.
- Never hand-edit generated files or lockfiles. Regenerate.
- Files under 500 LOC. Split past that.
- Methods ordered by invocation: callers above callees.
- Name after what it means in the domain, not a generic verb. `person.decease`, not `person.soft_delete`.
- New dependency: check recent commits, adoption, maintenance before adding it.
- Before handoff, the project gate runs green.
