import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { PermissionRequest } from "../types/opencode";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { useAppStore } from "../store/appStore";

interface Props {
  request: PermissionRequest;
  onReply: (requestID: string, reply: "once" | "always" | "reject") => Promise<void>;
}

export default function PermissionCard({ request, onReply }: Props) {
  const [loading, setLoading] = React.useState(false);

  const handleReply = async (reply: "once" | "always" | "reject") => {
    setLoading(true);
    try {
      await onReply(request.id, reply);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>!</Text>
        <Text style={styles.title}>Permission Request</Text>
      </View>
      <Text style={styles.permission}>
        {request.permission}
      </Text>
      {request.patterns.length > 0 && (
        <Text style={styles.patterns}>{request.patterns.join(", ")}</Text>
      )}
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.btn, styles.btnAllow]}
          onPress={() => handleReply("once")}
          disabled={loading}
        >
          <Text style={styles.btnText}>Allow</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnAlways]}
          onPress={() => handleReply("always")}
          disabled={loading}
        >
          <Text style={styles.btnText}>Always</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnReject]}
          onPress={() => handleReply("reject")}
          disabled={loading}
        >
          <Text style={styles.btnText}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#3e2723",
    borderRadius: BorderRadii.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  icon: {
    backgroundColor: Colors.dark.warning,
    color: "#000",
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
    fontSize: FontSizes.sm,
    fontWeight: "700",
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#ffab91",
  },
  permission: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  patterns: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  buttons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  btn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadii.sm,
  },
  btnAllow: {
    backgroundColor: Colors.dark.success,
  },
  btnAlways: {
    backgroundColor: Colors.dark.primary,
  },
  btnReject: {
    backgroundColor: Colors.dark.error,
  },
  btnText: {
    color: "#fff",
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
});