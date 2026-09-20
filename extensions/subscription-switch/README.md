# subscription-switch

`/subscription-switch` moves pi from one Anthropic subscription to another, by email.

```text
Anthropic account: francois@ridecell.com
  francois@instacab.com
  Log in to another account
```

The account in use is the title, never an option. Picking an email swaps it in. Picking the last line puts the current one away and leaves pi with no Anthropic credential, which is what `/login` is for.

## Accounts are credentials, not providers

pi keys credentials by provider id, one per id, so a second subscription could be a second provider (`anthropic-2`, cloned catalog and all). That is the shape [`pi-provider-clone`](https://github.com/rkbkosp/pi-provider-clone) and [`pi-multi-pass`](https://github.com/hjanuschka/pi-multi-pass) take, and it spreads: every model id doubles, `enabledModels` doubles, `/opus` names one account, a subagent template pinned to `provider: anthropic` keeps using the account it was written against, and each of [`subscription-tool-alias`](../subscription-tool-alias/), [`subscription-web-search`](../subscription-web-search/), [`subscription-usage-pace`](../subscription-usage-pace/) and [`subscription-token-login`](../subscription-token-login/) has to learn that `anthropic-2` is also anthropic.

An account is not a model, so it is not a provider. Here there is one provider, `anthropic`, holding whichever credential is in use, and the others wait in `auth.json` under slots named after their email:

```json
{
  "anthropic": { "type": "oauth", "access": "...", "email": "francois@ridecell.com" },
  "anthropic-francois-instacab-com": { "type": "oauth", "access": "...", "email": "francois@instacab.com" }
}
```

Nothing else in pi, and nothing else in this package, has to know any of this exists.

## The email

Read from `GET api.anthropic.com/api/oauth/profile`, which answers `account.email` for a bare subscription token. The answer is written onto the credential as it is put away, so the picker lists the bench without a request, and a slot whose blob has no `email` is listed under its slot name rather than hidden.

The account in use is asked for only when its credential carries no `email`: pi's own token refresh and a fresh `/login` both replace the whole credential object, which is exactly when the field is gone and the question needs asking again. Nothing is cached elsewhere, because a cache that goes stale here would file a credential under someone else's address. When the endpoint cannot answer, the ware asks for the name rather than inventing one, and an empty answer cancels the switch: an unnamed slot is a credential nobody can find again.

## One locked write

A switch is a single read-modify-write of `auth.json`: the credential in `anthropic` moves to its email slot, the chosen slot moves into `anthropic`. Both under `auth.json.lock`, the lock pi itself takes through `proper-lockfile`, whose protocol is `mkdir` of that path. Retries are 25 at 20ms, then the switch reports that another process is holding it and changes nothing.

The file is re-read **inside** the lock, so a token pi rotated while the picker sat open is what gets stashed, not the copy the picker was shown. Without that, a switch would file yesterday's refresh token and lose the rotation.

pi reads `auth.json` back whenever its revision changes (`dev:ino:size:mtimeNs:ctimeNs`, checked on every credential read), so the running session uses the new account on its very next request, and so does every other pane on the machine. No restart, and no reload.

What pi does not re-read on its own is the snapshot of which providers hold a credential, rebuilt only when pi writes one itself. Left alone, it would answer for the account that has gone: `/login` listing anthropic as signed in, `/model` still offering its models, and a prompt waved past the preflight to fail on the wire instead of being told to log in. The switch rebuilds it with `modelRegistry.refresh({ providers: ["anthropic"] })` before it reports anything, so the menus and the error you get agree with the file. Other sessions keep their own copy until they switch or log in themselves; their requests still go out on the new account, because that part comes from the file.

## Logging in another account

Putting the current account away leaves `anthropic` empty. pi then fails the next request naming the provider, and `/login` fills it: browser, or the paste from [`subscription-token-login`](../subscription-token-login/). The new credential has no email yet, and gets one the first time it is switched away from, which is the first moment its address can be read.

One warning comes with that empty slot: `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` are ambient credentials pi falls back to when nothing is stored, and a key found there is billed per token. If one of them is set in the environment, the ware says which.

A benched access token is usually expired by the time it comes back, which is pi's ordinary refresh path and costs one round trip. A benched **refresh** token that Anthropic no longer accepts surfaces as `OAuth refresh failed for anthropic`, and the answer to that is `/login` again.

## Around it

- Removing an account is pi's own `/logout`: the slots are credentials, so they are listed there under their slot name.
- A switch emits `subscription-switch:switched` on the extension event bus. [`subscription-usage-pace`](../subscription-usage-pace/) listens and drops the bars that belong to the account that just left, instead of showing them for up to five minutes as if they were the new account's.
- No automatic failover. A spent account is a decision, not an error to route around: the swap moves where the next dollar is spent, and doing that behind your back during a turn is not something a footer notice makes up for.

## Check

```bash
npx tsx extensions/subscription-switch/test.ts
```

Covers slot naming, the two credential moves, the profile read and its refusals, and the locked round trip against a real file: mode `0600` on creation, a rotation landing between picker and write, and a lock held by another process.
