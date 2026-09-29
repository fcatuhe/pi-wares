import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { policy } from "../policy.ts";
import { refusal } from "./check.ts";

const markers = { paths: [".git"] };

export default function (pi: ExtensionAPI) {
  if (!policy(import.meta.dirname, markers)(pi)) return;
  pi.on("tool_call", async ({ toolName, input }) => {
    if (toolName !== "bash") return;
    return refusal((input as { command: string }).command);
  });
}
