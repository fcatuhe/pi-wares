import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { installTokenLogin } from "./token-login.ts";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => installTokenLogin(pi, ctx));
}
