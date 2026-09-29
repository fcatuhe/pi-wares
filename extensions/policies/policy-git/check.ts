export const TYPES = ["feat", "fix", "ui", "content", "refactor", "test", "docs", "perf", "infra", "deps"];

const COMMIT = /\bgit\s+(?:-C\s+\S+\s+)?commit\b/;
const QUOTED = /\s-m\s*(["'])(?!\$\()([^\n]*?)\1/;
const HEREDOC = /\s-m\s*"\$\(cat\s*<<-?\s*'?(\w+)'?\n([^\n]*)/;
const SUBJECT = new RegExp(`^(?:(?:fixup|squash|amend)! )?(?:${TYPES.join("|")})(?:\\([\\w./-]+\\))?!?: \\S`);

export function subject(command: string): string | undefined {
  if (!COMMIT.test(command)) return;
  return command.match(HEREDOC)?.[2] ?? command.match(QUOTED)?.[2];
}

export function refusal(command: string): { block: true; reason: string } | undefined {
  const line = subject(command);
  if (line === undefined || SUBJECT.test(line)) return;
  return {
    block: true,
    reason: `Git policy refused the commit: "${line}" is not a Conventional Commit subject, type(scope): subject, with a type of ${TYPES.join("|")}.`,
  };
}
