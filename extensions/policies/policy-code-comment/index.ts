import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { policy } from "../policy.ts";
import { existingLines, refusal, review } from "./check.ts";

type Input = { path: string; content?: string; edits?: Array<{ newText: string }> };

export default function (pi: ExtensionAPI) {
  policy(import.meta.dirname)(pi);
  pi.on("tool_call", async ({ toolName, input }) => {
    if (toolName !== "write" && toolName !== "edit") return;
    const { path, content = "", edits = [] } = input as Input;
    const existing = existingLines(path);
    const texts = toolName === "write" ? [content] : edits.map(({ newText }) => newText);
    return refusal(
      path,
      texts.flatMap((text) => review(path, text, existing)),
    );
  });
}
