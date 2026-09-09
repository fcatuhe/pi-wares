/** Self-check: npx tsx extensions/auto-session-name/test.ts */
import assert from "node:assert/strict";
import { buildExchange, MAX_CHARS, toSessionName } from "./naming.ts";

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

assert.equal(toSessionName("session-name"), "session-name");
assert.equal(toSessionName("Token Refresh"), "token-refresh");
assert.equal(toSessionName('  "auth token refresh"  '), "auth-token-refresh");
assert.equal(toSessionName("Label: oauth-rotation"), "oauth-rotation");
// A model that narrates puts the label last, and four words are cut to three.
assert.equal(toSessionName("Here is the label:\nsession-name-fix"), "session-name-fix");
assert.equal(toSessionName("fix the flaky payment test"), "fix-the-flaky");
assert.equal(toSessionName(""), "");
assert.equal(toSessionName("!!! ???"), "");

// Words drop, never characters, until one word is all that is left.
assert.equal(toSessionName("interoperability standardization council"), "interoperability");
assert.ok(toSessionName("unmaintainable-internationalization-machinery").length <= MAX_CHARS);
