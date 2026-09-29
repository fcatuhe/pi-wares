import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { policy } from "../policy.ts";
import { refusal } from "./check.ts";

type Input = { path: string; content?: string; edits?: Array<{ newText: string }> };

const markers = { paths: ["config/application.rb"], files: /^([^/]+\/)?config\/application\.rb$/ };

export default function (pi: ExtensionAPI) {
  if (!policy(import.meta.dirname, markers)(pi)) return;
  pi.on("tool_call", async ({ toolName, input }) => {
    if (toolName !== "write" && toolName !== "edit") return;
    const { path, content = "", edits = [] } = input as Input;
    return refusal(path, toolName === "write" ? [content] : edits.map(({ newText }) => newText));
  });
}
