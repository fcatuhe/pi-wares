# auto-session-name

Names the session after its first answer, so `/resume` and the herdr tab show the topic instead of a number.

```text
oauth-rotation
flaky-test-fix
```

The name is two words, three when two cannot say it, lowercase and hyphen-joined, 28 characters at most. It goes to `pi.setSessionName()`, and [`herdr-tab-title`](../herdr-tab-title/) carries it to the tab.

It fires on the first `agent_settled` whose transcript holds both user and assistant text. It listens there rather than on `turn_end`, which fires once per tool roundtrip. A session that already has a name is left alone (`/name`, `-n`, a resume or a fork), and a name you set while the call is in flight wins over its answer. A failed call, or a reply with no name in it, is retried on the next turn. Sessions without a UI, subagents and `-p` runs, stay unnamed.

The call goes to `anthropic/claude-haiku-5-5`, or the cheapest authenticated anthropic model by input cost when haiku is not on offer, never another provider. No anthropic credential, no name. It is one `complete()` of 24 output tokens at `low` effort over the first 4k characters of the transcript. Haiku 5.5 cannot turn thinking off, and pi sends `high` effort unless told otherwise: there it thinks about 200 tokens before a name and the cap cuts it off. At `low` it skips thinking and names in 9 to 17 tokens. `enabledModels` does not restrict it, since it scopes what `/model` offers, not what the registry finds.
