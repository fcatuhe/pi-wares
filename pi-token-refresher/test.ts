import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { refreshDueLogins, refreshDueMcpTokens } from "./refresh.ts";

const MINUTE = 60_000;

type Answer = { status: number; body: Record<string, unknown> };

async function tokenEndpoint(answer: Answer) {
  const requests: URLSearchParams[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      requests.push(new URLSearchParams(body));
      response.writeHead(answer.status, { "content-type": "application/json" });
      response.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, requests, close: () => server.close() };
}

function agentWith(base: string, entry: Record<string, unknown>, mcpServers: Record<string, unknown> = { wiki: { url: `${base}/mcp` } }) {
  const dir = mkdtempSync(join(tmpdir(), "pi-token-refresher-"));
  const key = `mcp__wiki|${base}/mcp`;
  const state = {
    serverUrl: `${base}/mcp`,
    discovery: {
      authorizationServerUrl: base,
      authorizationServerMetadata: { issuer: base, token_endpoint: `${base}/token` },
      resourceMetadata: { resource: `${base}/mcp` },
    },
    clientInformation: { client_id: "registered", token_endpoint_auth_method: "none" },
    tokens: { access_token: "A0", token_type: "Bearer", expires_in: 3600, refresh_token: "R0", scope: "read" },
    ...entry,
  };
  writeFileSync(join(dir, "mcp-auth.json"), JSON.stringify({ [key]: state }));
  writeFileSync(join(dir, "mcp.json"), JSON.stringify({ mcpServers }));
  const stored = () => JSON.parse(readFileSync(join(dir, "mcp-auth.json"), "utf8"))[key];
  const refreshLock = join(dir, `mcp-auth-refresh-${createHash("sha256").update(key).digest("hex").slice(0, 16)}.lock`);
  return { dir, stored, refreshLock, authPath: join(dir, "mcp-auth.json"), key };
}

const rotated: Answer = {
  status: 200,
  body: { access_token: "A1", token_type: "Bearer", expires_in: 3600, refresh_token: "R1", scope: "read" },
};

test("a token that expires within 10 minutes is refreshed with its client and resource, and saved with its new expiry", async () => {
  const endpoint = await tokenEndpoint(rotated);
  const agent = agentWith(endpoint.base, { tokensExpireAt: Date.now() + 5 * MINUTE });

  const failures = await refreshDueMcpTokens(agent.dir);
  endpoint.close();

  assert.equal(failures, 0);
  assert.deepEqual(Object.fromEntries(endpoint.requests[0]), {
    grant_type: "refresh_token",
    refresh_token: "R0",
    resource: `${endpoint.base}/mcp`,
    client_id: "registered",
  });
  assert.equal(agent.stored().tokens.refresh_token, "R1");
  assert.ok(Math.abs(agent.stored().tokensExpireAt - (Date.now() + 60 * MINUTE)) < MINUTE);
});

test("a token with more than 10 minutes left is not refreshed", async () => {
  const endpoint = await tokenEndpoint(rotated);
  const agent = agentWith(endpoint.base, { tokensExpireAt: Date.now() + 15 * MINUTE });

  await refreshDueMcpTokens(agent.dir);
  endpoint.close();

  assert.equal(endpoint.requests.length, 0);
  assert.equal(agent.stored().tokens.refresh_token, "R0");
});

test("a server signed in through a client metadata document refreshes as pi's document", async () => {
  const endpoint = await tokenEndpoint(rotated);
  const agent = agentWith(
    endpoint.base,
    {
      clientInformation: undefined,
      tokensExpireAt: Date.now() + 5 * MINUTE,
      discovery: {
        authorizationServerUrl: endpoint.base,
        authorizationServerMetadata: { token_endpoint: `${endpoint.base}/token`, authorization_response_iss_parameter_supported: true },
      },
    },
    { wiki: { url: `${endpoint.base}/mcp`, oauth: { clientRegistration: "cimd" } } },
  );

  await refreshDueMcpTokens(agent.dir);
  endpoint.close();

  assert.equal(endpoint.requests[0].get("client_id"), "https://pi.dev/oauth/client.json");
});

