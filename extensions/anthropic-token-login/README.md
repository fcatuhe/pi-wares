# anthropic-token-login

Adds a second method to Anthropic's `/login`: one paste, good for a year.

```text
Select Anthropic login method:
  Browser login (default)
  Long-lived token (1 year, headless)
```

The token is the one `claude setup-token` mints, `sk-ant-oat01-...`. Paste it and pi stores it as its own Anthropic OAuth credential, which is the point: `isUsingOAuth` and `isUsingSubscription` stay true, so the usage bar, `subscription-tool-alias` and pi's own subscription warning all behave as they do after a browser login. The same token in `ANTHROPIC_OAUTH_TOKEN` lands in the API-key slot instead, where pi believes it is on pay-per-token billing.

The paste is followed by the rotation date, offered as a placeholder pi renders dim above the input:

```text
Rotate by (Enter for a year less 7 days)
e.g., 2027-07-30
>
```

Enter takes that date, a year less a week from today, on the assumption that the token was minted minutes ago. Type over it for an older token, or for a shorter leash. The date is stored as midnight UTC, so the day named is the deadline rather than the last day that works.

Nothing of pi's is replaced. The ware registers the built-in provider back with only `auth.oauth` wrapped, so the models, the display name, `isSubscription` and `toAuth` are the objects pi built, the browser option calls pi's own `login`, and `refresh` calls pi's own whenever the credential has a refresh token. Only a credential with an empty `refresh`, which is every pasted token, gets our error naming the mint command.

That date is `expires`, and pi treats it as it treats any OAuth expiry: it refreshes five minutes before, finds nothing to refresh with, and fails there naming the provider, `OAuth refresh failed for anthropic: a long-lived token carries no refresh token...`. Dating it inside the token's real year is what buys that legible error rather than opaque 401s. Anything sooner, revocation or a lapsed subscription, arrives as Anthropic's own `401 OAuth access token is invalid`. Both mean the same thing: mint another and log in again.

A date that is not `YYYY-MM-DD`, does not exist (`Date.parse` rolls `2027-02-31` into March rather than refusing it), or has already passed ends the login. A past date would leave pi retrying a refresh it cannot make on every request.

A pasted token is stripped of whitespace, then checked for the `sk-ant-oat01-` prefix and a minimum length. The length is the one that matters: pi's login input submits on newline, so a token that wrapped in the terminal arrives cut short with its prefix intact, and without that check it would store and fail as a 401 one request later.

The wrapped method carries a marker, because `/reload` reruns this file against a registry that still holds the previous registration, and wrapping a wrapper would stack a second selector.

No config, no commands. Self-check: `npx tsx extensions/anthropic-token-login/test.ts`.
