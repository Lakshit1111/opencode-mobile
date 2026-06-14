import React, { useEffect, useState, useRef } from "react";
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
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { useAppStore } from "../store/appStore";
import { RootStackParamList } from "../App";
import MessagePart from "../components/MessagePart";
import PermissionCard from "../components/PermissionCard";
import QuestionCard from "../components/QuestionCard";
import TodoList from "../components/TodoList";

type Props = NativeStackScreenProps<RootStackParamList, "Session">;

export default function SessionScreen({ route, navigation }: Props) {
  const { sessionID } = route.params;
  const {
    sessions,
    sessionStatuses,
    messages,
    parts,
    permissions,
    questions,
    todos,
    fetchMessages,
    sendMessage,
    abortSession,
    replyPermission,
    replyQuestion,
  } = useAppStore();

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const session = sessions.get(sessionID);
  const sessionMessages = messages.get(sessionID) || [];
  const sessionStatus = sessionStatuses.get(sessionID);
  const isBusy = sessionStatus?.type === "busy";
  const sessionPermissions = permissions.filter((p) => p.sessionID === sessionID);
  const sessionQuestions = questions.filter((q) => q.sessionID === sessionID);
  const sessionTodos = todos.get(sessionID) || [];

  useEffect(() => {
    fetchMessages(sessionID);
  }, [sessionID]);

  useEffect(() => {
    navigation.setOptions({
      title: session?.title || "Session",
    });
  }, [session?.title]);

  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [sessionMessages.length]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);
    try {
      await sendMessage(sessionID, text);
    } catch (e) {
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const handleAbort = async () => {
    await abortSession(sessionID);
  };

  const sortedMessages = [...sessionMessages].sort(
    (a, b) => a.time.created - b.time.created
  );

  const allParts: { messageID: string; role: string; part: any }[] = [];
  for (const msg of sortedMessages) {
    const msgParts = parts.get(`${sessionID}:${msg.id}`);
    if (msgParts) {
      for (const part of msgParts.values()) {
        allParts.push({ messageID: msg.id, role: msg.role, part });
      }
    }
  }

  const renderItem = ({ item }: { item: { messageID: string; role: string; part: any } }) => (
    <MessagePart messageID={item.messageID} role={item.role} part={item.part} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.inner}
        keyboardVerticalOffset={90}
      >
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
          <View style={styles.permissionsContainer}>
            {sessionPermissions.map((p) => (
              <PermissionCard key={p.id} request={p} onReply={replyPermission} />
            ))}
          </View>
        )}

        {sessionQuestions.length > 0 && (
          <View style={styles.questionsContainer}>
            {sessionQuestions.map((q) => (
              <QuestionCard key={q.id} request={q} onReply={replyQuestion} />
            ))}
          </View>
        )}

        {sessionTodos.length > 0 && <TodoList todos={sessionTodos} />}

        <FlatList
          ref={flatListRef}
          data={allParts}
          keyExtractor={(item) => item.part.id}
          renderItem={renderItem}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
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
  permissionsContainer: {
    paddingHorizontal: Spacing.md,
  },
  questionsContainer: {
    paddingHorizontal: Spacing.md,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
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