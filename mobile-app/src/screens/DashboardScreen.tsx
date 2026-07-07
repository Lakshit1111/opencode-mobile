import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Colors, Spacing, FontSizes } from "../constants/theme";
import { useAppStore } from "../store/appStore";
import { logger } from "../utils/logger";
import { RootStackParamList } from "../App";
import FolderCard from "../components/FolderCard";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

interface FolderInfo {
  directory: string;
  count: number;
  lastUpdated: number;
}

export default function DashboardScreen({ navigation }: Props) {
  const {
    sessions,
    permissions,
    questions,
    fetchSessions,
    disconnect,
    connected,
  } = useAppStore();

  useFocusEffect(
    useCallback(() => {
      if (connected) {
        logger.info("dashboard", "Focus gained, fetching sessions");
        fetchSessions();
      }
    }, [connected, fetchSessions])
  );

  const onRefresh = async () => {
    await fetchSessions();
  };

  const folderMap = new Map<string, FolderInfo>();
  for (const s of sessions.values()) {
    const dir = s.directory || "(no directory)";
    const existing = folderMap.get(dir);
    if (existing) {
      existing.count += 1;
      if (s.time.updated > existing.lastUpdated) {
        existing.lastUpdated = s.time.updated;
      }
    } else {
      folderMap.set(dir, {
        directory: dir,
        count: 1,
        lastUpdated: s.time.updated,
      });
    }
  }

  const folderList = Array.from(folderMap.values()).sort(
    (a, b) => b.lastUpdated - a.lastUpdated
  );

  const pendingCount = permissions.length + questions.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.statusDot} />
          <Text style={styles.headerTitle}>Folders</Text>
        </View>
        <View style={styles.headerRight}>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => navigation.navigate("Logs")} style={styles.logsBtn}>
            <Text style={styles.logsText}>Logs</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={disconnect} style={styles.disconnectBtn}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>

      {permissions.length > 0 && (
        <View style={styles.alertBar}>
          <Text style={styles.alertText}>
            {permissions.length} permission request(s) pending
          </Text>
        </View>
      )}

      {questions.length > 0 && (
        <View style={[styles.alertBar, { backgroundColor: "#1a237e" }]}>
          <Text style={[styles.alertText, { color: "#90caf9" }]}>
            {questions.length} question(s) need your answer
          </Text>
        </View>
      )}

      <FlatList
        data={folderList}
        keyExtractor={(item) => item.directory}
        renderItem={({ item }) => (
          <FolderCard
            directory={item.directory}
            count={item.count}
            lastUpdated={item.lastUpdated}
            onPress={() =>
              navigation.navigate("FolderSessions", { directory: item.directory })
            }
          />
        )}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Folders</Text>
            <Text style={styles.emptyText}>
              Start a session in OpenCode on your laptop to see it here
            </Text>
          </View>
        }
        contentContainerStyle={folderList.length === 0 ? styles.emptyList : styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
    marginRight: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  badge: {
    backgroundColor: Colors.dark.error,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginRight: Spacing.md,
  },
  badgeText: {
    color: "#fff",
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  logsBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    marginRight: Spacing.sm,
  },
  logsText: {
    color: Colors.dark.accent,
    fontSize: FontSizes.sm,
  },
  disconnectBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  disconnectText: {
    color: Colors.dark.error,
    fontSize: FontSizes.sm,
  },
  alertBar: {
    backgroundColor: "#3e2723",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  alertText: {
    color: "#ffab91",
    fontSize: FontSizes.sm,
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