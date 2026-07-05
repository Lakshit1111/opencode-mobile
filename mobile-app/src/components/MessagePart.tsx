import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { Part } from "../types/opencode";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { logger } from "../utils/logger";

interface Props {
  messageID: string;
  role: string;
  part: Part;
}

export default function MessagePart({ messageID, role, part }: Props) {
  switch (part.type) {
    case "text":
      logger.debug("ui", `Render text part (msg=${messageID})`, { role, textLen: part.text?.length });
      return <TextPart role={role} part={part} />;
    case "reasoning":
      logger.debug("ui", `Render reasoning part (msg=${messageID})`, { textLen: part.text?.length });
      return <ReasoningBlock part={part} />;
    case "tool":
      logger.debug("ui", `Render tool part (msg=${messageID})`, { tool: part.tool, status: part.state?.status });
      return <ToolCall part={part} />;
    case "step-start":
      return <StepStart part={part} />;
    case "step-finish":
      return <StepFinish part={part} />;
    case "subtask":
      return <SubtaskBlock part={part} />;
    default:
      logger.warn("ui", `Unknown part type: ${(part as any).type}`);
      return null;
  }
}

function TextPart({ role, part }: { role: string; part: any }) {
  const isUser = role === "user";
  return (
    <View
      style={[
        styles.textBubble,
        isUser ? styles.userBubble : styles.assistantBubble,
      ]}
    >
      {isUser && <Text style={styles.roleLabel}>You</Text>}
      <Text style={[styles.textContent, isUser && styles.userText]}>
        {part.text}
      </Text>
    </View>
  );
}

function ReasoningBlock({ part }: { part: any }) {
  return (
    <View style={styles.reasoningBlock}>
      <Text style={styles.reasoningLabel}>Thinking</Text>
      <Text style={styles.reasoningText} numberOfLines={8}>
        {part.text}
      </Text>
    </View>
  );
}

function ToolCall({ part }: { part: any }) {
  const { state } = part;
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

  return (
    <View style={styles.toolBlock}>
      <View style={styles.toolHeader}>
        <View style={[styles.toolStatusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.toolName}>{part.tool}</Text>
        <Text style={[styles.toolStatusLabel, { color: statusColor }]}>
          {statusLabel}
        </Text>
      </View>
      {isRunning && state.title && (
        <Text style={styles.toolTitle}>{state.title}</Text>
      )}
      {isCompleted && state.title && (
        <Text style={styles.toolTitle}>{state.title}</Text>
      )}
      {isError && (
        <Text style={styles.toolError}>{state.error}</Text>
      )}
    </View>
  );
}

function StepStart({ part }: { part: any }) {
  return (
    <View style={styles.stepBlock}>
      <Text style={styles.stepLabel}>Step started</Text>
    </View>
  );
}

function StepFinish({ part }: { part: any }) {
  return (
    <View style={styles.stepBlock}>
      <Text style={styles.stepLabel}>Step finished: {part.reason}</Text>
    </View>
  );
}

function SubtaskBlock({ part }: { part: any }) {
  return (
    <View style={styles.subtaskBlock}>
      <Text style={styles.subtaskLabel}>
        Subtask ({part.agent})
      </Text>
      <Text style={styles.subtaskDesc}>{part.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  textBubble: {
    marginVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadii.lg,
    maxWidth: "90%",
  },
  userBubble: {
    backgroundColor: "#1b3a1b",
    alignSelf: "flex-end",
    borderBottomRightRadius: Spacing.xs,
  },
  assistantBubble: {
    backgroundColor: Colors.dark.surface,
    alignSelf: "flex-start",
    borderBottomLeftRadius: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  roleLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.primary,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  textContent: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    lineHeight: FontSizes.md * 1.5,
  },
  userText: {
    color: Colors.dark.primaryLight,
  },
  reasoningBlock: {
    backgroundColor: "#1a0a2e",
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.reasoning,
    padding: Spacing.md,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
  },
  reasoningLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.reasoning,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  reasoningText: {
    fontSize: FontSizes.sm,
    color: "#ce93d8",
    lineHeight: FontSizes.sm * 1.5,
  },
  toolBlock: {
    backgroundColor: "#0d1b2a",
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.tool,
    padding: Spacing.md,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
  },
  toolHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  toolStatusDot: {
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
  toolStatusLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  toolTitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.xs,
  },
  toolError: {
    fontSize: FontSizes.sm,
    color: Colors.dark.error,
    marginTop: Spacing.xs,
  },
  stepBlock: {
    paddingVertical: Spacing.xs,
  },
  stepLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
  },
  subtaskBlock: {
    backgroundColor: "#1a1a2e",
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.accent,
    padding: Spacing.md,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
  },
  subtaskLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.accent,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  subtaskDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
  },
});