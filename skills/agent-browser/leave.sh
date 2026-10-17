#!/usr/bin/env bash
set -euo pipefail

[ $# -eq 1 ] || {
  echo "✗ Usage: leave.sh <session>" >&2
  exit 1
}
you=$1
profile=$HOME/.agent-browser/profiles/agent-browser
state=${XDG_RUNTIME_DIR:+$XDG_RUNTIME_DIR/agent-browser}
state=${state:-$HOME/.agent-browser}

[ "$you" != agent-browser ] || {
  echo "✗ The agent-browser session owns the browser, leave your own session instead" >&2
  exit 1
}

set -- "$state/$you".*
[ -e "$1" ] || {
  echo "✗ No session $you in $state" >&2
  exit 1
}

if pgrep -f "user-data-dir=$profile" >/dev/null; then
  cdp=$(agent-browser --session agent-browser get cdp-url)
  if ! closed=$(agent-browser --session "$you" --cdp "$cdp" tab close 2>&1); then
    case "$closed" in
      *"✗ tab_gone:"*) ;;
      *)
        echo "$closed" >&2
        exit 1
        ;;
    esac
  fi
  agent-browser --session "$you" --cdp "$cdp" close >/dev/null
elif [ -e "$state/$you.pid" ] && kill -0 "$(cat "$state/$you.pid")" 2>/dev/null; then
  kill "$(cat "$state/$you.pid")"
fi

rm -f "$state/$you".*
echo "✓ Left $you: tab closed, session cleared"
