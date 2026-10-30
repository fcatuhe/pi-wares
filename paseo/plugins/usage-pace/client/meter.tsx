import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import type { UsageWindow } from "../shared/usage";
import { clamp, type Pace, usedPct } from "./pace";

export type Tone = NonNullable<UsageWindow["tone"]>;

export function windowTone(rateWindow: UsageWindow): Tone {
  if (rateWindow.tone) return rateWindow.tone;
  const used = usedPct(rateWindow);
  if (used == null) return "default";
  if (used > 90) return "danger";
  if (used >= 70) return "warning";
  return "default";
}

export function toneColor(theme: PluginTheme, tone: Tone): string {
  switch (tone) {
    case "ok":
      return theme.colors.statusSuccess;
    case "warning":
      return theme.colors.statusWarning;
    case "danger":
      return theme.colors.statusDanger;
    default:
      return theme.colors.foregroundMuted;
  }
}

export function paceColor(theme: PluginTheme, pace: Pace): string {
  return pace.stage === "deficit" ? theme.colors.statusDanger : theme.colors.statusSuccess;
}

export function UsageMeter({
  theme,
  percent,
  pace,
  fill,
  height = 4,
  style,
}: {
  theme: PluginTheme;
  percent: number;
  pace: Pace | null;
  fill: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const marker = pace && pace.stage !== "on_pace" ? pace : null;
  const styles = useMemo(
    () => ({
      frame: { height: height + 4, justifyContent: "center" as const },
      track: {
        height,
        borderRadius: height / 2,
        backgroundColor: theme.colors.border,
        overflow: "hidden" as const,
      },
      fill: { height: "100%" as const, borderRadius: height / 2, backgroundColor: fill, width: `${clamp(percent)}%` as const },
      marker: marker && {
        position: "absolute" as const,
        top: 0,
        bottom: 0,
        width: 2,
        marginLeft: -1,
        borderRadius: 1,
        left: `${clamp(marker.expectedPct)}%` as const,
        backgroundColor: paceColor(theme, marker),
      },
    }),
    [fill, height, marker, percent, theme],
  );
  return (
    <View style={[styles.frame, style]}>
      <View style={styles.track}>
        <View style={styles.fill} />
      </View>
      {styles.marker ? <View style={styles.marker} /> : null}
    </View>
  );
}
