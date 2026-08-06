# wares-doctor

`/wares-doctor` compares this machine against the reference configs in [`config/`](../../config/README.md) and prints one line per file into the transcript.

```text
/wares-doctor         # report what is missing
/wares-doctor apply   # write the missing keys
```

`apply` only ever adds. A key you set differently comes back as `kept`, JSON edits go through `jsonc-parser` and TOML edits through `toml-eslint-parser`, so comments, alignment and key order in the file survive. A TOML key with no table to live in is reported as `manual` rather than guessed at.

The report is a custom entry, so it renders in the transcript, survives `/reload`, and is never sent to the model. A run that cannot read a reference or create a target directory notifies the error instead of drawing an empty card.

Targets live in `targets()` in [`doctor.ts`](./doctor.ts), one object per file, each with the hint the report prints once it has written: `restart pi`, `/reload in pi`, or `herdr server reload-config`. Paths follow `PI_CODING_AGENT_DIR` and `XDG_CONFIG_HOME` when either is set, which is also how the self-check points them at a temp directory.
