import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { type listUsage, usageEntries } from "../shared/usage";

const run = promisify(execFile);

// INFO: fc 30oct26 the plugin SDK only exposes the legacy provider usage list, so we read the current reports through the documented `paseo usage --json` CLI
export async function readUsage({ refresh }: RpcInput<typeof listUsage>): Promise<RpcOutput<typeof listUsage>> {
  const cli = process.env.PASEO_CLI ?? "paseo";
  const args = ["usage", "--json", ...(refresh ? ["--refresh"] : [])];
  const { stdout } = await run(cli, args, { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  return { entries: usageEntries.parse(JSON.parse(stdout)) };
}
