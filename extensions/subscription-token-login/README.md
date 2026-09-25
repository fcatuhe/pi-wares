# subscription-token-login

Adds a long-lived token method to Anthropic's `/login`, for machines without a browser.

```text
Select Anthropic login method:
  Browser login (default)
  Long-lived token (1 year, headless)
```

Paste the `sk-ant-oat01-...` token from `npx -y @anthropic-ai/claude-code@latest setup-token`. pi stores it as an OAuth credential, so it counts as a subscription. The same token in `ANTHROPIC_OAUTH_TOKEN` counts as a pay-per-token API key instead.

A paste that wrapped in the terminal arrives cut short, since pi's input submits on newline, so a token under the minimum length is refused.

Then comes a rotation date, `YYYY-MM-DD`, stored as the expiry at midnight UTC. Enter takes a year less 7 days from today, so type an earlier date for an older token, and a date that does not exist or has passed ends the login. Five minutes before it, pi fails with `OAuth refresh failed for anthropic: a long-lived token carries no refresh token...`. A revoked token shows as `401 OAuth access token is invalid`. Either way, mint another and log in again.

Browser login and refreshable credentials still run through pi's own OAuth code.
