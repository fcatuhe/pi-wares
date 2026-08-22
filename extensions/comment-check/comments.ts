import { existsSync, readFileSync } from "node:fs";

export interface Offence {
	line: string;
	reason: string;
}

export const BUDGET_WORDS = 25;

const MARKERS: Array<[marker: string, extensions: string[]]> = [
	["//", [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".rs", ".swift", ".java", ".kt", ".kts", ".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".scala", ".dart"]],
	["#", [".rb", ".rake", ".gemspec", ".py", ".pl"]],
	["--", [".sql", ".lua"]],
];

const PRAGMA =
	/^(?:@|\/|!|biome-|eslint|prettier-|oxlint-|tslint:|istanbul |c8 |v8 |noqa|type: ignore|rubocop:|pylint:|mypy:|deno-lint-|dprint-|region|endregion)/;

export function review(path: string, text: string, existing: ReadonlySet<string> = new Set()): Offence[] {
	const marker = commentMarker(path);
	if (!marker) return [];
	const test = isTest(path);
	const offences: Offence[] = [];
	const reported = new Set<string>();
	let previousWasComment = false;

	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line.startsWith(marker)) {
			previousWasComment = false;
			continue;
		}
		const comment = line.slice(marker.length).trim();
		if (!comment || PRAGMA.test(comment)) {
			previousWasComment = false;
			continue;
		}
		const continued = previousWasComment;
		previousWasComment = true;
		if (existing.has(line)) continue;

		const reason = fault(comment, test, continued);
		if (!reason || reported.has(line)) continue;
		reported.add(line);
		offences.push({ line, reason });
	}
	return offences;
}

const LISTED = 5;
const CLIPPED = 100;

export function refusal(path: string, offences: Offence[]): { block: true; reason: string } | undefined {
	if (offences.length === 0) return;
	const listed = offences.slice(0, LISTED).map(({ line, reason }) => `  ${reason}:\n    ${clip(line)}`);
	const rest = offences.length - listed.length;
	return {
		block: true,
		reason: [
			`Comment policy refused ${counted(offences.length)} in ${path}:`,
			...listed,
			...(rest > 0 ? [`  and ${counted(rest)} more.`] : []),
			"Send the call again without them. A fact code cannot express is one tagged line inside the budget, the rest is the README's.",
		].join("\n"),
	};
}

function counted(n: number): string {
	return n === 1 ? "1 comment" : `${n} comments`;
}

function clip(line: string): string {
	return line.length > CLIPPED ? `${line.slice(0, CLIPPED)}...` : line;
}

export function existingLines(path: string): ReadonlySet<string> {
	if (!existsSync(path)) return new Set();
	return new Set(
		readFileSync(path, "utf8")
			.split("\n")
			.map((line) => line.trim()),
	);
}

export function commentMarker(path: string): string | undefined {
	const lower = path.toLowerCase();
	return MARKERS.find(([, extensions]) => extensions.some((extension) => lower.endsWith(extension)))?.[0];
}

const TEST_DIR = /^(?:tests?|specs?|__tests__|features)$/;
const TEST_FILE = /(?:^|[._-])(?:tests?|specs?)\.[a-z]+$|^test_/;

export function isTest(path: string): boolean {
	const segments = path.toLowerCase().split(/[\\/]/);
	const name = segments.pop() ?? "";
	return TEST_FILE.test(name) || segments.some((segment) => TEST_DIR.test(segment));
}

const TAG = /^(?:TODO|FIXME|OPTIMIZE|INFO):/;
const NOTE = /^(?:TODO|FIXME|OPTIMIZE|INFO): [a-z]{2,4} \d{2}[a-z]{3}\d{2}\s+(?=\S)/;

function fault(comment: string, test: boolean, continued: boolean): string | undefined {
	if (continued) return "a second comment line, so the note belongs in the README";
	if (TAG.test(comment)) {
		if (!NOTE.test(comment)) return "a tag without initials and a DDmmmYY date";
		return budget(comment.replace(NOTE, ""));
	}
	if (looksLikeCode(comment)) return "commented-out code, delete it, git remembers";
	if (!test) return "untagged prose in code, so it is a tagged note, a name, or nothing";
	return budget(comment);
}

const CLOSER = /[;{}]$/;
const CALL = /^[\w.]+\(/;
const DECLARATION = /^(?:if|else|elsif|for|while|return|const|let|var|def|import|export|function|class|fn)\b/;
const OPERATOR = /[=(){}]/;

function looksLikeCode(comment: string): boolean {
	if (CLOSER.test(comment) || CALL.test(comment)) return true;
	return DECLARATION.test(comment) && OPERATOR.test(comment);
}

function budget(description: string): string | undefined {
	const words = description.split(/\s+/).filter(Boolean).length;
	return words > BUDGET_WORDS ? `${words} words, over the ${BUDGET_WORDS}-word budget` : undefined;
}
