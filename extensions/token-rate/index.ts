import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { format, record, type Sample } from "./rate.ts";

const KEY = "token-rate";

export default function (pi: ExtensionAPI) {
	let samples: Sample[] = [];
	let firstChunkMs: number | null = null;
	let lastChunkMs: number | null = null;

	function paint(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		const text = format(samples);
		ctx.ui.setStatus(KEY, text === undefined ? undefined : ctx.ui.theme.fg("accent", text));
	}

	function reset(ctx: ExtensionContext): void {
		samples = [];
		firstChunkMs = null;
		lastChunkMs = null;
		paint(ctx);
	}

	pi.on("session_start", (_event, ctx) => reset(ctx));
	// INFO: fc 11aug26 models generate at wildly different rates, averaging across a switch describes neither
	pi.on("model_select", (_event, ctx) => reset(ctx));

	pi.on("message_start", (event) => {
		if (event.message.role !== "assistant") return;
		firstChunkMs = null;
		lastChunkMs = null;
	});

	// INFO: fc 11aug26 the stream window, not the turn: turn_start puts queueing and thinking in the denominator
	pi.on("message_update", (event) => {
		if (event.message.role !== "assistant") return;
		const now = Date.now();
		firstChunkMs ??= now;
		lastChunkMs = now;
	});

	pi.on("message_end", (event, ctx) => {
		const message = event.message;
		if (message.role !== "assistant") return;
		const tokens = message.usage?.output ?? 0;
		const seconds = firstChunkMs !== null && lastChunkMs !== null ? (lastChunkMs - firstChunkMs) / 1000 : 0;
		samples = record(samples, { tokens, seconds });
		firstChunkMs = null;
		lastChunkMs = null;
		paint(ctx);
	});
}
