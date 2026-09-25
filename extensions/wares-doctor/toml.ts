import { getStaticTOMLValue, parseTOML } from "toml-eslint-parser";

import { diffDefaults, type Finding, members, type Reconciled, writes } from "./diff.ts";

type Node = any;
type Index = ReturnType<typeof indexDocument>;
interface Edit {
  at: number;
  through: number;
  text: string;
}

export function reconcileToml(actualSource: string, referenceSource: string, force = false): Reconciled {
  const reference = parseTOML(referenceSource);
  const actual = parseTOML(actualSource);
  const findings = diffDefaults(getStaticTOMLValue(reference), getStaticTOMLValue(actual));
  const referenceIndex = indexDocument(reference);
  const actualIndex = indexDocument(actual);

  const inserts: Omit<Edit, "through">[] = [];
  const replacements: Edit[] = [];
  const appends: string[] = [];
  const createdTables = new Set<string>();

  for (const finding of findings) {
    if (!writes(finding, force)) continue;

    if (finding.state === "diverged") {
      const replacement = replace(finding, referenceSource, referenceIndex, actualIndex);
      if (replacement) replacements.push(replacement);
      continue;
    }
    if (finding.kind === "members" && finding.state === "incomplete") {
      const extension = extend(finding, actualIndex);
      if (extension) replacements.push(extension);
      continue;
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

function extend(finding: Finding, actualIndex: Index): Edit | undefined {
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

function replace(finding: Finding, referenceSource: string, referenceIndex: Index, actualIndex: Index): Edit | undefined {
  const where = finding.path.join(".");
  const reference = referenceIndex.values.get(where)?.node;
  const actual = actualIndex.values.get(where)?.node;
  if (!reference) throw new Error(`the reference has no ${where} to copy`);
  if (!actual) {
    finding.blocked = `no ${where} written plainly enough to overwrite`;
    return undefined;
  }
  return { at: actual.range[0], through: actual.range[1], text: referenceSource.slice(...reference.range) };
}

function lineInsert(source: string, host: Node, line: string): Omit<Edit, "through"> {
  const at = insertOffset(source, host);
  return at === 0 ? { at, text: `${line}\n` } : { at, text: `\n${line}` };
}

function insertOffset(source: string, host: Node): number {
  const last = (host.body ?? []).filter((node: Node) => node.type === "TOMLKeyValue").at(-1);
  if (last) return endOfLine(source, last.range[1]);
  return host.type === "TOMLTopLevelTable" ? 0 : endOfLine(source, host.range[1]);
}

function applyEdits(source: string, inserts: Omit<Edit, "through">[], replacements: Edit[]): string {
  const byOffset = new Map<number, string>();
  for (const { at, text } of inserts) byOffset.set(at, (byOffset.get(at) ?? "") + text);
  const edits = [...[...byOffset.entries()].map(([at, text]) => ({ at, through: at, text })), ...replacements];
  return edits.sort((a, b) => b.at - a.at).reduce((text, edit) => text.slice(0, edit.at) + edit.text + text.slice(edit.through), source);
}

function appendBlocks(source: string, blocks: string[]): string {
  if (blocks.length === 0) return source;
  const base = source === "" || source.endsWith("\n") ? source : `${source}\n`;
  return blocks.reduce((text, block) => `${text}\n${block}\n`, base);
}

function indexDocument(ast: Node) {
  const root = ast.body[0];
  const tables = new Map<string, Node>([["", root]]);
  const values = new Map<string, { node: Node; tablePath: string }>();

  const readKeys = (container: Node, prefix: string[]) => {
    for (const node of container.body ?? []) {
      if (node.type !== "TOMLKeyValue") continue;
      values.set([...prefix, ...node.key.keys.map(keyName)].join("."), { node, tablePath: prefix.join(".") });
    }
  };

  readKeys(root, []);
  for (const node of root.body) {
    if (node.type !== "TOMLTable" || node.kind !== "standard") continue;
    tables.set(node.resolvedKey.join("."), node);
    readKeys(node, node.resolvedKey);
  }
  return { tables, values };
}

function keyName(node: Node): string {
  return node.type === "TOMLBare" ? node.name : node.value;
}

function sliceNode(source: string, comments: Node[], node: Node): string {
  return source.slice(leadingStart(source, comments, node), trailingEnd(comments, node));
}

function leadingStart(source: string, comments: Node[], node: Node): number {
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

function trailingEnd(comments: Node[], node: Node): number {
  const trailing = comments.find((comment) => comment.range[0] >= node.range[1] && comment.loc.start.line === node.loc.end.line);
  return trailing ? trailing.range[1] : node.range[1];
}

function startsLine(source: string, offset: number): boolean {
  return /^[ \t]*$/.test(source.slice(source.lastIndexOf("\n", offset - 1) + 1, offset));
}

function endOfLine(source: string, from: number): number {
  const next = source.indexOf("\n", from);
  return next === -1 ? source.length : next;
}
