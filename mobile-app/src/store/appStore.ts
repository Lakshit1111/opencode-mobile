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
import { logger } from "../utils/logger";

interface AppState {
  connection: ConnectionConfig | null;
  connected: boolean;
  bridgeEnabled: boolean;
  sessions: Map<string, Session>;
  sessionStatuses: Map<string, SessionStatus>;
  messages: Map<string, Message[]>;
  parts: Map<string, Map<string, Part>>;
  messageLimits: Map<string, number>;
  messageHasMore: Map<string, boolean>;
  messageLoadingMore: Set<string>;
  lastFetchTime: Map<string, number>;
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  todos: Map<string, Todo[]>;
  diffs: Map<string, FileDiff[]>;

  setConnection: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  loadSavedConnection: () => Promise<ConnectionConfig | null>;
  fetchSessions: () => Promise<void>;
  fetchMessages: (sessionID: string) => Promise<void>;
  loadMoreMessages: (sessionID: string) => Promise<void>;
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
  messageLimits: new Map(),
  messageHasMore: new Map(),
  messageLoadingMore: new Set(),
  lastFetchTime: new Map(),
  permissions: [],
  questions: [],
  todos: new Map(),
  diffs: new Map(),

  setConnection: async (config: ConnectionConfig) => {
    logger.info("store", "setConnection called", { url: config.bridgeUrl, keyLength: config.apiKey.length });
    client.configure(config);
    const health = await client.checkHealth();
    if (!health.healthy) {
      logger.error("store", "setConnection failed — health check returned unhealthy", health);
      throw new Error("Cannot connect to OpenCode server. Make sure the bridge is running and OpenCode is started with 'opencode serve --port 8765'.");
    }
    logger.info("store", "Health check passed, saving connection");
    await saveConnection(config);
    set({ connection: config, connected: true, bridgeEnabled: health.bridgeEnabled ?? true });
    logger.info("store", "Connection established, starting event stream");
    get().startEventStream();
    get().fetchSessions();
  },

  disconnect: async () => {
    logger.info("store", "disconnect called");
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
    logger.info("store", "Disconnected and state cleared");
  },

  loadSavedConnection: async () => {
    logger.info("store", "loadSavedConnection called");
    const config = await loadConnection();
    if (config) {
      client.configure(config);
      const health = await client.checkHealth();
      if (health.healthy) {
        logger.info("store", "Saved connection is valid, restoring");
        set({ connection: config, connected: true, bridgeEnabled: health.bridgeEnabled ?? true });
        get().startEventStream();
        get().fetchSessions();
        return config;
      } else {
        logger.warn("store", "Saved connection is no longer valid", health);
      }
    } else {
      logger.info("store", "No saved connection to restore");
    }
    return null;
  },

  fetchSessions: async () => {
    logger.info("store", "fetchSessions called");
    try {
      const projects = await client.listProjects();
      const directories = projects.map((p) => p.worktree).filter((d) => d && d !== "/");
      logger.info("store", `fetchSessions: querying ${directories.length} directories`);

      const results = await Promise.all(
        directories.map(async (dir) => {
          try {
            return await client.listSessions(dir);
          } catch (e: any) {
            logger.warn("store", `fetchSessions: directory ${dir} failed`, { error: e.message });
            return [] as Session[];
          }
        })
      );

      const sessionMap = new Map<string, Session>();
      let total = 0;
      results.forEach((sessions) => {
        sessions.forEach((s) => {
          if (!sessionMap.has(s.id)) {
            sessionMap.set(s.id, s);
            total++;
          }
        });
      });
      set({ sessions: sessionMap });
      logger.info("store", `fetchSessions: loaded ${total} unique sessions across ${directories.length} directories`);

      try {
        const statuses = await client.getSessionStatus();
        const statusMap = new Map<string, SessionStatus>();
        Object.entries(statuses).forEach(([id, status]) => {
          statusMap.set(id, status as SessionStatus);
        });
        set({ sessionStatuses: statusMap });
        logger.info("store", `fetchSessions: loaded ${statusMap.size} statuses`);
      } catch (e: any) {
        logger.warn("store", `fetchSessions: status fetch failed`, { error: e.message });
      }
    } catch (e: any) {
      logger.error("store", "fetchSessions failed", { error: e.message });
    }
  },

  fetchMessages: async (sessionID: string) => {
    logger.info("store", `fetchMessages called for ${sessionID}`);
    const now = Date.now();
    const last = get().lastFetchTime.get(sessionID) || 0;
    if (now - last < 10000 && get().messages.has(sessionID)) {
      logger.debug("store", `fetchMessages skipped (throttled, ${now - last}ms since last)`);
      return;
    }
    const limit = get().messageLimits.get(sessionID) || 10;
    try {
      const entries = await client.getSessionMessages(sessionID, limit);
      const infoList = entries.map((e) => e.info);
      set((state) => {
        const messages = new Map(state.messages);
        messages.set(sessionID, infoList);
        const parts = new Map(state.parts);
        entries.forEach((e) => {
          const msgKey = `${sessionID}:${e.info.id}`;
          const msgParts = new Map(parts.get(msgKey) || new Map());
          e.parts.forEach((p) => msgParts.set(p.id, p));
          parts.set(msgKey, msgParts);
        });
        const messageLimits = new Map(state.messageLimits);
        messageLimits.set(sessionID, limit);
        const messageHasMore = new Map(state.messageHasMore);
        messageHasMore.set(sessionID, entries.length === limit);
        const lastFetchTime = new Map(state.lastFetchTime);
        lastFetchTime.set(sessionID, now);
        return { messages, parts, messageLimits, messageHasMore, lastFetchTime };
      });
      logger.info("store", `fetchMessages: loaded ${entries.length} messages (limit=${limit})`);
    } catch (e: any) {
      logger.error("store", `fetchMessages failed for ${sessionID}`, { error: e.message });
    }
  },

