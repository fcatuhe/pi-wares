# wares-doctor

`/wares-doctor` compares this machine against the reference configs in [`config/`](../../config/README.md) and prints one line per file into the transcript.

```text
/wares-doctor         # report what is missing
/wares-doctor:apply   # write the missing keys
/wares-doctor:force   # write those, and overwrite the keys that differ
```

`:apply` only ever adds. A key you set differently comes back as `kept`, and every run, report or apply, closes with what `:force` would take instead.

Under the file lines, each group of findings prints a headline and one indented line per item, so nothing is a bare count:

```text
2 to add. /wares-doctor:apply writes them.
  pi settings treeFilterMode = "no-tools"
  pi settings enabledModels + ["openai-codex/gpt-5.6-sol"]
1 kept as yours. /wares-doctor:force takes the reference instead.
  pi settings defaultThinkingLevel "low" -> "high"
```

`=` writes a key, `+` appends array members, `->` shows what a value would become, so a difference always names both sides. Warning color means the line waits on you: work to run, or a key only you can write. `kept as yours` is plain text, you already chose that value.

JSON edits go through `jsonc-parser` and TOML edits through `toml-eslint-parser`, so comments, alignment and key order in the file survive. A TOML key with no table to live in is reported as `manual` rather than guessed at.

`:force` adds the same keys and then replaces every `kept` one with the reference value, counted as `replaced` in the report. It is key by key, not file by file: keys the reference never mentions stay, extra array members stay (an extra enabled model is an addition, not a disagreement), and a diverged `[[keys.command]]` entry is rewritten in place rather than duplicated. Only the key and value are replaced, so a trailing comment you wrote next to the old value survives and may end up describing the new one. A key written in a form the parser cannot pin to a single node, an inline table for instance, is reported as `manual` instead of being overwritten blind.

The three modes are three registered commands, `COMMANDS` in [`doctor.ts`](./doctor.ts), not one command taking an argument, so the `/` palette lists all three with their own descriptions. None of them takes an argument, and one typed anyway is refused rather than ignored.

The report is a custom entry, so it renders in the transcript under the command that produced it, survives `/reload`, and is never sent to the model. A run that cannot read a reference or create a target directory notifies the error instead of drawing an empty card.

Targets live in `targets()` in [`doctor.ts`](./doctor.ts), one object per file, each with the hint the report prints once it has written: `restart pi`, `/reload in pi`, or `herdr server reload-config`. Paths follow `PI_CODING_AGENT_DIR` and `XDG_CONFIG_HOME` when either is set, which is also how the self-check points them at a temp directory.
