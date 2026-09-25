/** Self-check: npx tsx extensions/subscription-switch/test.ts */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ACTIVE, activate, activeCredential, slotFor, stash, storedAccounts } from "./accounts.ts";
import { emailFrom, fetchEmail } from "./profile.ts";
import { readCredentials, updateCredentials } from "./store.ts";

const oauth = (access: string) => ({ type: "oauth", access, refresh: `r-${access}`, expires: 7 });
const RIDECELL = "francois@ridecell.com";
const INSTACAB = "francois@instacab.com";

assert.equal(slotFor(RIDECELL), "anthropic-francois-ridecell-com");
assert.equal(slotFor("  Francois+Pi@Instacab.com "), "anthropic-francois-pi-instacab-com");
assert.throws(() => slotFor("@@"), /Not an account name/);

const two = {
  "openai-codex": oauth("codex"),
  [ACTIVE]: oauth("current"),
  "anthropic-francois-instacab-com": { ...oauth("benched"), email: INSTACAB },
  "anthropic-old-slot": oauth("unlabelled"),
};

// The picker lists what is on the bench, by email, and never the account in use.
assert.deepEqual(storedAccounts(two), [
  { slot: "anthropic-francois-instacab-com", email: INSTACAB },
  { slot: "anthropic-old-slot", email: "old-slot" },
]);
assert.deepEqual(storedAccounts({ [ACTIVE]: oauth("current") }), []);
assert.equal(activeCredential(two)?.access, "current");

// Switching is one move out and one move in, so a credential is never in two slots at once.
const switched = activate(stash(two, RIDECELL), "anthropic-francois-instacab-com");
assert.equal(switched[ACTIVE].access, "benched");
assert.equal(switched["anthropic-francois-ridecell-com"].access, "current");
assert.equal(switched["anthropic-francois-ridecell-com"].email, RIDECELL);
assert.equal("anthropic-francois-instacab-com" in switched, false);
// Everything else in auth.json is carried through untouched.
assert.deepEqual(switched["openai-codex"], two["openai-codex"]);
assert.deepEqual(switched["anthropic-old-slot"], two["anthropic-old-slot"]);
// The file pi reads is not mutated under it: the transforms copy.
assert.equal(two[ACTIVE].access, "current");

// Logging in another account is the same stash with nothing moved in, so pi finds no credential and asks for one.
const emptied = stash(two, RIDECELL);
assert.equal(ACTIVE in emptied, false);
assert.equal(emptied["anthropic-francois-ridecell-com"].access, "current");

// Nothing to stash before the first login, and the chosen account still lands in place.
assert.deepEqual(stash({ "anthropic-x": oauth("x") }, RIDECELL), { "anthropic-x": oauth("x") });
assert.equal(activate({ "anthropic-x": oauth("x") }, "anthropic-x")[ACTIVE].access, "x");
assert.throws(() => activate({}, "anthropic-x"), /No credential stored under anthropic-x/);

// The email is the account's own, read from Anthropic rather than guessed from the token.
assert.equal(emailFrom({ account: { email: RIDECELL }, organization: { name: "Ridecell" } }), RIDECELL);
assert.throws(() => emailFrom({ account: {} }), /no account email/);
assert.throws(() => emailFrom(undefined), /no account email/);

const profileCalls: Array<{ url: string; headers: Record<string, string> }> = [];
const fakeFetch = (async (url: string, init: any) => {
  profileCalls.push({ url: String(url), headers: init.headers });
  return { ok: true, json: async () => ({ account: { email: INSTACAB } }) };
}) as unknown as typeof fetch;
assert.equal(await fetchEmail("sk-ant-oat01-x", fakeFetch), INSTACAB);
assert.equal(profileCalls[0].url, "https://api.anthropic.com/api/oauth/profile");
assert.deepEqual(profileCalls[0].headers, {
  Authorization: "Bearer sk-ant-oat01-x",
  "anthropic-beta": "oauth-2025-04-20",
});
const refusing = (async () => ({ ok: false, status: 401 })) as unknown as typeof fetch;
await assert.rejects(fetchEmail("sk-ant-oat01-x", refusing), /answered 401/);

const dir = mkdtempSync(join(tmpdir(), "subscription-switch-"));
const path = join(dir, "auth.json");
assert.deepEqual(readCredentials(path), {});

writeFileSync(path, JSON.stringify(two, null, 2));
await updateCredentials(path, (current) => activate(stash(current, RIDECELL), "anthropic-francois-instacab-com"));
assert.equal(readCredentials(path)[ACTIVE].access, "benched");
// Secrets: a file this ware creates is as private as the one pi creates.
const fresh = join(dir, "fresh.json");
await updateCredentials(fresh, (current) => ({ ...current, [ACTIVE]: oauth("first") }));
assert.equal(statSync(fresh).mode & 0o777, 0o600);

// A refresh landing between the picker and the write is read inside the lock, not clobbered by a stale snapshot.
writeFileSync(path, JSON.stringify(two, null, 2));
const whatThePickerSaw = readCredentials(path);
writeFileSync(path, JSON.stringify({ ...two, [ACTIVE]: oauth("rotated") }, null, 2));
assert.equal(whatThePickerSaw[ACTIVE].access, "current");
await updateCredentials(path, (current) => {
  assert.equal(current[ACTIVE].access, "rotated");
  return activate(stash(current, RIDECELL), "anthropic-francois-instacab-com");
});
assert.equal(readCredentials(path)["anthropic-francois-ridecell-com"].access, "rotated");

// pi holds the same lock while it writes a rotated token, so the switch waits rather than racing it.
const lock = `${path}.lock`;
mkdirSync(lock);
const held = updateCredentials(path, (current) => activate(current, "anthropic-old-slot"));
setTimeout(() => rmdirSync(lock), 60);
await held;
assert.equal(readCredentials(path)[ACTIVE].access, "unlabelled");
