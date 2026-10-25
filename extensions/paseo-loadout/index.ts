import { setTimeout as delay } from "node:timers/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { PASEO_AGENT_TOOL, paseoLoadout, paseoSkills } from "./loadout.ts";

const STARTUP_WAIT_MS = 10_000;
const POLL_MS = 100;

export default function (pi: ExtensionAPI) {
  if (!process.env.PASEO_AGENT_ID) return;

  let waited = false;

  pi.on("before_agent_start", async (event, ctx) => {
    if (!waited) await paseoToolsRegistered(ctx.signal);
    waited = true;

    const active = pi.getActiveTools();
    const next = paseoLoadout(active, registeredTools());
    if (next.length !== active.length || next.some((name, index) => name !== active[index])) pi.setActiveTools(next);

    event.systemPromptOptions.skills = paseoSkills(event.systemPromptOptions.skills, registeredTools());
  });

  // INFO: fc 25oct26 Pi emits no event when MCP tools register, so we poll at most 10 seconds, as Pi waits for direct servers
  async function paseoToolsRegistered(signal: AbortSignal | undefined): Promise<void> {
    if (!pi.getMcpServers().some((server) => server.name === "paseo")) return;

    const deadline = performance.now() + STARTUP_WAIT_MS;
    while (!registeredTools().includes(PASEO_AGENT_TOOL) && performance.now() < deadline && !signal?.aborted) {
      await delay(POLL_MS);
    }
  }

  function registeredTools(): string[] {
    return pi.getAllTools().map((tool) => tool.name);
  }
}
