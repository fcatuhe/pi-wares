# auto-tab-title

Names the session once, after the first turn, so the herdr tab stops reading `3`.

```text
tab-title
oauth-rotation
flaky-test-fix
```

Two words, three only when two cannot say it, lowercase, hyphen-joined, 28 characters at most. The name goes to `pi.setSessionName()`, which [`herdr-tab-title`](../herdr-tab-title/) carries to the tab label, and `/resume` and `pi -r` list it too.

## When it fires

On the first `agent_settled`: one user prompt, one settled answer, tool calls and retries included. `turn_end` would fire once per LLM roundtrip, so a prompt with eight tool calls would name the session eight times.

It fires once. A session that already has a name at `session_start` is left alone (`/name`, `-n`, a resumed or forked name), and a name arriving later stops it too. Nothing is fired if the turn produced no user text and no assistant text; that turn is skipped and the next one is the first. A failed call also leaves the next turn to retry, since the reason is usually the network.

Naming needs no threshold on tokens or characters. Input tokens are dominated by the system prompt and tool output before you have typed anything, so they measure the harness rather than the topic, and the first request plus its answer is what states the task.

## The call

`anthropic/claude-haiku-4-5`, else the first available model whose id contains `haiku`, else nothing: a tab label never escalates to Opus. One `ctx.modelRegistry.complete()` of 24 output tokens on a transcript capped at 4k chars, so the whole session costs a fraction of a cent. `enabledModels` does not apply, it scopes what `/model` offers, not what the registry can find.

The reply is read as its last non-empty line, lowercased, stripped to `[a-z0-9]` words, cut to the first three, and then words are dropped, never characters, until it fits: a truncated word is a worse label than one word fewer.

Inert without a UI, so subagents and `-p` runs stay unnamed.

No config. No commands. Self-check: `npx tsx extensions/auto-tab-title/test.ts`.
