export const MAX_LABEL_CHARS = 60;

const HERDR_NUMBERING = /^\d+$/;
const ENDED_LABEL = /^\(.*\)$/;

export function truncateLabel(name: string, limit = MAX_LABEL_CHARS): string {
	return Array.from(name.trim()).slice(0, limit).join("");
}

export function endedLabel(name: string): string {
	return ENDED_LABEL.test(name) ? name : `(${truncateLabel(name, MAX_LABEL_CHARS - 2)})`;
}

// INFO: fc 09mar26 herdr recomputes its numbering from tab position and has no label clear, so a number is never ours to write back
export function borrowedLabel(baseline: string | undefined): string | undefined {
	if (!baseline) return undefined;
	if (HERDR_NUMBERING.test(baseline) || ENDED_LABEL.test(baseline)) return undefined;
	return baseline;
}
