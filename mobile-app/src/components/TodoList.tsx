import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { Todo } from "../types/opencode";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";

interface Props {
  todos: Todo[];
}

export default function TodoList({ todos }: Props) {
  if (todos.length === 0) return null;

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return "[x]";
      case "in_progress": return "[~]";
      case "cancelled": return "[-]";
      default: return "[ ]";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return Colors.dark.success;
      case "in_progress": return Colors.dark.busy;
      case "cancelled": return Colors.dark.textMuted;
      default: return Colors.dark.textSecondary;
    }
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case "high": return Colors.dark.error;
      case "medium": return Colors.dark.busy;
      default: return Colors.dark.textMuted;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tasks</Text>
      {todos.map((todo, i) => (
        <View key={i} style={styles.todoRow}>
          <Text style={[styles.statusIcon, { color: statusColor(todo.status) }]}>
            {statusIcon(todo.status)}
          </Text>
          <Text style={[styles.todoContent, todo.status === "completed" && styles.todoCompleted]}>
            {todo.content}
          </Text>
          <View style={[styles.priorityDot, { backgroundColor: priorityColor(todo.priority) }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadii.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  title: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
  },
  todoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  statusIcon: {
    fontFamily: "Courier",
    fontSize: FontSizes.sm,
    marginRight: Spacing.sm,
    width: 24,
  },
  todoContent: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.dark.text,
  },
  todoCompleted: {
    textDecorationLine: "line-through",
    color: Colors.dark.textMuted,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: Spacing.sm,
  },
});