const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const REQUEST_TIMEOUT_MS = 60000;

export async function callExaMcp(toolName, args) {
	const headers = {
		"Content-Type": "application/json",
		"Accept": "application/json, text/event-stream",
	};
	if (process.env.EXA_API_KEY) {
		headers["x-api-key"] = process.env.EXA_API_KEY;
	}

	const response = await fetch(EXA_MCP_URL, {
		method: "POST",
		headers,
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: toolName, arguments: args },
		}),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (!response.ok) {
		const errorText = await response.text();
		if (response.status === 429) {
			throw new Error(
				`Exa rate limit reached (429). Set EXA_API_KEY for unthrottled usage ($10 free credits/month at https://dashboard.exa.ai).\n${errorText.slice(0, 200)}`,
			);
		}
		throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 300)}`);
	}

	const rpc = parseRpcResponse(await response.text());

	if (rpc.error) {
		throw new Error(`Exa MCP error ${rpc.error.code ?? ""}: ${rpc.error.message ?? "unknown"}`);
	}

	const text = rpc.result?.content
		?.filter((item) => item.type === "text" && item.text)
		.map((item) => item.text)
		.join("\n\n");

	if (rpc.result?.isError) {
		throw new Error(text || "Exa MCP tool returned an error");
	}
	if (!text) {
		throw new Error("Exa MCP returned an empty response");
	}
	return text;
}

function parseRpcResponse(body) {
	const candidates = body
		.split("\n")
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trim())
		.filter(Boolean);
	candidates.push(body);

	for (const payload of candidates) {
		try {
			const parsed = JSON.parse(payload);
			if (parsed?.result || parsed?.error) return parsed;
		} catch {}
	}
	throw new Error("Exa MCP returned an unparseable response");
}
