// INFO: fc 06aug26 limits, validation and cache lifted from Claude Code 2.1.222's own web fetch, so a page reads the same here as there: 10MB response, 60s, 10 redirects, 2000 character URLs, 1MB of source into the converter, 100k characters of markdown to the model, 15 minute cache capped at 50MB.
const FETCH_TIMEOUT_MS = 60_000;
const MAX_PAGE_BYTES = 10_485_760;
const MAX_REDIRECTS = 10;
const MAX_URL_CHARS = 2000;
const MAX_SOURCE_CHARS = 1_048_576;
const MAX_MARKDOWN_CHARS = 100_000;
const CACHE_TTL_MS = 900_000;
const CACHE_MAX_BYTES = 52_428_800;
// INFO: fc 06aug26 Claude-User is the agent a site sees when a Claude model reads a page to answer someone's question, which is exactly this traffic, on the user's own Anthropic subscription. Claiming the name means keeping its policy: every hostname is cleared against Anthropic's own can_fetch endpoint below, so a publisher who has opted out is refused here as it would be in Claude Code.
const USER_AGENT = "Claude-User (2.1.222; +https://support.anthropic.com/)";
const ACCEPT = "text/markdown, text/html, */*";
const DOMAIN_INFO_URL = "https://api.anthropic.com/api/web/domain_info?domain=";
const DOMAIN_CHECK_TIMEOUT_MS = 10_000;

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

// The row is pi's own result preview of this text, so what a reader wants about the fetch belongs in its first line.
export function formatPage(page: Page, answer: string): string {
	const cut = page.truncated ? ", truncated before reading" : "";
	return `${page.url} (${formatBytes(page.bytes)}, ${page.status} ${page.statusText}${cut})\n\n${answer}`;
}

export function validateUrl(url: string): URL {
	if (url.length > MAX_URL_CHARS) {
		throw new Error(`URL is ${url.length} characters, over the ${MAX_URL_CHARS} limit`);
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Not a URL: ${url}`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`Only http and https are fetchable, got ${parsed.protocol}`);
	}
	// Credentials in a URL are a phishing shape, and a hostname with no dot is a local or intranet name.
	if (parsed.username || parsed.password) {
		throw new Error(`Refusing a URL carrying credentials: ${parsed.host}`);
	}
	if (parsed.hostname.split(".").length < 2) {
		throw new Error(`Not a public hostname: ${parsed.hostname}`);
	}
	parsed.protocol = "https:";
	return parsed;
}

// A redirect may not change publisher: same port, same host bar a leading www. Protocol and credentials are
// not compared because validateUrl has already forced https and refused both, on every hop.
export function isSamePublisher(from: URL, to: URL): boolean {
	const bare = (url: URL) => url.hostname.replace(/^www\./, "");
	return from.port === to.port && bare(from) === bare(to);
}

const clearedDomains = new Set<string>();

export async function assertFetchable(hostname: string, signal?: AbortSignal): Promise<void> {
	if (clearedDomains.has(hostname)) return;
	let canFetch: unknown;
	try {
		const timeout = AbortSignal.timeout(DOMAIN_CHECK_TIMEOUT_MS);
		const response = await fetch(`${DOMAIN_INFO_URL}${encodeURIComponent(hostname)}`, {
			signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
		});
		if (!response.ok) throw new Error(`status ${response.status}`);
		canFetch = ((await response.json()) as { can_fetch?: unknown }).can_fetch;
	} catch (error) {
		throw new Error(`Cannot verify whether ${hostname} allows fetching: ${(error as Error).message}`);
	}
	if (canFetch !== true) {
		throw new Error(`${hostname} has opted out of being fetched by Claude`);
	}
	clearedDomains.add(hostname);
}

// Redirects are followed by hand so each hop is validated and counted, which fetch's own follow mode does neither of.
async function fetchFollowing(url: URL, signal: AbortSignal): Promise<Response> {
	let target = url;
	for (let hop = 0; ; hop++) {
		const response = await fetch(target, {
			redirect: "manual",
			signal,
			headers: { "user-agent": USER_AGENT, accept: ACCEPT },
		});
		const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
		if (!location) return response;
		if (hop >= MAX_REDIRECTS) {
			throw new Error(`More than ${MAX_REDIRECTS} redirects from ${url.href}`);
		}
		const next = validateUrl(new URL(location, target).href);
		if (!isSamePublisher(target, next)) {
			throw new Error(`${target.href} redirects to another site. Fetch ${next.href} instead.`);
		}
		target = next;
	}
}

export function capMarkdown(markdown: string): { markdown: string; truncated: boolean } {
	if (markdown.length <= MAX_MARKDOWN_CHARS) return { markdown, truncated: false };
	return { markdown: markdown.slice(0, MAX_MARKDOWN_CHARS), truncated: true };
}

// A page is cached by url, not by prompt: asking a second question about one page costs no second fetch.
const cache = new Map<string, { page: Page; expires: number }>();

export function cachePage(url: string, page: Page): void {
	cache.delete(url);
	cache.set(url, { page, expires: Date.now() + CACHE_TTL_MS });
	let held = 0;
	for (const [key, entry] of [...cache].reverse()) {
		held += entry.page.bytes;
		if (held > CACHE_MAX_BYTES) cache.delete(key);
	}
}

export function cachedPage(url: string): Page | undefined {
	const entry = cache.get(url);
	if (!entry) return undefined;
	if (entry.expires <= Date.now()) {
		cache.delete(url);
		return undefined;
	}
	return entry.page;
}

export function clearPageCache(): void {
	cache.clear();
}

export async function fetchPage(url: string, signal?: AbortSignal): Promise<Page> {
	const target = validateUrl(url);
	const hit = cachedPage(target.href);
	if (hit) return hit;
	await assertFetchable(target.hostname, signal);
	const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
	const response = await fetchFollowing(target, signal ? AbortSignal.any([signal, timeout]) : timeout);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${response.statusText} for ${target.href}`);
	}
	const contentType = response.headers.get("content-type") ?? "";
	const { text, bytes } = await readCapped(response);
	const source = text.slice(0, MAX_SOURCE_CHARS);
	const rendered = isHtml(contentType) ? await renderMarkdown(source, target.href) : plainText(contentType, source);
	const capped = capMarkdown(rendered);
	if (!capped.markdown) {
		throw new Error(`No text in ${target.href}`);
	}
	const page: Page = {
		url: response.url || target.href,
		status: response.status,
		statusText: response.statusText,
		bytes,
		contentType,
		markdown: capped.markdown,
		truncated: capped.truncated || source.length < text.length,
	};
	cachePage(target.href, page);
	return page;
}

