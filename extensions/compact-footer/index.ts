/**
 * Compact Footer Extension
 *
 * Reuses the built-in FooterComponent and merges its line 3 (extension statuses)
 * onto line 1 (path), reducing the footer from 3 lines to 2.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FooterComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setFooter((_tui, theme, footerData) => {
			const builtIn = new FooterComponent({
				get state() {
					return { model: ctx.model, get thinkingLevel() { return pi.getThinkingLevel(); } };
				},
				sessionManager: ctx.sessionManager,
				modelRegistry: (ctx as any).modelRegistry,
				getContextUsage: () => ctx.getContextUsage(),
			} as any, footerData);

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
