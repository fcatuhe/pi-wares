/**
 * Clear-On-Startup Extension
 *
 * Clears the visible terminal once on a fresh pi process, before the first
 * frame paints. This startup clear preserves scrollback, so the user can still
 * scroll up to see whatever was in their shell before pi launched. (Note: pi-tui
 * itself may still wipe scrollback later on certain full re-render paths — that
 * is outside this extension's control.) Gated on `session_start` with
 * `reason: "startup"`, so it does NOT fire for `/reload`, `/new`,
 * `/resume`, or `/fork` (which would otherwise destroy chat scrollback).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (event, ctx) => {
    if (event.reason !== "startup") return;
    // Skip in print/RPC (headless) modes — no interactive UI, and we'd
    // otherwise blow away whatever the calling process printed before pi.
    if (!ctx.hasUI) return;
    if (!process.stdout.isTTY) return;
    // ESC[2J  - clear visible screen (scrollback preserved, user can scroll up to pre-pi shell history)
    // ESC[3J  - would also wipe scrollback; intentionally omitted so prior shell history stays accessible
    // ESC[H   - cursor home (deterministic post-clear state, avoids stale cursor before first paint)
    process.stdout.write("\x1b[2J\x1b[H");
  });
}
