/** Self-check: npx tsx extensions/anthropic-token-login/test.ts */
import assert from "node:assert";

import {
	installTokenLogin,
	normalizeToken,
	rotationDate,
	rotationRejection,
	tokenCredential,
	tokenRejection,
	withTokenLogin,
} from "./token-login.ts";

const WHOLE_TOKEN = `sk-ant-oat01-${"x".repeat(80)}`;
const BROWSER_CREDENTIAL = { type: "oauth", access: "browser-access", refresh: "browser-refresh", expires: 1 };
const REFRESHED_CREDENTIAL = { type: "oauth", access: "refreshed", refresh: "next-refresh", expires: 2 };
const DAY_MS = 86_400_000;
const midnightUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);

function fakeBase(): any {
	return {
		name: "Anthropic (Claude Pro/Max)",
		isSubscription: true,
		loginCalls: 0,
		refreshCalls: [] as unknown[],
		async login() {
			this.loginCalls += 1;
			return BROWSER_CREDENTIAL;
		},
		async refresh(credential: unknown) {
			this.refreshCalls.push(credential);
			return REFRESHED_CREDENTIAL;
		},
		async toAuth(credential: any) {
			return { apiKey: credential.access };
		},
	};
}

// Answers each prompt by its type, so a flow that asks in a new order fails loudly here.
function fakeInteraction(answers: { select?: string; secret?: string; text?: string }): any {
	const prompts: any[] = [];
	return {
		prompts,
		notify() {},
		signal: new AbortController().signal,
		async prompt(prompt: any) {
			prompts.push(prompt);
			return answers[prompt.type as keyof typeof answers] ?? "";
		},
	};
}

const types = (interaction: any) => interaction.prompts.map((prompt: any) => prompt.type);

// A token pasted over SSH wraps, and the terminal hands back the newlines and spaces with it.
assert.equal(normalizeToken(`  sk-ant-oat01-abc\n  def \t`), "sk-ant-oat01-abcdef");

assert.equal(tokenRejection(""), "Required");
assert.match(tokenRejection("sk-ant-api03-notthisone") ?? "", /^Expected a token starting with sk-ant-oat01-/);
// The prefix survives a truncated paste, so only the length rejects it.
assert.match(tokenRejection("sk-ant-oat01-tooshort") ?? "", /too short to be whole/);
assert.equal(tokenRejection(WHOLE_TOKEN), undefined);

assert.deepEqual(tokenCredential(WHOLE_TOKEN, 7), { type: "oauth", access: WHOLE_TOKEN, refresh: "", expires: 7 });

// The offered date is a year less a week from the day of the login.
const NOON = midnightUtc("2026-08-06") + 12 * 3_600_000;
assert.equal(rotationDate(NOON), "2027-07-30");
assert.equal(midnightUtc(rotationDate(NOON)) - midnightUtc("2026-08-06"), 358 * DAY_MS);

assert.match(rotationRejection("30-07-2027", NOON) ?? "", /^Expected YYYY-MM-DD/);
assert.match(rotationRejection("2027-13-01", NOON) ?? "", /No such date/);
// Date.parse rolls this into March rather than rejecting it, which the round trip catches.
assert.match(rotationRejection("2027-02-31", NOON) ?? "", /that is 2027-03-03/);
assert.match(rotationRejection("2020-01-01", NOON) ?? "", /has passed/);
assert.equal(rotationRejection("2027-07-30", NOON), undefined);

// The token method is ours: select, paste, rotation date. pi never sees the browser flow.
const tokenBase = fakeBase();
const tokenInteraction = fakeInteraction({ select: "long-lived-token", secret: `${WHOLE_TOKEN}\n`, text: "" });
const defaulted = await withTokenLogin(tokenBase).login(tokenInteraction);
assert.deepEqual(types(tokenInteraction), ["select", "secret", "text"]);
assert.equal(defaulted.access, WHOLE_TOKEN, "the pasted newline was stored with the token");
assert.equal(defaulted.refresh, "");
assert.equal(tokenBase.loginCalls, 0);

