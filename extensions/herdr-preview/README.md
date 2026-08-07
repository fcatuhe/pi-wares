# herdr-preview

`/md` previews a markdown file in a herdr split beside pi, rendered and live.

```text
/md                    # pick a file
/md docs/pricing.md    # open one, with argument completion
/md auto               # toggle preview-on-write
```

One markdown file touched this session opens without asking, which is the common case: pi just wrote a doc and you want to see it. Otherwise a picker opens, session files first, then the rest of the repo from `git ls-files`. The split takes focus with it nowhere: you keep typing in pi while the doc is up.

The pane runs `mdcat --watch`, so the file pi is about to rewrite re-renders on every save. Images, math and mermaid render as real graphics, since mdcat detects Ghostty through the pane and herdr's `experimental.kitty_graphics` passes the protocol through. `--watch` is why mdcat and not glow, whose renderer never looks at the file again.

A second `/md` retargets the same split rather than stacking a new one, interrupting the running viewer and waiting for the shell before feeding it the next file. A pane you closed yourself is noticed and split again. The label leads with the filename, `pricing.md (docs/pricing.md)`, because a narrow border truncates the tail.

The pane is borrowed and returned. `session_shutdown` closes it, but only when the label is still the one we set, so anything you started in that pane yourself is left alone. A crash skips this and leaves the pane.

Inert outside herdr (`HERDR_ENV != 1`) and when `mdcat` is not on `PATH`: the command does not register at all rather than registering and failing.

## Requirements

```bash
brew install mdcat
```

## Configuration

`~/.pi/agent/extensions/herdr-preview.json`, read on every open, every key optional.

```json
{ "auto": true, "direction": "right", "ratio": 0.4 }
```

`auto` opens every markdown file pi writes, and is what `/md auto` toggles. `direction` is `right` or `down`, `ratio` is between 0 and 1 exclusive, unset leaving the split at herdr's own. A missing file or an out-of-range value falls back rather than failing. A corrupt file also falls back, but logs the file and the parse error first, since a silently ignored config reads as a broken extension.

[`/wares-doctor`](../wares-doctor/) creates the file with `auto` on. Without it the code says off, the right default for a machine that never met the doctor. Toggle it back off and the doctor reports `kept 1` on every run, the price of a toggle under reference control.

No project-local override: a repo that set `auto` would silently outrank `/md auto`.
