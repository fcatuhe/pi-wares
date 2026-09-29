import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

const HERE = import.meta.dirname;
const POLICIES = join(HERE, "..", "..");
const TOOL_ALIAS = join(POLICIES, "..", "subscription-tool-alias");
const CONDITIONS = ["none", "policy"] as const;
const CHAT_TASKS = ["explain", "tradeoff", "debug", "code", "review"];
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

type Condition = (typeof CONDITIONS)[number];

const words = (...list: string[]) => new RegExp(`\\b(?:${list.join("|")})\\b`, "gi");

const TELLS: Record<string, RegExp> = {
  "dash as a joint": /[\u2013\u2014]/g,
  arrow: /[\u2190-\u21ff]/g,
  "smart quote, ellipsis": /[\u2018\u2019\u201c\u201d\u2026]/g,
  "semicolon between clauses": /\w; [a-z]/g,
  "filler adverb": words("simply", "just", "actually", "really", "basically", "genuinely", "truly", "incredibly", "deeply", "importantly"),
  "service opener": /^\s*(?:great|good catch|you're (?:absolutely )?right|certainly|absolutely|sure[,!]|i'd be happy|let me)/gi,
  "service closer, offer": /hope this helps|let me know if|feel free to|happy to help|want me to|would you like me to|i can also/gi,
  "throat-clearing, signposting":
    /here's the thing|here's why|the truth is|it turns out|it's worth noting|it's important to note|let's break|in summary|to summarize|overall,|key takeaways?|tl;dr|bottom line/gi,
  "inflated word": words(
    "delve",
    "leverage",
    "utilize",
    "robust",
    "seamless(?:ly)?",
    "elegant",
    "powerful",
    "comprehensive",
    "crucial",
    "pivotal",
    "intricate",
    "meticulous",
    "holistic",
    "streamline",
    "empower",
    "foster",
    "elevate",
    "unlock",
    "harness",
    "showcase",
    "underscore",
    "journey",
    "landscape",
    "realm",
    "tapestry",
  ),
  'inflated "is"': /serves as|stands as|plays a (?:key|crucial|vital) role|boasts/gi,
  "praise tail": /, (?:ensuring|allowing for|making it (?:ideal|easy|easier))/gi,
  "staged reveal": /(?:^|\. )the (?:result|catch|fix|problem|kicker|upshot)[?:]/gim,
  "contrast frame": /not just [^.]{1,40}, but|isn't [^.]{1,30}\. it's|it's not about/gi,
  emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
  "bullet led by a bold term": /^\s*(?:[-*]|\d+\.) \*\*[^*\n]+\*\*/gm,
  "--- between sections": /^---\s*$/gm,
};

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      model: { type: "string", default: "anthropic/claude-opus-5-5" },
      thinking: { type: "string", default: "high" },
      runs: { type: "string", default: "3" },
      jobs: { type: "string", default: "5" },
    },
  });
  const [command, dir] = positionals;
  if (command === "score" && dir) {
    console.log(score(dir));
  } else if (command === "run") {
    const out = mkdtempSync(join(tmpdir(), "policy-writing-eval-"));
    await runAll(out, values.model, values.thinking, Number(values.runs), Number(values.jobs));
    console.log(`${values.model}:${values.thinking}, outputs in ${out}\n\n${score(out)}`);
  } else {
    console.error("usage: eval.ts run [--model provider/id] [--thinking high] [--runs 3] [--jobs 5] | eval.ts score <dir>");
    process.exit(2);
  }
}

async function runAll(out: string, model: string, thinking: string, runs: number, jobs: number) {
  const tasks = readdirSync(join(HERE, "tasks")).map((file) => basename(file, ".md"));
  const queue = tasks.flatMap((task) =>
    CONDITIONS.flatMap((condition) => Array.from({ length: runs }, (_, i) => ({ task, condition, n: i + 1 }))),
  );
  const total = queue.length;
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const id = `${job.task}.${job.condition}.${job.n}`;
      try {
        writeFileSync(join(out, `${id}.md`), await runOne(job.task, job.condition, model, thinking));
        process.stderr.write(`${total - queue.length}/${total} ${id}\n`);
      } catch (error) {
        writeFileSync(join(out, `${id}.err`), String(error));
        process.stderr.write(`${total - queue.length}/${total} ${id} failed, see ${id}.err\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
}

async function runOne(task: string, condition: Condition, model: string, thinking: string): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), "policy-writing-run-"));
  cpSync(join(HERE, "fixture"), cwd, { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd });
  const policies = readdirSync(POLICIES).filter(
    (entry) => entry.startsWith("policy-") && (condition === "policy" || entry !== "policy-writing"),
  );
  const args = [
    "-p",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-context-files",
    ...["--model", model, "--thinking", thinking],
    ...[TOOL_ALIAS, ...policies.map((entry) => join(POLICIES, entry))].flatMap((path) => ["-e", path]),
    readFileSync(join(HERE, "tasks", `${task}.md`), "utf8"),
  ];
  return pi(args, cwd);
}

function pi(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("pi", args, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: RUN_TIMEOUT_MS });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`pi exited ${code}: ${stderr}`))));
  });
}

export function score(dir: string): string {
  const outputs = readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const [task, condition] = file.split(".");
      return { task, condition, text: readFileSync(join(dir, file), "utf8") };
    });
  const of = (condition: string) => outputs.filter((output) => output.condition === condition);
  const count = (text: string, pattern: RegExp) => stripCode(text).match(pattern)?.length ?? 0;
  const perRun = (condition: string) => (of(condition).length / new Set(of(condition).map(({ task }) => task)).size).toString();

  const rows = Object.entries(TELLS).map(([tell, pattern]) => [
    tell,
    ...CONDITIONS.map((c) => sum(of(c).map(({ text }) => count(text, pattern)))),
  ]);
  const chat = (condition: string) => of(condition).filter(({ task }) => CHAT_TASKS.includes(task));
  rows.push([
    "chat reply opening on a heading or label",
    ...CONDITIONS.map((c) => `${chat(c).filter(({ text }) => opensOnLabel(text)).length}/${chat(c).length}`),
  ]);
  rows.push(["mean words", ...CONDITIONS.map((c) => Math.round(sum(of(c).map(({ text }) => text.split(/\s+/).length)) / of(c).length))]);

  const tasks = [...new Set(outputs.map(({ task }) => task))].sort();
  const tellsIn = (text: string) => sum(Object.values(TELLS).map((pattern) => count(text, pattern)));
  const perTask = tasks.map((task) => [
    task,
    ...CONDITIONS.map((c) => {
      const runs = of(c).filter((output) => output.task === task);
      return `${sum(runs.map(({ text }) => tellsIn(text)))} tells, ${Math.round(sum(runs.map(({ text }) => text.split(/\s+/).length)) / runs.length)} words`;
    }),
  ]);

  return [
    `Totals over ${tasks.length} tasks, ${perRun("policy")} runs each:`,
    "",
    table(["", ...CONDITIONS], rows),
    "",
    table(["task", ...CONDITIONS], perTask),
  ].join("\n");
}

function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

function opensOnLabel(text: string): boolean {
  const first = text.split("\n").find((line) => line.trim()) ?? "";
  return /^#{1,6} /.test(first) || /^\*\*[^*]+\*\*\s*$/.test(first.trim());
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function table(header: string[], rows: Array<Array<string | number>>): string {
  return [header, header.map(() => "---"), ...rows].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

if (process.argv[1] === import.meta.filename) await main();
