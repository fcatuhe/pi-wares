import type { PluginClientContext } from "@getpaseo/plugin/client";
import { UsageSidebarItem } from "./client/sidebar-item";

export default function contribute(client: PluginClientContext) {
  client.addSidebarFooterItem({ id: "usage", title: "Usage with pace", Component: UsageSidebarItem });
  return () => {};
}
