import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	formatResults,
	MAX_QUERY_CHARS,
	parseSearchResults,
	parseText,
	postMessages,
	resolveWorker,
	type SearchResult,
	searchRequest,
	summaryRequest,
	usageFrom,
} from "./anthropic.ts";
import { fetchPage, formatBytes, formatPage } from "./page.ts";

interface SearchDetails {
	query: string;
	results: SearchResult[];
	ms: number;
}

interface FetchDetails {
	url: string;
	status: number;
	statusText: string;
	bytes: number;
	contentType: string;
	ms: number;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const answerOf = (result: { content: Array<{ type: string; text?: string }> }) =>
	result.content.find((block) => block.type === "text")?.text ?? "";

// The row would otherwise read "0 results" for a call that failed loudly, hiding why.
const errorText = (result: { content: Array<{ type: string; text?: string }> }, theme: Theme) =>
	new Text(theme.fg("error", answerOf(result) || "failed"), 0, 0);

// INFO: fc 06aug26 no underscore in either name: pi-ai canonicalizes a tool whose name matches its first-party list case-insensitively (anthropic-messages.js:64), which both passes the subscription transport as-is and tells subscription-tool-alias the transport accepted it, so neither tool needs an mcp__ alias. "web_search" would match nothing and be aliased.
export const websearch = defineTool({
	name: "websearch",
	label: "Web Search",
	description:
		"Search the web and get back a ranked list of titles and URLs. Returns no page text: read a result with webfetch.",
	promptSnippet: "Search the web for pages about a query, returning titles and URLs only",
	parameters: Type.Object({
		query: Type.String({
			maxLength: MAX_QUERY_CHARS,
			description: "Search query, as you would type it into a search engine",
		}),
	}),

	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const started = Date.now();
		const worker = await resolveWorker(ctx);
		const response = await postMessages(worker, searchRequest(worker.model.id, params.query), signal);
		const results = parseSearchResults(response);
		return {
			content: [{ type: "text", text: formatResults(params.query, results) }],
			details: { query: params.query, results, ms: Date.now() - started } satisfies SearchDetails,
			usage: usageFrom(worker.model, response),
		};
	},

	renderCall(args, theme) {
		const title = theme.fg("toolTitle", theme.bold("Web Search"));
		return new Text(args.query ? `${title}${theme.fg("muted", `("${args.query}")`)}` : title, 0, 0);
	},

	renderResult(result, { expanded, isPartial }, theme, context) {
		if (isPartial) return new Text(theme.fg("muted", "Searching..."), 0, 0);
		if (context.isError) return errorText(result, theme);
		const details = result.details as SearchDetails;
		let text = theme.fg("muted", `Did 1 search in ${seconds(details.ms)}, ${details.results.length} results`);
		if (expanded) {
			for (const found of details.results) {
				text += `\n${theme.fg("dim", found.title)}\n  ${theme.fg("muted", found.url)}`;
			}
		}
		return new Text(text, 0, 0);
	},
});

export const webfetch = defineTool({
	name: "webfetch",
	label: "Web Fetch",
	description:
		"Fetch one URL and answer a question about it. The page is converted to markdown and read by a small model, so state exactly which facts you need. For raw bytes use bash curl instead.",
	promptSnippet: "Fetch one web page and extract the facts a prompt asks for",
	parameters: Type.Object({
		url: Type.String({ description: "Absolute http or https URL" }),
		prompt: Type.String({ description: "What to extract from the page, stated as a request" }),
	}),

	async execute(_toolCallId, params, signal, onUpdate, ctx) {
		const started = Date.now();
		const worker = await resolveWorker(ctx);
		onUpdate?.({ content: [{ type: "text", text: `Fetching ${params.url}` }], details: {} });
		const page = await fetchPage(params.url, signal);
		const request = summaryRequest(worker.model.id, page.url, page.markdown, params.prompt);
		const response = await postMessages(worker, request, signal);
		return {
			content: [{ type: "text", text: formatPage(page, parseText(response)) }],
			details: {
				url: page.url,
				status: page.status,
				statusText: page.statusText,
				bytes: page.bytes,
				contentType: page.contentType,
				ms: Date.now() - started,
			} satisfies FetchDetails,
			usage: usageFrom(worker.model, response),
		};
	},

	renderCall(args, theme) {
		const title = theme.fg("toolTitle", theme.bold("Fetch"));
		return new Text(args.url ? `${title}${theme.fg("muted", `(${args.url})`)}` : title, 0, 0);
	},

	renderResult(result, { expanded, isPartial }, theme, context) {
		if (isPartial) return new Text(theme.fg("muted", "Fetching..."), 0, 0);
		if (context.isError) return errorText(result, theme);
		const details = result.details as FetchDetails;
		let text = theme.fg(
			"muted",
			`Received ${formatBytes(details.bytes)} (${details.status} ${details.statusText}) in ${seconds(details.ms)}`,
		);
		if (expanded) text += `\n${theme.fg("dim", answerOf(result))}`;
		return new Text(text, 0, 0);
	},
});

export default function subscriptionWebSearch(pi: ExtensionAPI): void {
	pi.registerTool(websearch);
	pi.registerTool(webfetch);
}
