---
description: Send a scope to the rails-review reviewer, a pi or Paseo subagent, and report what it finds
argument-hint: "[base ref or paths]"
---
Start the `rails-review` reviewer, as the `rails-review` skill's "Start the reviewer" section says, on: ${@:-the uncommitted changes, staged and unstaged}.

If there is nothing to review, say so and start nothing.

Wait for its answer, then report its findings as written, severity first. Change nothing unless I ask for a fix.
