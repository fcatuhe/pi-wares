import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

import { ACTIVE, activate, activeCredential, type Credentials, slotFor, stash, storedAccounts } from "./accounts.ts";
import { fetchEmail } from "./profile.ts";
import { readCredentials, updateCredentials } from "./store.ts";

const COMMAND = "subscription-switch";
const NEW_ACCOUNT = "Log in to another account";
const AMBIENT_KEYS = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];
export const SWITCHED_EVENT = "subscription-switch:switched";

function authPath(): string {
  return join(getAgentDir(), "auth.json");
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function identify(ctx: ExtensionCommandContext, credential: Record<string, any>): Promise<string | undefined> {
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

function switchTo(email: string | undefined, slot: string | undefined): (current: Credentials) => Credentials {
  return (current) => {
    const stashed = email ? stash(current, email) : current;
    return slot ? activate(stashed, slot) : stashed;
  };
}

export default function subscriptionSwitch(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND, {
    description: "Switch the Anthropic subscription account",
    handler: async (_args, ctx) => {
      const path = authPath();
      const credentials = readCredentials(path);
      const active = activeCredential(credentials);
      const accounts = storedAccounts(credentials);
      if (!active && accounts.length === 0) {
        ctx.ui.notify("No Anthropic account is stored yet: run /login", "warning");
        return;
      }

      const email = active ? await identify(ctx, active) : undefined;
      if (active && !email) return;
      if (email) {
        try {
          slotFor(email);
        } catch (error) {
          ctx.ui.notify(reason(error), "error");
          return;
        }
      }

      const title = `Anthropic account: ${email ?? "none"}`;
      const choice = await ctx.ui.select(title, [...accounts.map((account) => account.email), NEW_ACCOUNT]);
      if (!choice) return;
      const target = accounts.find((account) => account.email === choice);
      if (!target && !email) {
        ctx.ui.notify("Run /login to add an account", "info");
        return;
      }

      try {
        await updateCredentials(path, switchTo(email, target?.slot));
      } catch (error) {
        ctx.ui.notify(`Nothing was changed: ${reason(error)}`, "error");
        return;
      }

      await resyncProvider(ctx);
      pi.events.emit(SWITCHED_EVENT, { email: target?.email });
      if (target) {
        ctx.ui.notify(email ? `Switched to ${target.email}, stored ${email}` : `Switched to ${target.email}`, "info");
        return;
      }
      ctx.ui.notify(`Stored ${email}. Run /login for the account to use now`, "info");
      const ambient = AMBIENT_KEYS.find((key) => process.env[key]);
      if (ambient) ctx.ui.notify(`${ambient} is set, and pi bills that credential until you log in`, "warning");
    },
  });
}
