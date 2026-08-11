import type { Identity } from "./browser.ts";

// INFO: fc 11aug26 both ways of setting the UA cost the client hints, so the page-side object is rebuilt either way. The CDP
// override empties navigator.userAgentData outright; the --user-agent launch flag keeps the low entropy values (brands,
// platform, mobile) and blanks every high entropy one (architecture, bitness, platformVersion, uaFullVersion,
// fullVersionList). A Chrome that answers getHighEntropyValues with empty strings is as clear a tell as HeadlessChrome was.
// INFO: fc 11aug26 this does not reach workers: an init script runs in the page only, so a worker keeps the blank high
// entropy hints. Verified harmless on CreepJS, which scores the patched getter at 0% stealth and the browser at 0% headless
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