// INFO: fc 06aug26 extraction never reads CSS and external sheets are never fetched, so the stylesheets go before jsdom sees them. Parsing them printed css-tree grammar warnings (css-tree/lib/lexer/match.js:528) and jsdom's own "Could not parse CSS stylesheet" for any page using nesting, both straight to the console the TUI is drawing on.
const STYLESHEET = /<style\b[^>]*>[\s\S]*?<\/style\s*>|<link\b[^>]*\brel\s*=\s*["']?stylesheet\b[^>]*>/gi;

export function withoutStylesheets(html: string): string {
	return html.replace(STYLESHEET, "");
}

// INFO: fc 06aug26 jsdom and turndown cost ~200ms to import, so they load on first fetch rather than at pi startup.
export async function renderMarkdown(html: string, url: string): Promise<string> {
	const [{ JSDOM, VirtualConsole }, { Readability }, turndown, gfm] = await Promise.all([
		import("jsdom"),
		import("@mozilla/readability"),
		import("turndown") as Promise<{ default: TurndownConstructor }>,
		import("turndown-plugin-gfm") as Promise<{ gfm: unknown }>,
	]);
	// A VirtualConsole with no listeners drops what the default one forwards to the process console.
	const document = new JSDOM(withoutStylesheets(html), { url, virtualConsole: new VirtualConsole() }).window.document;
	const body = document.body?.innerHTML ?? "";
	// INFO: fc 06aug26 Readability rewrites the document it parses, so the fallback body is taken first.
	const article = new Readability(document).parse();
	const service = new turndown.default({ headingStyle: "atx", codeBlockStyle: "fenced" });
	service.use(gfm.gfm);
	service.remove(["script", "style", "noscript", "iframe"]);
	const markdown = service.turndown(article?.content ?? body).trim();
	if (!markdown) {
		throw new Error(`No readable text extracted from ${url}`);
	}
	const title = article?.title?.trim();
	return title ? `# ${title}\n\n${markdown}` : markdown;
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
