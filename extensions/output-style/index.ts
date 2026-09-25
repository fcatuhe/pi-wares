import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const COMMAND = "output-style";
const SETTING = "outputStyle";
const DEFAULT_STYLE = "default";
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

type Style = { name: string; description: string; body: string };
type Styles = Map<string, Style>;

export default function (pi: ExtensionAPI) {
  const base = readFileSync(join(import.meta.dirname, "base.md"), "utf8").trim();
  const styles = loadStyles(join(import.meta.dirname, "output-styles"));
  let configured = DEFAULT_STYLE;

  pi.registerCommand(COMMAND, {
    description: `Switch the output style for this session: ${names(styles)}`,
    getArgumentCompletions: (prefix) =>
      [...styles.values()]
        .filter(({ name }) => name.toLowerCase().startsWith(prefix.toLowerCase()))
        .map(({ name, description }) => ({ value: name, label: name, description })),
    handler: async (args, ctx) => {
      const current = activeStyle(ctx, styles, configured);
      const others = [...styles.values()].filter((style) => style !== current).map(({ name }) => name);
      const choice = args.trim() || (await ctx.ui.select(`Output style: ${current.name}`, others));
      if (!choice) return;
      const style = styles.get(choice.toLowerCase());
      if (!style) {
        ctx.ui.notify(`Unknown output style "${choice}", pick one of: ${names(styles)}`, "error");
        return;
      }
      if (style === current) return;
      pi.appendEntry(COMMAND, { style: style.name });
      showStatus(ctx, style);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    const setting = settingStyle(ctx.cwd);
    configured = setting && styles.has(setting.toLowerCase()) ? setting.toLowerCase() : DEFAULT_STYLE;
    if (setting && configured !== setting.toLowerCase()) {
      ctx.ui.notify(`${SETTING} names an unknown output style "${setting}", using ${styles.get(DEFAULT_STYLE)!.name}`, "error");
    }
    showStatus(ctx, activeStyle(ctx, styles, configured));
  });

  pi.on("session_tree", (_event, ctx) => showStatus(ctx, activeStyle(ctx, styles, configured)));

  pi.on("before_agent_start", (event, ctx) => ({
    systemPrompt: `${event.systemPrompt}\n\n${base}\n\n${activeStyle(ctx, styles, configured).body}`,
  }));
}

function loadStyles(dir: string): Styles {
  const styles: Styles = new Map();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".md")).sort()) {
    const style = parseStyle(basename(file, ".md"), readFileSync(join(dir, file), "utf8"));
    styles.set(style.name.toLowerCase(), style);
  }
  if (!styles.has(DEFAULT_STYLE)) throw new Error(`${dir} has no ${DEFAULT_STYLE}.md, the default output style`);
  return styles;
}

function parseStyle(fileName: string, text: string): Style {
  const [frontmatter, fields] = text.match(FRONTMATTER) ?? ["", ""];
  const field = (key: string) => fields.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim();
  return { name: field("name") ?? fileName, description: field("description") ?? "", body: text.slice(frontmatter.length).trim() };
}

function activeStyle(ctx: ExtensionContext, styles: Styles, configured: string): Style {
  const switched = ctx.sessionManager
    .getBranch()
    .findLast((entry) => entry.type === "custom" && entry.customType === COMMAND) as { data?: { style?: string } } | undefined;
  return styles.get(switched?.data?.style?.toLowerCase() ?? configured) ?? styles.get(configured)!;
}

function settingStyle(cwd: string): string | undefined {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  for (const file of [join(cwd, ".pi", "settings.json"), join(agentDir, "settings.json")]) {
    if (!existsSync(file)) continue;
    const value = JSON.parse(readFileSync(file, "utf8"))[SETTING];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function names(styles: Styles): string {
  return [...styles.values()].map(({ name }) => name).join(", ");
}

function showStatus(ctx: ExtensionContext, style: Style) {
  ctx.ui.setStatus(COMMAND, style.name.toLowerCase() === DEFAULT_STYLE ? undefined : `style: ${style.name}`);
}
