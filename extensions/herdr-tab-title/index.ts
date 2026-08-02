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

function truncateLabel(name: string): string {
	return Array.from(name.trim()).slice(0, MAX_LABEL_CHARS).join("");
}

export default function (pi: ExtensionAPI) {
	if (!enabled()) return;

	let started = false;
	let shutdown = false;
	let desiredLabel: string | undefined;
	let syncedLabel: string | undefined;
	let chain: Promise<void> = Promise.resolve();
	let watcher: net.Socket | undefined;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	const liveRequests = new Set<net.Socket>();

	function request(method: string, params: Record<string, unknown>): Promise<any> {
		return new Promise((resolve) => {
			let done = false;
			let buffer = "";
			const socket = net.createConnection(socketEndpoint!);
			liveRequests.add(socket);
			socket.unref?.();
			const timeout = setTimeout(() => finish(), REQUEST_TIMEOUT_MS);
			timeout.unref?.();
			const finish = (result?: any) => {
				if (done) return;
				done = true;
				clearTimeout(timeout);
				liveRequests.delete(socket);
				socket.destroy();
				resolve(result);
			};
			socket.on("error", () => finish());
			socket.on("close", () => finish());
			socket.on("connect", () =>
				socket.write(`${JSON.stringify({ id: requestId(), method, params })}\n`),
			);
			socket.on("data", (chunk) => {
				buffer += chunk.toString();
				if (!buffer.includes("\n")) return;
				try {
					finish(JSON.parse(buffer.split("\n", 1)[0]).result);
				} catch {
					finish();
				}
			});
		});
	}

	async function getTabLabel(): Promise<string | undefined> {
		const result = await request("tab.get", { tab_id: tabId });
		const label = result?.tab?.label;
		return typeof label === "string" && label ? label : undefined;
	}

	async function renameTab(label: string): Promise<void> {
		const result = await request("tab.rename", { tab_id: tabId, label });
		if (result) syncedLabel = label;
	}

	function enqueue(task: () => Promise<void>): void {
		chain = chain
			.then(async () => {
				if (!shutdown) await task();
			})
			.catch(() => {});
	}

	function pushToTab(name: string): void {
		const label = truncateLabel(name);
		if (!label || label === desiredLabel) return;
		desiredLabel = label;
		enqueue(async () => {
			const superseded = label !== desiredLabel;
			if (superseded || label === syncedLabel) return;
			await renameTab(label);
		});
	}

	function pullFromTab(): void {
		enqueue(async () => {
			const label = await getTabLabel();
			if (!label) return;
			if (syncedLabel === undefined) {
				// INFO: fc 02aug26 first read only baselines: herdr's default numeric labels must not name sessions
				syncedLabel = label;
			}
			if (label !== syncedLabel) {
				syncedLabel = label;
				desiredLabel = truncateLabel(label);
				pi.setSessionName(label);
				return;
			}
			const unconfirmedRename = desiredLabel && desiredLabel !== syncedLabel;
			if (unconfirmedRename) await renameTab(desiredLabel!);
		});
	}

	// INFO: fc 02aug26 herdr replays a backlog of recent events on every subscribe, so event
	// payloads are untrusted: any rename notification only triggers a re-read deduped above
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
		const drop = () => {
			if (watcher === socket) watcher = undefined;
			socket.destroy();
			scheduleReconnect();
		};
		socket.on("error", drop);
		socket.on("close", drop);
		socket.on("connect", () => {
			socket.write(
				`${JSON.stringify({
					id: requestId(),
					method: "events.subscribe",
					params: { subscriptions: [{ type: "tab.renamed" }] },
				})}\n`,
			);
			scheduleSync();
		});
		socket.on("data", (chunk) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				let msg: any;
				try {
					msg = JSON.parse(line);
				} catch {
					continue;
				}
				if (msg.event === "tab_renamed" && msg.data?.tab_id === tabId) {
					scheduleSync();
				} else if (msg.id && msg.result?.type !== "subscription_started") {
					return drop();
				}
			}
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI !== true) return;
		started = true;
		pullFromTab();
		const name = pi.getSessionName();
		if (name) pushToTab(name);
		watchTabRenames();
	});

	pi.on("session_info_changed", async (event) => {
		if (!started || !event.name) return;
		pushToTab(event.name);
	});

	pi.on("session_shutdown", async () => {
		shutdown = true;
		clearTimeout(settleTimer);
		clearTimeout(reconnectTimer);
		watcher?.destroy();
		watcher = undefined;
		for (const socket of liveRequests) socket.destroy();
		liveRequests.clear();
	});
}
