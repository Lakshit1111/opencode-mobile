import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";

interface Props {
  text: string;
}

export default function ReasoningBlock({ text }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.label}>Thinking</Text>
        <Text style={styles.chevron}>{expanded ? "▼" : "▶"}</Text>
      </View>
      <Text
        style={styles.text}
        numberOfLines={expanded ? undefined : 2}
      >
        {text}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1a0a2e",
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.reasoning,
    padding: Spacing.sm,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
    flexShrink: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  label: {
    fontSize: FontSizes.xs,
    color: Colors.dark.reasoning,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  chevron: {
    fontSize: FontSizes.xs,
    color: Colors.dark.reasoning,
  },
  text: {
    fontSize: FontSizes.sm,
    color: "#ce93d8",
    lineHeight: FontSizes.sm * 1.5,
    flexShrink: 1,
  },
});