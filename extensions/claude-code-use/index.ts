// Thin wrapper around @benvargas/pi-claude-code-use.
//
// The upstream entry point lives at
// node_modules/@benvargas/pi-claude-code-use/extensions/index.ts. Pointing
// pi.extensions at it directly makes pi's config selector label it as a bare
// "index.ts" (it only prefixes the parent folder when that folder isn't itself
// named "extensions"). Re-exporting from here gives it a readable label:
// "claude-code-use/index.ts".
export { default } from "@benvargas/pi-claude-code-use/extensions/index.ts";
