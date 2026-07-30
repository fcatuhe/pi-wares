# policies

House rules appended to the system prompt, byte-identical every turn so they cache once per session.

```
always/   every session, every repo
when/     only when a marker file exists in cwd or above it
```

| File | Loaded when |
|---|---|
| `always/code-comment.md` | always |
| `always/writing-style.md` | always |
| `always/engineering.md` | always |
| `when/git.md` | `.git` exists |
| `when/html.md` | `app/views` or `index.html` exists |
| `when/rails.md` | `config/application.rb` exists |

Adding a stack: drop the `.md` in `when/` and add its markers to `MARKERS` in `index.ts`. A file with no marker entry never loads.

Markers are searched in cwd and every directory above it. A workspace holding sibling repos gets nothing, since the search never descends. `cd` into the repo.

## Inject or make it a skill

|  | Inject here | Skill |
|---|---|---|
| Trigger | repo-shaped, true for every edit in this repo | task-shaped, true a few times per feature |
| Cost of the model not reading it | silently wrong code, a force push | a mediocre draft you regenerate |
| Size | small, it is rent paid every turn | as big as it needs to be |

Anything bulky enough to be a skill gets a one-line pointer from the policy that covers its topic, which fixes skill discovery without paying for the skill.
