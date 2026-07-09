import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  FlatList,
  ScrollView,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { useAppStore } from "../store/appStore";
import { logger } from "../utils/logger";
import { RootStackParamList } from "../App";
import type { ServerProfile, ServerTestResult } from "../types/opencode";

type Props = NativeStackScreenProps<RootStackParamList, "Servers">;

interface EditForm {
  id?: string;
  name: string;
  url: string;
  username: string;
  password: string;
  autoDiscover: boolean;
}

const EMPTY_FORM: EditForm = {
  name: "",
  url: "",
  username: "opencode",
  password: "",
  autoDiscover: false,
};

type TestState = Record<string, { loading: boolean; result?: ServerTestResult; error?: string }>;

export default function ServersScreen({}: Props) {
  const {
    servers,
    activeServerId,
    activeServerName,
    addServer,
    updateServer,
    deleteServer,
    testServer,
    activateServer,
  } = useAppStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({});

  const openAdd = () => {
    setEditing({ ...EMPTY_FORM });
    setModalVisible(true);
  };

  const openEdit = (s: ServerProfile) => {
    setEditing({
      id: s.id,
      name: s.name,
      url: s.url,
      username: s.username || "opencode",
      password: s.password || "",
      autoDiscover: s.autoDiscover,
    });
    setModalVisible(true);
  };

  const closeForm = () => {
    setModalVisible(false);
    setEditing(EMPTY_FORM);
  };

  const saveForm = async () => {
    if (!editing.url.trim()) {
      Alert.alert("Error", "URL is required");
      return;
    }
    if (!editing.name.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        url: editing.url.trim(),
        username: editing.username.trim() || "opencode",
        password: editing.password,
        autoDiscover: editing.autoDiscover,
      };
      if (editing.id) {
        await updateServer(editing.id, payload);
      } else {
        await addServer(payload);
      }
      closeForm();
    } catch (e: any) {
      logger.error("servers", "saveForm failed", { error: e.message });
      Alert.alert("Save failed", e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestState((s) => ({ ...s, [id]: { loading: true } }));
    try {
      const result = await testServer(id);
      setTestState((s) => ({ ...s, [id]: { loading: false, result } }));
      if (!result.healthy && result.requiresAuth) {
        Alert.alert(
          "Authentication required",
          "This server requires a username and password. Edit the profile to add credentials.",
          [
            {
              text: "Edit",
              onPress: () => {
                const s = servers.find((x) => x.id === id);
                if (s) openEdit(s);
              },
            },
            { text: "OK" },
          ]
        );
      }
    } catch (e: any) {
      setTestState((s) => ({ ...s, [id]: { loading: false, error: e.message } }));
      Alert.alert("Test failed", e.message);
    }
  };

  const handleActivate = async (id: string) => {
    setActivatingId(id);
    try {
      await activateServer(id);
      Alert.alert("Server activated", "Switched to the selected server.");
    } catch (e: any) {
      Alert.alert("Activation failed", e.message);
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = (s: ServerProfile) => {
    if (s.id === activeServerId) {
      Alert.alert("Cannot delete", "This is the active server. Activate another server first.");
      return;
    }
    Alert.alert("Delete server", `Remove "${s.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteServer(s.id);
          } catch (e: any) {
            Alert.alert("Delete failed", e.message);
          }
        },
      },
    ]);
  };

  const renderServer = ({ item }: { item: ServerProfile }) => {
    const isActive = item.id === activeServerId;
    const ts = testState[item.id];
    const requiresAuth = !!item.password;
    return (
      <View style={[styles.card, isActive && styles.cardActive]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardName}>{item.name}</Text>
            {isActive && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
          </View>
          <View style={styles.cardTags}>
            {requiresAuth && <Text style={styles.tagAuth}>auth</Text>}
            {item.autoDiscover && <Text style={styles.tagAuto}>auto</Text>}
          </View>
        </View>

        <Text style={styles.cardUrl} numberOfLines={1}>{item.url}</Text>
        <Text style={styles.cardUser}>user: {item.username || "opencode"}</Text>

        {ts?.result && (
          <View style={[styles.testResult, ts.result.healthy ? styles.testOk : styles.testBad]}>
            <Text style={styles.testResultText}>
              {ts.result.healthy
                ? `Healthy${ts.result.version ? ` · v${ts.result.version}` : ""}${ts.result.sessionCount != null ? ` · ${ts.result.sessionCount} sessions` : ""}`
                : ts.result.requiresAuth
                  ? "Unreachable — requires auth"
                  : `Unreachable${ts.result.error ? `: ${ts.result.error}` : ""}`}
            </Text>
          </View>
        )}
        {ts?.error && !ts.result && (
          <View style={[styles.testResult, styles.testBad]}>
            <Text style={styles.testResultText}>Error: {ts.error}</Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, isActive && styles.actionBtnDisabled]}
            onPress={() => handleActivate(item.id)}
            disabled={isActive || activatingId === item.id}
          >
            {activatingId === item.id ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <Text style={[styles.actionBtnText, isActive && styles.actionBtnTextMuted]}>
                {isActive ? "Active" : "Activate"}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleTest(item.id)}
            disabled={ts?.loading}
          >
            {ts?.loading ? (
              <ActivityIndicator size="small" color={Colors.dark.accent} />
            ) : (
              <Text style={[styles.actionBtnText, { color: Colors.dark.accent }]}>Test</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
            <Text style={[styles.actionBtnText, { color: Colors.dark.textSecondary }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
            <Text style={[styles.actionBtnText, { color: Colors.dark.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={servers}
        keyExtractor={(item) => item.id}
        renderItem={renderServer}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBar}>
            <View>
              <Text style={styles.headerLabel}>Active server</Text>
              <Text style={styles.headerValue}>{activeServerName || "—"}</Text>
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
              <Text style={styles.addBtnText}>+ Add server</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No servers</Text>
            <Text style={styles.emptyText}>Add an OpenCode server to get started.</Text>
          </View>
        }
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={closeForm}
      >
        <SafeAreaView style={styles.container}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalInner}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing.id ? "Edit server" : "Add server"}</Text>
              <TouchableOpacity onPress={closeForm} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <ScrollView
                style={styles.formScroll}
                contentContainerStyle={styles.formScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={editing.name}
                onChangeText={(v) => setEditing({ ...editing, name: v })}
                placeholder="My laptop"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Server URL</Text>
              <Text style={styles.hint}>e.g. http://192.168.1.100:8765</Text>
              <TextInput
                style={styles.input}
                value={editing.url}
                onChangeText={(v) => setEditing({ ...editing, url: v })}
                placeholder="http://127.0.0.1:8765"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={editing.username}
                onChangeText={(v) => setEditing({ ...editing, username: v })}
                placeholder="opencode"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Password</Text>
              <Text style={styles.hint}>Leave empty if the server has no auth</Text>
              <TextInput
                style={styles.input}
                value={editing.password}
                onChangeText={(v) => setEditing({ ...editing, password: v })}
                placeholder=""
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Auto-discover</Text>
                  <Text style={styles.hint}>Scan local ports for an OpenCode process and use it automatically</Text>
                </View>
                <Switch
                  value={editing.autoDiscover}
                  onValueChange={(v) => setEditing({ ...editing, autoDiscover: v })}
                  trackColor={{ false: Colors.dark.border, true: Colors.dark.primary }}
                  thumbColor="#fff"
                />
              </View>

              <TouchableOpacity
                style={[styles.button, saving && styles.buttonDisabled]}
                onPress={saveForm}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
              </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  list: {
    padding: Spacing.lg,
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  headerLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerValue: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadii.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  addBtnText: {
    color: "#fff",
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadii.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardActive: {
    borderColor: Colors.dark.primary,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  cardName: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  activeBadge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadii.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  activeBadgeText: {
    color: "#fff",
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  cardTags: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  tagAuth: {
    fontSize: FontSizes.xs,
    color: Colors.dark.warning,
    borderWidth: 1,
    borderColor: Colors.dark.warning,
    borderRadius: BorderRadii.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: "hidden",
  },
  tagAuto: {
    fontSize: FontSizes.xs,
    color: Colors.dark.accent,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    borderRadius: BorderRadii.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: "hidden",
  },
  cardUrl: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    fontFamily: "monospace",
    marginBottom: 2,
  },
  cardUser: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  testResult: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadii.sm,
  },
  testOk: {
    backgroundColor: "rgba(76,175,80,0.15)",
  },
  testBad: {
    backgroundColor: "rgba(244,67,54,0.15)",
  },
  testResultText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
  },
  cardActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadii.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: "500",
    color: Colors.dark.primary,
  },
  actionBtnTextMuted: {
    color: Colors.dark.textMuted,
  },
  empty: {
    alignItems: "center",
    padding: Spacing.xxl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  modalInner: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  closeBtn: {
    padding: Spacing.sm,
  },
  closeBtnText: {
    color: Colors.dark.accent,
    fontSize: FontSizes.md,
  },
  form: {
    gap: Spacing.md,
    flex: 1,
  },
  formScroll: {
    flex: 1,
  },
  formScrollContent: {
    paddingBottom: Spacing.xxl,
  },
  label: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  hint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadii.md,
    padding: Spacing.lg,
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: Spacing.md,
  },
  button: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadii.md,
    padding: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: FontSizes.lg,
    fontWeight: "600",
  },
});