#!/usr/bin/env bash
set -euo pipefail

home_dir=$HOME/.agent-browser
profile=$home_dir/profiles/agent-browser
config=$home_dir/config.json
keeper=$home_dir/keeper.html

command -v agent-browser >/dev/null || {
  echo "agent-browser is not on PATH: mise use -g npm:agent-browser" >&2
  exit 1
}

executable=""
case "$(uname -s)" in
  Darwin)
    candidates=("Brave Origin" "Brave Browser" "Chromium" "Google Chrome")
    for app in "${candidates[@]}"; do
      bundle="/Applications/$app.app/Contents"
      [ -f "$bundle/Info.plist" ] || continue
      executable="$bundle/MacOS/$(defaults read "$bundle/Info" CFBundleExecutable)"
      break
    done
    platform_args=""
    ;;
  Linux)
    candidates=(brave-origin brave brave-browser chromium google-chrome-stable google-chrome)
    for name in "${candidates[@]}"; do
      executable=$(command -v "$name") && break
    done
    platform_args="--class=agent-browser\n"
    ;;
  *)
    echo "unsupported platform: $(uname -s)" >&2
    exit 1
    ;;
esac

[ -x "$executable" ] || {
  echo "no browser found, looked for: ${candidates[*]}" >&2
  echo "install one, or run: AGENT_BROWSER_EXECUTABLE_PATH=<path> agent-browser ..." >&2
  exit 1
}

launcher=$home_dir/brave-launcher
case "$executable" in
  *[Bb]rave*) brave=1 launch=$launcher ;;
  *) brave=0 launch=$executable ;;
esac

if pgrep -f "user-data-dir=$profile" >/dev/null; then
  echo "the browser is running on $profile, close it first:" >&2
  echo "  agent-browser --session agent-browser close" >&2
  exit 1
fi

mkdir -p "$profile/Default"

# INFO: fc 14oct26 agent-browser always passes these flags, and without component updates Brave loads no Shields filter list
if [ "$brave" = 1 ]; then
  cat > "$launcher" <<EOF
#!/usr/bin/env bash
args=()
for arg in "\$@"; do
  case "\$arg" in
    --disable-component-update | --disable-background-networking) ;;
    *) args+=("\$arg") ;;
  esac
done
exec $(printf %q "$executable") "\${args[@]}"
EOF
  chmod +x "$launcher"
fi
cat > "$keeper" <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>agent-browser</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
             font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; }
      main { max-width: 34rem; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 1rem; }
      p { margin: 0 0 .75rem; }
      code { font-family: ui-monospace, monospace; font-size: .9em; }
    </style>
  </head>
  <body>
    <main>
      <h1>agent-browser session</h1>
      <p>Agents drive this window, one tab each.</p>
      <p>Keep this tab open, it holds the window.</p>
      <p>All logins persist in the current profile:<br><code>~/.agent-browser/profiles/agent-browser</code></p>
    </main>
  </body>
</html>
HTML

PROFILE=$profile BRAVE=$brave node <<'JS'
const fs = require("fs")
const profile = process.env.PROFILE
const brave = process.env.BRAVE === "1"

const preferences = {
  session: { restore_on_startup: 5 },
  translate: { enabled: false },
  translate_blocked_languages: ["en", "fr"],
  credentials_enable_service: false,
  credentials_enable_autosignin: false,
  autofill: { profile_enabled: false, credit_card_enabled: false, payment_cvc_storage: false },
  payments: { can_make_payment_enabled: false },
  profile: {
    password_manager_leak_detection: false,
    cookie_controls_mode: 1,
    default_content_setting_values: { cookies: 1, anti_abuse: 2 },
  },
  browser: { enable_spellchecking: false, show_home_button: false, theme: { color_scheme2: 1 } },
  spellcheck: { use_spelling_service: false },
  bookmark_bar: { show_on_all_tabs: false },
  download: { prompt_for_download: false },
  enable_do_not_track: true,
  intl: { accept_languages: "en-US,fr-FR", selected_languages: "en-US,fr-FR" },
  privacy_sandbox: { first_party_sets_enabled: false },
  search: { suggest_enabled: false },
  tab_search: { pinned_to_tabstrip: false },
  default_search_provider: { guid: "485bf7d3-0215-45af-87dc-538868000001" },
}

