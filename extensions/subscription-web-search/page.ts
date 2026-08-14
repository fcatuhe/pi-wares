const FETCH_TIMEOUT_MS = 20_000;
const MAX_PAGE_BYTES = 5_000_000;
const MAX_MARKDOWN_CHARS = 300_000;
// INFO: fc 06aug26 a descriptive agent user-agent is blocked or served a consent wall by enough sites to make the tool unreliable.
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

interface TurndownInstance {
	use(plugin: unknown): void;
	remove(tags: string[]): void;
	turndown(html: string): string;
}

type TurndownConstructor = new (options: Record<string, string>) => TurndownInstance;

export interface Page {
	url: string;
	status: number;
	statusText: string;
	bytes: number;
	contentType: string;
	markdown: string;
	truncated: boolean;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb < 100 ? kb.toFixed(1) : Math.round(kb)}KB`;
	return `${(kb / 1024).toFixed(1)}MB`;
}

export function formatPage(page: Page, answer: string): string {
	const cut = page.truncated ? ", truncated before reading" : "";
	return `${page.url} (${formatBytes(page.bytes)}${cut})\n\n${answer}`;
}

export function validateUrl(url: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Not a URL: ${url}`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`Only http and https are fetchable, got ${parsed.protocol}`);
	}
	return parsed;
}

export function capMarkdown(markdown: string): { markdown: string; truncated: boolean } {
	if (markdown.length <= MAX_MARKDOWN_CHARS) return { markdown, truncated: false };
	return { markdown: markdown.slice(0, MAX_MARKDOWN_CHARS), truncated: true };
}

export async function fetchPage(url: string, signal?: AbortSignal): Promise<Page> {
	const target = validateUrl(url);
	const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
	const response = await fetch(target, {
		redirect: "follow",
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
		headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8" },
	});
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${response.statusText} for ${target.href}`);
	}
	const contentType = response.headers.get("content-type") ?? "";
	const { text, bytes } = await readCapped(response);
	const rendered = isHtml(contentType) ? await renderMarkdown(text, target.href) : plainText(contentType, text);
	const capped = capMarkdown(rendered);
	if (!capped.markdown) {
		throw new Error(`No text in ${target.href}`);
	}
	return {
		url: response.url || target.href,
		status: response.status,
		statusText: response.statusText,
		bytes,
		contentType,
		markdown: capped.markdown,
		truncated: capped.truncated,
	};
}

// INFO: fc 06aug26 css-tree warns straight to the console on ordinary pages (css-tree/lib/lexer/match.js:528) and jsdom exposes no hook for it, so it is muted around the parse rather than left to land in the TUI.
export function withoutCssWarnings<T>(parse: () => T): T {
	const warn = console.warn;
	console.warn = () => {};
	try {
		return parse();
	} finally {
		console.warn = warn;
	}
}

// INFO: fc 06aug26 jsdom and turndown cost ~200ms to import, so they load on first fetch rather than at pi startup.
export async function renderMarkdown(html: string, url: string): Promise<string> {
	const [{ JSDOM }, { Readability }, turndown, gfm] = await Promise.all([
		import("jsdom"),
		import("@mozilla/readability"),
		import("turndown") as Promise<{ default: TurndownConstructor }>,
		import("turndown-plugin-gfm") as Promise<{ gfm: unknown }>,
	]);
	const extracted = withoutCssWarnings(() => {
		const document = new JSDOM(html, { url }).window.document;
		const body = document.body?.innerHTML ?? "";
		// INFO: fc 06aug26 Readability rewrites the document it parses, so the fallback body is taken first.
		const article = new Readability(document).parse();
		return { body, title: article?.title?.trim(), content: article?.content };
	});
	const service = new turndown.default({ headingStyle: "atx", codeBlockStyle: "fenced" });
	service.use(gfm.gfm);
	service.remove(["script", "style", "noscript"]);
	const markdown = service.turndown(extracted.content ?? extracted.body).trim();
	if (!markdown) {
		throw new Error(`No readable text extracted from ${url}`);
	}
	return extracted.title ? `# ${extracted.title}\n\n${markdown}` : markdown;
}

function isHtml(contentType: string): boolean {
	return /\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType);
}

function plainText(contentType: string, body: string): string {
	if (!/^\s*(?:text\/|application\/(?:json|xml|.*\+json|.*\+xml))/i.test(contentType)) {
		throw new Error(`Not a text document: ${contentType || "unknown content type"}`);
	}
	return body.trim();
}

// INFO: fc 06aug26 read through the stream and stop at the cap: content-length is absent on chunked responses, and response.text() would buffer the whole body before any check.
async function readCapped(response: Response): Promise<{ text: string; bytes: number }> {
	const declared = Number(response.headers.get("content-length") ?? Number.NaN);
	if (Number.isFinite(declared) && declared > MAX_PAGE_BYTES) {
		throw new Error(`Page declares ${declared} bytes, over the ${MAX_PAGE_BYTES} byte limit`);
	}
	if (!response.body) return { text: "", bytes: 0 };
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		bytes += value.byteLength;
		if (bytes > MAX_PAGE_BYTES) {
			await reader.cancel();
			throw new Error(`Page exceeds the ${MAX_PAGE_BYTES} byte limit`);
		}
		chunks.push(value);
	}
	return { text: new TextDecoder().decode(Buffer.concat(chunks)), bytes };
}
