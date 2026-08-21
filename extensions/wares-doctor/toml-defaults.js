import { getStaticTOMLValue, parseTOML } from "toml-eslint-parser";

import { diffDefaults, members, writes } from "./defaults-diff.js";

export function reconcileToml(actualSource, referenceSource, identityByPath = {}, force = false) {
	const reference = parseTOML(referenceSource);
	const actual = parseTOML(actualSource);
	const findings = diffDefaults(getStaticTOMLValue(reference), getStaticTOMLValue(actual), identityByPath);
	const referenceIndex = indexDocument(reference);
	const actualIndex = indexDocument(actual);

	const inserts = [];
	const replacements = [];
	const appends = [];
	const createdTables = new Set();

	for (const finding of findings) {
		if (!writes(finding, force)) continue;

		if (finding.state === "diverged") {
			const replacement = replace(finding, referenceSource, referenceIndex, actualIndex);
			if (replacement) replacements.push(replacement);
			continue;
		}

		if (finding.kind === "entry") {
			const node = findEntryNode(referenceIndex, finding);
			if (!node) throw new Error(`the reference has no ${finding.path.join(".")} entry to copy`);
			appends.push(sliceNode(referenceSource, reference.comments, node));
			continue;
		}
		if (finding.kind === "members" && finding.state === "incomplete") {
			const extension = extend(finding, actualIndex);
			if (extension) replacements.push(extension);
			continue;
		}
		if (finding.kind !== "value" && finding.kind !== "members") {
			throw new Error(`cannot write a ${finding.kind} finding into TOML at ${finding.path.join(".")}`);
		}

		const source = referenceIndex.values.get(finding.path.join("."));
		if (!source) throw new Error(`the reference has no ${finding.path.join(".")} key to copy`);

		const host = actualIndex.tables.get(source.tablePath);
		if (host) {
			inserts.push(lineInsert(actualSource, host, sliceNode(referenceSource, reference.comments, source.node)));
			continue;
		}

		const table = referenceIndex.tables.get(source.tablePath);
		if (!table || table.type === "TOMLTopLevelTable") {
			finding.blocked = `no [${source.tablePath}] table to write into`;
			continue;
		}
		if (createdTables.has(source.tablePath)) continue;
		createdTables.add(source.tablePath);
		appends.push(sliceNode(referenceSource, reference.comments, table));
	}

	return { findings, text: appendBlocks(applyEdits(actualSource, inserts, replacements), appends) };
}

// A binding the user set as one string becomes an array holding theirs and ours, the way herdr reads alternates.
function extend(finding, actualIndex) {
	const where = finding.path.join(".");
	const value = actualIndex.values.get(where)?.node.value;
	if (!value) {
		finding.blocked = `no ${where} written plainly enough to extend`;
		return undefined;
	}
	const list = members(finding)
		.map((member) => JSON.stringify(member))
		.join(", ");
	return { at: value.range[0], through: value.range[1], text: `[${list}]` };
}

function replace(finding, referenceSource, referenceIndex, actualIndex) {
	const where = finding.path.join(".");
	const [reference, actual] =
		finding.kind === "entry"
			? [findEntryNode(referenceIndex, finding), findEntryNode(actualIndex, finding)]
			: [referenceIndex.values.get(where)?.node, actualIndex.values.get(where)?.node];
	if (!reference) throw new Error(`the reference has no ${where} to copy`);
	if (!actual) {
		finding.blocked = `no ${where} written plainly enough to overwrite`;
		return undefined;
	}
	return { at: actual.range[0], through: actual.range[1], text: referenceSource.slice(...reference.range) };
}

function lineInsert(source, host, line) {
	const at = insertOffset(source, host);
	return at === 0 ? { at, text: `${line}\n` } : { at, text: `\n${line}` };
}

function insertOffset(source, host) {
	const last = (host.body ?? []).filter((node) => node.type === "TOMLKeyValue").at(-1);
	if (last) return endOfLine(source, last.range[1]);
	return host.type === "TOMLTopLevelTable" ? 0 : endOfLine(source, host.range[1]);
}

function applyEdits(source, inserts, replacements) {
	const byOffset = new Map();
	for (const { at, text } of inserts) byOffset.set(at, (byOffset.get(at) ?? "") + text);
	const edits = [...[...byOffset.entries()].map(([at, text]) => ({ at, through: at, text })), ...replacements];
	return edits
		.sort((a, b) => b.at - a.at)
		.reduce((text, edit) => text.slice(0, edit.at) + edit.text + text.slice(edit.through), source);
}

function appendBlocks(source, blocks) {
	if (blocks.length === 0) return source;
	const base = source === "" || source.endsWith("\n") ? source : `${source}\n`;
	return blocks.reduce((text, block) => `${text}\n${block}\n`, base);
}

function indexDocument(ast) {
	const root = ast.body[0];
	const tables = new Map([["", root]]);
	const values = new Map();
	const entries = [];

	const readKeys = (container, prefix) => {
		for (const node of container.body ?? []) {
			if (node.type !== "TOMLKeyValue") continue;
			values.set([...prefix, ...node.key.keys.map(keyName)].join("."), { node, tablePath: prefix.join(".") });
		}
	};

	readKeys(root, []);
	for (const node of root.body) {
		if (node.type !== "TOMLTable") continue;
		if (node.kind === "standard") {
			tables.set(node.resolvedKey.join("."), node);
			readKeys(node, node.resolvedKey);
		} else {
			entries.push({ path: node.resolvedKey.slice(0, -1).join("."), node });
		}
	}
	return { tables, values, entries };
}

function findEntryNode(index, finding) {
	const wanted = finding.expected[finding.identity];
	return index.entries.find(
		({ path, node }) => path === finding.path.join(".") && entryIdentity(node, finding.identity) === wanted,
	)?.node;
}

function entryIdentity(node, identity) {
	for (const kv of node.body ?? []) {
		const keys = kv.key.keys.map(keyName);
		if (keys.length === 1 && keys[0] === identity) return kv.value.value;
	}
	return undefined;
}

function keyName(node) {
	return node.type === "TOMLBare" ? node.name : node.value;
}

function sliceNode(source, comments, node) {
	return source.slice(leadingStart(source, comments, node), trailingEnd(comments, node));
}

function leadingStart(source, comments, node) {
	let start = node.range[0];
	let line = node.loc.start.line;
	for (const comment of [...comments].reverse()) {
		if (comment.loc.end.line !== line - 1) continue;
		if (!startsLine(source, comment.range[0])) continue;
		start = comment.range[0];
		line = comment.loc.start.line;
	}
	return start;
}

function trailingEnd(comments, node) {
	const trailing = comments.find(
		(comment) => comment.range[0] >= node.range[1] && comment.loc.start.line === node.loc.end.line,
	);
	return trailing ? trailing.range[1] : node.range[1];
}

function startsLine(source, offset) {
	return /^[ \t]*$/.test(source.slice(source.lastIndexOf("\n", offset - 1) + 1, offset));
}

function endOfLine(source, from) {
	const next = source.indexOf("\n", from);
	return next === -1 ? source.length : next;
}