  loadMoreMessages: async (sessionID: string) => {
    if (get().messageLoadingMore.has(sessionID)) {
      logger.debug("store", `loadMoreMessages skipped (already loading)`);
      return;
    }
    const hasMore = get().messageHasMore.get(sessionID);
    if (hasMore === false) {
      logger.debug("store", `loadMoreMessages skipped (no more)`);
      return;
    }
    const currentLimit = get().messageLimits.get(sessionID) || 10;
    const newLimit = currentLimit + 10;
    set((state) => {
      const messageLoadingMore = new Set(state.messageLoadingMore);
      messageLoadingMore.add(sessionID);
      return { messageLoadingMore };
    });
    logger.info("store", `loadMoreMessages: fetching ${newLimit} messages`);
    try {
      const entries = await client.getSessionMessages(sessionID, newLimit);
      const infoList = entries.map((e) => e.info);
      set((state) => {
        const messages = new Map(state.messages);
        messages.set(sessionID, infoList);
        const parts = new Map(state.parts);
        entries.forEach((e) => {
          const msgKey = `${sessionID}:${e.info.id}`;
          const msgParts = new Map(parts.get(msgKey) || new Map());
          e.parts.forEach((p) => msgParts.set(p.id, p));
          parts.set(msgKey, msgParts);
        });
        const messageLimits = new Map(state.messageLimits);
        messageLimits.set(sessionID, newLimit);
        const messageHasMore = new Map(state.messageHasMore);
        messageHasMore.set(sessionID, entries.length === newLimit);
        const messageLoadingMore = new Set(state.messageLoadingMore);
        messageLoadingMore.delete(sessionID);
        return { messages, parts, messageLimits, messageHasMore, messageLoadingMore };
      });
      logger.info("store", `loadMoreMessages: loaded ${entries.length} messages (limit=${newLimit})`);
    } catch (e: any) {
      set((state) => {
        const messageLoadingMore = new Set(state.messageLoadingMore);
        messageLoadingMore.delete(sessionID);
        return { messageLoadingMore };
      });
      logger.error("store", `loadMoreMessages failed for ${sessionID}`, { error: e.message });
    }
  },

  sendMessage: async (sessionID: string, text: string) => {
    logger.info("store", `sendMessage to ${sessionID}`, { textLength: text.length });
    try {
      await client.sendPrompt(sessionID, text);
      logger.info("store", "sendMessage success");
    } catch (e: any) {
      logger.error("store", `sendMessage failed`, { error: e.message });
      throw e;
    }
  },

  replyPermission: async (requestID: string, reply: "once" | "always" | "reject") => {
    logger.info("store", `replyPermission ${requestID}: ${reply}`);
    await client.replyPermission(requestID, reply);
    set((state) => ({
      permissions: state.permissions.filter((p) => p.id !== requestID),
    }));
  },

  replyQuestion: async (requestID: string, answers: string[][]) => {
    logger.info("store", `replyQuestion ${requestID}`);
    await client.replyQuestion(requestID, answers);
    set((state) => ({
      questions: state.questions.filter((q) => q.id !== requestID),
    }));
  },

  createSession: async (title?: string) => {
    logger.info("store", `createSession`, { title });
    try {
      const session = await client.createSession({ title });
      set((state) => {
        const sessions = new Map(state.sessions);
        sessions.set(session.id, session);
        return { sessions };
      });
      logger.info("store", `createSession success: ${session.id}`);
      return session;
    } catch (e: any) {
      logger.error("store", "createSession failed", { error: e.message });
      return null;
    }
  },

  abortSession: async (sessionID: string) => {
    logger.info("store", `abortSession ${sessionID}`);
    await client.abortSession(sessionID);
  },

  startEventStream: () => {
    const { connection } = get();
    if (!connection) {
      logger.warn("store", "startEventStream called but no connection");
      return;
    }

    const url = client.getEventStreamUrl();
    logger.info("store", "Starting event stream", { url });
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
          const { sessionID: sID, messageID: mID, partID: pID, field, delta } = properties;
          if (sID && mID && pID && field === "text" && delta) {
            set((state) => {
              const parts = new Map(state.parts);
              const msgKey = `${sID}:${mID}`;
              const msgParts = new Map(parts.get(msgKey) || new Map());
              const existing = msgParts.get(pID) as any;
              if (existing && typeof existing.text === "string") {
                msgParts.set(pID, { ...existing, text: existing.text + delta });
                parts.set(msgKey, msgParts);
              }
              return { parts };
            });
          }
          break;
        }
        case "message.part.removed":
        case "message.removed":
        case "file.edited":
        case "command.executed":
          break;
        case "permission.asked": {
          logger.info("store", "Permission requested", properties);
          set((state) => ({
            permissions: [...state.permissions, properties as PermissionRequest],
          }));
          break;
        }
        case "question.asked": {
          logger.info("store", "Question asked", properties);
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
      }
    });
  },

  stopEventStream: () => {
    logger.info("store", "stopEventStream called");
    sseManager.disconnect();
  },
}));