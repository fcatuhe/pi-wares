import { type Api, calculateCost, type Model, Type, type Usage } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, formatSize } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, Text } from "@earendil-works/pi-tui";
import {
	formatDuration,
	formatResults,
	MAX_QUERY_CHARS,
	parseSearchResults,
	parseText,
	postMessages,
	resolveWorker,
	searchRequest,
	summaryRequest,
	usageTokens,
} from "./anthropic.ts";
import { fetchPage } from "./page.ts";

// INFO: fc 15aug26 a page a fetch summarized can tell the model to put escape sequences in the next call's arguments, and this row prints to the terminal the TUI is drawing on. pi sanitizes tool output (core/tools/render-utils.js) but passes call arguments through as given, so the two rows carrying page-influenced text sanitize their own.
const rowText = (value: unknown): string =>
	typeof value === "string" ? stripTerminalSequences(value).replace(/\p{Cc}/gu, " ") : "";

const usageOf = (model: Model<Api>, response: unknown): Usage => {
	const tokens = usageTokens(response);
	const usage: Usage = {
		...tokens,
		totalTokens: tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	calculateCost(model, usage);
	return usage;
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
		const started = performance.now();
		const response = await postMessages(worker, searchRequest(worker.model.id, params.query), signal);
		const requestMs = performance.now() - started;
		const results = parseSearchResults(response);
		return {
			content: [{ type: "text", text: formatResults(results, requestMs) }],
			details: { query: params.query, results },
			usage: usageOf(worker.model, response),
		};
	},

	renderCall(args, theme, context) {
		const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
		const title = theme.fg("toolTitle", theme.bold("websearch"));
		const query = rowText(args.query);
		text.setText(query ? `${title} ${theme.fg("accent", query)}` : title);
		return text;
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
		// The row is pi's own result preview of this text, so what a reader wants about the fetch belongs in its first line. The url is in the call row right above it.
		const cut = page.truncated ? ", truncated before reading" : "";
		const took = page.cached ? "from cache" : `in ${formatDuration(page.requestMs)}`;
		const head = `Received ${formatSize(page.bytes)} (${page.status} ${page.statusText}${cut}) ${took}`;
		return {
			content: [{ type: "text", text: `${head}\n\n${parseText(response)}` }],
			details: { url: page.url, status: page.status, bytes: page.bytes, contentType: page.contentType },
			usage: usageOf(worker.model, response),
		};
	},

	renderCall(args, theme, context) {
		const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
		const title = theme.fg("toolTitle", theme.bold("webfetch"));
		const url = rowText(args.url);
		const prompt = rowText(args.prompt);
		let content = url ? `${title} ${theme.fg("accent", url)}` : title;
		if (context.expanded && prompt) content += theme.fg("toolOutput", ` ${prompt}`);
		text.setText(content);
		return text;
	},
});

export default function subscriptionWebSearch(pi: ExtensionAPI): void {
	pi.registerTool(websearch);
	pi.registerTool(webfetch);
}
