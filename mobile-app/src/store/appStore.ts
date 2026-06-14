import { create } from "zustand";
import type {
  Session,
  Message,
  Part,
  SessionStatus,
  PermissionRequest,
  QuestionRequest,
  Todo,
  ConnectionConfig,
  FileDiff,
  Event,
} from "../types/opencode";
import { client } from "../api/client";
import { sseManager } from "../api/sse";
import { saveConnection, loadConnection, clearConnection } from "../api/client";

interface AppState {
  connection: ConnectionConfig | null;
  connected: boolean;
  bridgeEnabled: boolean;
  sessions: Map<string, Session>;
  sessionStatuses: Map<string, SessionStatus>;
  messages: Map<string, Message[]>;
  parts: Map<string, Map<string, Part>>;
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  todos: Map<string, Todo[]>;
  diffs: Map<string, FileDiff[]>;

  setConnection: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  loadSavedConnection: () => Promise<ConnectionConfig | null>;
  fetchSessions: () => Promise<void>;
  fetchMessages: (sessionID: string) => Promise<void>;
  sendMessage: (sessionID: string, text: string) => Promise<void>;
  replyPermission: (requestID: string, reply: "once" | "always" | "reject") => Promise<void>;
  replyQuestion: (requestID: string, answers: string[][]) => Promise<void>;
  createSession: (title?: string) => Promise<Session | null>;
  abortSession: (sessionID: string) => Promise<void>;
  startEventStream: () => void;
  stopEventStream: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  connection: null,
  connected: false,
  bridgeEnabled: false,
  sessions: new Map(),
  sessionStatuses: new Map(),
  messages: new Map(),
  parts: new Map(),
  permissions: [],
  questions: [],
  todos: new Map(),
  diffs: new Map(),

  setConnection: async (config: ConnectionConfig) => {
    client.configure(config);
    const health = await client.checkHealth();
    if (!health.healthy && !health.version) {
      throw new Error("Cannot connect to OpenCode server");
    }
    await saveConnection(config);
    set({ connection: config, connected: true });
    get().startEventStream();
    get().fetchSessions();
  },

  disconnect: async () => {
    get().stopEventStream();
    await clearConnection();
    set({
      connection: null,
      connected: false,
      bridgeEnabled: false,
      sessions: new Map(),
      sessionStatuses: new Map(),
      messages: new Map(),
      parts: new Map(),
      permissions: [],
      questions: [],
      todos: new Map(),
      diffs: new Map(),
    });
  },

  loadSavedConnection: async () => {
    const config = await loadConnection();
    if (config) {
      client.configure(config);
      const health = await client.checkHealth();
      if (health.healthy || health.version) {
        set({ connection: config, connected: true });
        get().startEventStream();
        get().fetchSessions();
        return config;
      }
    }
    return null;
  },

  fetchSessions: async () => {
    try {
      const sessions = await client.listSessions();
      const sessionMap = new Map<string, Session>();
      sessions.forEach((s) => sessionMap.set(s.id, s));
      set({ sessions: sessionMap });

      const statuses = await client.getSessionStatus();
      const statusMap = new Map<string, SessionStatus>();
      Object.entries(statuses).forEach(([id, status]) => {
        statusMap.set(id, status as SessionStatus);
      });
      set({ sessionStatuses: statusMap });
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
    }
  },

  fetchMessages: async (sessionID: string) => {
    try {
      const msgs = await client.getSessionMessages(sessionID);
      set((state) => {
        const messages = new Map(state.messages);
        messages.set(sessionID, msgs);
        return { messages };
      });
    } catch (e) {
      console.error("Failed to fetch messages:", e);
    }
  },

  sendMessage: async (sessionID: string, text: string) => {
    try {
      await client.sendPrompt(sessionID, text);
    } catch (e) {
      console.error("Failed to send message:", e);
      throw e;
    }
  },

