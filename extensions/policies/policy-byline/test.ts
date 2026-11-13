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

const shellSends = {
  "a chat message": [
    "gog chat messages send spaces/1 --text Hi",
    "gog chat messages create spaces/1 --text Hi",
    "gog chat messages post spaces/1 --text Hi",
    "gog chat dm send a@x.com --text Hi",
    "gog chat dm post a@x.com --text Hi",
  ],
  "an email": [
    'gog --account f@x.com gmail send --to a@x.com --subject S --body "Hi"',
    "gog send --to a@x.com --body Hi",
    "gog -a f@x.com --json send --to a@x.com --body Hi",
    "gog mail send --to a@x.com --body-html Hi",
    "gog email reply 1 --body Hi",
    "gog gmail reply-all 1 --body Hi",
    "gog gmail replyall 1 --body Hi",
    "gog gmail forward 1 --to a@x.com --body Hi",
    "gog gmail fwd 1 --to a@x.com --body Hi",
    "gog gmail autoreply 'from:a@x.com' --body Hi",
  ],
  "a document comment": [
    "gog docs comments add doc1 Hi",
    "gog doc comments reply doc1 c1 Hi",
    "gog drive comments create file1 Hi",
    "gog drv comments update file1 c1 Hi",
    "gog drive comments respond file1 c1 Hi",
  ],
  "an issue or pull request comment": [
    'gh pr comment 12 --body "Hi"',
    "gh issue comment 3 -b Hi",
    'gh pr review 12 --comment -b "Hi"',
    "gh pr review 12 --request-changes --body Hi",
    "gh api repos/o/r/issues/3/comments -f body=Hi",
    "gh api repos/o/r/pulls/12/comments --raw-field body=Hi -f path=a.rb",
    "gh api -X POST repos/o/r/pulls/12/reviews -F body=Hi",
  ],
  "an issue or pull request body": [
    'gh pr create --title T --body "Hi"',
    "gh issue create -t T -b Hi",
    "gh pr edit 12 --body Hi",
    "gh issue edit 3 --title T -b Hi",
    "gh api -X POST repos/o/r/issues -f title=T -f body=Hi",
  ],
};

for (const [kind, commands] of Object.entries(shellSends)) {
  test(`${kind} sent from the shell without the byline is refused, and passes with it`, () => {
    for (const command of commands) {
      assert.equal(bash(command)?.block, true, command);
      assert.equal(bash(command.replace("Hi", "'🦉 Kit writing for Ada.'")), undefined, command);
    }
  });
}

test("a Slack message or schedule, or an Outline comment, from codemode without the byline is refused, naming both icons", () => {
  for (const tool of ["slack_send_message", "slack_schedule_message", "create_comment", "update_comment"]) {
    const code = `await tools.mcp__x__${tool}({ channel_id: "C1", message: "Hi" })`;
    assert.match(codemode(code)?.reason ?? "", /"_:owl: Kit writing for Ada\._" in Slack, or "_🦉 Kit writing for Ada\._" elsewhere/, tool);
    assert.equal(codemode(code.replace('"Hi"', JSON.stringify(signed))), undefined, tool);
  }
});

