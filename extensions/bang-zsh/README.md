# bang-zsh

Hands a `!` or `!!` command that bash cannot find to an interactive zsh, so your zshrc aliases and functions resolve, while everything bash knows stays in pi's `bash -c` at no cost.

```
!gst              # omz git alias, unknown to bash, runs in zsh
!git status       # a binary, stays in bash
!make && vsc      # make runs in bash, then vsc in zsh
```

It is active when a zsh is on `PATH` and `$ZDOTDIR/.zshrc` (`~/.zshrc` by default) exists, whatever the login shell, so it also covers a zsh used only inside a terminal multiplexer. Without a zshrc there is nothing for the fallback to find, and nothing is registered.

The switch happens inside bash, through its `command_not_found_handle`: bash calls it for one command at the moment it fails to find it, with the arguments already expanded, and the handler runs `zsh -ic` on just that command. The rest of the line keeps bash semantics, a command that ran before is never run twice, and the exit status is zsh's, 127 when neither shell knows the name. The arguments are requoted with `printf %q`, so quotes, newlines, `$` and globs reach zsh as typed.

Bash before 4.0, macOS's `/bin/bash`, has no such handler, so there every `!` command runs in zsh as a whole. Sourcing the zshrc costs about a tenth of a second for each command that falls through. Only your `!` commands are affected, the model's bash tool stays on bash.
