import net from "node:net";
import { basename } from "node:path";

import { randomId } from "./envelope.ts";
import type { Station } from "./station.ts";

const socketPath = process.env.HERDR_SOCKET_PATH;
const socketEndpoint = process.platform === "win32" && socketPath ? `\\\\.\\pipe\\${socketPath}` : socketPath;
const REQUEST_TIMEOUT_MS = 2000;

export interface HerdrAgent {
	agent: string;
	pane_id: string;
	status: string;
	cwd: string;
	title: string;
	session_path?: string;
}

export interface Peer {
	name: string;
	cwd: string;
	status: string;
	agent: string;
	reach: "radio" | "keys";
	pane_id?: string;
	session_id?: string;
	self: boolean;
}

export function herdrEnabled(): boolean {
	return process.env.HERDR_ENV === "1" && !!socketEndpoint;
}

function request(method: string, params: Record<string, unknown>): Promise<any> {
	if (!herdrEnabled()) return Promise.resolve(undefined);
	return new Promise((resolve) => {
		let done = false;
		let buffer = "";
		const socket = net.createConnection(socketEndpoint as string);
		socket.unref?.();
		const finish = (message?: any) => {
			if (done) return;
			done = true;
			clearTimeout(timeout);
			socket.destroy();
			resolve(message);
		};
		const timeout = setTimeout(finish, REQUEST_TIMEOUT_MS);
		timeout.unref?.();
		socket.on("error", () => finish());
		socket.on("close", () => finish());
		socket.on("connect", () => socket.write(`${JSON.stringify({ id: randomId("radio"), method, params })}\n`));
		socket.on("data", (chunk) => {
			buffer += chunk.toString();
			if (!buffer.includes("\n")) return;
			try {
				finish(JSON.parse(buffer.split("\n", 1)[0]));
			} catch {
				finish();
			}
		});
	});
}

export async function herdrAgents(): Promise<HerdrAgent[]> {
	const message = await request("agent.list", {});
	const listed = message?.result?.agents;
	if (!Array.isArray(listed)) return [];
	return listed.map((agent: any) => ({
		agent: typeof agent.agent === "string" ? agent.agent : "unknown",
		pane_id: String(agent.pane_id ?? ""),
		status: typeof agent.agent_status === "string" ? agent.agent_status : "unknown",
		cwd: typeof agent.cwd === "string" ? agent.cwd : "",
		title: typeof agent.terminal_title_stripped === "string" ? agent.terminal_title_stripped : "",
		session_path: typeof agent.agent_session?.value === "string" ? agent.agent_session.value : undefined,
	}));
}

export async function typeIntoPane(paneId: string, text: string): Promise<string | undefined> {
	const message = await request("agent.prompt", { target: paneId, text });
	if (!message) return "herdr did not answer";
	if (message.error) return String(message.error.code ?? message.error.message ?? "refused");
	return undefined;
}

export function paneName(title: string, cwd: string): string {
	const parts = title
		.replace(/^[^\w\s]+\s*-\s*/, "")
		.split(" - ")
		.map((part) => part.trim())
		.filter(Boolean);
	return parts[0] || basename(cwd) || title || "unnamed";
}

export function peers(stations: Station[], agents: HerdrAgent[], selfSessionId: string): Peer[] {
	const bySession = new Map(agents.filter((agent) => agent.session_path).map((agent) => [agent.session_path as string, agent]));
	const claimed = new Set<string>();
	const found: Peer[] = [];

	for (const station of stations) {
		const agent = bySession.get(station.session_file);
		if (agent) claimed.add(agent.pane_id);
		found.push({
			name: station.name,
			cwd: station.cwd,
			status: agent?.status ?? "unknown",
			agent: "pi",
			reach: "radio",
			pane_id: agent?.pane_id ?? station.pane_id,
			session_id: station.session_id,
			self: station.session_id === selfSessionId,
		});
	}

	for (const agent of agents) {
		if (claimed.has(agent.pane_id)) continue;
		found.push({
			name: paneName(agent.title, agent.cwd),
			cwd: agent.cwd,
			status: agent.status,
			agent: agent.agent,
			reach: "keys",
			pane_id: agent.pane_id,
			self: false,
		});
	}

	return found.sort((left, right) => left.name.localeCompare(right.name));
}

function describe(peer: Peer): string {
	return peer.pane_id ? `${peer.name} (${peer.pane_id})` : peer.name;
}

export function resolvePeer(found: Peer[], query: string): Peer {
	const wanted = query.trim().toLowerCase();
	if (!wanted) throw new Error("No target given. Call radio_agents to see who is reachable.");

	const callable = found.filter((peer) => !peer.self);
	const self = found.find((peer) => peer.self && (peer.name.toLowerCase() === wanted || peer.pane_id === query.trim()));
	if (self) throw new Error(`${describe(self)} is this session. Answer your owner instead of calling yourself.`);

	const pane = callable.find((peer) => peer.pane_id === query.trim());
	if (pane) return pane;

	const exact = callable.filter((peer) => peer.name.toLowerCase() === wanted);
	if (exact.length === 1) return exact[0];
	if (exact.length > 1) throw ambiguous(query, exact);

	const partial = callable.filter((peer) => peer.name.toLowerCase().includes(wanted));
	if (partial.length === 1) return partial[0];
	if (partial.length > 1) throw ambiguous(query, partial);

	const byCwd = callable.filter((peer) => basename(peer.cwd).toLowerCase() === wanted);
	if (byCwd.length === 1) return byCwd[0];
	if (byCwd.length > 1) throw ambiguous(query, byCwd);

	const known = callable.map((peer) => peer.name).join(", ") || "nobody";
	throw new Error(`No agent matches "${query}". Reachable right now: ${known}.`);
}

function ambiguous(query: string, candidates: Peer[]): Error {
	return new Error(`"${query}" matches ${candidates.length} agents: ${candidates.map(describe).join(", ")}. Call the one you mean by its pane id.`);
}
