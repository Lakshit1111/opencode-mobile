import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { Session, SessionStatus } from "../types/opencode";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";

interface Props {
  session: Session;
  status?: SessionStatus;
  onPress: () => void;
}

export default function SessionCard({ session, status, onPress }: Props) {
  const statusLabel =
    status?.type === "busy"
      ? "Busy"
      : status?.type === "retry"
      ? `Retry (${status.attempt})`
      : "Idle";

  const statusColor =
    status?.type === "busy"
      ? Colors.dark.busy
      : status?.type === "retry"
      ? Colors.dark.retry
      : Colors.dark.idle;

  const timeAgo = getTimeAgo(session.time.updated);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.title} numberOfLines={1}>
            {session.title || "Untitled"}
          </Text>
        </View>
        <Text style={styles.time}>{timeAgo}</Text>
      </View>
      <View style={styles.footer}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {session.summary && (
          <Text style={styles.summary}>
            +{session.summary.additions} -{session.summary.deletions} ({session.summary.files} files)
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadii.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: Spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  time: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadii.sm,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  summary: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
});