test("a refused refresh keeps the stored tokens and counts as a failure", async () => {
  const endpoint = await tokenEndpoint({ status: 400, body: { error: "invalid_grant", error_description: "used before" } });
  const agent = agentWith(endpoint.base, { tokensExpireAt: Date.now() + 5 * MINUTE });

  const failures = await refreshDueMcpTokens(agent.dir);
  endpoint.close();

  assert.equal(failures, 1);
  assert.equal(agent.stored().tokens.refresh_token, "R0");
});

// The refresh lock is pi's, so a token pi rotated while the script waited is not sent again.
test("while pi holds the refresh lock, the script waits and then leaves pi's fresh token alone", async () => {
  const endpoint = await tokenEndpoint(rotated);
  const agent = agentWith(endpoint.base, { tokensExpireAt: Date.now() + 5 * MINUTE });
  mkdirSync(agent.refreshLock);

  const run = refreshDueMcpTokens(agent.dir);
  await new Promise((resolve) => setImmediate(resolve));
  const fresh = { ...agent.stored(), tokens: { ...agent.stored().tokens, refresh_token: "R1" }, tokensExpireAt: Date.now() + 60 * MINUTE };
  writeFileSync(agent.authPath, JSON.stringify({ [agent.key]: fresh }));
  rmdirSync(agent.refreshLock);
  await run;
  endpoint.close();

  assert.equal(endpoint.requests.length, 0);
  assert.equal(agent.stored().tokens.refresh_token, "R1");
});

async function withFakePi(logins: Record<string, unknown>, fails: boolean, run: (dir: string) => Promise<void>) {
  const bin = mkdtempSync(join(tmpdir(), "fake-pi-"));
  const fail = 'echo "Error: Failed to resolve credential" >&2; exit 1';
  writeFileSync(join(bin, "pi"), `#!/bin/sh\necho "$*" >> "$PI_CODING_AGENT_DIR/pi-calls"\n${fails ? fail : "echo bearer-token"}\n`);
  chmodSync(join(bin, "pi"), 0o755);
  const dir = mkdtempSync(join(tmpdir(), "pi-token-refresher-"));
  writeFileSync(join(dir, "auth.json"), JSON.stringify(logins));
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    await run(dir);
  } finally {
    process.env.PATH = path;
  }
}

const calls = (dir: string) => (existsSync(join(dir, "pi-calls")) ? readFileSync(join(dir, "pi-calls"), "utf8").trim().split("\n") : []);

test("a login with a refresh token that expires within 10 minutes is refreshed by pi itself", async () => {
  const logins = { openai: { type: "oauth", access: "A0", refresh: "R0", expires: Date.now() + 5 * MINUTE } };

  await withFakePi(logins, false, async (dir) => {
    assert.equal(await refreshDueLogins(dir), 0);
    assert.deepEqual(calls(dir), ["auth print-bearer-token --provider openai --min-expiry 10m"]);
  });
});

test("a long-lived login without a refresh token, and a login with more than 10 minutes left, are left alone", async () => {
  const logins = {
    anthropic: { type: "oauth", access: "sk-ant-oat01", refresh: "", expires: Date.now() + 5 * MINUTE },
    openai: { type: "oauth", access: "A0", refresh: "R0", expires: Date.now() + 15 * MINUTE },
    mistral: { type: "api_key", key: "k" },
  };

  await withFakePi(logins, false, async (dir) => {
    assert.equal(await refreshDueLogins(dir), 0);
    assert.deepEqual(calls(dir), []);
  });
});

test("a login pi fails to refresh counts as a failure", async () => {
  const logins = { anthropic: { type: "oauth", access: "A0", refresh: "R0", expires: Date.now() + 5 * MINUTE } };

  await withFakePi(logins, true, async (dir) => {
    assert.equal(await refreshDueLogins(dir), 1);
  });
});
