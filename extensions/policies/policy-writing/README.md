# policy-writing

Appends [`policy.md`](./policy.md) to the system prompt: how every reply, commit, doc and piece of copy is written. It holds only the rules a measured model still breaks, and the eval below decides what stays.

## Eval

[`eval/eval.ts`](./eval/eval.ts) sends each task in [`eval/tasks/`](./eval/tasks/) through `pi -p`, with every other policy loaded, once without this policy (`none`) and once with it (`policy`). It then counts tells in the replies, with code blocks and inline code taken out.

```sh
npx tsx extensions/policies/policy-writing/eval/eval.ts run --model anthropic/claude-opus-5-5 --thinking high --runs 3 --jobs 5
npx tsx extensions/policies/policy-writing/eval/eval.ts score /tmp/policy-writing-eval-XXXXXX
```

`run` prints the tables below and the directory that holds every reply. `score` recounts a directory, for a tell added after the run. The defaults make 60 pi calls, about 6 minutes. Each call runs in a fresh copy of [`eval/fixture/`](./eval/fixture/) with `git init`, so `policy-git` loads and the code task has a file to edit. `subscription-tool-alias` is loaded too, so an Anthropic subscription accepts the call.

The tasks cover a concept question, a trade-off, a stack trace, a code change with tools, a commit message, a README, a code review, a PR body, landing page copy and an outbound email.

How to read a run:

- `none` breaks a rule and `policy` holds it: the rule earns its tokens.
- 0 in both columns: the model's own habit, and the rule can go. The tell stays counted, so a new model that regresses shows up.
- High in both columns: the rule does not work as written. Reword it and run again, or drop it.

Per-task totals are dominated by bold-led bullets, which the policy does not address, so read the tell table first.

## Results

### claude-opus-5-5, high, 29sep26

Two runs of the 10 tasks, 3 replies each. The first compared no style against the retired `output-style` ware, which was about 950 words: a 21-row table of tells, then form, claims and a Default or Prose shape. The second compared no style against this 8-line policy.

| Tell | none | output-style | none | policy |
|---|---|---|---|---|
| dash as a joint | 9 | 0 | 9 | 0 |
| arrow | 13 | 0 | 12 | 0 |
| smart quote, ellipsis | 2 | 0 | 0 | 0 |
| semicolon between clauses | 7 | 0 | 3 | 0 |
| filler adverb | 7 | 1 | 9 | 1 |
| staged reveal | 1 | 0 | 1 | 0 |
| `---` between sections | 4 | 0 | 5 | 0 |
| bullet led by a bold term | 107 | 68 | 96 | 95 |
| chat reply opening on a heading or label | 3/15 | 0/15 | 3/15 | 0/15 |
| service opener or closer, signposting, inflated words, praise tail, contrast frame, emoji | 0 | 0 | 0 | 0 |
| mean words | 332 | 318 | 334 | 309 |

- **Kept:** ASCII punctuation, the period over `;`, filler adverbs, and opening on the sentence that carries the answer. Without that last rule, 3 of the 5 chat tasks started with `## The difference` or a bold label.
- **Dropped:** most of the table of tells, which Opus 5.5 does not commit even without the rule. Also "commit bodies wrap at 72", since the model wraps at 68 to 73 unprompted, and sentence-case headings, which were never violated. `---` went too: it only showed up in landing copy, and this policy holds it at 0 without naming it.
- **Dropped, the Prose style:** without it, landing copy and email came back clean. The style only swapped `---` and bold labels for headings.
- **Unsolved:** bold-led bullets. The old rule, "never a run of bullets each opening with a bold term and a colon", only brought them from 107 to 68. The model reads a numbered `**Role comes from the request.**` as a heading, not as a bold term. A rule comes back only with wording that measurably moves the count.
- **Unmeasured:** the claims rules and holding a position. No task tests them yet, and they are kept because they are cheap and the stakes are high.
