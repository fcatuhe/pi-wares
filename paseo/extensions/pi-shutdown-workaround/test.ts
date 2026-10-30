import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";

const FIXTURE = new URL("./fixture.ts", import.meta.url);

function startPi(mode: string) {
  const child = fork(FIXTURE, [mode], { stdio: ["pipe", "pipe", "inherit", "ipc"] });
  const exited = once(child, "exit");
  let output = "";
  let changed = () => {};
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
    changed();
  });

  const printed = async (line: string) => {
    while (!output.includes(`${line}\n`)) await new Promise<void>((resolve) => (changed = resolve));
  };

  return { child, printed, exited, output: () => output };
}

test("Paseo's close, stdin EOF then SIGTERM, lets pi finish disposing", async () => {
  const pi = startPi("rpc");
  await pi.printed("ready");

  pi.child.stdin?.end();
  await pi.printed("disposing");
  pi.child.kill("SIGTERM");
  pi.child.send("refreshed");

  const [, signal] = await pi.exited;
  assert.equal(signal, null);
  assert.match(pi.output(), /disposed/);
});

test("a daemon restart, SIGTERM then stdin EOF, lets pi finish disposing", async () => {
  const pi = startPi("rpc");
  await pi.printed("ready");

  pi.child.kill("SIGTERM");
  await pi.printed("disposing");
  pi.child.stdin?.end();
  await Promise.race([pi.printed("stdin ended"), pi.exited]);
  if (pi.child.exitCode === null) pi.child.send("refreshed");

  await pi.exited;
  assert.match(pi.output(), /disposed/);
});

test("outside RPC mode, pi's own shutdown is left alone", async () => {
  const pi = startPi("tui");
  await pi.printed("ready");

  pi.child.stdin?.end();
  await pi.printed("disposing");
  pi.child.kill("SIGTERM");

  const [, signal] = await pi.exited;
  assert.equal(signal, "SIGTERM");
  assert.doesNotMatch(pi.output(), /disposed/);
});
