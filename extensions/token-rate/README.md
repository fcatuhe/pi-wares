# token-rate

Footer status showing how fast the model writes, as `42 tok/s`, under the status key `token-rate`.

It is output tokens per second of streaming, over the last 5 assistant messages, token-weighted: total tokens over total seconds, so a long message counts for more than a short one. Nothing shows until a rate exists.

The clock runs from the first streamed chunk to the last, not from `turn_start`, which would count queueing and thinking time and halve the number on a reasoning model. Tokens are the message's `usage.output`, reasoning included. A message that arrived in one chunk or had no output tokens is skipped. The window resets at session start (also `/new`, `/resume`, `/fork`) and on model change, since two models' rates average into a number describing neither.
