// INFO: fc 15aug26 the package ships lib/index.d.ts but declares it as module "domino", not under its own name, so the two calls this extension makes are declared here.
declare module "@mixmark-io/domino" {
	export function createWindow(html?: string, address?: string): Window;
	export function createDocument(html?: string, force?: boolean): Document;
}
