import extension from "./index.ts";

type SessionStart = (event: unknown, ctx: { mode: string }) => void;

let sessionStart: SessionStart | undefined;
extension({
  on: (event: string, handler: SessionStart) => {
    if (event === "session_start") sessionStart = handler;
  },
} as never);
sessionStart?.({}, { mode: process.argv[2] });

// INFO: fc 30oct26 copies pi's shutdown in rpc-mode.ts, where the first trigger drops pi's SIGTERM handler and awaits MCP refreshes
let shuttingDown = false;
const onSigterm = () => shutdown(143);
process.on("SIGTERM", onSigterm);
process.stdin.on("end", () => shutdown(0));
process.stdin.resume();

let refreshed = () => {};
const refresh = new Promise<void>((resolve) => {
  refreshed = resolve;
});
process.on("message", () => refreshed());

async function shutdown(code: number) {
  if (shuttingDown) process.exit(code);
  shuttingDown = true;
  process.off("SIGTERM", onSigterm);
  process.stdout.write("disposing\n");
  process.stdin.once("end", () => process.stdout.write("stdin ended\n"));
  await refresh;
  process.stdout.write("disposed\n");
  process.exit(code);
}

process.stdout.write("ready\n");
