import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseByline, refusal } from "./check.ts";

const byline = { byline: "Kit writing for Ada", shortcode: ":owl:", emoji: "🦉" };
const signed = "_:owl: Kit writing for Ada._\n\nHi";
const codemode = (code: string) => refusal("mcp__local__codemode", { code }, byline);
const bash = (command: string) => refusal("bash", { command }, byline);

test("a Slack message, draft or Outline comment from codemode without the byline is refused, naming both icons", () => {
  for (const tool of ["slack_send_message", "slack_send_message_draft", "slack_schedule_message", "create_comment"]) {
    const code = `await tools.mcp__x__${tool}({ channel_id: "C1", message: "Hi" })`;
    assert.match(codemode(code)?.reason ?? "", /"_:owl: Kit writing for Ada\._" in Slack, or "_🦉 Kit writing for Ada\._" elsewhere/, tool);
    assert.equal(codemode(code.replace('"Hi"', JSON.stringify(signed))), undefined, tool);
  }
});

test("codemode that only reads Slack passes", () => {
  assert.equal(codemode('await tools.mcp__slack_ridecell__slack_read_channel({ channel_id: "C1" })'), undefined);
});

test("a prompt to another agent passes without the byline", () => {
  assert.equal(refusal("mcp__paseo__send_agent_prompt", { agentId: "a1", prompt: "Hi" }, byline), undefined);
  assert.equal(refusal("mcp__paseo__create_agent", { title: "T", initialPrompt: "Hi" }, byline), undefined);
  assert.equal(codemode('await tools.mcp__paseo__send_agent_prompt({ agentId: "a1", prompt: "Hi" })'), undefined);
});

test("a send tool called directly is judged by its input", () => {
  assert.equal(refusal("mcp__slack_ridecell__slack_send_message", { message: "Hi" }, byline)?.block, true);
  assert.equal(refusal("mcp__slack_ridecell__slack_send_message", { message: signed }, byline), undefined);
});

test("a gog mail or chat send, and a gh comment, without the byline are refused", () => {
  for (const command of [
    'gog --account f@x.com gmail send --to a@x.com --subject S --body "Hi"',
    "gog gmail reply 123 --body Hi",
    "gog gmail drafts create --to a@x.com --body Hi",
    "gog chat messages send spaces/1 --text Hi",
    "gog chat dm send a@x.com --text Hi",
    'gh pr comment 12 --body "Hi"',
    'gh pr review 12 --comment -b "Hi"',
  ]) {
    assert.equal(bash(command)?.block, true, command);
    assert.equal(bash(command.replace("Hi", "'🦉 Kit writing for Ada.'")), undefined, command);
  }
});

test("a body file is read for the byline", () => {
  const dir = mkdtempSync(join(tmpdir(), "policy-byline-"));
  writeFileSync(join(dir, "signed.txt"), signed);
  writeFileSync(join(dir, "unsigned.txt"), "Hi");
  assert.equal(bash(`gog gmail reply 1 --body-file ${join(dir, "signed.txt")}`), undefined);
  assert.equal(bash(`gh issue comment 3 -F '${join(dir, "signed.txt")}'`), undefined);
  assert.equal(bash(`gog gmail reply 1 --body-file=${join(dir, "unsigned.txt")}`)?.block, true);
  assert.equal(bash("gog gmail send --to a@x.com --body-file missing.txt")?.block, true);
});

test("reading mail and chat, or approving a PR without a body, passes", () => {
  for (const command of ["gog gmail search 'is:unread'", "gog chat messages list spaces/1", "gh pr review 12 --approve", "gh pr view 12 --comments"]) {
    assert.equal(bash(command), undefined, command);
  }
});

test("a config missing a field fails loudly, naming the file", () => {
  assert.throws(() => parseByline({ byline: "Kit writing for Ada", shortcode: ":owl:" }, "/x/config.json"), /\/x\/config\.json needs/);
  assert.throws(() => parseByline([], "/x/config.json"), /needs/);
});

test("the extension loads only with a config, and then fills the policy and checks tool calls", async () => {
  const agent = mkdtempSync(join(tmpdir(), "policy-byline-agent-"));
  process.env.PI_CODING_AGENT_DIR = agent;
  const load = (await import("./index.ts")).default;
  const handlers: Record<string, (event: unknown) => Promise<unknown>> = {};
  const pi = { on: (event: string, fn: never) => (handlers[event] = fn) } as never;

  load(pi);
  assert.deepEqual(Object.keys(handlers), [], "without a config nothing is registered");

  mkdirSync(join(agent, "policy-byline"));
  writeFileSync(join(agent, "policy-byline", "config.json"), JSON.stringify(byline));
  load(pi);
  const options = { systemPromptOptions: { sections: {} as Record<string, string> } };
  await handlers.before_agent_start(options);
  const section = options.systemPromptOptions.sections["policy-byline"];
  assert.match(section, /`_:owl: Kit writing for Ada\._`/);
  assert.match(section, /write `🦉` everywhere else/);
  assert.match(section, /Leave it out of messages to other agents/);
  assert.doesNotMatch(section, /\{/);
  const call = (toolName: string, input: object) => handlers.tool_call({ toolName, input });
  assert.equal(((await call("bash", { command: "gog gmail send --body Hi" })) as { block: boolean }).block, true);
  assert.equal(await call("write", { path: "x", content: "gog gmail send --body Hi" }), undefined);
});
