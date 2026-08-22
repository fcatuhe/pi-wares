function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameScalar(a, b) {
	return a === b;
}

function sameEntry(reference, found) {
	return Object.entries(reference).every(([key, value]) => sameScalar(value, found[key]));
}

export function members(finding) {
	return [...present(finding.found), ...finding.absent];
}

// INFO: fc 22aug26 a single value where the reference lists several is one member of that list
function present(found) {
	if (Array.isArray(found)) return found;
	return found === undefined ? [] : [found];
}

export function writes(finding, force) {
	if (finding.state === "missing" || finding.state === "incomplete") return true;
	return force && finding.state === "diverged";
}

export function diffDefaults(reference, actual, identityByPath = {}) {
	const findings = [];
	collect(reference, actual, [], identityByPath, findings);
	return findings;
}

function collect(reference, actual, path, identityByPath, findings) {
	for (const [key, expected] of Object.entries(reference)) {
		const here = [...path, key];
		const found = isRecord(actual) ? actual[key] : undefined;

		if (isRecord(expected)) {
			collect(expected, found, here, identityByPath, findings);
		} else if (Array.isArray(expected)) {
			findings.push(...diffArray(here, expected, found, identityByPath));
		} else {
			findings.push({
				kind: "value",
				path: here,
				expected,
				found,
				state: found === undefined ? "missing" : sameScalar(expected, found) ? "ok" : "diverged",
			});
		}
	}
}

function diffArray(path, expected, found, identityByPath) {
	if (expected.every(isRecord)) return diffEntries(path, expected, found, identityByPath);

	const absent = expected.filter((member) => !present(found).includes(member));
	return [
		{
			kind: "members",
			path,
			expected,
			found,
			absent,
			state: found === undefined ? "missing" : absent.length > 0 ? "incomplete" : "ok",
		},
	];
}

function diffEntries(path, expected, found, identityByPath) {
	const joined = path.join(".");
	const identity = identityByPath[joined];
	if (!identity) throw new Error(`no identity field declared for the table array at ${joined}`);

	const present = Array.isArray(found) ? found.filter(isRecord) : [];
	return expected.map((entry) => {
		if (!(identity in entry)) throw new Error(`entry at ${joined} has no ${identity} field`);
		const match = present.find((candidate) => sameScalar(candidate[identity], entry[identity]));
		return {
			kind: "entry",
			path,
			identity,
			expected: entry,
			found: match,
			state: match === undefined ? "missing" : sameEntry(entry, match) ? "ok" : "diverged",
		};
	});
}

