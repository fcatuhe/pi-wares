# herdr-app

Builds `~/Applications/Herdr.app`, a Ghostty bundle rebranded as Herdr that opens straight into the herdr session instead of a shell. Dock icon, menu bar and Cmd-Tab all say Herdr.

```bash
./build.sh          # ~1s, needs Ghostty in /Applications and the Xcode CLT
```

Rerun it after changing the launcher or the logo. Not after a Ghostty update: everything but the `Info.plist`, the launcher and the icon is a symlink into `/Applications/Ghostty.app`, so updates flow through on the next launch. The bundle is 830 KB.

Nothing here is loaded by pi. It sits in this repo because the terminal is part of how we run pi.

## Design notes

Each of these is the answer to something that did not work.

**The launcher is compiled.** Ghostty takes the command to run from `argv` only, and a Finder launch passes none, so the bundle's main executable seeds the flags and re-execs the `ghostty` symlink beside it. It cannot be a shell script: launchd refuses an interpreted main executable under the hardened runtime, with a spawn error 162.

**`-e` is ignored, `--command` is not.** When Ghostty starts through `open --args`, `-e cmd` silently yields a plain login shell. `+new-window` is Linux only in 1.3.1.

**The title is seeded with OSC 0.** Ghostty titles a window with a ghost emoji until the program inside sets one. The `title` config would fix that but freezes the title forever, so herdr could never show session names. A `printf` before the `exec` fills the gap instead.

**The icon is a Finder custom icon.** `Contents/Resources` belongs to Ghostty, so there is nowhere to put a `CFBundleIconFile`. macOS draws a custom icon verbatim, without the squircle mask and inset it applies to a bundle icon, so `build.sh` bakes those in: 824 points of artwork on a 1024 canvas, drawn through AppKit in `osascript` rather than an image library.

**The bundle root is read only.** On startup Ghostty stamps its own icon on its bundle as a custom icon, which outranks everything else. Not through `setApplicationIconImage:` or `NSWorkspace setIcon:forFile:`, both swizzle-tested and never called, so `chmod a-w` on the bundle root is what stops it.

**Second click focuses.** LaunchServices gives single instance behavior for free, since the bundle is the app rather than a stub that shells out to Ghostty.

## Signature and portability

Ad hoc signed, no team ID, so `spctl` rejects it. It launches anyway because Gatekeeper only assesses bundles carrying `com.apple.quarantine`, which a locally built one does not have. After the re-exec, the process runs under Ghostty's own notarized Developer ID signature.

Copying the app to another Mac is possible but fragile: anything arriving by AirDrop or download is quarantined and blocked (`xattr -dr com.apple.quarantine` clears it), and the icon lives in a resource fork that `zip` and `rsync -a` drop. Run `build.sh` there instead.
