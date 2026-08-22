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

// INFO: fc 17aug26 pi sanitizes tool output (core/tools/render-utils.js) but prints call arguments as the model wrote them
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

// INFO: fc 06aug26 no underscore in either name: pi-ai canonicalizes a match against its first-party list (anthropic-messages.js:64), "web_search" would not
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
		// INFO: fc 17aug26 the clock covers the whole call, credential resolution included, not the request alone
		const started = performance.now();
		const worker = await resolveWorker(ctx);
		const response = await postMessages(worker, searchRequest(worker.model.id, params.query), signal);
		const results = parseSearchResults(response);
		return {
			content: [{ type: "text", text: formatResults(results, performance.now() - started) }],
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
		const started = performance.now();
		const worker = await resolveWorker(ctx);
		onUpdate?.({ content: [{ type: "text", text: `Fetching ${params.url}` }], details: {} });
		const page = await fetchPage(params.url, signal);
		const request = summaryRequest(worker.model.id, page.url, page.markdown, params.prompt);
		const response = await postMessages(worker, request, signal);
		// INFO: fc 17aug26 pi previews this text in the row, so what a reader wants belongs in its first line
		const cut = page.truncated ? ", truncated before reading" : "";
		const head = `Received ${formatSize(page.bytes)} (${page.status} ${page.statusText}${cut}) in ${formatDuration(performance.now() - started)}`;
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
