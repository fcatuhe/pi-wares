# bang-zsh

Runs `!` and `!!` commands in an interactive zsh instead of pi's `bash -c`, so your zshrc aliases and functions resolve.

```
!gst              # omz git alias
!vsc              # omz vscode plugin, opens the cwd
!ll               # your alias, not a binary
```

It only acts when `$SHELL` is a zsh, and runs `$SHELL -ic '<command>'` through pi's local shell backend, so streaming, cancellation and process-tree kill still work. With any other login shell nothing is registered.

Only your `!` commands are affected, the model's bash tool stays on bash. Single quotes are escaped, so `!git commit -m 'it's fine'` survives. Sourcing zshrc costs about a tenth of a second per command, and the commands land in your zsh history.
