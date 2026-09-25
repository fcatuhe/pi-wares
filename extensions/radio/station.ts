import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { type AckStatus, type Envelope, PROTOCOL, randomId, validEnvelope } from "./envelope.ts";

export interface Station {
  v: number;
  session_id: string;
  session_file: string;
  name: string;
  cwd: string;
  pane_id?: string;
  pid: number;
  since: string;
}

export interface Ack {
  msg: string;
  status: AckStatus;
  at: string;
}

const ACK_KEEP_MS = 5 * 60_000;

export function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function radioRoot(dir = agentDir()): string {
  return join(dir, "radio");
}

export function stationDir(root: string, sessionId: string): string {
  return join(root, sessionId);
}

function inboxDir(root: string, sessionId: string): string {
  return join(stationDir(root, sessionId), "inbox");
}

function ackDir(root: string, sessionId: string): string {
  return join(stationDir(root, sessionId), "ack");
}

function writeAtomic(path: string, value: unknown): void {
  const temporary = `${path}.${randomId("w")}`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, path);
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function register(root: string, station: Station): void {
  mkdirSync(inboxDir(root, station.session_id), { recursive: true, mode: 0o700 });
  mkdirSync(ackDir(root, station.session_id), { recursive: true, mode: 0o700 });
  writeAtomic(join(stationDir(root, station.session_id), "station.json"), station);
}

export function deregister(root: string, sessionId: string): void {
  rmSync(stationDir(root, sessionId), { recursive: true, force: true });
}

export function inbox(root: string, sessionId: string): string {
  return inboxDir(root, sessionId);
}

export function stations(root: string): Station[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const live: Station[] = [];
  for (const entry of entries) {
    const station = readJson<Station>(join(root, entry, "station.json"));
    if (!station || station.v !== PROTOCOL || !station.session_id) continue;
    if (!alive(station.pid)) {
      rmSync(join(root, entry), { recursive: true, force: true });
      continue;
    }
    live.push(station);
  }
  return live;
}

export function deliver(root: string, sessionId: string, envelope: Envelope): void {
  const target = inboxDir(root, sessionId);
  statSync(target);
  writeAtomic(join(target, `${envelope.id}.json`), envelope);
}

export function collect(root: string, sessionId: string): Envelope[] {
  const target = inboxDir(root, sessionId);
  let names: string[] = [];
  try {
    names = readdirSync(target).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const envelopes: Envelope[] = [];
  for (const name of names.sort()) {
    const path = join(target, name);
    const envelope = readJson<Envelope>(path);
    rmSync(path, { force: true });
    if (validEnvelope(envelope)) envelopes.push(envelope);
  }
  return envelopes;
}

export function acknowledge(root: string, envelope: Envelope, status: AckStatus): void {
  const target = ackDir(root, envelope.from.session_id);
  try {
    statSync(target);
  } catch {
    return;
  }
  const ack: Ack = { msg: envelope.id, status, at: new Date().toISOString() };
  writeAtomic(join(target, `${envelope.id}.json`), ack);
}

export function takeAck(root: string, sessionId: string, msgId: string): Ack | undefined {
  const path = join(ackDir(root, sessionId), `${msgId}.json`);
  const ack = readJson<Ack>(path);
  if (ack) rmSync(path, { force: true });
  return ack;
}

export function pruneAcks(root: string, sessionId: string, now = Date.now()): void {
  const target = ackDir(root, sessionId);
  let names: string[] = [];
  try {
    names = readdirSync(target);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(target, name);
    const ack = readJson<Ack>(path);
    if (!ack || now - Date.parse(ack.at) > ACK_KEEP_MS) rmSync(path, { force: true });
  }
}
