import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { policy } from "../policy.ts";
import { branchRefusal, refusal } from "./check.ts";

const markers = { paths: [".git"] };

export default function (pi: ExtensionAPI) {
  if (!policy(import.meta.dirname, markers)(pi)) return;
  pi.on("tool_call", async ({ toolName, input }) => {
    if (toolName === "herdr_worktree_jump") return branchRefusal([(input as { branch?: string }).branch]);
    if (toolName === "mcp__paseo__create_workspace") return branchRefusal([(input as { branchName?: string }).branchName]);
    if (toolName !== "bash") return;
    return refusal((input as { command: string }).command);
  });
}
