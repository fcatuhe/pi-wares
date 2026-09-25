import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FooterComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { readJson } from "../../lib/files.ts";
import { usingSubscription } from "../../lib/models.ts";
import { agentDir, PROJECT_DIR } from "../../lib/paths.ts";

const RIGHTMOST_STATUS_KEYS = ["subscription-usage-pace", "token-rate"];

function autoCompactEnabled(cwd: string): boolean {
  for (const file of [join(cwd, PROJECT_DIR, "settings.json"), join(agentDir(), "settings.json")]) {
    const enabled = readJson<{ compaction?: { enabled?: unknown } }>(file)?.compaction?.enabled;
    if (typeof enabled === "boolean") return enabled;
  }
  return true;
}

function statusLine(statuses: ReadonlyMap<string, string>): string {
  const rank = (key: string) => RIGHTMOST_STATUS_KEYS.indexOf(key);
  return Array.from(statuses.entries())
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([, text]) => text.replace(/[\r\n\t]+/g, " "))
    .join(" ");
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setFooter((_tui, theme, footerData) => {
      const builtIn = new FooterComponent(
        {
          get state() {
            return {
              model: ctx.model,
              get thinkingLevel() {
                return pi.getThinkingLevel();
              },
            };
          },
          sessionManager: ctx.sessionManager,
          modelRegistry: ctx.modelRegistry,
          modelRuntime: {
            isUsingSubscription: (provider: string) => ctx.model?.provider === provider && usingSubscription(ctx.modelRegistry, ctx.model),
          },
          getContextUsage: () => ctx.getContextUsage(),
        } as any,
        footerData,
      );
      builtIn.setAutoCompactEnabled(autoCompactEnabled(ctx.cwd));

      return {
        dispose: () => builtIn.dispose(),
        invalidate: () => builtIn.invalidate(),
        render(width: number): string[] {
          const lines = builtIn.render(width);
          if (lines.length < 3) return lines;

          lines[2] = statusLine(footerData.getExtensionStatuses());
          const statusW = visibleWidth(lines[2]);
          const maxW = width - statusW - 2;
          let left = lines[0];
          if (visibleWidth(left) > maxW) left = truncateToWidth(left, Math.max(0, maxW), theme.fg("dim", "…"));

          lines[0] = left + " ".repeat(Math.max(1, width - visibleWidth(left) - statusW)) + lines[2];
          lines.length = 2;
          return lines;
        },
      };
    });
  });
}
