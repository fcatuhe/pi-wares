import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { herdrTabTitle } from "./herdr.ts";
import { paseoTabTitle } from "./paseo.ts";

export default function (pi: ExtensionAPI) {
  herdrTabTitle(pi);
  paseoTabTitle(pi);
}