// An empty date line takes the offered one, which the prompt shows as its placeholder.
const datePrompt = tokenInteraction.prompts[2];
assert.equal(datePrompt.placeholder, rotationDate(Date.now()));
assert.equal(defaulted.expires, midnightUtc(datePrompt.placeholder));

// An entered date wins, at midnight UTC so the day itself is the deadline.
const edited = await withTokenLogin(fakeBase()).login(
	fakeInteraction({ select: "long-lived-token", secret: WHOLE_TOKEN, text: " 2099-06-16 " }),
);
assert.equal(edited.expires, midnightUtc("2099-06-16"));

// A date pi would immediately refresh against ends the login instead of storing a doomed credential.
await assert.rejects(
	withTokenLogin(fakeBase()).login(fakeInteraction({ select: "long-lived-token", secret: WHOLE_TOKEN, text: "2020-01-01" })),
	/has passed/,
);

// The browser method is pi's own login, called with the same interaction and returned untouched.
const browserBase = fakeBase();
const browserInteraction = fakeInteraction({ select: "browser" });
assert.deepEqual(await withTokenLogin(browserBase).login(browserInteraction), BROWSER_CREDENTIAL);
assert.equal(browserBase.loginCalls, 1);
assert.deepEqual(types(browserInteraction), ["select"], "the browser path asked for more than the method");

// A truncated paste ends the login before the date prompt, rather than storing a token that would 401 later.
const rejectingBase = fakeBase();
const rejectingInteraction = fakeInteraction({ select: "long-lived-token", secret: "sk-ant-oat01-cut" });
await assert.rejects(withTokenLogin(rejectingBase).login(rejectingInteraction), /too short to be whole/);
assert.deepEqual(types(rejectingInteraction), ["select", "secret"]);
assert.equal(rejectingBase.loginCalls, 0);

// Refresh belongs to pi whenever there is a refresh token, which is every browser login.
const refreshBase = fakeBase();
const refreshWrapped = withTokenLogin(refreshBase);
const signal = new AbortController().signal;
assert.deepEqual(await refreshWrapped.refresh(BROWSER_CREDENTIAL as any, signal), REFRESHED_CREDENTIAL);
assert.deepEqual(refreshBase.refreshCalls, [BROWSER_CREDENTIAL]);

// A long-lived token has nothing to refresh with, so the failure says what to do on the rotation date.
await assert.rejects(refreshWrapped.refresh(defaulted, signal), /mint another/);
assert.equal(refreshBase.refreshCalls.length, 1, "a credential with no refresh token still reached pi");

// Everything else about the method stays pi's.
const passthroughBase = fakeBase();
const passthrough = withTokenLogin(passthroughBase);
assert.equal(passthrough.name, passthroughBase.name);
assert.equal(passthrough.isSubscription, true);
assert.deepEqual(await passthrough.toAuth(defaulted), { apiKey: WHOLE_TOKEN });

// Wrapping twice would stack a second selector, so an already-wrapped method is returned as-is.
assert.equal(withTokenLogin(passthrough), passthrough);

// /reload reruns the extension against a registry that already holds the wrapped provider.
function registrationsFor(oauth: unknown): unknown[] {
	const registered: unknown[] = [];
	const provider = { id: "anthropic", auth: { apiKey: {}, oauth } };
	const pi: any = { registerProvider: (next: unknown) => registered.push(next) };
	const ctx: any = { modelRegistry: { getProvider: (id: string) => (id === "anthropic" ? provider : undefined) } };
	installTokenLogin(pi, ctx);
	return registered;
}
assert.equal(registrationsFor(fakeBase()).length, 1);
assert.equal(registrationsFor(withTokenLogin(fakeBase())).length, 0);

// A provider without OAuth is left alone rather than registered back half-built.
assert.equal(registrationsFor(undefined).length, 0);

console.log("anthropic-token-login: ok");
