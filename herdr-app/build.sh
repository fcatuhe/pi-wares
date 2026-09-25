#!/bin/bash
# Usage: ./build.sh [name [herdr-args...]]
set -euo pipefail

SOURCE="/Applications/Ghostty.app"
LOGO_URL="https://herdr.dev/assets/logo.png"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NAME="Herdr"
if (( $# )); then NAME="$1"; shift; fi
HERDR_ARGS=""
for arg in "$@"; do HERDR_ARGS+=" $arg"; done
# a quote would end the single-quoted zsh -lc command the launcher bakes in
case "$NAME$HERDR_ARGS" in *[\'\"]*) echo "name and herdr args cannot contain quotes" >&2; exit 1;; esac

APP="$HOME/Applications/$NAME.app"
# an id per variant keeps the Dock and Cmd-Tab apart, the default keeps its id so Dock pins survive
BUNDLE_ID="dev.herdr.terminal"
if [ "$NAME" != "Herdr" ]; then
  BUNDLE_ID="dev.herdr.terminal.$(printf '%s' "$NAME" | tr '[:upper:] ' '[:lower:]-')"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# a running instance holds the bundle, and the last build left it read only
pkill -f "$NAME.app/Contents/MacOS/ghostty" || true
chmod u+w "$APP" 2>/dev/null || true
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

ln -s "$SOURCE/Contents/Frameworks" "$APP/Contents/Frameworks"
ln -s "$SOURCE/Contents/Resources" "$APP/Contents/Resources"
ln -s "$SOURCE/Contents/MacOS/ghostty" "$APP/Contents/MacOS/ghostty"

plist="$APP/Contents/Info.plist"
cp "$SOURCE/Contents/Info.plist" "$plist"
plutil -replace CFBundleName -string "$NAME" "$plist"
plutil -replace CFBundleDisplayName -string "$NAME" "$plist"
plutil -replace CFBundleIdentifier -string "$BUNDLE_ID" "$plist"
plutil -replace CFBundleExecutable -string "herdr-launch" "$plist"

clang -O2 -Wall -DAPP_TITLE="\"$NAME\"" -DHERDR_ARGS="\"$HERDR_ARGS\"" \
  -o "$APP/Contents/MacOS/herdr-launch" "$here/herdr-launch.c"

# the patched Info.plist voids Ghostty's signature, ad hoc suffices since the re-exec runs under Ghostty's notarized one
codesign --force --sign - "$APP" 2>&1 | grep -v "replacing existing signature" || true
codesign --verify "$APP"

curl -fsSL "$LOGO_URL" -o "$work/logo.png"

# Contents/Resources is Ghostty's, and macOS draws a Finder custom icon verbatim, so the squircle is baked in
osascript -l JavaScript -e "
ObjC.import('AppKit');
const CANVAS = 1024, BODY = 824, RADIUS = 185;

const logo = \$.NSImage.alloc.initWithContentsOfFile('$work/logo.png');
if (logo.isNil()) throw new Error('logo did not load');

const icon = \$.NSImage.alloc.initWithSize(\$.NSMakeSize(CANVAS, CANVAS));
const body = \$.NSMakeRect((CANVAS - BODY) / 2, (CANVAS - BODY) / 2, BODY, BODY);
icon.lockFocus;
\$.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(body, RADIUS, RADIUS).addClip;
logo.drawInRectFromRectOperationFraction(body, \$.NSZeroRect, \$.NSCompositingOperationSourceOver, 1.0);
icon.unlockFocus;

if (!\$.NSWorkspace.sharedWorkspace.setIconForFileOptions(icon, '$APP', 0)) throw new Error('setIcon failed');
" >/dev/null

# Ghostty stamps its own icon on a writable bundle at startup
chmod a-w "$APP"

touch "$APP"
echo "built $APP (herdr$HERDR_ARGS) against $("$SOURCE/Contents/MacOS/ghostty" +version | head -1)"
