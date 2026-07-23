/**
 * Clear-On-Startup Extension
 *
 * Clears the terminal once on a fresh pi process so leftover shell output from
 * the command that launched pi is wiped and pi starts on a clean screen. This
 * intentionally wipes scrollback too — we do NOT want the pre-pi shell history
 * hanging around above the session. Gated on `session_start` with
 * `reason: "startup"`, so it does NOT fire for `/reload`, `/new`, `/resume`, or
 * `/fork` (which would otherwise destroy chat scrollback).
 *
 * Why not just write `ESC[2J`?  (pi >= ~0.81):
 * pi now calls `ui.start()` — which paints the first frame, including the
 * prompt's purple bars — BEFORE it fires `session_start` (see interactive-mode:
 * "Start the UI before initializing extensions so session_start handlers can use
 * interactive dialogs"). pi-tui is a *differential* renderer: it keeps a shadow
 * buffer of what it thinks is on screen and only emits diffs. A raw `ESC[2J`
 * here erases the freshly painted prompt behind the renderer's back — the shadow
 * buffer still thinks the bars are there, so the next diff repaints nothing and
 * the purple bars never come back. That was the "purple bars don't appear
 * anymore" bug.
 *
 * The fix: drive the clear through pi-tui itself. `tui.requestRender(true)`
 * forces a full redraw — pi-tui's fullRender path emits `ESC[2J ESC[H ESC[3J`
 * (clear screen + scrollback) and then repaints the whole UI, so we get a clean
 * screen with the prompt/purple bars intact and the shadow buffer stays in sync.
 * This uses only the public `force` parameter, so it survives pi upgrades.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (event, ctx) => {
    if (event.reason !== "startup") return;
    // Terminal-only. In print/RPC/json modes there's no interactive TUI and we'd
    // otherwise blow away whatever the calling process printed before pi.
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    if (!process.stdout.isTTY) return;

    const KEY = "clear-on-startup";

    // A widget factory is the sanctioned way for an extension to get a handle to
    // the live TUI. We register a zero-height placeholder purely to capture
    // `tui`, then remove it again. queueMicrotask runs before pi-tui's next
    // scheduled paint (a macrotask), so the placeholder never actually renders.
    ctx.ui.setWidget(KEY, (tui) => {
      queueMicrotask(() => {
        ctx.ui.setWidget(KEY, undefined);
        // Forced full redraw: clears screen + scrollback (ESC[2J/H/3J) and
        // repaints the whole UI, keeping the renderer's shadow buffer in sync.
        tui.requestRender(true);
      });
      return new Text("", 0, 0);
    });
  });
}
