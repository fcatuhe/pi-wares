import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
	DynamicBorder,
	type ExtensionAPI,
	type ExtensionCommandContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

import {
	candidates,
	type Config,
	DEFAULTS,
	matching,
	isMarkdown,
	paneLabel,
	parseCommand,
	parseConfig,
	remember,
	shortestPath,
	splitArgs,
	viewerCommand,
} from "./preview.ts";

const CONFIG_FILENAME = "herdr-preview.json";
const VIEWER = "mdcat";
const HERDR_TIMEOUT_MS = 5000;
const STOP_POLL_MS = 100;
const STOP_ATTEMPTS = 15;
const VISIBLE_ROWS = 12;

const paneId = process.env.HERDR_PANE_ID;

function onPath(binary: string): boolean {
	return (process.env.PATH ?? "").split(":").some((dir) => {
		try {
			accessSync(join(dir, binary), constants.X_OK);
			return true;
		} catch {
			return false;
		}
	});
}

export default function (pi: ExtensionAPI) {
	if (process.env.HERDR_ENV !== "1" || !paneId || !onPath(VIEWER)) return;

	let cwd = process.cwd();
	let recent: string[] = [];
	let repo: string[] = [];
	let viewerPane: string | undefined;
	let viewerLabel: string | undefined;
	let chain: Promise<void> = Promise.resolve();
	let shutdown = false;

	function configFile(): string {
		return join(getAgentDir(), "extensions", CONFIG_FILENAME);
	}

	function config(): Config {
		const file = configFile();
		if (!existsSync(file)) return DEFAULTS;
		try {
			return parseConfig(readFileSync(file, "utf8"));
		} catch (err) {
			console.error(`[herdr-preview] ignoring ${file}: ${err}`);
			return DEFAULTS;
		}
	}

	async function herdr(args: string[]): Promise<any> {
		const result = await pi.exec("herdr", args, { timeout: HERDR_TIMEOUT_MS });
		if (result.code !== 0) return undefined;
		try {
			return JSON.parse(result.stdout).result;
		} catch {
			return undefined;
		}
	}

	function enqueue(task: () => Promise<void>): Promise<void> {
		chain = chain.then(() => (shutdown ? undefined : task())).catch(() => {});
		return chain;
	}

	async function livePane(): Promise<string | undefined> {
		if (!viewerPane) return undefined;
		if (await herdr(["pane", "get", viewerPane])) return viewerPane;
		viewerPane = undefined;
		viewerLabel = undefined;
		return undefined;
	}

	async function atPrompt(pane: string): Promise<boolean> {
		const info = (await herdr(["pane", "process-info", "--pane", pane]))?.process_info;
		return !info || info.foreground_process_group_id === info.shell_pid;
	}

	// INFO: fc 07aug26 mdcat --watch never exits on its own, so reusing the pane means interrupting it:
	// a command sent while it still runs would be typed into it and swallowed
	async function stopViewer(pane: string): Promise<void> {
		if (await atPrompt(pane)) return;
		await herdr(["pane", "send-keys", pane, "ctrl+c"]);
		for (let attempt = 0; attempt < STOP_ATTEMPTS; attempt++) {
			if (await atPrompt(pane)) return;
			await new Promise((done) => setTimeout(done, STOP_POLL_MS).unref?.());
		}
	}

	async function show(file: string): Promise<void> {
		let pane = await livePane();
		if (pane) {
			await stopViewer(pane);
		} else {
			pane = (await herdr(splitArgs(paneId!, cwd, config())))?.pane?.pane_id;
			if (!pane) return;
			viewerPane = pane;
		}
		viewerLabel = paneLabel(file, cwd, homedir());
		await herdr(["pane", "rename", pane, viewerLabel]);
		await herdr(["pane", "run", pane, viewerCommand(file)]);
	}

	async function pick(ctx: ExtensionCommandContext): Promise<string | undefined> {
		const touched = recent.filter((path) => existsSync(path));
		const choices = candidates(touched, repo).slice(0, 200);
		if (choices.length === 0) {
			ctx.ui.notify("No markdown files found", "warning");
			return undefined;
		}
		if (choices.length === 1) return choices[0];
		// INFO: fc 07aug26 ui.custom needs a real terminal, so RPC mode gets the plain dialog
		if (ctx.mode !== "tui") {
			const shown = choices.map((path) => shortestPath(path, cwd, homedir()));
			const picked = await ctx.ui.select("Preview markdown", shown);
			return picked ? choices[shown.indexOf(picked)] : undefined;
		}

		const items: SelectItem[] = choices.map((path) => ({
			value: path,
			label: shortestPath(path, cwd, homedir()),
			...(touched.includes(path) ? { description: "this session" } : {}),
		}));
		return (
			(await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
				const container = new Container();
				container.addChild(new DynamicBorder((line: string) => theme.fg("accent", line)));
				container.addChild(new Text(theme.fg("accent", theme.bold("Preview markdown")), 1, 0));
				const list = new SelectList(items, Math.min(items.length, VISIBLE_ROWS), {
					selectedPrefix: (t: string) => theme.fg("accent", t),
					selectedText: (t: string) => theme.fg("accent", t),
					description: (t: string) => theme.fg("muted", t),
					scrollInfo: (t: string) => theme.fg("dim", t),
					noMatch: (t: string) => theme.fg("warning", t),
				});
				list.onSelect = (item: SelectItem) => done(item.value);
				list.onCancel = () => done(null);
				container.addChild(list);
				container.addChild(new DynamicBorder((line: string) => theme.fg("accent", line)));
				return {
					render: (width: number) => container.render(width),
					invalidate: () => container.invalidate(),
					handleInput: (data: string) => {
						list.handleInput(data);
						tui.requestRender();
					},
				};
			})) ?? undefined
		);
	}

	function toggleAuto(ctx: ExtensionCommandContext): void {
		const next = { ...config(), auto: !config().auto };
		const file = configFile();
		try {
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
		} catch {
			ctx.ui.notify(`Could not write ${file}`, "error");
			return;
		}
		ctx.ui.notify(`Markdown preview on write: ${next.auto ? "on" : "off"}`, "info");
	}

	async function loadRepoMarkdown(): Promise<void> {
		const listed = await pi.exec("git", ["ls-files", "-z", "*.md", "*.markdown", "*.mdx"], {
			cwd,
			timeout: HERDR_TIMEOUT_MS,
		});
		if (listed.code !== 0) return;
		repo = listed.stdout.split("\0").filter(Boolean).map((path) => resolve(cwd, path));
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI !== true) return;
		cwd = ctx.cwd;
		recent = [];
		await loadRepoMarkdown();
	});

	pi.on("tool_result", (event) => {
		const path = typeof (event.input as any)?.path === "string" ? (event.input as any).path : undefined;
		if (!path || event.isError) return;
		const file = resolve(cwd, path);
		if (!isMarkdown(file)) return;
		recent = remember(recent, file);
		const written = event.toolName === "write" || event.toolName === "edit";
		if (written && config().auto) void enqueue(() => show(file));
	});

	// INFO: fc 07aug26 the pane is borrowed: closing it only when the label is still the one we set
	// leaves anything the user started in there alone
	pi.on("session_shutdown", async () => {
		shutdown = true;
		// INFO: fc 07aug26 a split in flight would otherwise outlive the session it was opened for
		await chain;
		const pane = await livePane();
		if (!pane) return;
		const label = (await herdr(["pane", "get", pane]))?.pane?.label;
		if (label === viewerLabel) await herdr(["pane", "close", pane]);
	});

	pi.registerCommand("preview:md", {
		description: "Preview a markdown file in a herdr split",
		getArgumentCompletions: (prefix: string) => {
			const paths = matching(candidates(recent, repo), prefix).map((path) => ({
				value: shortestPath(path, cwd, homedir()),
				label: shortestPath(path, cwd, homedir()),
			}));
			const auto = matching(["auto"], prefix).map(() => ({
				value: "auto",
				label: "auto",
				description: `preview on write: ${config().auto ? "on" : "off"}`,
			}));
			const items = [...auto, ...paths];
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			if (ctx.hasUI !== true) return;
			const command = parseCommand(args);
			if (command.kind === "auto") return toggleAuto(ctx);

			const file = command.kind === "open" ? resolve(cwd, command.path) : await pick(ctx);
			if (!file) return;
			if (!existsSync(file)) {
				ctx.ui.notify(`No such file: ${file}`, "error");
				return;
			}
			await enqueue(() => show(file));
		},
	});
}
