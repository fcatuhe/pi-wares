import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { clamp, type Pace, paceTone } from "./pace";

function fillColor(theme: PluginTheme, pace: Pace | null): string {
  if (!pace) return theme.colors.foregroundMuted;
  switch (paceTone(pace)) {
    case "success":
      return theme.colors.statusSuccess;
    case "warning":
      return theme.colors.statusWarning;
    case "danger":
      return theme.colors.statusDanger;
  }
}

export function UsageMeter({
  theme,
  percent,
  pace,
  height = 4,
  style,
}: {
  theme: PluginTheme;
  percent: number;
  pace: Pace | null;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useMemo(() => {
    const fill = fillColor(theme, pace);
    return {
      frame: { height: height + 4, justifyContent: "center" as const },
      track: {
        height,
        borderRadius: height / 2,
        backgroundColor: theme.colors.border,
        overflow: "hidden" as const,
      },
      fill: { height: "100%" as const, borderRadius: height / 2, backgroundColor: fill, width: `${clamp(percent)}%` as const },
      marker: pace && {
        position: "absolute" as const,
        top: 0,
        bottom: 0,
        width: 2,
        marginLeft: -1,
        borderRadius: 1,
        left: `${clamp(pace.expectedPct)}%` as const,
        backgroundColor: theme.colors.accent,
      },
    };
  }, [height, pace, percent, theme]);
  return (
    <View style={[styles.frame, style]}>
      <View style={styles.track}>
        <View style={styles.fill} />
      </View>
      {styles.marker ? <View style={styles.marker} /> : null}
    </View>
  );
}
