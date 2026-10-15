import assert from "node:assert/strict";
import { test } from "node:test";
import autoSessionName from "./index.ts";
import { buildExchange, MAX_CHARS, toSessionName } from "./naming.ts";

const user = { role: "user", content: [{ type: "text", text: "the auth token expires mid-session" }] };
const assistant = { role: "assistant", content: [{ type: "text", text: "refreshing it before each call" }] };

test("a prompt with no answer yet is not a turn, so naming waits", () => {
  assert.equal(buildExchange([]), undefined);
  assert.equal(buildExchange([user]), undefined);
  assert.equal(buildExchange([assistant]), undefined);
  assert.match(buildExchange([user, assistant]) ?? "", /^User: the auth token expires mid-session\n\nAssistant: refreshing/);
});

test("a turn answered only by tool calls still names, and thinking-only blocks contribute nothing", () => {
  const toolOnly = { role: "assistant", content: [{ type: "toolCall", name: "read" }] };
  assert.equal(buildExchange([user, toolOnly]), "User: the auth token expires mid-session\n\nAssistant: [tool:read]");
  assert.equal(buildExchange([user, { role: "assistant", content: [{ type: "thinking", text: "hmm" }] }]), undefined);
  assert.ok(buildExchange([user, { role: "toolResult", content: "ok" }, assistant]));
});

test("toSessionName slugs the model's label and strips quotes and a label prefix", () => {
  assert.equal(toSessionName("session-name"), "session-name");
  assert.equal(toSessionName("Token Refresh"), "token-refresh");
  assert.equal(toSessionName('  "auth token refresh"  '), "auth-token-refresh");
  assert.equal(toSessionName("Label: oauth-rotation"), "oauth-rotation");
  assert.equal(toSessionName(""), "");
  assert.equal(toSessionName("!!! ???"), "");
});

test("a narrating model puts the label last, and four words are cut to three", () => {
  assert.equal(toSessionName("Here is the label:\nsession-name-fix"), "session-name-fix");
  assert.equal(toSessionName("fix the flaky payment test"), "fix-the-flaky");
});

test("words drop, never characters, until one word is all that is left", () => {
  assert.equal(toSessionName("interoperability standardization council"), "interoperability");
  assert.ok(toSessionName("unmaintainable-internationalization-machinery").length <= MAX_CHARS);
});

type Reply = { stopReason: string; content: { type: string; text?: string; thinking?: string }[] };

type Options = { maxTokens: number; effort?: string };

function session(complete: (options: Options) => Reply) {
  const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
  let name: string | undefined;
  const pi = {
    on: (event: string, handler: (event: unknown, ctx?: unknown) => unknown) => handlers.set(event, handler),
    getSessionName: () => name,
    setSessionName: (value: string) => {
      name = value;
    },
  };
  const ctx = {
    hasUI: true,
    sessionManager: { getBranch: () => [user, assistant].map((message) => ({ type: "message", message })) },
    modelRegistry: {
      getAvailable: () => [{ provider: "anthropic", id: "claude-haiku-5-5", cost: { input: 0.1 } }],
      complete: async (_model: unknown, _context: unknown, options: Options) => complete(options),
    },
  };
  autoSessionName(pi as never);
  handlers.get("session_start")?.({}, ctx);
  return {
    settle: () => handlers.get("agent_settled")?.({}, ctx),
    name: () => name,
  };
}

// Haiku 5.5 cannot turn thinking off: at pi's default high effort it thinks about 200 tokens before naming, at low it answers in under 20.
test("a model that thinks before it answers is asked for low effort, so the name fits the cap", async () => {
  const run = session(({ maxTokens, effort }) =>
    (effort === "low" ? 20 : 200) < maxTokens
      ? { stopReason: "stop", content: [{ type: "text", text: "token-refresh" }] }
      : { stopReason: "length", content: [{ type: "thinking", thinking: "..." }] },
  );
  await run.settle();
  assert.equal(run.name(), "token-refresh");
});

test("a reply with no name in it leaves the session to be named on the next turn", async () => {
  const replies: Reply[] = [
    { stopReason: "length", content: [{ type: "thinking", thinking: "..." }] },
    { stopReason: "stop", content: [{ type: "text", text: "token-refresh" }] },
  ];
  const run = session(() => replies.shift()!);
  await run.settle();
  assert.equal(run.name(), undefined);
  await run.settle();
  assert.equal(run.name(), "token-refresh");
});
