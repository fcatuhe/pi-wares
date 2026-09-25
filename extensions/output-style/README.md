# output-style

Claude Code's output styles for pi: `base.md` holds the writing rules every style shares, and one file of `styles/` sets the shape on top of it.

| Style | For |
|---|---|
| Default | replies in the session, READMEs, docs, commits, PRs: one sentence that carries the answer, bullets only for what it cannot carry |
| Prose | content for readers, marketing copy, articles, emails: the brief sets the shape, paragraphs, concrete claims, placeholders for missing facts |

`/output-style` opens a picker, `/output-style prose` switches directly, case-insensitive. The footer shows `style: <name>` whenever the style is not Default.

`~/.pi/agent/output-style/config.json` sets the style a session starts in, `{ "style": "Prose" }`. An unknown name is reported at session start and Default applies. A project cannot change the style.

Two differences from Claude Code:

| | Claude Code | here |
|---|---|---|
| `/output-style` | writes the choice to `.claude/settings.local.json` | a session entry that follows the branch: `/tree` back to before it and the old style returns |
| a custom style | drops the built-in coding instructions unless `keep-coding-instructions: true` | adds to them, every policy stays |

A style is a markdown file with `name` and `description` in its frontmatter, the file name standing in for a missing `name`. Yours go in `~/.pi/agent/output-style/styles/`, where one named like a built-in replaces it. Styles load at session start, so an edit needs `/reload`.

A switch changes the system prompt, so the next request misses the prompt cache once.

Subagents load this ware through [`config/pi/pi-codex-subagents/config.json`](../../config/pi/pi-codex-subagents/config.json) and start in the configured style, never in the parent's switched style.
