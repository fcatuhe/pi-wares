#!/usr/bin/env bash
set -euo pipefail

skill_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
home_dir=$HOME/.agent-browser
profile=$home_dir/profiles/agent-browser
config=$home_dir/config.json
keeper=$home_dir/keeper.html

command -v agent-browser >/dev/null || {
  echo "agent-browser is not on PATH: mise use -g \"npm:agent-browser@latest\"" >&2
  exit 1
}

case "$(uname -s)" in
  Darwin)
    executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    platform_args=""
    ;;
  Linux)
    executable="/usr/bin/chromium"
    platform_args="--class=agent-browser\n"
    ;;
  *)
    echo "unsupported platform: $(uname -s)" >&2
    exit 1
    ;;
esac

[ -x "$executable" ] || {
  echo "no browser at $executable" >&2
  echo "install it, or run: AGENT_BROWSER_EXECUTABLE_PATH=<path> agent-browser ..." >&2
  exit 1
}

if pgrep -f "user-data-dir=$profile" >/dev/null; then
  echo "the browser is running on $profile, close it first:" >&2
  echo "  agent-browser --session agent-browser close" >&2
  exit 1
fi

mkdir -p "$profile/Default"
cp "$skill_dir/keeper.html" "$keeper"

PREFS_PATH=$profile/Default/Preferences node <<'JS'
const fs = require("fs")
const path = process.env.PREFS_PATH

const wanted = {
  translate: { enabled: false },
  credentials_enable_service: false,
  credentials_enable_autosignin: false,
  autofill: { profile_enabled: false, credit_card_enabled: false },
}

const merge = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) merge((target[key] ??= {}), value)
    else target[key] = value
  }
  return target
}

const prefs = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {}
fs.writeFileSync(path, JSON.stringify(merge(prefs, wanted)))
JS

cat > "$config" <<EOF
{
  "headed": true,
  "pinTab": true,
  "profile": "$profile",
  "executablePath": "$executable",
  "args": "--disable-blink-features=AutomationControlled\n--test-type\n--hide-crash-restore-bubble\n--deny-permission-prompts\n${platform_args}file://$keeper"
}
EOF

echo "wrote $config"
echo "  executable  $executable"
echo "  profile     $profile"
echo "  keeper      $keeper"
echo
echo 'start the browser: CDP=$(agent-browser --session agent-browser get cdp-url)'
