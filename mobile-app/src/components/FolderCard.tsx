import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";

interface Props {
  directory: string;
  count: number;
  lastUpdated: number;
  onPress: () => void;
}

function truncateFromLeft(path: string, maxLen: number = 40): string {
  if (path.length <= maxLen) return path;
  return "…" + path.slice(path.length - (maxLen - 1));
}

function lastSegments(path: string, n: number = 2): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= n) return path;
  return parts.slice(parts.length - n).join("/");
}

export default function FolderCard({ directory, count, lastUpdated, onPress }: Props) {
  const shortName = lastSegments(directory, 1);
  const fullDisplay = truncateFromLeft(directory);
  const timeAgo = getTimeAgo(lastUpdated);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconBox}>
        <Text style={styles.iconText}>{"{ }"}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.shortName} numberOfLines={1}>
          {shortName}
        </Text>
        <Text style={styles.fullPath} numberOfLines={1}>
          {fullDisplay}
        </Text>
        <Text style={styles.time}>{timeAgo}</Text>
      </View>
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{count}</Text>
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
    flexDirection: "row",
    alignItems: "center",
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: BorderRadii.md,
    backgroundColor: Colors.dark.surfaceHover,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  iconText: {
    color: Colors.dark.primary,
    fontSize: FontSizes.lg,
    fontWeight: "700",
  },
  body: {
    flex: 1,
    marginRight: Spacing.md,
  },
  shortName: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  fullPath: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  time: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  countBadge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadii.full,
    minWidth: 26,
    height: 26,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    color: "#fff",
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
});