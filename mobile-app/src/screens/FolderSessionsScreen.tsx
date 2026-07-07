import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { useAppStore } from "../store/appStore";
import { logger } from "../utils/logger";
import { RootStackParamList } from "../App";
import SessionCard from "../components/SessionCard";

type Props = NativeStackScreenProps<RootStackParamList, "FolderSessions">;

function lastSegments(path: string, n: number = 2): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= n) return path;
  return parts.slice(parts.length - n).join("/");
}

export default function FolderSessionsScreen({ route, navigation }: Props) {
  const { directory } = route.params;
  const [creating, setCreating] = useState(false);
  const {
    sessions,
    sessionStatuses,
    fetchSessions,
    createSession,
    fetchMessages,
    connected,
  } = useAppStore();

  useEffect(() => {
    navigation.setOptions({ title: lastSegments(directory, 2) });
  }, [directory, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (connected) {
        logger.info("folder", `Focus gained, refreshing sessions for ${directory}`);
        fetchSessions();
      }
    }, [connected, fetchSessions, directory])
  );

  const onRefresh = async () => {
    await fetchSessions();
  };

  const handleNewSession = async () => {
    if (creating) return;
    setCreating(true);
    logger.info("folder", `Creating new session`);
    try {
      const session = await createSession("New session");
      if (session) {
        await fetchMessages(session.id);
        navigation.navigate("Session", { sessionID: session.id });
      }
    } catch (e: any) {
      logger.error("folder", "Failed to create session", { error: e.message });
    } finally {
      setCreating(false);
    }
  };

  const folderSessions = Array.from(sessions.values())
    .filter((s) => (s.directory || "(no directory)") === directory)
    .sort((a, b) => b.time.updated - a.time.updated);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.pathBar}>
        <Text style={styles.pathText} numberOfLines={1}>
          {directory}
        </Text>
        <View style={styles.pathRight}>
          <Text style={styles.countText}>{folderSessions.length} session(s)</Text>
          <TouchableOpacity
            style={[styles.newBtn, creating && styles.newBtnDisabled]}
            onPress={handleNewSession}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <Text style={styles.newBtnText}>+ New</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={folderSessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            status={sessionStatuses.get(item.id)}
            onPress={() => navigation.navigate("Session", { sessionID: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Sessions</Text>
            <Text style={styles.emptyText}>
              No sessions in this folder yet
            </Text>
          </View>
        }
        contentContainerStyle={folderSessions.length === 0 ? styles.emptyList : styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  pathBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  pathText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginRight: Spacing.md,
  },
  pathRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  countText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  newBtn: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
  },
  newBtnDisabled: {
    opacity: 0.5,
  },
  newBtnText: {
    color: "#fff",
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  list: {
    padding: Spacing.md,
  },
  emptyList: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
});