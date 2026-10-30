import { createHash } from "node:crypto";
import { mkdirSync, rmdirSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { readJson, writeAtomic } from "../lib/files.ts";
import { agentDir } from "../lib/paths.ts";

const AHEAD_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const LOCK_WAIT_MS = 30_000;
const LOCK_RETRY_MS = 100;
const LOCK_TOUCH_MS = 5_000;
const REFRESH_LOCK_STALE_MS = 20_000;
const FILE_LOCK_STALE_MS = 10_000;
const CLIENT_METADATA_BASE_URL = "https://pi.dev/oauth";

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
type Client = { client_id: string; client_secret?: string; token_endpoint_auth_method?: string };
type State = {
  serverUrl: string;
  tokens?: Tokens;
  tokensExpireAt?: number;
  clientInformation?: Client;
  discovery?: {
    authorizationServerUrl: string;
    authorizationServerMetadata?: { token_endpoint?: string; authorization_response_iss_parameter_supported?: boolean };
    resourceMetadata?: { resource?: string };
  };
};
type States = Record<string, State>;
type Servers = Record<string, { oauth?: { clientRegistration?: string } }>;

if (import.meta.main) {
  const failures = await refreshDueTokens(agentDir());
  if (failures > 0) process.exitCode = 1;
}

export async function refreshDueTokens(dir: string): Promise<number> {
  const authPath = join(dir, "mcp-auth.json");
  const servers = readJson<{ mcpServers?: Servers }>(join(dir, "mcp.json"))?.mcpServers ?? {};
  const keys = Object.keys(await withLock(authPath, FILE_LOCK_STALE_MS, () => readStates(authPath)));
  let failures = 0;

  for (const key of keys) {
    const [name, server] = configured(servers, key);
    try {
      const expiresAt = await withLock(refreshLockPath(dir, key), REFRESH_LOCK_STALE_MS, () =>
        refreshIfDue(authPath, key, server?.oauth?.clientRegistration === "cimd"),
      );
      if (expiresAt) console.log(`${name}: refreshed, the access token now expires at ${new Date(expiresAt).toISOString()}`);
    } catch (error) {
      failures++;
      console.error(`${name}: ${(error as Error).message}`);
    }
  }
  return failures;
}

async function refreshIfDue(authPath: string, key: string, cimd: boolean): Promise<number | undefined> {
  const state = (await withLock(authPath, FILE_LOCK_STALE_MS, () => readStates(authPath)))[key];
  const refreshToken = state?.tokens?.refresh_token;
  if (!state?.tokens || !refreshToken || state.tokensExpireAt === undefined) return undefined;
  if (state.tokensExpireAt - Date.now() > AHEAD_MS) return undefined;

  const tokens = await requestRefresh(state, refreshToken, clientFor(state, cimd));
  const expiresAt = tokens.expires_in === undefined ? undefined : Date.now() + tokens.expires_in * 1000;

  await withLock(authPath, FILE_LOCK_STALE_MS, () => {
    const states = readStates(authPath);
    if (states[key]?.tokens?.refresh_token !== refreshToken) throw new Error("signed in again during the refresh, kept that sign-in");
    states[key] = { ...states[key], tokens, tokensExpireAt: expiresAt };
    if (expiresAt === undefined) delete states[key].tokensExpireAt;
    writeAtomic(authPath, `${JSON.stringify(states, null, 2)}\n`);
  });
  return expiresAt;
}

async function requestRefresh(state: State, refreshToken: string, client: Client): Promise<Tokens> {
  const discovery = state.discovery;
  if (!discovery) throw new Error("no authorization server discovered yet, sign in with pi first");

  const endpoint = discovery.authorizationServerMetadata?.token_endpoint ?? new URL("/token", discovery.authorizationServerUrl).href;
  const headers = new Headers({ Accept: "application/json", "content-type": "application/x-www-form-urlencoded" });
  const params = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (discovery.resourceMetadata?.resource) params.set("resource", discovery.resourceMetadata.resource);
  if (client.token_endpoint_auth_method === "client_secret_basic" && client.client_secret) {
    headers.set("Authorization", `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64")}`);
  } else {
    params.set("client_id", client.client_id);
    if (client.client_secret) params.set("client_secret", client.client_secret);
  }

  const response = await fetch(endpoint, { method: "POST", headers, body: params, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  const body = parseObject(text);
  if (typeof body?.error === "string") throw new Error(`${body.error}: ${body.error_description ?? "refused the refresh"}`);
  if (!response.ok || typeof body?.access_token !== "string") throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);

  return { refresh_token: refreshToken, ...(body as Tokens), scope: (body.scope as string | undefined) ?? state.tokens?.scope };
}

function clientFor(state: State, cimd: boolean): Client {
  if (state.clientInformation) return state.clientInformation;
  if (!cimd) throw new Error("no client to refresh with: neither a registered client nor clientRegistration cimd");

  if (state.discovery?.authorizationServerMetadata?.authorization_response_iss_parameter_supported) {
    return { client_id: `${CLIENT_METADATA_BASE_URL}/client.json` };
  }
  const url = new URL(state.serverUrl);
  url.hash = "";
  const id = createHash("sha256").update(url.href).digest().subarray(0, 9).toString("base64url");
  return { client_id: `${CLIENT_METADATA_BASE_URL}/${id}/client.json` };
}

// INFO: fc 30oct26 concurrency: these are pi's proper-lockfile locks, a <file>.lock directory judged stale by its mtime, so pi and this script never refresh at once
async function withLock<T>(file: string, staleMs: number, fn: () => T | Promise<T>): Promise<T> {
  const lock = `${file}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;

  while (!claimed(lock, staleMs)) {
    if (Date.now() > deadline) throw new Error(`${lock} stayed held for ${LOCK_WAIT_MS / 1000} s`);
    await delay(LOCK_RETRY_MS);
  }
  const touching = setInterval(() => utimesSync(lock, new Date(), new Date()), LOCK_TOUCH_MS);
  try {
    return await fn();
  } finally {
    clearInterval(touching);
    rmdirSync(lock);
  }
}

function claimed(lock: string, staleMs: number): boolean {
  try {
    mkdirSync(lock);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  try {
    if (statSync(lock).mtimeMs >= Date.now() - staleMs) return false;
    rmdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return false;
}

function refreshLockPath(dir: string, key: string): string {
  return join(dir, `mcp-auth-refresh-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`);
}

function readStates(authPath: string): States {
  return readJson<States>(authPath) ?? {};
}

function configured(servers: Servers, key: string): [string, Servers[string] | undefined] {
  const namespace = key.split("|")[0];
  const found = Object.entries(servers).find(([name]) => `mcp__${name.replace(/-/g, "_")}` === namespace);
  return found ?? [namespace.replace(/^mcp__/, ""), undefined];
}

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}
