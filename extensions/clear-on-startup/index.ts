import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const WIDGET_KEY = "clear-on-startup";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (event, ctx) => {
    const isFreshProcess = event.reason === "startup";
    const isInteractiveTerminal = ctx.hasUI && ctx.mode === "tui" && process.stdout.isTTY;
    if (!isFreshProcess || !isInteractiveTerminal) return;
    clearScreenAndScrollback(ctx);
  });
}

// INFO: fc 31jul26 pi paints the first frame (prompt bars included) before it fires
// session_start, and pi-tui is a differential renderer. Writing ESC[2J here erases
// that frame behind its shadow buffer, so the next diff repaints nothing and the
// prompt stays invisible. A forced render emits ESC[2J/H/3J itself and repaints
// everything, which clears scrollback and keeps the shadow buffer honest.
function clearScreenAndScrollback(ctx: ExtensionContext) {
  // INFO: fc 31jul26 a widget factory is the only public handle to the live TUI.
  // The microtask runs before pi-tui's next paint macrotask, so the placeholder is
  // gone before it can render.
  ctx.ui.setWidget(WIDGET_KEY, (tui) => {
    queueMicrotask(() => {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      tui.requestRender(true);
    });
    return new Text("", 0, 0);
  });
}
