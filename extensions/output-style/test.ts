import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import load from "./index.ts";

type Handler = (event: unknown, ctx: unknown) => any;

const body = (name: string) =>
  readFileSync(join(import.meta.dirname, "styles", `${name}.md`), "utf8")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .trim();

type Files = Record<string, string>;

function write(dir: string, files: Files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

const styleFile = (name: string, body: string) => `---\nname: ${name}\ndescription: ${name} for tests\n---\n\n${body}\n`;

async function session({ style, userFiles = {}, projectFiles = {} }: { style?: string; userFiles?: Files; projectFiles?: Files } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "output-style-"));
  const agentDir = mkdtempSync(join(tmpdir(), "output-style-agent-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  if (style) write(agentDir, { "output-style/config.json": JSON.stringify({ style }) });
  write(agentDir, userFiles);
  write(cwd, projectFiles);

  const handlers: Record<string, Handler[]> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const entries: Array<{ type: string; customType: string; data: unknown }> = [];
  const notices: string[] = [];
  const statuses = new Map<string, string | undefined>();
  const ctx = {
    cwd,
    sessionManager: { getBranch: () => entries },
    ui: {
      notify: (message: string) => notices.push(message),
      setStatus: (key: string, text: string | undefined) => statuses.set(key, text),
      select: async () => undefined,
    },
  };
  load({
    on: (event: string, fn: Handler) => (handlers[event] ??= []).push(fn),
    registerCommand: (name: string, options: (typeof commands)[string]) => (commands[name] = options),
    appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
  } as never);
  for (const fn of handlers.session_start) await fn({ reason: "startup" }, ctx);

  return {
    notices,
    status: () => statuses.get("output-style"),
    switchTo: (name: string) => commands["output-style"].handler(name, ctx),
    prompt: async () => (await handlers.before_agent_start[0]({ systemPrompt: "BASE" }, ctx)).systemPrompt as string,
  };
}

test("a session with no setting writes in Default and keeps the footer quiet", async () => {
  const fresh = await session();
  assert.ok((await fresh.prompt()).endsWith(body("default")), "a session with no setting writes in Default");
  assert.equal(fresh.status(), undefined, "the footer stays quiet on Default");
});

test("a switch replaces the style, keeps the base rules, and ignores an unknown name", async () => {
  const fresh = await session();
  await fresh.switchTo("prose");
  const switched = await fresh.prompt();
  assert.ok(switched.endsWith(body("prose")) && !switched.includes(body("default")), "a switch replaces the style");
  assert.ok(switched.startsWith("BASE\n\n# Writing\n"), "the base rules hold in every style");
  assert.equal(fresh.status(), "style: Prose");

  await fresh.switchTo("poetry");
  assert.match(fresh.notices.at(-1)!, /Unknown output style "poetry"/);
  assert.ok((await fresh.prompt()).endsWith(body("prose")), "an unknown name leaves the style alone");
});

test("the configured style starts the session, and a switch in the session beats it", async () => {
  const configured = await session({ style: "Prose" });
  assert.ok((await configured.prompt()).endsWith(body("prose")), "the configured style did not start the session");
  await configured.switchTo("default");
  assert.ok((await configured.prompt()).endsWith(body("default")), "a switch in the session beats the configured style");
});

test("a project cannot set the style: its settings and style files are ignored", async () => {
  const project = await session({
    projectFiles: {
      ".pi/settings.json": JSON.stringify({ outputStyle: "Prose" }),
      ".pi/output-styles/pitch.md": styleFile("Pitch", "PROJECT PITCH"),
    },
  });
  assert.ok((await project.prompt()).endsWith(body("default")), "a project setting chose the style");
  await project.switchTo("pitch");
  assert.match(project.notices.at(-1)!, /Unknown output style "pitch"/, "a project style file was loaded");
});

test("a typo in the setting is reported and falls back to Default", async () => {
  const typo = await session({ style: "Prosse" });
  assert.match(typo.notices[0], /unknown output style "Prosse"/);
  assert.ok((await typo.prompt()).endsWith(body("default")), "a typo in the setting falls back to Default");
});

test("user style files are switchable and replace built-ins by name", async () => {
  const own = await session({ userFiles: { "output-style/styles/pitch.md": styleFile("Pitch", "USER PITCH") } });
  await own.switchTo("pitch");
  assert.ok((await own.prompt()).endsWith("USER PITCH"), "a style in ~/.pi/agent/output-style/styles is one to switch to");
  assert.equal(own.status(), "style: Pitch");

  const configured = await session({ style: "pitch", userFiles: { "output-style/styles/pitch.md": styleFile("Pitch", "USER PITCH") } });
  assert.ok((await configured.prompt()).endsWith("USER PITCH"), "a user style can be the configured one");

  const replaced = await session({ userFiles: { "output-style/styles/default.md": styleFile("Default", "MY DEFAULT") } });
  assert.ok((await replaced.prompt()).endsWith("MY DEFAULT"), "a user style can replace a built-in");
});
