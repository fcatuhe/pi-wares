export const OAUTH_PROTOCOL_BETA = "oauth-2025-04-20";

export function oauthHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "anthropic-beta": OAUTH_PROTOCOL_BETA };
}
