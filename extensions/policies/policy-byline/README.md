# policy-byline

Asks the agent to open every message it sends to someone other than you, pull request and issue bodies included, with a byline that names it, so the reader knows an agent wrote it. A draft you send yourself speaks as you and goes without it, as do published text such as website pages, guides and manuals, its chat replies to you and its messages to other agents. It loads only on a machine that configures it, so the byline stays personal.

## Config

Write `~/.pi/agent/policy-byline/config.json`:

```json
{ "byline": "Kit writing for Ada", "shortcode": ":owl:", "emoji": "🦉" }
```

The agent writes `_:owl: Kit writing for Ada._` in Slack, which turns the shortcode into the icon, and `_🦉 Kit writing for Ada._` everywhere else. An optional `"skill"` names the path of a `SKILL.md`, which the policy then tells the agent to read before it writes for anyone but you, as [`azade`](../../../skills/azade/SKILL.md) does. Without the file the policy adds nothing. A file without the three non-empty strings, or with a `skill` path that does not exist, stops pi at load, naming the file.

## Check

[`check.ts`](./check.ts) refuses a message that does not carry the `byline` text. It covers the Slack send and schedule tools and Outline comments, from codemode or called directly. It also covers `gog` mail and chat sends and Google Docs or Drive comments, and `gh` comments, reviews, pull requests and issues created or edited with a body, and `gh api` calls that set a `body`. Slack and mail drafts pass, since you send them yourself. It lets a command through when it ends in `-h` or `--help`. It reads a `--body-file`, `--body-html-file`, `--text-file`, `-F` or `-F body=@` file for the byline. It cannot see a body piped through stdin from a file, or a byline built at runtime in codemode.
