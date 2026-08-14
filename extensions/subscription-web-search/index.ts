import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	formatResults,
	MAX_QUERY_CHARS,
	parseSearchResults,
	parseText,
	postMessages,
	resolveWorker,
	searchRequest,
	summaryRequest,
	usageFrom,
} from "./anthropic.ts";
import { fetchPage, formatPage } from "./page.ts";

const callLine = (lastComponent: unknown, content: string): Text => {
	const text = (lastComponent as Text | undefined) ?? new Text("", 0, 0);
	text.setText(content);
	return text;
};

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
		const worker = await resolveWorker(ctx);
		const response = await postMessages(worker, searchRequest(worker.model.id, params.query), signal);
		const results = parseSearchResults(response);
		return {
			content: [{ type: "text", text: formatResults(params.query, results) }],
			details: { query: params.query, results },
			usage: usageFrom(worker.model, response),
		};
	},

	renderCall(args, theme, context) {
		const title = theme.fg("toolTitle", theme.bold("websearch"));
		return callLine(context.lastComponent, args.query ? `${title} ${theme.fg("accent", args.query)}` : title);
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
		const worker = await resolveWorker(ctx);
		onUpdate?.({ content: [{ type: "text", text: `Fetching ${params.url}` }], details: {} });
		const page = await fetchPage(params.url, signal);
		const request = summaryRequest(worker.model.id, page.url, page.markdown, params.prompt);
		const response = await postMessages(worker, request, signal);
		return {
			content: [{ type: "text", text: formatPage(page, parseText(response)) }],
			details: { url: page.url, status: page.status, bytes: page.bytes, contentType: page.contentType },
			usage: usageFrom(worker.model, response),
		};
	},

	renderCall(args, theme, context) {
		const title = theme.fg("toolTitle", theme.bold("webfetch"));
		let text = args.url ? `${title} ${theme.fg("accent", args.url)}` : title;
		if (context.expanded && args.prompt) text += theme.fg("toolOutput", ` ${args.prompt}`);
		return callLine(context.lastComponent, text);
	},
});

export default function subscriptionWebSearch(pi: ExtensionAPI): void {
	pi.registerTool(websearch);
	pi.registerTool(webfetch);
}
