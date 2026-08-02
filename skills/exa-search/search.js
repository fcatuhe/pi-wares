#!/usr/bin/env node

import { callExaMcp } from "./exa-mcp.js";

const args = process.argv.slice(2);

let numResults = 5;
const nIndex = args.indexOf("-n");
if (nIndex !== -1 && args[nIndex + 1]) {
	numResults = parseInt(args[nIndex + 1], 10);
	args.splice(nIndex, 2);
}

const query = args.join(" ");

if (!query) {
	console.log("Usage: search.js <query> [-n <num>]");
	console.log("\nOptions:");
	console.log("  -n <num>     Number of results (default: 5, max: 20)");
	console.log("\nEnvironment:");
	console.log("  EXA_API_KEY  Optional. Without it, uses Exa's keyless rate-limited endpoint.");
	console.log("\nExamples:");
	console.log('  search.js "javascript async await"');
	console.log('  search.js "rust programming latest 2026" -n 10');
	process.exit(1);
}

try {
	console.log(await callExaMcp("web_search_exa", { query, numResults: Math.min(numResults, 20) }));
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
