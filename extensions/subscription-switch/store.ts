import { mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";

import type { Credentials } from "./accounts.ts";

const LOCK_ATTEMPTS = 25;
const LOCK_RETRY_MS = 20;
const AUTH_FILE_MODE = 0o600;

export function readCredentials(path: string): Credentials {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
}

export async function updateCredentials(path: string, change: (current: Credentials) => Credentials): Promise<void> {
	await withAuthLock(path, () => {
		const next = change(readCredentials(path));
		writeFileSync(path, JSON.stringify(next, null, 2), { encoding: "utf8", mode: AUTH_FILE_MODE });
	});
}

// INFO: fc 09mar26 pi locks auth.json with proper-lockfile, whose protocol is mkdir of <path>.lock (core/auth-storage.js)
async function withAuthLock<T>(path: string, write: () => T): Promise<T> {
	const lock = `${path}.lock`;
	for (let attempt = 1; ; attempt++) {
		try {
			mkdirSync(lock);
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			if (attempt === LOCK_ATTEMPTS) throw new Error(`auth.json is locked by another process: ${lock}`);
			await sleep(LOCK_RETRY_MS);
		}
	}
	try {
		return write();
	} finally {
		rmdirSync(lock);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
