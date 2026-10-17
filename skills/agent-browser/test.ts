import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const leave = join(import.meta.dirname, "leave.sh");
const tabs = join(import.meta.dirname, "tabs.sh");

const stub = (bin: string, name: string, body: string) => {
  writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
};

const machine = ({ browserUp = true, tabClose = "ok", port = 0 } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "agent-browser-"));
  const bin = join(root, "bin");
  const state = join(root, "run", "agent-browser");
  const log = join(root, "agent-browser.log");
  mkdirSync(bin);
  mkdirSync(state, { recursive: true });
  writeFileSync(log, "");
  stub(bin, "pgrep", `exit ${browserUp ? 0 : 1}`);
  stub(
    bin,
    "agent-browser",
    `echo "$*" >> ${log}
case "$*" in
  "--session agent-browser get cdp-url") echo ws://127.0.0.1:${port}/devtools/browser/b1 ;;
  *"tab close"*)
    case ${tabClose} in
      ok) echo "✓ Tab [t2] closed" ;;
      gone) echo "✗ tab_gone: bound tab is gone" >&2; exit 1 ;;
      broken) echo "✗ Daemon refused the command" >&2; exit 1 ;;
    esac ;;
  *close) echo "✓ Browser closed" ;;
  *) exit 64 ;;
esac`,
  );
  const env = { ...process.env, HOME: root, XDG_RUNTIME_DIR: join(root, "run"), PATH: `${bin}:${process.env.PATH}` };
  const session = (name: string, targetId = "T-other") => {
    for (const suffix of ["config", "sock", "version"]) writeFileSync(join(state, `${name}.${suffix}`), "");
    writeFileSync(join(state, `${name}.target`), JSON.stringify({ targetId, url: "https://example.com/", pinned: true }));
  };
  const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { root, state, env, session, calls };
};

const run = (script: string, env: NodeJS.ProcessEnv, ...args: string[]) => spawnSync("bash", [script, ...args], { encoding: "utf-8", env });

// A close without --cdp launches a second browser, which hands the running one a stray keeper tab per retry
test("leaving closes the tab and detaches over CDP, so it never launches a browser of its own", () => {
  const { state, env, session, calls } = machine();
  session("docs-review");

  const result = run(leave, env, "docs-review");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "✓ Left docs-review: tab closed, session cleared\n");
  assert.deepEqual(calls(), [
    "--session agent-browser get cdp-url",
    "--session docs-review --cdp ws://127.0.0.1:0/devtools/browser/b1 tab close",
    "--session docs-review --cdp ws://127.0.0.1:0/devtools/browser/b1 close",
  ]);
  assert.equal(existsSync(join(state, "docs-review.target")), false);
});

test("a tab already gone is what leaving wants, so the session still clears", () => {
  const { state, env, session } = machine({ tabClose: "gone" });
  session("docs-review");

  assert.equal(run(leave, env, "docs-review").status, 0);
  assert.equal(existsSync(join(state, "docs-review.target")), false);
});

test("a tab close failing for another reason keeps the session, so leaving can be retried", () => {
  const { state, env, session, calls } = machine({ tabClose: "broken" });
  session("docs-review");

  const result = run(leave, env, "docs-review");

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "✗ Daemon refused the command\n");
  assert.deepEqual(calls(), [
    "--session agent-browser get cdp-url",
    "--session docs-review --cdp ws://127.0.0.1:0/devtools/browser/b1 tab close",
  ]);
  assert.equal(existsSync(join(state, "docs-review.target")), true);
});

test("with the browser down, leaving stops the daemon without calling agent-browser, which would launch it", async () => {
  const { state, env, session, calls } = machine({ browserUp: false });
  session("docs-review");
  const daemon = spawn("sleep", ["30"]);
  const exited = new Promise((resolve) => daemon.on("exit", (_code, signal) => resolve(signal)));
  writeFileSync(join(state, "docs-review.pid"), String(daemon.pid));

  const result = run(leave, env, "docs-review");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(await exited, "SIGTERM");
  assert.deepEqual(calls(), []);
  assert.equal(existsSync(join(state, "docs-review.target")), false);
});

test("leaving refuses the session that owns the browser, and a name with no session", () => {
  const { env, calls } = machine();

  assert.match(run(leave, env, "agent-browser").stderr, /^✗ The agent-browser session owns the browser/);
  assert.match(run(leave, env, "docs-reveiw").stderr, /^✗ No session docs-reveiw/);
  assert.equal(run(leave, env).stderr, "✗ Usage: leave.sh <session>\n");
  assert.deepEqual(calls(), []);
});

test("listing tabs names each tab's owner from the DevTools endpoint, without opening a tab", async () => {
  const pages = (home: string) => [
    { id: "T-keeper", type: "page", url: `file://${home}/.agent-browser/keeper.html` },
    { id: "T-docs", type: "page", url: "https://developer.mozilla.org/" },
    { id: "T-stray", type: "page", url: "about:blank" },
    { id: "T-worker", type: "service_worker", url: "https://developer.mozilla.org/sw.js" },
  ];
  let home = "";
  const server = createServer((request, response) => {
    assert.equal(request.url, "/json/list");
    response.end(JSON.stringify(pages(home)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const { root, env, session, calls } = machine({ port });
  home = root;
  session("docs-review", "T-docs");

  const { stdout } = await promisify(execFile)("bash", [tabs], { env });
  server.close();

  assert.equal(
    stdout,
    [
      `(keeper)     file://${root}/.agent-browser/keeper.html`,
      "docs-review  https://developer.mozilla.org/",
      "(none)       about:blank",
      "",
    ].join("\n"),
  );
  assert.deepEqual(calls(), ["--session agent-browser get cdp-url"]);
});

test("listing tabs with the browser down fails without calling agent-browser, which would launch it", () => {
  const { env, calls } = machine({ browserUp: false });

  const result = run(tabs, env);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "✗ The browser is not running\n");
  assert.deepEqual(calls(), []);
});
