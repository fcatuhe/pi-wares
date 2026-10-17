#!/usr/bin/env bash
set -euo pipefail

profile=$HOME/.agent-browser/profiles/agent-browser
state=${XDG_RUNTIME_DIR:+$XDG_RUNTIME_DIR/agent-browser}
state=${state:-$HOME/.agent-browser}

pgrep -f "user-data-dir=$profile" >/dev/null || {
  echo "✗ The browser is not running" >&2
  exit 1
}

cdp=$(agent-browser --session agent-browser get cdp-url)
CDP=$cdp STATE=$state KEEPER="file://$HOME/.agent-browser/keeper.html" node <<'JS'
const fs = require("fs")
const { CDP, STATE, KEEPER } = process.env

const owners = new Map(
  fs
    .readdirSync(STATE)
    .filter((file) => file.endsWith(".target"))
    .map((file) => [JSON.parse(fs.readFileSync(`${STATE}/${file}`, "utf8")).targetId, file.slice(0, -".target".length)]),
)

fetch(CDP.replace(/^ws:\/\/([^/]+)\/.*$/, "http://$1/json/list"))
  .then((response) => response.json())
  .then((targets) => {
    const rows = targets
      .filter((target) => target.type === "page")
      .map((target) => [target.url === KEEPER ? "(keeper)" : (owners.get(target.id) ?? "(none)"), target.url])
    const width = Math.max(...rows.map(([owner]) => owner.length))
    for (const [owner, url] of rows) console.log(`${owner.padEnd(width)}  ${url}`)
  })
JS
