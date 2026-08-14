// INFO: fc 14aug26 the package ships no types and DefinitelyTyped has no @types/turndown-plugin-gfm, so the one export this extension uses is declared here against @types/turndown.
declare module "turndown-plugin-gfm" {
	import type TurndownService from "turndown";

	export const gfm: TurndownService.Plugin;
}
