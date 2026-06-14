import React, { useEffect, useState } from "react";
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
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { useAppStore } from "../store/appStore";
import { RootStackParamList } from "../App";
import SessionCard from "../components/SessionCard";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

export default function DashboardScreen({ navigation }: Props) {
  const {
    sessions,
    sessionStatuses,
    permissions,
    questions,
    fetchSessions,
    disconnect,
    connected,
  } = useAppStore();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (connected) {
      fetchSessions();
    }
  }, [connected]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  const sessionList = Array.from(sessions.values()).sort(
    (a, b) => b.time.updated - a.time.updated
  );

  const pendingCount = permissions.length + questions.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.statusDot} />
          <Text style={styles.headerTitle}>Sessions</Text>
        </View>
        <View style={styles.headerRight}>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
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
        data={sessionList}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            status={sessionStatuses.get(item.id)}
            onPress={() => navigation.navigate("Session", { sessionID: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Sessions</Text>
            <Text style={styles.emptyText}>
              Start a session in OpenCode on your laptop to see it here
            </Text>
          </View>
        }
        contentContainerStyle={sessionList.length === 0 ? styles.emptyList : styles.list}
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
    borderRadius: BorderRadii.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginRight: Spacing.md,
  },
  badgeText: {
    color: "#fff",
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  disconnectBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
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