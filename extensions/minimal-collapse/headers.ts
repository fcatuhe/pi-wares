import { homedir } from "node:os";

export type Header = { title: string; target: string; detail: string };

type Args = Record<string, unknown>;

export function minimalHeader(toolName: string, args: Args, home = homedir()): Header {
  switch (toolName) {
    case "read":
      return { title: "read", target: shortenPath(args.path, home), detail: lineRange(args) };
    case "bash":
      return bashHeader(args);
    case "write":
      return { title: "write", target: shortenPath(args.path, home), detail: count(lines(args.content), "line") };
    case "edit":
      return { title: "edit", target: shortenPath(args.path, home), detail: editCount(args.edits) };
    default:
      return { title: toolName, target: "", detail: "" };
  }
}

function bashHeader(args: Args): Header {
  const [firstLine = "", ...rest] = text(args.command).split("\n");
  const more = rest.some((line) => line.trim()) ? " ..." : "";
  const timeout = typeof args.timeout === "number" ? ` (timeout ${args.timeout}s)` : "";
  return { title: "$", target: firstLine + more, detail: timeout };
}

function lineRange(args: Args): string {
  if (typeof args.offset !== "number" && typeof args.limit !== "number") return "";

  const start = typeof args.offset === "number" ? args.offset : 1;
  const end = typeof args.limit === "number" ? start + args.limit - 1 : "";
  return `:${start}-${end}`;
}

function editCount(edits: unknown): string {
  if (Array.isArray(edits) && edits.length > 1) {
    return ` (${edits.length} edits)`;
  } else {
    return "";
  }
}

function lines(content: unknown): number {
  const value = text(content);
  return value ? value.split("\n").length : 0;
}

function count(n: number, noun: string): string {
  return n === 0 ? "" : ` (${n} ${noun}${n === 1 ? "" : "s"})`;
}

function shortenPath(path: unknown, home: string): string {
  const value = text(path);
  if (value === home || value.startsWith(`${home}/`)) {
    return `~${value.slice(home.length)}`;
  } else {
    return value;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
