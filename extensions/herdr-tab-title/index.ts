// Lets the agent label its Herdr tab via a `set_tab_title` tool. Reverts on
// /new and quit, but only labels this extension set (never clobbers a manual
// rename). No-op outside Herdr and outside the interactive TUI session that
// owns the pane (so sidequest/headless/RPC children don't touch the tab).

import { execFile } from "node:child_process";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PANE_ID = process.env.HERDR_PANE_ID;
const TAB_ID = process.env.HERDR_TAB_ID;
const ENABLED = process.env.HERDR_ENV === "1" && !!(TAB_ID || PANE_ID);
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
// The last label we set ourselves. Used to detect a manual user rename so we
// never revert a title the user chose.
let lastSetTitle: string | undefined;

async function tabId(): Promise<string | undefined> {
	if (cachedTabId) return cachedTabId;
	// Herdr now exposes the tab id directly; fall back to the pane lookup.
	cachedTabId =
		TAB_ID ?? field<string>(await herdr(["pane", "get", PANE_ID!]), "result", "pane", "tab_id");
	return cachedTabId;
}

function clean(raw: string): string {
	return raw.split(/\r?\n/)[0]?.replace(/\s+/g, " ").trim().slice(0, MAX_LEN).trim() ?? "";
}

// Only the interactive terminal session that owns the pane should touch the
// tab. Sidequest / headless children run one-shot in "json"/"print" mode (and
// RPC children in "rpc") inheriting HERDR_* — gating to "tui" keeps them from
// clobbering the parent's label on their own shutdown.
function ownsTab(mode: string | undefined): boolean {
	return mode === "tui";
}

async function reset(): Promise<void> {
	// We only ever revert a custom label we set ourselves.
	if (lastSetTitle === undefined) return;
	const id = await tabId();
	if (!id) return;
	const tab = await herdr(["tab", "get", id]);
	const num = field<number>(tab, "result", "tab", "number");
	if (num === undefined) return;
	// Don't clobber a manual rename: bail unless the current label still matches
	// what we set (an absent/changed label counts as "not ours").
	const label = field<string>(tab, "result", "tab", "label");
	if (label !== lastSetTitle) return;
	await herdr(["tab", "rename", id, String(num)]);
	lastSetTitle = undefined;
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
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ownsTab(ctx?.mode))
				return { content: [{ type: "text", text: "Not the owning Herdr tab; ignored." }] };
			const title = clean(String((params as { title?: unknown }).title ?? ""));
			if (!title) return { content: [{ type: "text", text: "Empty title; tab unchanged." }] };
			const id = await tabId();
			if (!id) return { content: [{ type: "text", text: "Herdr tab unavailable." }] };
			await herdr(["tab", "rename", id, title]);
			lastSetTitle = title;
			return { content: [{ type: "text", text: `Tab labeled: ${title}` }] };
		},
	});

	// On /new, pi tears down the old runtime (session_shutdown reason "new")
	// before loading a fresh one, and the extension loader re-imports this module
	// with no module cache — so lastSetTitle only survives on the OLD instance.
	// Reset from shutdown for both "new" and "quit"; not "reload"/"resume"/"fork".
	pi.on("session_shutdown", async (event, ctx) => {
		if ((event.reason === "quit" || event.reason === "new") && ownsTab(ctx?.mode))
			await reset();
	});
}
