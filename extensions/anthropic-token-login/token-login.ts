import type { OAuthAuth, OAuthCredential, ProviderAuthInteraction } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER = "anthropic";
const TOKEN_PREFIX = "sk-ant-oat01-";
// INFO: fc 06aug26 pi's login input submits on newline, so a token pasted with a line wrap arrives cut
// short with its prefix intact. Length is the only check that catches that. openclaw validates the same 80.
const MIN_TOKEN_LENGTH = 80;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_LIFETIME_DAYS = 365;
const ROTATION_MARGIN_DAYS = 7;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BROWSER_METHOD = "browser";
const TOKEN_METHOD = "long-lived-token";
const MINT_COMMAND = "npx -y @anthropic-ai/claude-code@latest setup-token";
const NO_REFRESH_MESSAGE = `a long-lived token carries no refresh token: mint another with \`${MINT_COMMAND}\` and run /login again`;
const WRAPPED = Symbol.for("pi-wares.anthropic-token-login");

export function normalizeToken(pasted: string): string {
	return pasted.replaceAll(/\s+/g, "");
}

export function tokenRejection(token: string): string | undefined {
	if (!token) return "Required";
	if (!token.startsWith(TOKEN_PREFIX)) return `Expected a token starting with ${TOKEN_PREFIX}`;
	if (token.length < MIN_TOKEN_LENGTH) return "That token is too short to be whole, paste all of it";
	return undefined;
}

export function tokenCredential(token: string, expires: number): OAuthCredential {
	return { type: "oauth", access: token, refresh: "", expires };
}

function dateOf(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function rotationDate(now: number = Date.now()): string {
	return dateOf(now + (TOKEN_LIFETIME_DAYS - ROTATION_MARGIN_DAYS) * DAY_MS);
}

function rotationMs(date: string): number {
	return Date.parse(`${date}T00:00:00Z`);
}

export function rotationRejection(date: string, now: number = Date.now()): string | undefined {
	if (!DATE_PATTERN.test(date)) return `Expected YYYY-MM-DD, got ${date}`;
	const ms = rotationMs(date);
	// INFO: fc 06aug26 Date.parse rejects month 13 but rolls 2027-02-31 into March, so only the round
	// trip proves the day exists.
	if (Number.isNaN(ms)) return `No such date: ${date}`;
	if (dateOf(ms) !== date) return `No such date: ${date}, that is ${dateOf(ms)}`;
	if (ms <= now) return `${date} has passed, pi would retry a refresh it cannot make on every request`;
	return undefined;
}

async function readToken(interaction: ProviderAuthInteraction): Promise<string> {
	const pasted = await interaction.prompt({
		type: "secret",
		message: `Paste the token from ${MINT_COMMAND}`,
	});
	const token = normalizeToken(pasted);
	const rejection = tokenRejection(token);
	if (rejection) throw new Error(rejection);
	return token;
}

async function readRotationMs(interaction: ProviderAuthInteraction, now: number): Promise<number> {
	const fallback = rotationDate(now);
	const answer = await interaction.prompt({
		type: "text",
		message: `Rotate by (Enter for a year less ${ROTATION_MARGIN_DAYS} days)`,
		placeholder: fallback,
	});
	const date = answer.trim() || fallback;
	const rejection = rotationRejection(date, now);
	if (rejection) throw new Error(rejection);
	return rotationMs(date);
}

export function withTokenLogin(base: OAuthAuth): OAuthAuth {
	if (isWrapped(base)) return base;
	const wrapped: OAuthAuth = {
		...base,
		async login(interaction) {
			const method = await interaction.prompt({
				type: "select",
				message: "Select Anthropic login method:",
				options: [
					{ id: BROWSER_METHOD, label: "Browser login (default)" },
					{ id: TOKEN_METHOD, label: "Long-lived token (1 year, headless)", description: MINT_COMMAND },
				],
			});
			if (method === BROWSER_METHOD) return base.login(interaction);
			const token = await readToken(interaction);
			return tokenCredential(token, await readRotationMs(interaction, Date.now()));
		},
		refresh: (credential, signal) =>
			credential.refresh ? base.refresh(credential, signal) : Promise.reject(new Error(NO_REFRESH_MESSAGE)),
	};
	return Object.defineProperty(wrapped, WRAPPED, { value: true });
}

// INFO: fc 06aug26 the marker rides on the method itself because /reload reruns this module against a
// registry that still holds the previous registration, and wrapping a wrapper stacks a second selector.
function isWrapped(oauth: OAuthAuth): boolean {
	return Reflect.get(oauth, WRAPPED) === true;
}

export function installTokenLogin(pi: ExtensionAPI, ctx: ExtensionContext): void {
	const provider = ctx.modelRegistry.getProvider(PROVIDER);
	const oauth = provider?.auth.oauth;
	if (!provider || !oauth || isWrapped(oauth)) return;
	pi.registerProvider({ ...provider, auth: { ...provider.auth, oauth: withTokenLogin(oauth) } });
}
