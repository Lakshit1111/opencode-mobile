import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";

interface Props {
  tool: string;
  state: any;
}

export default function ToolCall({ tool, state }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = state.status === "running";
  const isCompleted = state.status === "completed";
  const isError = state.status === "error";

  const statusColor = isRunning
    ? Colors.dark.busy
    : isCompleted
    ? Colors.dark.success
    : isError
    ? Colors.dark.error
    : Colors.dark.textMuted;

  const statusLabel =
    state.status === "running"
      ? "Running"
      : state.status === "completed"
      ? "Done"
      : state.status === "error"
      ? "Error"
      : "Pending";

  const hasDetails =
    (state.input && Object.keys(state.input).length > 0) ||
    state.output ||
    state.error;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => hasDetails && setExpanded(!expanded)}
        activeOpacity={hasDetails ? 0.7 : 1}
      >
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={styles.toolName} numberOfLines={1}>{tool}</Text>
        <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>
        {hasDetails && (
          <Text style={styles.chevron}>{expanded ? "▼" : "▶"}</Text>
        )}
      </TouchableOpacity>

      {isRunning && state.title && !expanded && (
        <Text style={styles.title} numberOfLines={1}>{state.title}</Text>
      )}

      {expanded && hasDetails && (
        <View style={styles.details}>
          {state.input && Object.keys(state.input).length > 0 && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Input</Text>
              <Text style={styles.detailContent} numberOfLines={10}>
                {JSON.stringify(state.input, null, 2)}
              </Text>
            </View>
          )}
          {isCompleted && state.output && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Output</Text>
              <Text style={styles.detailContent} numberOfLines={15}>
                {state.output}
              </Text>
            </View>
          )}
          {isError && state.error && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Error</Text>
              <Text style={styles.detailError} numberOfLines={10}>
                {state.error}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0d1b2a",
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.tool,
    padding: Spacing.sm,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
    flexShrink: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  toolName: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.tool,
    flex: 1,
  },
  status: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  chevron: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  title: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.xs,
    marginLeft: Spacing.sm + 6,
  },
  details: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  detailSection: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: BorderRadii.sm,
    padding: Spacing.sm,
  },
  detailLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  detailContent: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    fontFamily: "monospace",
    flexShrink: 1,
  },
  detailError: {
    fontSize: FontSizes.sm,
    color: Colors.dark.error,
    fontFamily: "monospace",
    flexShrink: 1,
  },
});