test("a send tool called directly is judged by its input", () => {
  for (const tool of ["mcp__slack_ridecell__slack_send_message", "mcp__outline_patoumatic__create_comment", "mcp__outline_patoumatic__update_comment"]) {
    assert.equal(refusal(tool, { text: "Hi" }, byline)?.block, true, tool);
    assert.equal(refusal(tool, { text: signed }, byline), undefined, tool);
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

test("work that reaches only the session owner passes without the byline", () => {
  assert.equal(refusal("write", { path: "notes.md", content: "Hi" }, byline), undefined);
  assert.equal(refusal("edit", { path: "notes.md", edits: [{ oldText: "a", newText: "Hi" }] }, byline), undefined);
  assert.equal(bash("echo Hi"), undefined);
  assert.equal(codemode('console.log("Hi")'), undefined);
  assert.equal(codemode('await tools.mcp__paseo__get_agent_activity({ agentId: "a1" })'), undefined);
});

test("a draft the session owner sends passes without the byline", () => {
  assert.equal(codemode('await tools.mcp__x__slack_send_message_draft({ channel_id: "C1", message: "Hi" })'), undefined);
  assert.equal(refusal("mcp__slack_ridecell__slack_send_message_draft", { text: "Hi" }, byline), undefined);
  for (const command of [
    "gog gmail drafts create --to a@x.com --body Hi",
    "gog gmail draft new --to a@x.com --body Hi",
    "gog gmail drafts update d1 --body Hi",
    "gog gmail drafts reply 1 --body Hi",
    "gog gmail drafts forward 1 --to a@x.com --body Hi",
  ]) {
    assert.equal(bash(command), undefined, command);
  }
});

test("a body file is read for the byline", () => {
  const dir = mkdtempSync(join(tmpdir(), "policy-byline-"));
  const signedFile = join(dir, "signed.txt");
  const unsignedFile = join(dir, "unsigned.txt");
  writeFileSync(signedFile, signed);
  writeFileSync(unsignedFile, "Hi");
  for (const command of [
    `gog gmail reply 1 --body-file ${signedFile}`,
    `gog gmail send --body-html-file ${signedFile}`,
    `gh issue comment 3 -F '${signedFile}'`,
    `gh pr review 12 --comment --body-file ${signedFile}`,
    `gh pr create --title T --body-file ${signedFile}`,
    `gh issue edit 3 -F ${signedFile}`,
    `gh api repos/o/r/issues/3/comments -F body=@${signedFile}`,
  ]) {
    assert.equal(bash(command), undefined, command);
  }
  for (const command of [
    `gog gmail reply 1 --body-file=${unsignedFile}`,
    `gh api repos/o/r/issues/3/comments -F body=@${unsignedFile}`,
    `gh issue create --title T --body-file ${unsignedFile}`,
    "gog gmail send --to a@x.com --body-file missing.txt",
  ]) {
    assert.equal(bash(command)?.block, true, command);
  }
});

test("reading, asking for help, sending a saved draft, or touching a PR or issue without a body, passes", () => {
  for (const command of [
    "gog gmail search 'is:unread'",
    "gog gmail drafts list",
    "gog gmail drafts send d1",
    "gog chat messages list spaces/1",
    "gog docs comments list doc1",
    "gog drive comments resolve file1 c1",
    "gog gmail send --help",
    "gog chat dm send -h",
    "gh pr comment --help",
    "gh pr review 12 --approve",
    "gh pr create --fill",
    "gh pr edit 12 --add-label bug",
    "gh issue edit 3 --add-label bug",
    "gh pr view 12 --comments",
    "gh api repos/o/r/issues/3/comments",
    "gh api repos/o/r/issues/3/comments --jq '.[].body'",
  ]) {
    assert.equal(bash(command), undefined, command);
  }
});

test("a send chained after a help call, or with a help flag inside its body, is still refused", () => {
  assert.equal(bash("gog gmail send --help && gog gmail send --body Hi")?.block, true);
  assert.equal(bash("gog gmail send --body 'run it with --help' --to a@x.com")?.block, true);
});

test("a config missing a field fails loudly, naming the file", () => {
  assert.throws(() => parseByline({ byline: "Kit writing for Ada", shortcode: ":owl:" }, "/x/config.json"), /\/x\/config\.json needs/);
  assert.throws(() => parseByline([], "/x/config.json"), /needs/);
  assert.throws(() => parseByline({ ...byline, skill: "/x/missing/SKILL.md" }, "/x/config.json"), /\/x\/config\.json names a skill/);
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
  assert.match(section, /`🦉` elsewhere/);
  assert.match(section, /send to someone other than the session owner/);
  assert.match(section, /Leave it off a draft the session owner sends,/);
  assert.match(section, /Never use it in chat replies to the session owner or in messages to agents/);
  assert.doesNotMatch(section, /\{/);
  assert.doesNotMatch(section, /read `/, "without a skill field the policy names no skill");
  const call = (toolName: string, input: object) => handlers.tool_call({ toolName, input });
  assert.equal(((await call("bash", { command: "gog gmail send --body Hi" })) as { block: boolean }).block, true);
  assert.equal(await call("write", { path: "x", content: "gog gmail send --body Hi" }), undefined);
});

test("a skill field makes the policy name the skill to read before writing for someone else", async () => {
  const agent = mkdtempSync(join(tmpdir(), "policy-byline-skill-"));
  const skill = join(agent, "SKILL.md");
  writeFileSync(skill, "---\nname: kit\n---\n");
  mkdirSync(join(agent, "policy-byline"));
  writeFileSync(join(agent, "policy-byline", "config.json"), JSON.stringify({ ...byline, skill }));
  process.env.PI_CODING_AGENT_DIR = agent;
  const load = (await import("./index.ts")).default;
  const handlers: Record<string, (event: unknown) => Promise<unknown>> = {};
  load({ on: (event: string, fn: never) => (handlers[event] = fn) } as never);
  const options = { systemPromptOptions: { sections: {} as Record<string, string> } };
  await handlers.before_agent_start(options);
  assert.match(options.systemPromptOptions.sections["policy-byline"], new RegExp(`read \`${skill}\` and follow it\.$`));
});
