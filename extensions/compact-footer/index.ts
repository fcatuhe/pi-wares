import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, FooterComponent, getAgentDir } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// INFO: fc 02aug26 mirrors SettingsManager.getCompactionEnabled(): project settings over global, default true
function autoCompactEnabled(cwd: string): boolean {
	for (const file of [join(cwd, CONFIG_DIR_NAME, "settings.json"), join(getAgentDir(), "settings.json")]) {
		try {
			const enabled = JSON.parse(readFileSync(file, "utf8"))?.compaction?.enabled;
			if (typeof enabled === "boolean") return enabled;
		} catch {}
	}
	return true;
}

const RIGHTMOST_STATUS_KEYS = ["usage", "token-rate"];

function statusLine(statuses: ReadonlyMap<string, string>): string {
	const rank = (key: string) => RIGHTMOST_STATUS_KEYS.indexOf(key);
	return Array.from(statuses.entries())
		.sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
		.map(([, text]) => text.replace(/[\r\n\t]+/g, " "))
		.join(" ");
}

function usingSubscription(ctx: ExtensionContext, provider: string): boolean {
	const model = ctx.model;
	if (!model || model.provider !== provider) return false;
	return ctx.modelRegistry.isUsingOAuth(model) && ctx.modelRegistry.getProvider(provider)?.auth?.oauth?.isSubscription === true;
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
				// INFO: fc 06aug26 FooterComponent.render() calls modelRuntime.isUsingSubscription(providerId) for the (sub) indicator, pi >= 0.84
				modelRuntime: {
					isUsingSubscription: (provider: string) => usingSubscription(ctx, provider),
				},
				getContextUsage: () => ctx.getContextUsage(),
			} as any, footerData);
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
