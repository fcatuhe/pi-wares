# auto-session-name

Names the session after its first answer, so `/resume` and the herdr tab show the topic instead of a number.

```text
oauth-rotation
flaky-test-fix
```

The name is two words, three when two cannot say it, lowercase and hyphen-joined, 28 characters at most. It goes to `pi.setSessionName()`, and [`herdr-tab-title`](../herdr-tab-title/) carries it to the tab.

It fires once, on the first `agent_settled` whose transcript holds both user and assistant text. It listens there rather than on `turn_end`, which fires once per tool roundtrip. A session that already has a name is left alone (`/name`, `-n`, a resume or a fork), and a name you set while the call is in flight wins over its answer. A failed call is retried on the next turn. Sessions without a UI, subagents and `-p` runs, stay unnamed.

The call goes to `anthropic/claude-haiku-4-5`, or the cheapest authenticated anthropic model by input cost when haiku is not on offer, never another provider. No anthropic credential, no name. It is one `complete()` of 24 output tokens over the first 4k characters of the transcript. `enabledModels` does not restrict it, since it scopes what `/model` offers, not what the registry finds.
