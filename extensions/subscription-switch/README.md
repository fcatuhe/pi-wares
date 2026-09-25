# subscription-switch

`/subscription-switch` moves pi from one Anthropic subscription to another, picked by email.

```text
Anthropic account: francois@ridecell.com
  francois@instacab.com
  Log in to another account
```

The title is the account in use. Picking an email swaps it in. The last line puts the current account away and leaves pi with no Anthropic credential, for `/login` to fill.

pi's `anthropic` credential in `~/.pi/agent/auth.json` is the account in use. The others wait in `~/.pi/agent/subscription-switch/accounts.json`, keyed by email, mode 0600. Accounts are credentials, not providers: a provider per account would double every model id, `enabledModels` entry and shortcut.

```json
{
  "francois@instacab.com": { "type": "oauth", "access": "...", "refresh": "...", "email": "francois@instacab.com" }
}
```

Accounts an older version benched inside `auth.json` as `anthropic-<email>` slots are listed too, and move to `accounts.json` on the next switch.

The email is written onto a credential as it is put away. When the credential in use has none, as after a token refresh or `/login`, it is read from `api.anthropic.com/api/oauth/profile`, and failing that you are asked to name it.

A switch runs under `auth.json.lock`, the lock pi takes, and re-reads both files inside it, so a token pi rotated meanwhile is kept. It writes atomically (temporary file, rename) in an order that can duplicate a credential across the two files if interrupted, never lose one: the bench with both accounts, then `auth.json`, then the bench without the one moved in. A lock held by another process for about half a second fails the switch with nothing changed. pi re-reads the file on change, so every pane uses the new account on its next request, no restart. Menus in other sessions stay stale until they switch or log in.

Leaving the slot empty while `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is set gets a warning, since pi falls back to it. A stored account whose refresh token has lapsed fails with `OAuth refresh failed for anthropic` until you `/login` again. To forget a benched account, delete its key from `accounts.json`. A switch emits `subscription-switch:switched` on the event bus. There is no automatic failover.
