import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import handoff from "./handoff.ts";

export default function (pi: ExtensionAPI) {
  if (process.env.PASEO_AGENT_ID) return;

  handoff(pi);
}
