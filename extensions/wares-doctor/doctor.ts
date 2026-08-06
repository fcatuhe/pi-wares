import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const DOCTOR = join(import.meta.dirname, "..", "..", "bin", "wares-doctor");

export const APPLY = "apply";
export const REPORT_ENTRY = "wares-doctor-report";

export interface Report {
	lines: string[];
	applied: boolean;
}

export async function runDoctor(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
	const mode = args.trim();
	if (mode !== "" && mode !== APPLY) {
		ctx.ui.notify(`wares-doctor: unknown argument ${mode}, expected "${APPLY}"`, "warning");
		return;
	}

	const applied = mode === APPLY;
	const result = await pi.exec(process.execPath, applied ? [DOCTOR, "--apply"] : [DOCTOR]);
	// INFO: fc 06aug26 the report exits 1 when config is missing, so stdout decides success, not the code
	if (result.stdout.trim() === "") {
		ctx.ui.notify(`wares-doctor failed: ${result.stderr.trim() || `exit ${result.code}`}`, "error");
		return;
	}

	pi.appendEntry<Report>(REPORT_ENTRY, { lines: result.stdout.trimEnd().split("\n"), applied });
}