const bravePreferences = {
  brave: {
    enable_window_closing_confirm: false,
    location_bar_is_wide: false,
    web_view_rounded_corners: false,
    autofill_private_windows: false,
    history: { retention_days: 30 },
    new_tab_page: { shows_options: 2 },
    sidebar: { sidebar_show_option: 3 },
    tabs: {
      vertical_tabs_enabled: true,
      vertical_tabs_floating_enabled: true,
      vertical_tabs_collapsed: false,
      vertical_tabs_hide_completely_when_collapsed: false,
      vertical_tabs_show_title_on_window: false,
      tree_tabs_enabled: false,
      scrollable_horizontal_tab_strip: false,
      always_hide_tab_close_button: false,
      hover_mode: 1,
    },
  },
  vertical_tabs: { collapsed_state: false, uncollapsed_width: 240 },
  profile: {
    content_settings: {
      exceptions: {
        shieldsAds: { "*,*": { setting: 2 } },
        trackers: { "*,*": { setting: 2 } },
        cosmeticFilteringV2: { "*,*": { setting: { cosmeticFilteringV2: 2 } } },
      },
    },
  },
}

const filterLists = {
  "Annoying distractions": "67E792D4-AE03-4D1A-9EDE-80E01C81F9B8",
  "AI suggestions": "6b91e355-1421-4c03-9a30-911b4d0fb277",
  "Newsletter popups": "690FF3B4-8B6B-4709-8505-FEC6643D7BD9",
  "Social media": "7911A1CB-304E-4CDB-ABB3-E2A94A37E4DD",
  "YouTube Shorts": "9E8EC586-4E17-4E5E-99D7-35172C4CEA74",
  "YouTube Playables": "5c6a6c95-b60a-4695-9efb-539359022531",
  "YouTube autodubbed videos": "7f11b964-4f36-4e06-9d75-bd16381b9386",
  "YouTube end video elements": "d579f370-6de3-4507-aa9a-cee4227e59f5",
  "YouTube members-only videos": "49958da7-f532-4a84-a765-9501729b8e75",
  "Tracking URLs": "E2FA7D98-0BD5-493E-8AF4-950604ADE9CB",
  "Chat apps": "1ED1870B-997C-4BFE-AEBC-B67D679BAF3B",
  "Paywalls": "78672887-A098-4D2C-B0CB-A3DEC4834DA7",
  "Porn": "F61D6B7B-4110-4EA4-9C81-38FB4CE90AEC",
  "French website ads": "9852EFC4-99E4-4F2D-A915-9C3196C7A1DE",
}

const braveLocalState = {
  brave: {
    ad_block: {
      checked_all_default_regions: true,
      regional_filters: Object.fromEntries(Object.values(filterLists).map((uuid) => [uuid, { enabled: true }])),
    },
    shields: { fb_embed_default: false, twitter_embed_default: false },
    tabs: { compact_horizontal_tabs: true },
    enable_search_suggestions_by_default: true,
    dont_ask_for_crash_reporting: true,
    p3a: { notice_acknowledged: true },
  },
  user_experience_metrics: { reporting_enabled: false },
}

const merge = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) merge((target[key] ??= {}), value)
    else target[key] = value
  }
  return target
}

const update = (path, ...layers) => {
  const current = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {}
  fs.writeFileSync(path, JSON.stringify(layers.reduce(merge, current)))
}

update(`${profile}/Default/Preferences`, preferences, ...(brave ? [bravePreferences] : []))
if (brave) update(`${profile}/Local State`, braveLocalState)
JS

cat > "$config" <<EOF
{
  "headed": true,
  "pinTab": true,
  "profile": "$profile",
  "executablePath": "$launch",
  "args": "--disable-blink-features=AutomationControlled\n--test-type\n--hide-crash-restore-bubble\n--deny-permission-prompts\n--disable-search-engine-choice-screen\n--propagate-iph-for-testing\n${platform_args}file://$keeper"
}
EOF

echo "wrote $config"
echo "  executable  $launch"
echo "  profile     $profile"
echo "  keeper      $keeper"
echo
echo 'start the browser: CDP=$(agent-browser --session agent-browser get cdp-url)'
