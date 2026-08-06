# wares-doctor

`/wares-doctor` runs [`bin/wares-doctor`](../../bin/wares-doctor) without leaving the session and prints its report into the transcript.

```text
/wares-doctor         # report what this machine is missing
/wares-doctor apply   # write the missing keys
```

The script stays the source of truth, and the CLI stays the way to run it when pi will not start, which is the run that matters most. This is a front end: same reference configs in [`config/`](../../config/README.md), same one-line-per-file output, same "only ever adds" behavior.

The report is a custom entry, so it renders in the transcript and is never sent to the model. A pending report exits 1 by design, so stdout decides success rather than the exit code, and a genuinely broken run (empty stdout) surfaces stderr as an error notification instead of an empty card.

Writing `settings.json` still needs a restart to take effect. The report's own hint column says which target needs what, so `/wares-doctor apply` followed by `/reload` covers extensions, and pi settings wait for the next launch.
