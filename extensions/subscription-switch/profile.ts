const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";
// INFO: fc 09mar26 the OAuth protocol beta, not client identity: this endpoint takes a bare subscription token
const OAUTH_BETA = "oauth-2025-04-20";
const REQUEST_TIMEOUT_MS = 10_000;

export function emailFrom(profile: unknown): string {
	const email = (profile as { account?: { email?: unknown } })?.account?.email;
	if (typeof email !== "string" || !email.includes("@")) throw new Error("the profile carried no account email");
	return email;
}

export async function fetchEmail(token: string, fetchImpl: typeof fetch = fetch): Promise<string> {
	const response = await fetchImpl(PROFILE_URL, {
		headers: { Authorization: `Bearer ${token}`, "anthropic-beta": OAUTH_BETA },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`the profile endpoint answered ${response.status}`);
	return emailFrom(await response.json());
}
