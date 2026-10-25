import type { PluginClientContext } from "@getpaseo/plugin/client";
import { listenForPageKeys } from "./client/web";

export default function contribute(_client: PluginClientContext) {
  return listenForPageKeys();
}
