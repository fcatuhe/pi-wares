---
name: sidecar
description: "Handover notes from one agent to the next. Write a sidecar.md when ending a session that left unfinished work, non-obvious decisions, or traps behind. Read existing sidecars (alongside README.md and AGENTS.md) when arriving in unfamiliar code."
---

# Sidecar

A `sidecar.md` is a handover note from the previous agent to you. Not for users — for the next agent, who arrives with zero memory.

README is for humans. AGENTS is enduring rules. Sidecar is *what's happening right now*.

## Reading

Before editing unfamiliar code, read the `sidecar.md`, `README.md`, and `AGENTS.md` in scope. Walk up to the repo root if needed. Do this in parallel.

## Writing

Write or update a sidecar when you leave work in flight or discovered something the next agent would otherwise hit blind. Delete it entirely when everything in it is resolved — a stale sidecar is worse than none.

What goes in: whatever the next agent needs to not waste time. What's mid-change. What to do first. Open questions and how to investigate them. Bugs you noticed but didn't fix. Decisions that look wrong but aren't, with the reason.

What doesn't go in: setup (README's job), style or build commands (AGENTS' job), session logs, resolved items, generic advice. Don't reference README or AGENTS — the next agent reads them anyway.

## What good looks like

````markdown
# foo — handover

Migration from v1 to v2 schema is half done. `parse.ts` is on v2; `validate.ts` still expects v1 shapes and currently throws on every input. Don't ship.

## First task
Finish `validate.ts`. The v2 shape is in `types.ts:42`. Tests in `validate.test.ts` are written against v1 — rewrite, don't delete.

## Open questions
- Should `id` stay a string or become a branded type? Tried branded, broke three call sites in `api/`. Park unless it actually matters.

## Don't undo
- **No `zod` dependency.** Tried it, doubled bundle size. Hand-rolled validators are deliberate.
- **`parse` returns `null` on failure, not throws.** Callers rely on this; switching to throws cascades.
````

That's the register: present tense, concrete file paths, opinions with reasons, no ceremony. Match it.
