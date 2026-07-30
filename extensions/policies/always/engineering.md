# Engineering Policy

Language and framework agnostic. Stack rules live in their own policy.

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

## Hygiene

- Delete dead code. Git remembers.
- Never hand-edit generated files or lockfiles. Regenerate.
- Files under 500 LOC. Split past that.
- Methods ordered by invocation: callers above callees.
- Name after what it means in the domain, not a generic verb. `person.decease`, not `person.soft_delete`.
- New dependency: check recent commits, adoption, maintenance before adding it.
- Before handoff, the project gate runs green.
