import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { readJson, writeAtomic } from "../../lib/files.ts";
import { wareDir } from "../../lib/paths.ts";
import { type AckStatus, type Envelope, PROTOCOL, validEnvelope } from "./envelope.ts";

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

export function radioRoot(): string {
  return wareDir("radio");
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

function writeFile(path: string, value: unknown): void {
  writeAtomic(path, JSON.stringify(value));
}

function readPeerFile<T>(path: string): T | undefined {
  try {
    return readJson<T>(path);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    rmSync(path, { force: true });
    return undefined;
  }
}

function listDir(path: string, { directories = false } = {}): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => !directories || entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
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
  writeFile(join(stationDir(root, station.session_id), "station.json"), station);
}

export function deregister(root: string, sessionId: string): void {
  rmSync(stationDir(root, sessionId), { recursive: true, force: true });
}

export function inbox(root: string, sessionId: string): string {
  return inboxDir(root, sessionId);
}

export function stations(root: string): Station[] {
  const live: Station[] = [];
  for (const entry of listDir(root, { directories: true })) {
    const station = readPeerFile<Station>(join(root, entry, "station.json"));
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
  writeFile(join(target, `${envelope.id}.json`), envelope);
}

export function collect(root: string, sessionId: string): Envelope[] {
  const target = inboxDir(root, sessionId);
  const envelopes: Envelope[] = [];
  for (const name of listDir(target)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const path = join(target, name);
    const envelope = readPeerFile<Envelope>(path);
    if (validEnvelope(envelope)) envelopes.push(envelope);
    else rmSync(path, { force: true });
  }
  return envelopes;
}

export function discard(root: string, sessionId: string, envelope: Envelope): void {
  rmSync(join(inboxDir(root, sessionId), `${envelope.id}.json`), { force: true });
}

export function acknowledge(root: string, envelope: Envelope, status: AckStatus): void {
  const target = ackDir(root, envelope.from.session_id);
  if (!existsSync(target)) return;
  const ack: Ack = { msg: envelope.id, status, at: new Date().toISOString() };
  writeFile(join(target, `${envelope.id}.json`), ack);
}

export function takeAck(root: string, sessionId: string, msgId: string): Ack | undefined {
  const path = join(ackDir(root, sessionId), `${msgId}.json`);
  const ack = readPeerFile<Ack>(path);
  if (ack) rmSync(path, { force: true });
  return ack;
}

export function pruneAcks(root: string, sessionId: string, now = Date.now()): void {
  const target = ackDir(root, sessionId);
  for (const name of listDir(target)) {
    const path = join(target, name);
    const ack = readPeerFile<Ack>(path);
    if (!ack || now - Date.parse(ack.at) > ACK_KEEP_MS) rmSync(path, { force: true });
  }
}
