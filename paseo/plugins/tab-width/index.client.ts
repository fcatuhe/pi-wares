import type { PluginClientContext } from "@getpaseo/plugin/client";
import { widenTabs } from "./client/web";

export default function contribute(_client: PluginClientContext) {
  return widenTabs();
}
