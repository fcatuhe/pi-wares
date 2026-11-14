import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { readJson } from "../../../lib/files.ts";
import { expandHome, wareDir } from "../../../lib/paths.ts";
import { type Byline, parseByline, refusal } from "./check.ts";

export default function (pi: ExtensionAPI) {
  const byline = configuredByline();
  if (!byline) return;
  const text = readFileSync(join(import.meta.dirname, "policy.md"), "utf8")
    .trim()
    .replace(/\{(byline|shortcode|emoji)\}/g, (_, key: "byline" | "shortcode" | "emoji") => byline[key])
    .concat(
      byline.skill
        ? `\n\nBefore you write anything for someone other than the session owner, read \`${expandHome(byline.skill)}\` and follow it.`
        : "",
    );
  pi.on("before_agent_start", (event) => {
    event.systemPromptOptions.sections["policy-byline"] = text;
  });
  pi.on("tool_call", async ({ toolName, input }) => refusal(toolName, input, byline));
}

function configuredByline(): Byline | undefined {
  const file = join(wareDir("policy-byline"), "config.json");
  const config = readJson<unknown>(file);
  return config === undefined ? undefined : parseByline(config, file);
}
