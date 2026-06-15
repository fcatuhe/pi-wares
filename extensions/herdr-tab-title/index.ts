// Lets the agent label its Herdr tab via a `set_tab_title` tool. Resets on
// /new and quit. No-op outside Herdr.

import { execFile } from "node:child_process";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PANE_ID = process.env.HERDR_PANE_ID;
const ENABLED = process.env.HERDR_ENV === "1" && !!PANE_ID;
const MAX_LEN = 32;

function herdr(args: string[]): Promise<string> {
	return new Promise((resolve) => {
		execFile("herdr", args, { timeout: 1500 }, (_err, stdout) => resolve(stdout ?? ""));
	});
}

function field<T = unknown>(json: string, ...path: string[]): T | undefined {
	try {
		let node: unknown = JSON.parse(json);
		for (const key of path) {
			if (!node || typeof node !== "object") return undefined;
			node = (node as Record<string, unknown>)[key];
		}
		return node as T;
	} catch {
		return undefined;
	}
}

let cachedTabId: string | undefined;

async function tabId(): Promise<string | undefined> {
	if (cachedTabId) return cachedTabId;
	cachedTabId = field<string>(await herdr(["pane", "get", PANE_ID!]), "result", "pane", "tab_id");
	return cachedTabId;
}

function clean(raw: string): string {
	return raw.split(/\r?\n/)[0]?.replace(/\s+/g, " ").trim().slice(0, MAX_LEN).trim() ?? "";
}

async function reset(): Promise<void> {
	const id = await tabId();
	if (!id) return;
	const num = field<number>(await herdr(["tab", "get", id]), "result", "tab", "number");
	if (num === undefined) return;
	await herdr(["tab", "rename", id, String(num)]);
}

export default function (pi: ExtensionAPI) {
	if (!ENABLED) return;

	pi.registerTool({
		name: "set_tab_title",
		label: "Set Tab Title",
		description:
			"Set the Herdr tab label to a short (<=32 char) human-readable summary of the task " +
			"you are currently working on, so the user can see at a glance what this tab is doing.",
		promptSnippet: "Keep the Herdr tab label in sync with the current task via set_tab_title",
		promptGuidelines: [
			"Call set_tab_title at the very start of each new task and whenever the focus of work " +
				"meaningfully changes, with a concise phrase of about 3-5 words (e.g. 'fixing auth bug', " +
				"'writing tests', 'reviewing PR feedback'). Keep it short and do not announce that you " +
				"called it.",
		],
		parameters: Type.Object({
			title: Type.String({ description: "Short task summary, <= 32 chars." }),
		}),
		async execute(_toolCallId, params) {
			const title = clean(String((params as { title?: unknown }).title ?? ""));
			if (!title) return { content: [{ type: "text", text: "Empty title; tab unchanged." }] };
			const id = await tabId();
			if (!id) return { content: [{ type: "text", text: "Herdr tab unavailable." }] };
			await herdr(["tab", "rename", id, title]);
			return { content: [{ type: "text", text: `Tab labeled: ${title}` }] };
		},
	});

	pi.on("session_start", async (event) => {
		if (event.reason === "new") await reset();
	});
	pi.on("session_shutdown", async (event) => {
		if (event.reason === "quit") await reset();
	});
}
