import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { Message, Part } from "../types/opencode";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import MarkdownText from "./MarkdownText";
import ToolCall from "./ToolCall";
import ReasoningBlock from "./ReasoningBlock";

interface Props {
  message: Message;
  parts: Part[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({ message, parts }: Props) {
  const isUser = message.role === "user";

  const sortedParts = [...parts].sort((a, b) => {
    const ta = (a as any).time?.start || 0;
    const tb = (b as any).time?.start || 0;
    return ta - tb;
  });

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      {!isUser && (
        <Text style={styles.roleLabel}>Assistant</Text>
      )}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {sortedParts.map((part) => {
          switch (part.type) {
            case "text":
              return (
                <MarkdownText key={part.id} text={(part as any).text} />
              );
            case "reasoning":
              return (
                <ReasoningBlock key={part.id} text={(part as any).text} />
              );
            case "tool":
              return (
                <ToolCall
                  key={part.id}
                  tool={(part as any).tool}
                  state={(part as any).state}
                />
              );
            case "step-start":
              return null;
            case "step-finish":
              return null;
            case "subtask":
              return (
                <View key={part.id} style={styles.subtask}>
                  <Text style={styles.subtaskLabel}>Subtask ({(part as any).agent})</Text>
                  <Text style={styles.subtaskDesc}>{(part as any).description}</Text>
                </View>
              );
            default:
              return null;
          }
        })}
      </View>
      <Text style={styles.timestamp}>{formatTime(message.time.created)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.xs,
    maxWidth: "92%",
  },
  userContainer: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  assistantContainer: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  roleLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: 2,
    marginLeft: Spacing.sm,
  },
  bubble: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadii.lg,
  },
  userBubble: {
    backgroundColor: "#1b3a1b",
    borderBottomRightRadius: Spacing.xs,
  },
  assistantBubble: {
    backgroundColor: Colors.dark.surface,
    borderBottomLeftRadius: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  timestamp: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
    marginHorizontal: Spacing.sm,
  },
  subtask: {
    backgroundColor: "#1a1a2e",
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.accent,
    padding: Spacing.sm,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
  },
  subtaskLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.accent,
    fontWeight: "600",
    marginBottom: 4,
  },
  subtaskDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
  },
});