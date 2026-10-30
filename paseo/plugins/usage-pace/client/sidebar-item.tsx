import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Fragment, useMemo } from "react";
import { Pressable, type PressableStateCallbackType, Text, View } from "react-native";
import { UsageMeter } from "./meter";
import { type Pace, usedPct, windowPace } from "./pace";
import { UsagePopover } from "./popover";
import { summaryWindows } from "./report";
import { useNow, useUsage } from "./use-usage";

export function UsageSidebarItem({ theme, host, openPopover }: PluginSidebarItemProps) {
  const usage = useUsage(host.id);
  const now = useNow();
  const styles = useMemo(() => sidebarStyles(theme), [theme]);
  const sources = useMemo(
    () =>
      (usage.data?.entries ?? [])
        .map((entry) => ({ entry, windows: summaryWindows(entry) }))
        .filter((source) => source.windows.length > 0),
    [usage.data],
  );

  if (usage.isPending) return null;
  const open = () => openPopover(UsagePopover);
  const rowStyle = ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
    styles.row,
    (hovered || pressed) && styles.rowHovered,
  ];

  if (usage.isError || sources.length === 0) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Usage" onPress={open} style={rowStyle}>
        <Icon name={usage.isError ? "TriangleAlert" : "Gauge"} size={14} color={theme.colors.foregroundMuted} />
        <Text style={styles.muted} numberOfLines={1}>
          {usage.isError ? "Usage unavailable" : "No usage to show"}
        </Text>
      </Pressable>
    );
  }

  const label = sources
    .flatMap(({ entry, windows }) => windows.map((rateWindow) => `${entry.sourceLabel} ${rateWindow.label} ${usedPct(rateWindow) ?? "-"}%`))
    .join(", ");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Usage: ${label}`} onPress={open} style={rowStyle}>
      {sources.map(({ entry, windows }, sourceIndex) => (
        <Fragment key={entry.id}>
          <View style={sourceIndex === 0 ? null : styles.sourceGap}>
            <Icon
              {...(entry.icon ? { icon: { svg: entry.icon } } : { name: "Gauge" })}
              size={14}
              color={theme.colors.foregroundMuted}
            />
          </View>
          {windows.map((rateWindow) => {
            const pace = windowPace(rateWindow, now);
            return (
              <Fragment key={rateWindow.id}>
                <UsageMeter
                  theme={theme}
                  percent={usedPct(rateWindow) ?? 0}
                  pace={pace}
                  fill={theme.colors.foregroundMuted}
                  height={6}
                  style={styles.meter}
                />
                <Text style={[styles.percent, runsOut(pace) && styles.danger]} numberOfLines={1}>
                  {formatPct(usedPct(rateWindow))}
                  {rateWindow.shortLabel === "" ? null : (
                    <Text style={styles.windowLabel}>{` ${rateWindow.shortLabel ?? rateWindow.label}`}</Text>
                  )}
                </Text>
              </Fragment>
            );
          })}
        </Fragment>
      ))}
    </Pressable>
  );
}

function runsOut(pace: Pace | null): boolean {
  return pace?.runsOutInMs != null;
}

function formatPct(pct: number | null): string {
  return pct == null ? "-" : `${Math.round(pct)}%`;
}

function sidebarStyles(theme: PluginSidebarItemProps["theme"]) {
  return {
    row: {
      width: "100%" as const,
      minHeight: 28,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 8,
      overflow: "hidden" as const,
    },
    rowHovered: { backgroundColor: theme.colors.surface2 },
    sourceGap: { marginLeft: 6 },
    meter: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 16 },
    percent: { flexShrink: 0, color: theme.colors.foreground, fontSize: 13, fontVariant: ["tabular-nums" as const] },
    windowLabel: { color: theme.colors.foregroundMuted },
    danger: { color: theme.colors.statusDanger },
    muted: { flexShrink: 1, color: theme.colors.foregroundMuted, fontSize: 13 },
  };
}
