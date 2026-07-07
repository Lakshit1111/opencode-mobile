import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import type { Agent, ConfigProviders } from "../types/opencode";

interface Props {
  agents: Agent[];
  providers: ConfigProviders | null;
  selectedAgent: string;
  selectedModel: { providerID: string; modelID: string } | null;
  onSelectAgent: (agent: string) => void;
  onSelectModel: (model: { providerID: string; modelID: string }) => void;
}

interface ModelEntry {
  providerID: string;
  modelID: string;
  name: string;
  providerName: string;
}

export default function ModelAgentSelector({
  agents,
  providers,
  selectedAgent,
  selectedModel,
  onSelectAgent,
  onSelectModel,
}: Props) {
  const [agentModalVisible, setAgentModalVisible] = useState(false);
  const [modelModalVisible, setModelModalVisible] = useState(false);

  const agentLabel = selectedAgent || "build";
  const agentInfo = agents.find((a) => a.name === agentLabel);
  const agentDesc = agentInfo?.description
    ? agentInfo.description.substring(0, 40) + (agentInfo.description.length > 40 ? "..." : "")
    : "";

  let modelLabel = "Default";
  if (selectedModel) {
    const provider = providers?.providers.find((p) => p.id === selectedModel.providerID);
    const model = provider?.models[selectedModel.modelID];
    modelLabel = model?.name || selectedModel.modelID;
  }

  const allModels: ModelEntry[] = [];
  if (providers) {
    for (const p of providers.providers) {
      for (const key of Object.keys(p.models)) {
        const m = p.models[key];
        allModels.push({
          providerID: p.id,
          modelID: m.id,
          name: m.name || m.id,
          providerName: p.name,
        });
      }
    }
  }

  const visibleAgents = agents.filter(
    (a) => a.name !== "compaction" && a.name !== "summary" && a.name !== "title"
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.pill}
        onPress={() => setAgentModalVisible(true)}
      >
        <Text style={styles.pillLabel}>Mode</Text>
        <Text style={styles.pillValue} numberOfLines={1}>{agentLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.pill}
        onPress={() => setModelModalVisible(true)}
      >
        <Text style={styles.pillLabel}>Model</Text>
        <Text style={styles.pillValue} numberOfLines={1}>{modelLabel}</Text>
      </TouchableOpacity>

      <Modal visible={agentModalVisible} transparent animationType="slide" onRequestClose={() => setAgentModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Mode</Text>
            <FlatList
              data={visibleAgents}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    item.name === selectedAgent && styles.optionItemSelected,
                  ]}
                  onPress={() => {
                    onSelectAgent(item.name);
                    setAgentModalVisible(false);
                  }}
                >
                  <Text style={styles.optionTitle}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.optionDesc} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setAgentModalVisible(false)}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modelModalVisible} transparent animationType="slide" onRequestClose={() => setModelModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Model</Text>
            <FlatList
              data={allModels}
              keyExtractor={(item) => `${item.providerID}/${item.modelID}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    selectedModel?.providerID === item.providerID &&
                      selectedModel?.modelID === item.modelID &&
                      styles.optionItemSelected,
                  ]}
                  onPress={() => {
                    onSelectModel({ providerID: item.providerID, modelID: item.modelID });
                    setModelModalVisible(false);
                  }}
                >
                  <Text style={styles.optionTitle}>{item.name}</Text>
                  <Text style={styles.optionDesc}>{item.providerName}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setModelModalVisible(false)}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadii.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    flex: 1,
  },
  pillLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  pillValue: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: BorderRadii.xl,
    borderTopRightRadius: BorderRadii.xl,
    padding: Spacing.lg,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  optionItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadii.md,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.dark.background,
  },
  optionItemSelected: {
    backgroundColor: "#1b3a1b",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  optionTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  optionDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadii.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  closeBtnText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.md,
  },
});