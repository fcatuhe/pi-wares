import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { truncateLabel } from "./labels.ts";

const agentId = process.env.PASEO_AGENT_ID;

const RENAME_TIMEOUT_MS = 10_000;

const execFileAsync = promisify(execFile);

export function paseoTabTitle(pi: ExtensionAPI): void {
  if (!agentId) return;

  let started = false;
  let report: (error: Error) => void = () => {};
  const push = latestRename(
    (label) => renameAgent(agentId, label),
    (error) => report(error),
  );

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "rpc") return;
    started = true;
    report = (error) => ctx.ui.notify(`Paseo tab title not renamed: ${error.message}`, "warning");
    const name = pi.getSessionName();
    if (name) push(name);
  });

  pi.on("session_info_changed", async (event) => {
    if (!started || !event.name) return;
    push(event.name);
  });
}

export function latestRename(rename: (label: string) => Promise<void>, report: (error: Error) => void): (name: string) => Promise<void> {
  let desired: string | undefined;
  let synced: string | undefined;
  let chain: Promise<void> = Promise.resolve();

  return (name) => {
    const label = truncateLabel(name);
    if (!label || label === desired) return chain;
    desired = label;
    chain = chain.then(async () => {
      if (label !== desired || label === synced) return;
      try {
        await rename(label);
        synced = label;
      } catch (error) {
        if (desired === label) desired = synced;
        report(error as Error);
      }
    });
    return chain;
  };
}

async function renameAgent(id: string, label: string): Promise<void> {
  const args = ["agent", "update", id, `--name=${label}`];
  if (process.env.PASEO_HOME) args.push(`--home=${process.env.PASEO_HOME}`);
  await execFileAsync("paseo", args, { timeout: RENAME_TIMEOUT_MS });
}
