/** Self-check: npx tsx extensions/auto-tab-title/test.ts */
import assert from "node:assert/strict";
import { buildExchange, MAX_CHARS, toTabTitle } from "./naming.ts";

const user = { role: "user", content: [{ type: "text", text: "the auth token expires mid-session" }] };
const assistant = { role: "assistant", content: [{ type: "text", text: "refreshing it before each call" }] };

// A prompt with no answer yet is not a turn: naming waits rather than guessing from the request alone.
assert.equal(buildExchange([]), undefined);
assert.equal(buildExchange([user]), undefined);
assert.equal(buildExchange([assistant]), undefined);
assert.match(buildExchange([user, assistant]) ?? "", /^User: the auth token expires mid-session\n\nAssistant: refreshing/);

// A turn whose whole answer was tool calls still names, and thinking-only blocks contribute nothing.
const toolOnly = { role: "assistant", content: [{ type: "toolCall", name: "read" }] };
assert.equal(buildExchange([user, toolOnly]), "User: the auth token expires mid-session\n\nAssistant: [tool:read]");
assert.equal(buildExchange([user, { role: "assistant", content: [{ type: "thinking", text: "hmm" }] }]), undefined);
assert.equal(buildExchange([user, { role: "toolResult", content: "ok" }, assistant]) ? true : false, true);

assert.equal(toTabTitle("tab-title"), "tab-title");
assert.equal(toTabTitle("Token Refresh"), "token-refresh");
assert.equal(toTabTitle('  "auth token refresh"  '), "auth-token-refresh");
assert.equal(toTabTitle("Label: oauth-rotation"), "oauth-rotation");
// A model that narrates puts the label last, and four words are cut to three.
assert.equal(toTabTitle("Here is the label:\nsession-name-fix"), "session-name-fix");
assert.equal(toTabTitle("fix the flaky payment test"), "fix-the-flaky");
assert.equal(toTabTitle(""), "");
assert.equal(toTabTitle("!!! ???"), "");

// Words drop, never characters, until one word is all that is left.
assert.equal(toTabTitle("interoperability standardization council"), "interoperability");
assert.ok(toTabTitle("unmaintainable-internationalization-machinery").length <= MAX_CHARS);
