import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { agentDir, wareDir } from "../../lib/paths.ts";
import { ACTIVE, benchedEmails, type Credential, withLegacy } from "./accounts.ts";
import { fetchEmail } from "./profile.ts";
import { moveAccounts, readBench, readCredentials } from "./store.ts";

const COMMAND = "subscription-switch";
const NEW_ACCOUNT = "Log in to another account";
const AMBIENT_KEYS = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];
export const SWITCHED_EVENT = "subscription-switch:switched";

function authPath(): string {
  return join(agentDir(), "auth.json");
}

function benchPath(): string {
  return join(wareDir(COMMAND), "accounts.json");
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function identify(ctx: ExtensionCommandContext, credential: Credential): Promise<string | undefined> {
  if (typeof credential.email === "string") return credential.email;
  if (credential.type === "oauth" && typeof credential.access === "string") {
    try {
      return await fetchEmail(credential.access);
    } catch (error) {
      ctx.ui.notify(`Could not read the current account: ${reason(error)}`, "warning");
    }
  }
  const typed = await ctx.ui.input("Name the account being stored", "francois@example.com");
  return typed?.trim() || undefined;
}

async function resyncProvider(ctx: ExtensionCommandContext): Promise<void> {
  try {
    await ctx.modelRegistry.refresh({ providers: [ACTIVE], allowNetwork: false });
  } catch (error) {
    ctx.ui.notify(`The credential moved, but pi reads its own state as stale until /reload: ${reason(error)}`, "warning");
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand(COMMAND, {
    description: "Switch the Anthropic subscription account",
    handler: async (_args, ctx) => {
      const auth = readCredentials(authPath());
      const active = auth[ACTIVE];
      const accounts = benchedEmails(withLegacy(auth, readBench(benchPath())));
      if (!active && accounts.length === 0) {
        ctx.ui.notify("No Anthropic account is stored yet: run /login", "warning");
        return;
      }

      const email = active ? await identify(ctx, active) : undefined;
      if (active && !email) return;

      const title = `Anthropic account: ${email ?? "none"}`;
      const choice = await ctx.ui.select(title, [...accounts.filter((account) => account !== email), NEW_ACCOUNT]);
      if (!choice) return;
      const target = choice === NEW_ACCOUNT ? undefined : choice;
      if (!target && !email) {
        ctx.ui.notify("Run /login to add an account", "info");
        return;
      }

      try {
        await moveAccounts(authPath(), benchPath(), email, target);
      } catch (error) {
        ctx.ui.notify(`Nothing was changed: ${reason(error)}`, "error");
        return;
      }

      await resyncProvider(ctx);
      pi.events.emit(SWITCHED_EVENT, { email: target });
      if (target) {
        ctx.ui.notify(email ? `Switched to ${target}, stored ${email}` : `Switched to ${target}`, "info");
        return;
      }
      ctx.ui.notify(`Stored ${email}. Run /login for the account to use now`, "info");
      const ambient = AMBIENT_KEYS.find((key) => process.env[key]);
      if (ambient) ctx.ui.notify(`${ambient} is set, and pi bills that credential until you log in`, "warning");
    },
  });
}
