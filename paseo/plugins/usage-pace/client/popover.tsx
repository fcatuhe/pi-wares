import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginPopoverProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { UsageBalance, UsageEntry, UsageWindow } from "../shared/usage";
import { toneColor, UsageMeter, windowTone } from "./meter";
import { agoLabel, outlookLabel, paceLabel, resetLabel, usedPct, windowPace } from "./pace";
import { resolveReport } from "./report";
import { useNow, useRefreshUsage, useUsage } from "./use-usage";

type Styles = ReturnType<typeof popoverStyles>;

export function UsagePopover({ theme, host }: PluginPopoverProps) {
  const usage = useUsage(host.id);
  const refresh = useRefreshUsage(host.id);
  const now = useNow();
  const styles = useMemo(() => popoverStyles(theme), [theme]);

  return (
    <View style={styles.popover}>
      {usage.isPending ? <Text style={styles.muted}>Loading usage</Text> : null}
      {usage.isError ? <Text style={styles.error}>{errorText(usage.error)}</Text> : null}
      {usage.data?.entries.length === 0 ? <Text style={styles.muted}>No usage sources on {host.label}</Text> : null}
      {usage.data?.entries.map((entry, index) => (
        <View key={entry.id} style={index === 0 ? styles.card : [styles.card, styles.cardDivider]}>
          <UsageCard entry={entry} now={now} theme={theme} styles={styles} />
        </View>
      ))}
      <View style={styles.footer}>
        <Text style={styles.error} numberOfLines={2}>
          {refresh.isError ? `Refresh failed: ${errorText(refresh.error)}` : null}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh usage"
          disabled={refresh.isPending}
          onPress={() => refresh.mutate()}
          style={({ pressed }) => [styles.refresh, pressed && styles.refreshPressed]}
        >
          <Icon name="RotateCw" size={12} color={theme.colors.foregroundMuted} />
          <Text style={styles.muted}>{refresh.isPending ? "Refreshing" : "Refresh"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function UsageCard({ entry, now, theme, styles }: { entry: UsageEntry; now: number; theme: PluginTheme; styles: Styles }) {
  const report = resolveReport(entry);
  const updated = agoLabel(report.successfulAt, now);
  return (
    <>
      <View style={styles.header}>
        <Icon
          {...(entry.icon ? { icon: { svg: entry.icon } } : { name: "Gauge" })}
          size={14}
          color={theme.colors.foreground}
        />
        <Text style={styles.name} numberOfLines={1}>
          {entry.sourceLabel}
        </Text>
        {report.planLabel ? <Text style={styles.badge}>{report.planLabel}</Text> : null}
        <View style={styles.spacer} />
        <Text style={styles.small} numberOfLines={1}>
          {updated ? `${report.retained ? "Last updated" : "Updated"} ${updated}` : "Never updated"}
        </Text>
      </View>
      {entry.account.label ? (
        <Text style={styles.small} numberOfLines={1}>
          {entry.account.label}
        </Text>
      ) : null}
      {report.messages.map((message) => (
        <Text key={message} style={styles.error}>
          {message}
        </Text>
      ))}
      {report.windows.map((rateWindow) => (
        <WindowRow key={rateWindow.id} rateWindow={rateWindow} now={now} theme={theme} styles={styles} />
      ))}
      {report.balances.map((balance) => (
        <View key={balance.id} style={styles.labelRow}>
          <Text style={styles.label}>{balance.label}</Text>
          <Text style={styles.value}>{balanceText(balance)}</Text>
        </View>
      ))}
      {report.details.map((detail) => (
        <View key={detail.id} style={styles.labelRow}>
          <Text style={styles.label}>{detail.label}</Text>
          <Text style={styles.value}>{detail.value}</Text>
        </View>
      ))}
    </>
  );
}

function WindowRow({ rateWindow, now, theme, styles }: { rateWindow: UsageWindow; now: number; theme: PluginTheme; styles: Styles }) {
  const used = usedPct(rateWindow);
  const pace = windowPace(rateWindow, now);
  const reset = resetLabel(rateWindow.resetsAt, now);
  return (
    <View style={styles.window}>
      <View style={styles.labelRow}>
        <Text style={styles.label} numberOfLines={1}>
          {rateWindow.label}
        </Text>
        <Text style={styles.value} numberOfLines={1}>
          {used == null ? "-" : `${Math.round(used)}% used`}
          {reset ? <Text style={styles.muted}>{` · ${reset}`}</Text> : null}
        </Text>
      </View>
      <UsageMeter theme={theme} percent={used ?? 0} pace={pace} fill={toneColor(theme, windowTone(rateWindow))} height={6} />
      {pace ? (
        <Text style={styles.small} numberOfLines={1}>
          {`Pace: ${paceLabel(pace)} · `}
          <Text style={pace.runsOutInMs == null ? null : styles.danger}>{outlookLabel(pace)}</Text>
        </Text>
      ) : null}
    </View>
  );
}

function balanceText(balance: UsageBalance): string {
  const amount = (value: number) =>
    balance.unit === "usd"
      ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, notation: "compact" }).format(value);
  if (balance.remaining != null && balance.limit != null) return `${amount(balance.remaining)} of ${amount(balance.limit)} left`;
  if (balance.remaining != null) return `${amount(balance.remaining)} left`;
  if (balance.used != null) return `${amount(balance.used)} used`;
  return "-";
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function popoverStyles(theme: PluginTheme) {
  const small = { color: theme.colors.foregroundMuted, fontSize: 12 };
  return {
    popover: { gap: 12 },
    card: { gap: 8 },
    cardDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 },
    header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    name: { flexShrink: 1, color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const },
    badge: {
      ...small,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      backgroundColor: theme.colors.surface2,
    },
    spacer: { flex: 1 },
    window: { gap: 2, paddingVertical: 2 },
    labelRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    label: { flex: 1, color: theme.colors.foregroundMuted, fontSize: 13 },
    value: { flexShrink: 1, color: theme.colors.foreground, fontSize: 13, fontWeight: "500" as const },
    muted: { color: theme.colors.foregroundMuted, fontSize: 13, fontWeight: "400" as const },
    small,
    danger: { color: theme.colors.statusDanger },
    error: { color: theme.colors.statusDanger, fontSize: 12, flexShrink: 1 },
    footer: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 8 },
    refresh: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6 },
    refreshPressed: { backgroundColor: theme.colors.surface2 },
  };
}
