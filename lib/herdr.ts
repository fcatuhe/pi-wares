import { randomUUID } from "node:crypto";
import net from "node:net";

export interface HerdrMessage {
  result?: any;
  error?: { code?: string; message?: string };
  event?: string;
  data?: any;
  id?: string;
}

export function herdrEnabled(): boolean {
  return process.env.HERDR_ENV === "1" && !!process.env.HERDR_SOCKET_PATH;
}

export function herdrConnect(): net.Socket {
  const path = process.env.HERDR_SOCKET_PATH as string;
  const socket = net.createConnection(process.platform === "win32" ? `\\\\.\\pipe\\${path}` : path);
  socket.unref?.();
  return socket;
}

export function herdrLine(method: string, params: Record<string, unknown>): string {
  return `${JSON.stringify({ id: randomUUID(), method, params })}\n`;
}

export function herdrRequest(
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<HerdrMessage | undefined> {
  if (!herdrEnabled() || signal?.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let buffer = "";
    const socket = herdrConnect();
    const finish = (message?: HerdrMessage) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      socket.destroy();
      resolve(message);
    };
    const abort = () => finish();
    const timeout = setTimeout(abort, timeoutMs);
    timeout.unref?.();
    signal?.addEventListener("abort", abort, { once: true });
    socket.on("error", abort);
    socket.on("close", abort);
    socket.on("connect", () => socket.write(herdrLine(method, params)));
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const end = buffer.indexOf("\n");
      if (end === -1) return;
      finish(parseLine(buffer.slice(0, end)));
    });
  });
}

export function parseLine(line: string): HerdrMessage | undefined {
  try {
    return JSON.parse(line) as HerdrMessage;
  } catch {
    return undefined;
  }
}
