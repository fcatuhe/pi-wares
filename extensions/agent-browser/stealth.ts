import type { Identity } from "./browser.ts";

// INFO: fc 11aug26 the userAgent override goes through CDP, which empties navigator.userAgentData: a Chrome UA with no
// client hints is a louder tell than HeadlessChrome was, so the page-side object is rebuilt to match the sent headers
export function stealthScript(identity: Identity): string {
	const { brands, platform, platformVersion, version } = identity;
	const fullVersionList = brands.map(({ brand, version: v }) => ({
		brand,
		version: v === "99" ? "99.0.0.0" : version,
	}));
	const high = {
		architecture: process.arch === "x64" ? "x86" : "arm",
		bitness: "64",
		fullVersionList,
		model: "",
		platformVersion,
		uaFullVersion: version,
		wow64: false,
	};
	return `(() => {
	const brands = ${json(brands)};
	const low = { brands, mobile: false, platform: ${json(platform)} };
	const high = ${json(high)};
	const data = {
		...low,
		toJSON: () => ({ ...low }),
		getHighEntropyValues: (hints) => {
			const out = { ...low };
			for (const hint of hints ?? []) if (hint in high) out[hint] = high[hint];
			return Promise.resolve(out);
		},
	};
	Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => data, configurable: true });
})();
`;
}

function json(value: unknown): string {
	return JSON.stringify(value);
}
