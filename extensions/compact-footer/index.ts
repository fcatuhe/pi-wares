/**
 * Compact Footer Extension
 *
 * Reuses the built-in FooterComponent and merges its line 3 (extension statuses)
 * onto line 1 (path), reducing the footer from 3 lines to 2.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FooterComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/**
 * Mirror SettingsManager.getCompactionEnabled(): project settings override global, default true.
 *
 * Known drift vs the built-in footer: toggling auto-compact via /settings updates the built-in
 * instance live (interactive-mode pokes it directly) and persists to global settings.json
 * immediately, but extensions get no event for the toggle. So this footer shows a stale (auto)
 * indicator for the remainder of the current session after a live toggle; correct again at next
 * footer construction (session start/switch). Cosmetic only — compaction behavior is unaffected.
 * Proper fix is upstream: expose autoCompactionEnabled on ExtensionContext or emit a settings event.
 */
function autoCompactEnabled(cwd: string): boolean {
	for (const file of [join(cwd, ".pi", "settings.json"), join(homedir(), ".pi", "agent", "settings.json")]) {
		try {
			const enabled = JSON.parse(readFileSync(file, "utf8"))?.compaction?.enabled;
			if (typeof enabled === "boolean") return enabled;
		} catch {}
	}
	return true;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setFooter((_tui, theme, footerData) => {
			const builtIn = new FooterComponent({
				get state() {
					return { model: ctx.model, get thinkingLevel() { return pi.getThinkingLevel(); } };
				},
				sessionManager: ctx.sessionManager,
				modelRegistry: ctx.modelRegistry,
				getContextUsage: () => ctx.getContextUsage(),
			} as any, footerData);
			builtIn.setAutoCompactEnabled(autoCompactEnabled(ctx.cwd));

			return {
				dispose: () => builtIn.dispose(),
				invalidate: () => builtIn.invalidate(),
				render(width: number): string[] {
					const lines = builtIn.render(width);
					if (lines.length < 3) return lines;

					const statusW = visibleWidth(lines[2]);
					const maxW = width - statusW - 2;
					let left = lines[0];
					if (visibleWidth(left) > maxW)
						left = truncateToWidth(left, Math.max(0, maxW), theme.fg("dim", "…"));

					lines[0] = left + " ".repeat(Math.max(1, width - visibleWidth(left) - statusW)) + lines[2];
					lines.length = 2;
					return lines;
				},
			};
		});
	});
}
