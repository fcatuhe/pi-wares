import assert from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import load from "./index.ts";

type Handler = (event: unknown, ctx: unknown) => any;

const body = (name: string) =>
  readFileSync(join(import.meta.dirname, "output-styles", `${name}.md`), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();

function settings(dir: string, outputStyle: string) {
  mkdirSync(join(dir, ".pi"), { recursive: true });
  writeFileSync(join(dir, ".pi", "settings.json"), JSON.stringify({ outputStyle }));
}

type Files = Record<string, string>;

function write(dir: string, files: Files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

const styleFile = (name: string, body: string) => `---\nname: ${name}\ndescription: ${name} for tests\n---\n\n${body}\n`;

async function session({ project, user, projectFiles = {}, userFiles = {} }: { project?: string; user?: string; projectFiles?: Files; userFiles?: Files } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "output-style-"));
  const agentDir = mkdtempSync(join(tmpdir(), "output-style-agent-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  if (project) settings(cwd, project);
  if (user) writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ outputStyle: user }));
  write(cwd, projectFiles);
  write(agentDir, userFiles);

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

const fresh = await session();
assert.ok((await fresh.prompt()).endsWith(body("default")), "a session with no setting writes in Default");
assert.equal(fresh.status(), undefined, "the footer stays quiet on Default");

await fresh.switchTo("prose");
const switched = await fresh.prompt();
assert.ok(switched.endsWith(body("prose")) && !switched.includes(body("default")), "a switch replaces the style");
assert.ok(switched.startsWith("BASE\n\n# Writing\n"), "the base rules hold in every style");
assert.equal(fresh.status(), "style: Prose");

await fresh.switchTo("poetry");
assert.match(fresh.notices.at(-1)!, /Unknown output style "poetry"/);
assert.ok((await fresh.prompt()).endsWith(body("prose")), "an unknown name leaves the style alone");

const project = await session({ project: "Prose", user: "Default" });
assert.ok((await project.prompt()).endsWith(body("prose")), "the project setting beats the user setting");
await project.switchTo("default");
assert.ok((await project.prompt()).endsWith(body("default")), "a switch in the session beats the setting");

const user = await session({ user: "prose" });
assert.ok((await user.prompt()).endsWith(body("prose")), "the user setting applies where the project has none");

const typo = await session({ project: "Prosse" });
assert.match(typo.notices[0], /unknown output style "Prosse"/);
assert.ok((await typo.prompt()).endsWith(body("default")), "a typo in the setting falls back to Default");

const own = await session({ userFiles: { "output-styles/pitch.md": styleFile("Pitch", "USER PITCH") } });
await own.switchTo("pitch");
assert.ok((await own.prompt()).endsWith("USER PITCH"), "a style in ~/.pi/agent/output-styles is one to switch to");
assert.equal(own.status(), "style: Pitch");

const layered = await session({
  project: "pitch",
  userFiles: { "output-styles/pitch.md": styleFile("Pitch", "USER PITCH") },
  projectFiles: { ".pi/output-styles/pitch.md": styleFile("Pitch", "PROJECT PITCH") },
});
assert.ok((await layered.prompt()).endsWith("PROJECT PITCH"), "a project style replaces the user style of the same name");

const replaced = await session({ userFiles: { "output-styles/default.md": styleFile("Default", "MY DEFAULT") } });
assert.ok((await replaced.prompt()).endsWith("MY DEFAULT"), "a user style can replace a built-in");
