import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { readJson } from "../../lib/files.ts";
import { wareDir } from "../../lib/paths.ts";

const COMMAND = "output-style";
const DEFAULT_STYLE = "default";
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const STYLES_DIR = "styles";

type Style = { name: string; description: string; body: string };
type Styles = Map<string, Style>;

export default function (pi: ExtensionAPI) {
  const base = readFileSync(join(import.meta.dirname, "base.md"), "utf8").trim();
  let styles = loadStyles(styleDirs());
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
    styles = loadStyles(styleDirs());
    const setting = configuredStyle();
    configured = setting && styles.has(setting.toLowerCase()) ? setting.toLowerCase() : DEFAULT_STYLE;
    if (setting && configured !== setting.toLowerCase()) {
      ctx.ui.notify(`${configFile()} names an unknown output style "${setting}", using ${styles.get(DEFAULT_STYLE)!.name}`, "error");
    }
    showStatus(ctx, activeStyle(ctx, styles, configured));
  });

  pi.on("session_tree", (_event, ctx) => showStatus(ctx, activeStyle(ctx, styles, configured)));

  pi.on("before_agent_start", (event, ctx) => ({
    systemPrompt: `${event.systemPrompt}\n\n${base}\n\n${activeStyle(ctx, styles, configured).body}`,
  }));
}

function styleDirs(): string[] {
  return [join(import.meta.dirname, STYLES_DIR), join(wareDir(COMMAND), STYLES_DIR)];
}

function configFile(): string {
  return join(wareDir(COMMAND), "config.json");
}

function configuredStyle(): string | undefined {
  const style = readJson<{ style?: unknown }>(configFile())?.style;
  return typeof style === "string" ? style : undefined;
}

function loadStyles(dirs: string[]): Styles {
  const styles: Styles = new Map();
  for (const dir of dirs.filter((dir) => existsSync(dir))) {
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort()) {
      const style = parseStyle(basename(file, ".md"), readFileSync(join(dir, file), "utf8"));
      styles.set(style.name.toLowerCase(), style);
    }
  }
  if (!styles.has(DEFAULT_STYLE)) throw new Error(`no ${DEFAULT_STYLE}.md in ${dirs[0]}, the default output style`);
  return styles;
}

function parseStyle(fileName: string, text: string): Style {
  const [frontmatter, fields] = text.match(FRONTMATTER) ?? ["", ""];
  const field = (key: string) => fields.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim();
  return { name: field("name") ?? fileName, description: field("description") ?? "", body: text.slice(frontmatter.length).trim() };
}

function activeStyle(ctx: ExtensionContext, styles: Styles, configured: string): Style {
  const switched = ctx.sessionManager.getBranch().findLast((entry) => entry.type === "custom" && entry.customType === COMMAND) as
    | { data?: { style?: string } }
    | undefined;
  return styles.get(switched?.data?.style?.toLowerCase() ?? configured) ?? styles.get(configured)!;
}

function names(styles: Styles): string {
  return [...styles.values()].map(({ name }) => name).join(", ");
}

function showStatus(ctx: ExtensionContext, style: Style) {
  ctx.ui.setStatus(COMMAND, style.name.toLowerCase() === DEFAULT_STYLE ? undefined : `style: ${style.name}`);
}
