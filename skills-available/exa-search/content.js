#!/usr/bin/env node

import { callExaMcp } from "./exa-mcp.js";

const urls = process.argv.slice(2);

if (urls.length === 0 || !urls.every((url) => url.startsWith("http"))) {
	console.log("Usage: content.js <url> [url...]");
	console.log("\nFetches URLs and prints readable content as markdown.");
	console.log("\nEnvironment:");
	console.log("  EXA_API_KEY  Optional. Without it, uses Exa's keyless rate-limited endpoint.");
	process.exit(1);
}

try {
	console.log(await callExaMcp("web_fetch_exa", { urls }));
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
