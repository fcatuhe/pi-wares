import { basename, dirname, relative } from "node:path";

const MARKDOWN = /\.(md|markdown|mdx)$/i;
const MAX_RECENT = 20;

export type Config = { auto: boolean; direction: "right" | "down"; ratio?: number };
export type Command = { kind: "auto" } | { kind: "pick" } | { kind: "open"; path: string };

export const DEFAULTS: Config = { auto: false, direction: "right" };

export function parseCommand(args: string): Command {
	const arg = args.trim();
	if (!arg) return { kind: "pick" };
	if (arg === "auto") return { kind: "auto" };
	return { kind: "open", path: arg };
}

export function isMarkdown(path: string): boolean {
	return MARKDOWN.test(path);
}

export function remember(recent: string[], path: string): string[] {
	return [path, ...recent.filter((seen) => seen !== path)].slice(0, MAX_RECENT);
}

export function candidates(recent: string[], repo: string[]): string[] {
	const touched = new Set(recent);
	return [...recent, ...repo.filter((path) => !touched.has(path))];
}

export function matching(candidates: string[], prefix: string): string[] {
	const needle = prefix.trim().toLowerCase();
	return needle ? candidates.filter((path) => path.toLowerCase().includes(needle)) : candidates;
}

export function shortestPath(path: string, cwd: string, home: string): string {
	const fromCwd = relative(cwd, path);
	if (fromCwd && !fromCwd.startsWith("..")) return fromCwd;
	const fromHome = relative(home, path);
	return fromHome && !fromHome.startsWith("..") ? `~/${fromHome}` : path;
}

export function paneLabel(path: string, cwd: string, home: string): string {
	const shown = shortestPath(path, cwd, home);
	return dirname(shown) === "." ? basename(path) : `${basename(path)} (${shown})`;
}

export function quote(path: string): string {
	return `'${path.replaceAll("'", `'\\''`)}'`;
}

export function viewerCommand(path: string): string {
	return `mdcat --watch ${quote(path)}`;
}

export function parseConfig(raw: string | undefined): Config {
	let parsed: Partial<Config>;
	try {
		parsed = JSON.parse(raw ?? "");
	} catch {
		return DEFAULTS;
	}
	const ratio = Number(parsed?.ratio);
	return {
		auto: parsed?.auto === true,
		direction: parsed?.direction === "down" ? "down" : "right",
		...(ratio > 0 && ratio < 1 ? { ratio } : {}),
	};
}

export function splitArgs(paneId: string, cwd: string, config: Config): string[] {
	return [
		"pane",
		"split",
		"--pane",
		paneId,
		"--direction",
		config.direction,
		...(config.ratio ? ["--ratio", String(config.ratio)] : []),
		"--cwd",
		cwd,
		"--no-focus",
	];
}
