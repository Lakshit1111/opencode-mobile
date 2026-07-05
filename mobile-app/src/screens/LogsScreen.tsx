import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { logger, type LogEntry, type LogLevel } from "../utils/logger";

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: Colors.dark.textMuted,
  info: Colors.dark.accent,
  warn: Colors.dark.warning,
  error: Colors.dark.error,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
};

export default function LogsScreen() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsub = logger.subscribe((all) => {
      setEntries(all);
    });
    return unsub;
  }, []);

  const filtered = filter ? entries.filter((e) => e.level === filter) : entries;
  const display = [...filtered].reverse();

  useEffect(() => {
    if (autoScroll && display.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);
    }
  }, [display.length, autoScroll]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
  };

  const renderItem = ({ item }: { item: LogEntry }) => (
    <View style={styles.logRow}>
      <Text style={styles.logTime}>{formatTime(item.timestamp)}</Text>
      <Text style={[styles.logLevel, { color: LEVEL_COLORS[item.level] }]}>
        {LEVEL_LABELS[item.level]}
      </Text>
      <Text style={styles.logTag}>{item.tag}</Text>
      <Text style={[styles.logMsg, { color: LEVEL_COLORS[item.level] }]} numberOfLines={4}>
        {item.message}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, filter === null && styles.filterBtnActive]}
            onPress={() => setFilter(null)}
          >
            <Text style={[styles.filterBtnText, filter === null && styles.filterBtnTextActive]}>
              All ({entries.length})
            </Text>
          </TouchableOpacity>
          {(["error", "warn", "info", "debug"] as LogLevel[]).map((lvl) => {
            const count = entries.filter((e) => e.level === lvl).length;
            return (
              <TouchableOpacity
                key={lvl}
                style={[styles.filterBtn, filter === lvl && styles.filterBtnActive]}
                onPress={() => setFilter(lvl)}
              >
                <Text style={[styles.filterBtnText, filter === lvl && styles.filterBtnTextActive]}>
                  {LEVEL_LABELS[lvl]} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, autoScroll && styles.actionBtnActive]}
            onPress={() => setAutoScroll(!autoScroll)}
          >
            <Text style={styles.actionBtnText}>Auto-scroll: {autoScroll ? "ON" : "OFF"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => logger.clear()}>
            <Text style={[styles.actionBtnText, { color: Colors.dark.error }]}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={display}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No logs yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  toolbar: {
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    padding: Spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
    flexWrap: "wrap",
  },
  filterBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterBtnActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "#1b3a1b",
  },
  filterBtnText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  filterBtnTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  actionBtnActive: {
    borderColor: Colors.dark.primary,
  },
  actionBtnText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  list: {
    padding: Spacing.sm,
  },
  logRow: {
    flexDirection: "row",
    paddingVertical: 2,
    alignItems: "flex-start",
    gap: Spacing.xs,
  },
  logTime: {
    fontFamily: "Courier",
    fontSize: 10,
    color: Colors.dark.textMuted,
    width: 90,
  },
  logLevel: {
    fontFamily: "Courier",
    fontSize: 10,
    fontWeight: "700",
    width: 32,
  },
  logTag: {
    fontFamily: "Courier",
    fontSize: 10,
    color: Colors.dark.textSecondary,
    width: 60,
  },
  logMsg: {
    fontFamily: "Courier",
    fontSize: 10,
    flex: 1,
  },
  empty: {
    padding: Spacing.xxl,
    alignItems: "center",
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.md,
  },
});