import type net from "node:net";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { herdrConnect, herdrEnabled, herdrLine, herdrRequest, parseLine } from "../../lib/herdr.ts";
import { borrowedLabel, endedLabel, truncateLabel } from "./labels.ts";

const tabId = process.env.HERDR_TAB_ID;

const REQUEST_TIMEOUT_MS = 1500;
const RECONNECT_MS = 5000;
const EVENT_SETTLE_MS = 300;

export default function (pi: ExtensionAPI) {
  if (!herdrEnabled() || !tabId) return;

  let started = false;
  let shutdown = false;
  let desiredLabel: string | undefined;
  let syncedLabel: string | undefined;
  let baselineLabel: string | undefined;
  let chain: Promise<void> = Promise.resolve();
  let watcher: net.Socket | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const shutdownSignal = new AbortController();

  async function request(method: string, params: Record<string, unknown>): Promise<any> {
    return (await herdrRequest(method, params, REQUEST_TIMEOUT_MS, shutdownSignal.signal))?.result;
  }

  async function getTabLabel(): Promise<string | undefined> {
    const result = await request("tab.get", { tab_id: tabId });
    const label = result?.tab?.label;
    return typeof label === "string" && label ? label : undefined;
  }

  async function renameTab(label: string): Promise<void> {
    const result = await request("tab.rename", { tab_id: tabId, label });
    if (result) syncedLabel = label;
  }

  function enqueue(task: () => Promise<void>): void {
    chain = chain.then(async () => {
      if (!shutdown) await task();
    });
  }

  function pushToTab(name: string): void {
    const label = truncateLabel(name);
    if (!label || label === desiredLabel) return;
    desiredLabel = label;
    enqueue(async () => {
      const superseded = label !== desiredLabel;
      if (superseded || label === syncedLabel) return;
      await renameTab(label);
    });
  }

  function pullFromTab(): void {
    enqueue(async () => {
      const label = await getTabLabel();
      if (!label) return;
      if (syncedLabel === undefined) {
        syncedLabel = label;
        baselineLabel = label;
      }
      if (label !== syncedLabel) {
        syncedLabel = label;
        desiredLabel = truncateLabel(label);
        pi.setSessionName(label);
        return;
      }
      const unconfirmedRename = desiredLabel && desiredLabel !== syncedLabel;
      if (unconfirmedRename) await renameTab(desiredLabel!);
    });
  }

  function scheduleSync(): void {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(pullFromTab, EVENT_SETTLE_MS);
    settleTimer.unref?.();
  }

  function scheduleReconnect(): void {
    if (shutdown || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      watchTabRenames();
    }, RECONNECT_MS);
    reconnectTimer.unref?.();
  }

  function watchTabRenames(): void {
    if (shutdown || watcher) return;
    let buffer = "";
    const socket = herdrConnect();
    watcher = socket;
    const drop = () => {
      if (watcher === socket) watcher = undefined;
      socket.destroy();
      scheduleReconnect();
    };
    socket.on("error", drop);
    socket.on("close", drop);
    socket.on("connect", () => {
      socket.write(herdrLine("events.subscribe", { subscriptions: [{ type: "tab.renamed" }] }));
      scheduleSync();
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = parseLine(line);
        if (!msg) continue;
        if (msg.event === "tab_renamed" && msg.data?.tab_id === tabId) {
          scheduleSync();
        } else if (msg.id && msg.result?.type !== "subscription_started") {
          return drop();
        }
      }
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI !== true) return;
    started = true;
    pullFromTab();
    const name = pi.getSessionName();
    if (name) pushToTab(name);
    watchTabRenames();
  });

  pi.on("session_info_changed", async (event) => {
    if (!started || !event.name) return;
    pushToTab(event.name);
  });

  pi.on("session_shutdown", async () => {
    shutdown = true;
    clearTimeout(settleTimer);
    clearTimeout(reconnectTimer);
    watcher?.destroy();
    watcher = undefined;
    await releaseLabel();
    shutdownSignal.abort();
  });

  async function releaseLabel(): Promise<void> {
    if (!syncedLabel || syncedLabel === baselineLabel) return;
    const labelIsStillOurs = (await getTabLabel()) === syncedLabel;
    if (!labelIsStillOurs) return;
    const label = borrowedLabel(baselineLabel) ?? endedLabel(syncedLabel);
    await request("tab.rename", { tab_id: tabId, label });
  }
}
