# output-style

Claude Code's output styles for pi: `base.md` holds the writing rules for every style (the AI tells to avoid, form, honest claims), and one file of `output-styles/` sets the shape on top of it.

| Style | For |
|---|---|
| Default | replies in the session, READMEs, docs, commits, PRs: one sentence that carries the answer, bullets only for what it cannot carry |
| Prose | content for readers, marketing copy, articles, emails: the brief sets the shape, paragraphs, concrete claims, placeholders for missing facts |

`/output-style` opens a picker, `/output-style prose` switches directly, case-insensitive. The footer shows `style: <name>` whenever the style is not Default.

`outputStyle` sets the style a session starts in, in `.pi/settings.json` for a project and `~/.pi/agent/settings.json` for every project, the project winning. A name that matches no style is reported at session start and Default applies.

Two differences from Claude Code:

| | Claude Code | here |
|---|---|---|
| `/output-style` | writes the choice to `.claude/settings.local.json` | a session entry that follows the branch: `/tree` back to before it and the old style returns |
| a custom style | drops the built-in coding instructions unless `keep-coding-instructions: true` | adds to them, every policy stays |

A style is one markdown file in `output-styles/` with a `name` and a `description` in its frontmatter, the file name standing in for a missing `name`. A switch changes the system prompt, so the next request reads the conversation without the prompt cache, once.

Subagents load it from [`config/pi/pi-codex-subagents/config.json`](../../config/pi/pi-codex-subagents/config.json) and start in the `outputStyle` setting, never in the parent's session switch.
