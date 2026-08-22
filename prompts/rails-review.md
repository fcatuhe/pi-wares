---
description: Send a scope to the rails-review subagent and report what it finds
argument-hint: "[base ref or paths]"
---
Spawn the `rails-review` subagent (`spawn_agent` with `agent_type: "rails-review"`) on: ${@:-the uncommitted changes, staged and unstaged}.

Resolve the scope yourself before spawning: settle the base ref, list the files it covers, and name both in the message. The reviewer reads the code itself, so send the scope, not a diff. Nothing to review, say so and do not spawn.

Then wait for it, and report its findings as it wrote them, severity first. Change nothing unless I ask for a fix.
