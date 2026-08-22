import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";

import { existingLines, refusal, review } from "./comments.ts";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event) => {
		if (isToolCallEventType("write", event)) {
			const { path, content } = event.input;
			return refusal(path, review(path, content, existingLines(path)));
		}
		if (isToolCallEventType("edit", event)) {
			const { path, edits } = event.input;
			const existing = existingLines(path);
			return refusal(path, edits.flatMap(({ newText }) => review(path, newText, existing)));
		}
	});
}
