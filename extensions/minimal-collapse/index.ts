import {
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Box, type Component, Container, TruncatedText } from "@earendil-works/pi-tui";

import { minimalHeader } from "./headers.ts";

type ToolRenderContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];

const WRAPPED_TOOLS = [createReadToolDefinition, createBashToolDefinition, createEditToolDefinition, createWriteToolDefinition];

export default function (pi: ExtensionAPI) {
  let minimal = true;
  const redraws = new Map<string, () => void>();
  const ours = new WeakSet<Component>();

  const collapsedToMinimum = (context: ToolRenderContext) => minimal && !context.expanded;

  const mine = <T extends Component>(component: T): T => {
    ours.add(component);
    return component;
  };

  const forPi = (context: ToolRenderContext): ToolRenderContext =>
    context.lastComponent && ours.has(context.lastComponent) ? { ...context, lastComponent: undefined } : context;

  for (const create of WRAPPED_TOOLS) {
    const tool = create(process.cwd()) as ToolDefinition;

    pi.registerTool({
      ...tool,
      renderCall(args, theme, context) {
        redraws.set(context.toolCallId, context.invalidate);
        if (collapsedToMinimum(context)) {
          return mine(headerComponent(tool, args, theme, context));
        } else {
          return tool.renderCall?.(args, theme, forPi(context)) ?? mine(new Container());
        }
      },
      renderResult(result, options, theme, context) {
        if (collapsedToMinimum(context)) {
          return mine(new Container());
        } else {
          return tool.renderResult?.(result, options, theme, forPi(context)) ?? mine(new Container());
        }
      },
    });
  }

  pi.on("session_start", () => redraws.clear());

  const toggle = (ctx: ExtensionContext) => {
    minimal = !minimal;
    for (const redraw of redraws.values()) redraw();
    ctx.ui.notify(`Minimal collapse: ${minimal ? "on" : "off"}`, "info");
  };

  pi.registerShortcut("alt+o", { description: "Toggle minimal collapse of tool output", handler: toggle });
  pi.registerCommand("minimal-collapse", {
    description: "Toggle minimal collapse of tool output",
    handler: async (_args, ctx) => toggle(ctx),
  });
}

function headerComponent(tool: ToolDefinition, args: Record<string, unknown>, theme: Theme, context: ToolRenderContext): Component {
  const { title, target, detail } = minimalHeader(tool.name, args ?? {});
  const line = `${theme.fg("toolTitle", theme.bold(title))} ${theme.fg("accent", target)}${theme.fg("muted", detail)}`;

  if (tool.renderShell === "self") {
    const box = new Box(1, 1, shellBackground(theme, context));
    box.addChild(new TruncatedText(line));
    return box;
  } else {
    return new TruncatedText(line);
  }
}

function shellBackground(theme: Theme, context: ToolRenderContext): (text: string) => string {
  const color = context.isPartial ? "toolPendingBg" : context.isError ? "toolErrorBg" : "toolSuccessBg";
  return (text) => theme.bg(color, text);
}
