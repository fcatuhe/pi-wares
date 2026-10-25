export const TYPES = ["feat", "fix", "ui", "content", "refactor", "test", "docs", "perf", "infra", "deps"];

type Refusal = { block: true; reason: string };

const GIT = String.raw`\bgit\s+(?:-C\s+\S+\s+)?`;
const COMMIT = new RegExp(`${GIT}commit\\b`);
const QUOTED = /\s-m\s*(["'])(?!\$\()([^\n]*?)\1/;
const HEREDOC = /\s-m\s*"\$\(cat\s*<<-?\s*'?(\w+)'?\n([^\n]*)/;
const SUBJECT = new RegExp(`^(?:(?:fixup|squash|amend)! )?(?:${TYPES.join("|")})(?:\\([\\w./-]+\\))?!?: \\S`);
const WORKTREE_ADD = new RegExp(`${GIT}worktree\\s+add\\b`);
const NEW_BRANCH = [
  new RegExp(`${GIT}checkout\\s+-[bB]\\s+(\\S+)`, "g"),
  new RegExp(`${GIT}switch\\s+(?:-[cC]|--create|--force-create)\\s+(\\S+)`, "g"),
  new RegExp(`${GIT}branch\\s+(?!-)(\\S+)`, "g"),
  /\bherdr\s+worktree\s+create\b[^\n;&|]*?\s--branch[\s=]+(\S+)/g,
];

export function refusal(command: string): Refusal | undefined {
  return subjectRefusal(command) ?? worktreeRefusal(command) ?? branchRefusal(branches(command));
}

export function branchRefusal(names: (string | undefined)[]): Refusal | undefined {
  const name = names.find((n) => n?.includes("/"));
  if (name === undefined) return;
  return {
    block: true,
    reason: `Git policy refused the branch "${name}": a branch name has no "/", write <type>-<slug>, as in ${name.replaceAll("/", "-")}.`,
  };
}

export function subject(command: string): string | undefined {
  if (!COMMIT.test(command)) return;
  return command.match(HEREDOC)?.[2] ?? command.match(QUOTED)?.[2];
}

function subjectRefusal(command: string): Refusal | undefined {
  const line = subject(command);
  if (line === undefined || SUBJECT.test(line)) return;
  return {
    block: true,
    reason: `Git policy refused the commit: "${line}" is not a Conventional Commit subject, type(scope): subject, with a type of ${TYPES.join("|")}.`,
  };
}

function worktreeRefusal(command: string): Refusal | undefined {
  if (!WORKTREE_ADD.test(command)) return;
  return {
    block: true,
    reason:
      "Git policy refused git worktree add: create the worktree with Paseo's create_workspace, isolation worktree and baseBranch origin/main, or herdr_worktree_jump outside Paseo.",
  };
}

function branches(command: string): string[] {
  return NEW_BRANCH.flatMap((pattern) => [...command.matchAll(pattern)].map((m) => m[1].replace(/^["']|["']$/g, "")));
}
