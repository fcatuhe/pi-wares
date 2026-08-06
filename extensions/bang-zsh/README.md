# bang-zsh

Runs `!` and `!!` commands in an interactive zsh instead of pi's `bash -c`, so `zshrc` functions and aliases resolve:

```
!vsc              # omz vscode plugin, opens the cwd
!gst              # omz git alias
!ll               # your alias, not a binary
```

`$SHELL` is a zsh: the command reaches `$SHELL -ic '<command>'`, wrapped by pi's local shell backend, so streaming, cancellation, and process-tree kill still work. Any other login shell: nothing is registered and `!` stays `bash -c`.

Intercepts `user_bash` only, so the LLM's bash tool stays on bash. Single quotes are escaped, so `!git commit -m 'it's fine'` survives both layers. Sourcing `zshrc` costs a tenth of a second or so per `!`, and the commands land in your zsh history.
