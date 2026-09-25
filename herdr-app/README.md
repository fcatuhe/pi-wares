# herdr-app

Builds `~/Applications/Herdr.app`, a Ghostty bundle rebranded as Herdr that opens straight into the herdr session instead of a shell, with its own Dock icon, menu bar name and Cmd-Tab entry.

```bash
./build.sh          # needs Ghostty in /Applications and the Xcode CLT
```

A name plus herdr flags builds a variant with its own bundle id, which the Dock, Cmd-Tab and single-instance behavior treat as a separate app:

```bash
./build.sh "Herdr Work" --session work      # ~/Applications/Herdr Work.app
./build.sh "Herdr Devbox" --remote devbox   # attaches over SSH
```

Variants share the icon. Quotes are not allowed in the name or flags, since they would end the shell command the launcher bakes in.

Rerun it after changing the launcher or the logo, not after a Ghostty update: everything but `Info.plist`, the launcher and the icon is a symlink into `/Applications/Ghostty.app`.

## Design constraints

The launcher is compiled C, because launchd refuses an interpreted main executable under the hardened runtime (spawn error 162).

It passes `--command`, not `-e`, because Ghostty started through `open --args` ignores `-e` and opens a plain login shell.

A `printf` of OSC 0 seeds the window title, because Ghostty's `title` config would freeze it and herdr could never show session names.

The icon is a Finder custom icon with the squircle mask and inset baked in, because `Contents/Resources` belongs to Ghostty and macOS draws a custom icon verbatim.

The bundle root is read only, because Ghostty otherwise stamps its own custom icon on its bundle at startup.

## Signature and portability

The app is ad hoc signed, so `spctl` rejects it, but it launches because Gatekeeper only assesses quarantined bundles and after the re-exec it runs under Ghostty's notarized signature. On another Mac, run `build.sh` there: a copied app arrives quarantined (`xattr -dr com.apple.quarantine` clears it), and `zip` and `rsync -a` drop the icon's resource fork.
