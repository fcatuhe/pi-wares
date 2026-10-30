import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

let armed = false;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "rpc" || armed) return;
    armed = true;

    process.stdin.once("end", letShutdownFinish);
    process.prependOnceListener("SIGTERM", letShutdownFinish);
  });
}

// INFO: fc 30oct26 a second shutdown trigger makes pi exit mid-dispose and lose a rotated MCP token, so only the first trigger counts
function letShutdownFinish() {
  process.stdin.removeAllListeners("end");
  process.removeAllListeners("SIGTERM");
  process.on("SIGTERM", () => {});
}
