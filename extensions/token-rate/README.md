# token-rate

Footer status showing how fast the model is writing.

```
42 tok/s
```

Nothing is shown until a rate exists, so a fresh session and a non-streaming provider cost no footer width. In [`compact-footer`](../compact-footer/) that width is the path's.

## What it measures

Output tokens per second of **streaming**, averaged over the last 5 assistant messages, token-weighted (total tokens over total seconds, so a long message counts for more than a two-line one).

- The clock runs from the first streamed chunk to the last, not from `turn_start`. Queueing, time to first token and the whole thinking phase would otherwise sit in the denominator and roughly halve the number on a reasoning model.
- The numerator is `usage.output` from the finalized message, which already includes reasoning tokens.
- A message that arrived in one chunk has no measurable window and is skipped, as is one with no output tokens.
- The window resets on `session_start` (which pi also fires on `/new`, `/resume` and `/fork`) and on model change: opus and glm generate at rates that average into a number describing neither.

## Behavior

- Published with `ctx.ui.setStatus("token-rate", ...)`, so the built-in footer, [`compact-footer`](../compact-footer/) and any other footer render it without extra wiring.
- Dim, single line, no label. The unit is the label.

## Check

```bash
npx tsx extensions/token-rate/test.ts
```

Covers the weighted mean, the rounding, the window cap and the samples that get dropped.
