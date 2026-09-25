import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ACTIVE, benchedEmails, switchAccounts, withLegacy } from "./accounts.ts";
import { emailFrom, fetchEmail } from "./profile.ts";
import { moveAccounts, readBench, readCredentials } from "./store.ts";

const oauth = (access: string) => ({ type: "oauth", access, refresh: `r-${access}`, expires: 7 });
const RIDECELL = "francois@ridecell.com";
const INSTACAB = "francois@instacab.com";

const auth = { "openai-codex": oauth("codex"), [ACTIVE]: oauth("current") };
const bench = { [INSTACAB]: { ...oauth("benched"), email: INSTACAB } };

const dir = mkdtempSync(join(tmpdir(), "subscription-switch-"));
const authPath = join(dir, "auth.json");
const benchPath = join(dir, "subscription-switch", "accounts.json");

test("the picker lists the bench by email", () => {
  assert.deepEqual(benchedEmails({ [RIDECELL]: oauth("a"), [INSTACAB]: oauth("b") }), [INSTACAB, RIDECELL]);
  assert.deepEqual(benchedEmails({}), []);
});

test("a switch benches the account in use under its email and puts the chosen one in pi's slot", () => {
  const next = switchAccounts(auth, bench, RIDECELL, INSTACAB);
  assert.equal(next.auth[ACTIVE].access, "benched");
  assert.deepEqual(next.auth["openai-codex"], auth["openai-codex"], "an unrelated credential was not carried through untouched");
  assert.deepEqual(Object.keys(next.bench), [RIDECELL]);
  assert.equal(next.bench[RIDECELL].email, RIDECELL);
  assert.equal(auth[ACTIVE].access, "current", "the transform mutated the credentials pi reads");
});

test("the staged bench holds both accounts, so a crash between the writes duplicates a credential and never loses one", () => {
  const { staged } = switchAccounts(auth, bench, RIDECELL, INSTACAB);
  assert.deepEqual(benchedEmails(staged), [INSTACAB, RIDECELL]);
});

test("logging in another account benches the one in use and leaves pi's slot empty, so pi asks for a login", () => {
  const next = switchAccounts(auth, bench, RIDECELL, undefined);
  assert.equal(ACTIVE in next.auth, false);
  assert.equal(next.bench[RIDECELL].access, "current");
  assert.equal(next.bench[INSTACAB].access, "benched");
});

test("before the first login there is nothing to bench, and an unknown account or an unnamed one is refused", () => {
  assert.equal(switchAccounts({}, bench, undefined, INSTACAB).auth[ACTIVE].access, "benched");
  assert.throws(() => switchAccounts({}, bench, undefined, RIDECELL), /No account stored for francois@ridecell.com/);
  assert.throws(() => switchAccounts(auth, bench, undefined, INSTACAB), /no name/);
});

test("slots benched inside auth.json by an older version move out to the bench file", () => {
  const legacy = { ...auth, "anthropic-francois-instacab-com": { ...oauth("old"), email: INSTACAB }, "anthropic-vertex": oauth("x") };
  assert.deepEqual(benchedEmails(withLegacy(legacy, {})), [INSTACAB]);
  const next = switchAccounts(legacy, {}, RIDECELL, INSTACAB);
  assert.equal(next.auth[ACTIVE].access, "old");
  assert.equal("anthropic-francois-instacab-com" in next.auth, false);
  assert.deepEqual(next.auth["anthropic-vertex"], oauth("x"), "a provider that only looks like a slot was moved");
});

test("the email is the account's own, read from Anthropic rather than guessed from the token", async () => {
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
});

test("moveAccounts writes both files, and a bench file it creates is as private as auth.json", async () => {
  writeFileSync(authPath, JSON.stringify(auth, null, 2));
  await moveAccounts(authPath, benchPath, RIDECELL, undefined);
  assert.equal(ACTIVE in readCredentials(authPath), false);
  assert.equal(readBench(benchPath)[RIDECELL].access, "current");
  assert.equal(statSync(benchPath).mode & 0o777, 0o600);
  await moveAccounts(authPath, benchPath, undefined, RIDECELL);
  assert.equal(readCredentials(authPath)[ACTIVE].access, "current");
  assert.deepEqual(readBench(benchPath), {});
});

test("a refresh landing between the picker and the write is read inside the lock, not clobbered by a stale snapshot", async () => {
  writeFileSync(authPath, JSON.stringify(auth, null, 2));
  writeFileSync(benchPath, JSON.stringify(bench, null, 2));
  const whatThePickerSaw = readCredentials(authPath);
  writeFileSync(authPath, JSON.stringify({ ...auth, [ACTIVE]: oauth("rotated") }, null, 2));
  assert.equal(whatThePickerSaw[ACTIVE].access, "current");
  await moveAccounts(authPath, benchPath, RIDECELL, INSTACAB);
  assert.equal(readBench(benchPath)[RIDECELL].access, "rotated");
});

test("pi holds the same lock while it writes a rotated token, so the switch waits rather than racing it", async () => {
  const lock = `${authPath}.lock`;
  mkdirSync(lock);
  const before = readFileSync(authPath, "utf8");
  const held = moveAccounts(authPath, benchPath, INSTACAB, RIDECELL);
  assert.equal(readFileSync(authPath, "utf8"), before, "the switch wrote through a lock pi was holding");
  rmdirSync(lock);
  await held;
  assert.equal(readCredentials(authPath)[ACTIVE].access, "rotated");
});
