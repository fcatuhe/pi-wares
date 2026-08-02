import net from "node:net";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const socketPath = process.env.HERDR_SOCKET_PATH;
const socketEndpoint =
	process.platform === "win32" && socketPath ? `\\\\.\\pipe\\${socketPath}` : socketPath;
const tabId = process.env.HERDR_TAB_ID;

const MAX_LABEL_CHARS = 60;
const REQUEST_TIMEOUT_MS = 1500;
const RECONNECT_MS = 5000;
const EVENT_SETTLE_MS = 300;

function enabled(): boolean {
	return process.env.HERDR_ENV === "1" && !!socketPath && !!tabId;
}

function requestId(): string {
	return `herdr-tab-title:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function request(method: string, params: Record<string, unknown>): Promise<any> {
	return new Promise((resolve) => {
		let done = false;
		let buffer = "";
		const finish = (result?: any) => {
			if (done) return;
			done = true;
			clearTimeout(timeout);
			socket.destroy();
			resolve(result);
		};

		const socket = net.createConnection(socketEndpoint!);
		socket.on("error", () => finish());
		socket.on("end", () => finish());
		socket.on("connect", () => socket.write(`${JSON.stringify({ id: requestId(), method, params })}\n`));
		socket.on("data", (chunk) => {
			buffer += chunk.toString();
			const line = buffer.split("\n", 1)[0];
			if (!buffer.includes("\n")) return;
			try {
				finish(JSON.parse(line).result);
			} catch {
				finish();
			}
		});
		const timeout = setTimeout(finish, REQUEST_TIMEOUT_MS);
		timeout.unref?.();
	});
}

async function getTabLabel(): Promise<string | undefined> {
	const result = await request("tab.get", { tab_id: tabId });
	const label = result?.tab?.label;
	return typeof label === "string" ? label : undefined;
}

export default function (pi: ExtensionAPI) {
	if (!enabled()) return;

	let rootSession = false;
	let lastLabel: string | undefined;
	let chain: Promise<void> = Promise.resolve();
	let watcher: net.Socket | undefined;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	let shutdown = false;

	function enqueue(task: () => Promise<void>): void {
		chain = chain.then(task, () => {});
	}

	function pushToTab(name: string): void {
		const label = name.trim().slice(0, MAX_LABEL_CHARS);
		if (!label || label === lastLabel) return;
		lastLabel = label;
		enqueue(() => request("tab.rename", { tab_id: tabId, label }));
	}

	function pullFromTab(): void {
		enqueue(async () => {
			const label = await getTabLabel();
			if (!label || label === lastLabel) return;
			lastLabel = label;
			pi.setSessionName(label);
		});
	}

	// Herdr replays a backlog of recent events on every subscribe, so event
	// payloads are untrusted: any rename notification just triggers a re-read
	// of the tab's current label, deduped against the last synced label.
	function scheduleSync(): void {
		clearTimeout(settleTimer);
		settleTimer = setTimeout(pullFromTab, EVENT_SETTLE_MS);
		settleTimer.unref?.();
	}

	function scheduleReconnect(): void {
		if (shutdown || reconnectTimer) return;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = undefined;
			watchTabRenames();
		}, RECONNECT_MS);
		reconnectTimer.unref?.();
	}

	function watchTabRenames(): void {
		if (shutdown || watcher) return;
		let buffer = "";
		const socket = net.createConnection(socketEndpoint!);
		watcher = socket;
		socket.unref?.();
		socket.on("connect", () => {
			socket.write(
				`${JSON.stringify({
					id: requestId(),
					method: "events.subscribe",
					params: { subscriptions: [{ type: "tab.renamed" }] },
				})}\n`,
			);
		});
		socket.on("data", (chunk) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const msg = JSON.parse(line);
					if (msg.event === "tab_renamed" && msg.data?.tab_id === tabId) scheduleSync();
				} catch {
					// skip malformed line, resync on the next event
				}
			}
		});
		const drop = () => {
			if (watcher === socket) watcher = undefined;
			socket.destroy();
			scheduleReconnect();
		};
		socket.on("error", drop);
		socket.on("close", drop);
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI !== true) return;
		rootSession = true;
		lastLabel = await getTabLabel();
		const name = pi.getSessionName();
		if (name) pushToTab(name);
		watchTabRenames();
	});

	pi.on("session_info_changed", async (event) => {
		if (!rootSession || !event.name) return;
		pushToTab(event.name);
	});

	pi.on("session_shutdown", async () => {
		shutdown = true;
		clearTimeout(settleTimer);
		clearTimeout(reconnectTimer);
		watcher?.destroy();
		watcher = undefined;
	});
}
