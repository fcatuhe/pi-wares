# policy-byline

Asks the agent to open every message it sends or drafts for someone other than you with a byline that names it, so the reader knows an agent wrote it. Its chat replies to you, its messages to other agents and published text such as website copy go without it. It loads only on a machine that configures it, so the byline stays personal.

## Config

Write `~/.pi/agent/policy-byline/config.json`:

```json
{ "byline": "Kit writing for Ada", "shortcode": ":owl:", "emoji": "🦉" }
```

The agent writes `_:owl: Kit writing for Ada._` in Slack, which turns the shortcode into the icon, and `_🦉 Kit writing for Ada._` everywhere else. Without the file the policy adds nothing. A file without the three non-empty strings stops pi at load, naming the file.

## Check

[`check.ts`](./check.ts) refuses a message that does not carry the `byline` text. It covers the Slack send, draft and schedule tools and Outline comments, from codemode or called directly. It also covers `gog` mail, draft and chat sends and Google Docs or Drive comments, and `gh` comments, reviews with a body and `gh api` calls that set a `body`. It lets a command through when it ends in `-h` or `--help`. It reads a `--body-file`, `--body-html-file`, `--text-file`, `-F` or `-F body=@` file for the byline. It cannot see a body piped through stdin from a file, or a byline built at runtime in codemode.
