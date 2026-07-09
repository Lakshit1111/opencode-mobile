import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";
import { logger } from "../utils/logger";
import { RootStackParamList } from "../App";
import MessageBubble from "../components/MessageBubble";
import PermissionCard from "../components/PermissionCard";
import QuestionCard from "../components/QuestionCard";
import TodoList from "../components/TodoList";
import ModelAgentSelector from "../components/ModelAgentSelector";
import type { Message, Part } from "../types/opencode";

type Props = NativeStackScreenProps<RootStackParamList, "Session">;

const EMPTY_ARRAY: Message[] = [];
const EMPTY_TODOS: any[] = [];
const EMPTY_PARTS: Part[] = [];

export default function SessionScreen({ route, navigation }: Props) {
  const { sessionID } = route.params;
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const session = useAppStore((s) => s.sessions.get(sessionID));
  const sessionMessages = useAppStore((s) => s.messages.get(sessionID) || EMPTY_ARRAY);
  const sessionStatus = useAppStore((s) => s.sessionStatuses.get(sessionID));
  const sessionPermissions = useAppStore(useShallow((s) => s.permissions.filter((p) => p.sessionID === sessionID)));
  const sessionQuestions = useAppStore(useShallow((s) => s.questions.filter((q) => q.sessionID === sessionID)));
  const sessionTodos = useAppStore((s) => s.todos.get(sessionID) || EMPTY_TODOS);
  const isLoadingMore = useAppStore((s) => s.messageLoadingMore.has(sessionID));
  const hasMore = useAppStore((s) => s.messageHasMore.get(sessionID) !== false);
  const sessionError = useAppStore((s) => s.sessionErrors.get(sessionID));
  const partsMap = useAppStore((s) => s.parts);
  const agents = useAppStore((s) => s.agents);
  const providers = useAppStore((s) => s.providers);
  const selectedAgent = useAppStore((s) => s.selectedAgent);
  const selectedModel = useAppStore((s) => s.selectedModel);

  const fetchMessages = useAppStore((s) => s.fetchMessages);
  const loadMoreMessages = useAppStore((s) => s.loadMoreMessages);
  const fetchSessionTodos = useAppStore((s) => s.fetchSessionTodos);
  const fetchSessionDiff = useAppStore((s) => s.fetchSessionDiff);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const abortSession = useAppStore((s) => s.abortSession);
  const replyPermission = useAppStore((s) => s.replyPermission);
  const replyQuestion = useAppStore((s) => s.replyQuestion);
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const clearSessionError = useAppStore((s) => s.clearSessionError);

  const isBusy = sessionStatus?.type === "busy";

  useFocusEffect(
    useCallback(() => {
      logger.info("session", `SessionScreen focused for ${sessionID}`, { title: session?.title });
      if (session?.model) {
        const sessionModel = { providerID: session.model.providerID, modelID: session.model.id };
        const current = useAppStore.getState().selectedModel;
        if (!current || current.providerID !== sessionModel.providerID || current.modelID !== sessionModel.modelID) {
          logger.info("session", `Syncing selectedModel to session's model`, sessionModel);
          useAppStore.getState().setSelectedModel(sessionModel);
        }
      }
      if (session?.agent) {
        const currentAgent = useAppStore.getState().selectedAgent;
        if (currentAgent !== session.agent) {
          logger.info("session", `Syncing selectedAgent to session's agent`, { agent: session.agent });
          useAppStore.getState().setSelectedAgent(session.agent);
        }
      }
      fetchMessages(sessionID);
      fetchSessionTodos(sessionID);
      fetchSessionDiff(sessionID);
    }, [sessionID, session?.model, session?.agent])
  );

  useEffect(() => {
    navigation.setOptions({
      title: session?.title || "Session",
    });
  }, [session?.title]);

  const sortedMessages: Message[] = [...sessionMessages].sort(
    (a, b) => a.time.created - b.time.created
  );

  const reversedMessages: Message[] = [...sortedMessages].reverse();

  const handleEndReached = () => {
    if (hasMore && !isLoadingMore && reversedMessages.length > 0) {
      logger.info("session", `Reached end (oldest), loading more messages`);
      loadMoreMessages(sessionID);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    logger.info("session", `Sending message to ${sessionID}`, { textLength: text.length });
    setInputText("");
    setSending(true);
    clearSessionError(sessionID);
    try {
      await sendMessage(sessionID, text);
      logger.info("session", "Message sent successfully");
    } catch (e: any) {
      logger.error("session", "Send message failed", { error: e.message });
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const handleAbort = async () => {
    logger.info("session", `Aborting session ${sessionID}`);
    await abortSession(sessionID);
  };

  const handleReplyPermission = async (requestID: string, reply: "once" | "always" | "reject") => {
    await replyPermission(requestID, reply);
  };

  const handleReplyQuestion = async (requestID: string, answers: string[][]) => {
    await replyQuestion(requestID, answers);
  };

  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const msgParts = partsMap.get(`${sessionID}:${item.id}`);
      const partList = msgParts ? Array.from(msgParts.values()) : EMPTY_PARTS;
      return <MessageBubble message={item} parts={partList} />;
    },
    [partsMap, sessionID]
  );

  const ListFooter = hasMore ? (
    <View style={styles.loadMoreFooter}>
      {isLoadingMore ? (
        <ActivityIndicator size="small" color={Colors.dark.primary} />
      ) : (
        <Text style={styles.loadMoreText}>↑ Load older messages</Text>
      )}
    </View>
  ) : (
    <View style={styles.noMoreFooter}>
      <Text style={styles.noMoreText}>— Start of conversation —</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.inner}
        keyboardVerticalOffset={90}
      >
        {sessionError && (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{sessionError}</Text>
            <TouchableOpacity onPress={() => clearSessionError(sessionID)} style={styles.errorDismiss}>
              <Text style={styles.errorDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {sessionStatus && (
          <View
            style={[
              styles.statusBar,
              isBusy ? styles.statusBarBusy : styles.statusBarIdle,
            ]}
          >
            <Text style={styles.statusText}>
              {isBusy ? "Processing..." : sessionStatus.type === "retry" ? "Retrying..." : "Idle"}
            </Text>
            {isBusy && (
              <TouchableOpacity onPress={handleAbort} style={styles.abortBtn}>
                <Text style={styles.abortBtnText}>Stop</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {sessionPermissions.length > 0 && (
          <View style={styles.alertsContainer}>
            {sessionPermissions.map((p) => (
              <PermissionCard key={p.id} request={p} onReply={handleReplyPermission} />
            ))}
          </View>
        )}

        {sessionQuestions.length > 0 && (
          <View style={styles.alertsContainer}>
            {sessionQuestions.map((q) => (
              <QuestionCard key={q.id} request={q} onReply={handleReplyQuestion} />
            ))}
          </View>
        )}

        {sessionTodos.length > 0 && <TodoList todos={sessionTodos} />}

        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          extraData={partsMap}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          inverted
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={ListFooter}
        />

        <ModelAgentSelector
          agents={agents}
          providers={providers}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          onSelectAgent={setSelectedAgent}
          onSelectModel={setSelectedModel}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isBusy ? "Wait for response..." : "Type a message..."}
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  inner: {
    flex: 1,
  },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#5a1a1a",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.error,
  },
  errorText: {
    flex: 1,
    color: "#ffcccc",
    fontSize: FontSizes.xs,
    fontFamily: "monospace",
    flexShrink: 1,
  },
  errorDismiss: {
    marginLeft: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.error,
    borderRadius: BorderRadii.sm,
  },
  errorDismissText: {
    color: "#fff",
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  statusBarBusy: {
    backgroundColor: "#3e2723",
  },
  statusBarIdle: {
    backgroundColor: "#1b3a1b",
  },
  statusText: {
    fontSize: FontSizes.sm,
    fontWeight: "500",
  },
  abortBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.error,
    borderRadius: BorderRadii.sm,
  },
  abortBtnText: {
    color: "#fff",
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  alertsContainer: {
    paddingHorizontal: Spacing.md,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  loadMoreFooter: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  loadMoreText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  noMoreFooter: {
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  noMoreText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadii.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    maxHeight: 100,
  },
  sendBtn: {
    marginLeft: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadii.md,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
});