  replyPermission: async (requestID: string, reply: "once" | "always" | "reject") => {
    await client.replyPermission(requestID, reply);
    set((state) => ({
      permissions: state.permissions.filter((p) => p.id !== requestID),
    }));
  },

  replyQuestion: async (requestID: string, answers: string[][]) => {
    await client.replyQuestion(requestID, answers);
    set((state) => ({
      questions: state.questions.filter((q) => q.id !== requestID),
    }));
  },

  createSession: async (title?: string) => {
    try {
      const session = await client.createSession({ title });
      set((state) => {
        const sessions = new Map(state.sessions);
        sessions.set(session.id, session);
        return { sessions };
      });
      return session;
    } catch (e) {
      console.error("Failed to create session:", e);
      return null;
    }
  },

  abortSession: async (sessionID: string) => {
    await client.abortSession(sessionID);
  },

  startEventStream: () => {
    const { connection } = get();
    if (!connection) return;

    const url = client.getEventStreamUrl();
    sseManager.connect(url);

    sseManager.on("*", (event: Event) => {
      const { type, properties } = event as { type: string; properties: any };

      switch (type) {
        case "session.created":
        case "session.updated": {
          const info = properties.info || properties;
          if (info?.id) {
            set((state) => {
              const sessions = new Map(state.sessions);
              sessions.set(info.id, info);
              return { sessions };
            });
          }
          break;
        }
        case "session.deleted": {
          const deletedId = properties.sessionID || properties.info?.id;
          if (deletedId) {
            set((state) => {
              const sessions = new Map(state.sessions);
              sessions.delete(deletedId);
              return { sessions };
            });
          }
          break;
        }
        case "session.status": {
          set((state) => {
            const sessionStatuses = new Map(state.sessionStatuses);
            sessionStatuses.set(properties.sessionID, properties.status);
            return { sessionStatuses };
          });
          break;
        }
        case "session.idle": {
          set((state) => {
            const sessionStatuses = new Map(state.sessionStatuses);
            sessionStatuses.set(properties.sessionID, { type: "idle" });
            return { sessionStatuses };
          });
          break;
        }
        case "message.updated": {
          const msg = properties.info;
          if (msg?.sessionID && msg?.id) {
            set((state) => {
              const messages = new Map(state.messages);
              const sessionMsgs = [...(messages.get(msg.sessionID) || [])];
              const idx = sessionMsgs.findIndex((m) => m.id === msg.id);
              if (idx >= 0) {
                sessionMsgs[idx] = msg;
              } else {
                sessionMsgs.push(msg);
              }
              messages.set(msg.sessionID, sessionMsgs);
              return { messages };
            });
          }
          break;
        }
        case "message.part.updated": {
          const part = properties.part;
          if (part?.sessionID && part?.messageID && part?.id) {
            set((state) => {
              const parts = new Map(state.parts);
              const msgKey = `${part.sessionID}:${part.messageID}`;
              const msgParts = new Map(parts.get(msgKey) || new Map());
              msgParts.set(part.id, part);
              parts.set(msgKey, msgParts);
              return { parts };
            });
          }
          break;
        }
        case "message.part.delta": {
          break;
        }
        case "message.part.removed": {
          break;
        }
        case "message.removed": {
          break;
        }
        case "permission.asked": {
          set((state) => ({
            permissions: [...state.permissions, properties as PermissionRequest],
          }));
          break;
        }
        case "question.asked": {
          set((state) => ({
            questions: [...state.questions, properties as QuestionRequest],
          }));
          break;
        }
        case "todo.updated": {
          set((state) => {
            const todos = new Map(state.todos);
            todos.set(properties.sessionID, properties.todos);
            return { todos };
          });
          break;
        }
        case "session.diff": {
          set((state) => {
            const diffs = new Map(state.diffs);
            diffs.set(properties.sessionID, properties.diff);
            return { diffs };
          });
          break;
        }
        case "file.edited": {
          break;
        }
        case "command.executed": {
          break;
        }
      }
    });
  },

  stopEventStream: () => {
    sseManager.disconnect();
  },
}));