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
  Agent,
  ConfigProviders,
  ServerProfile,
  ServerTestResult,
} from "../types/opencode";
import { client } from "../api/client";
import { sseManager } from "../api/sse";
import { saveConnection, loadConnection, clearConnection } from "../api/client";
import { logger } from "../utils/logger";

interface DeltaEntry {
  sessionID: string;
  messageID: string;
  partID: string;
  delta: string;
}

const deltaBuffer: Map<string, DeltaEntry[]> = new Map();
let flushTimer: ReturnType<typeof setInterval> | null = null;
const FLUSH_INTERVAL_MS = 100;

let storeSet: ((partial: any) => void) | null = null;

function flushDeltas() {
  if (deltaBuffer.size === 0) return;
  const snapshot = new Map(deltaBuffer);
  deltaBuffer.clear();
  if (!storeSet) return;
  storeSet((state: any) => {
    const parts = new Map(state.parts);
    for (const [, entries] of snapshot) {
      for (const entry of entries) {
        const msgKey = `${entry.sessionID}:${entry.messageID}`;
        const msgParts = new Map<string, any>((parts.get(msgKey) as Map<string, any>) || []);
        const existing = msgParts.get(entry.partID) as any;
        if (existing && typeof existing.text === "string") {
          msgParts.set(entry.partID, { ...existing, text: existing.text + entry.delta });
        } else {
          msgParts.set(entry.partID, {
            id: entry.partID,
            sessionID: entry.sessionID,
            messageID: entry.messageID,
            type: "text",
            text: entry.delta,
          });
        }
        parts.set(msgKey, msgParts);
      }
    }
    return { parts };
  });
}

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (deltaBuffer.size > 0) {
      flushDeltas();
    }
  }, FLUSH_INTERVAL_MS);
}

function stopFlushTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (deltaBuffer.size > 0) {
    flushDeltas();
  }
}

function flushPartImmediately(sessionID: string, messageID: string, partID: string) {
  const key = `${sessionID}:${messageID}:${partID}`;
  const entries = deltaBuffer.get(key);
  if (entries && entries.length > 0) {
    deltaBuffer.delete(key);
    if (!storeSet) return;
    storeSet((state: any) => {
      const parts = new Map(state.parts);
      const msgKey = `${sessionID}:${messageID}`;
      const msgParts = new Map<string, any>((parts.get(msgKey) as Map<string, any>) || []);
      const existing = msgParts.get(partID) as any;
      const fullDelta = entries.map((e) => e.delta).join("");
      if (existing && typeof existing.text === "string") {
        msgParts.set(partID, { ...existing, text: existing.text + fullDelta });
      } else {
        msgParts.set(partID, {
          id: partID,
          sessionID,
          messageID,
          type: "text",
          text: fullDelta,
        });
      }
      parts.set(msgKey, msgParts);
      return { parts };
    });
  }
}

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
  agents: Agent[];
  providers: ConfigProviders | null;
  selectedAgent: string;
  selectedModel: { providerID: string; modelID: string } | null;
  sessionErrors: Map<string, string>;

  servers: ServerProfile[];
  activeServerId: string | null;
  activeServerName: string;

  setConnection: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  loadSavedConnection: () => Promise<ConnectionConfig | null>;
  fetchSessions: () => Promise<void>;
  fetchAgents: () => Promise<void>;
  fetchProviders: () => Promise<void>;
  fetchServers: () => Promise<void>;
  addServer: (profile: { name?: string; url: string; username?: string; password?: string; autoDiscover?: boolean }) => Promise<ServerProfile>;
  updateServer: (id: string, patch: Partial<ServerProfile>) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  testServer: (id: string) => Promise<ServerTestResult>;
  activateServer: (id: string) => Promise<void>;
  setSelectedAgent: (agent: string) => void;
  setSelectedModel: (model: { providerID: string; modelID: string } | null) => void;
  clearSessionError: (sessionID: string) => void;
  fetchSessionTodos: (sessionID: string) => Promise<void>;
  fetchSessionDiff: (sessionID: string) => Promise<void>;
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
  agents: [],
  providers: null,
  selectedAgent: "build",
  selectedModel: null,
  sessionErrors: new Map(),
  servers: [],
  activeServerId: null,
  activeServerName: "",

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
    get().fetchAgents();
    get().fetchProviders();
    get().fetchServers();
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
      agents: [],
      providers: null,
      selectedAgent: "build",
      selectedModel: null,
      sessionErrors: new Map(),
      servers: [],
      activeServerId: null,
      activeServerName: "",
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
        get().fetchAgents();
        get().fetchProviders();
        get().fetchServers();
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

  fetchAgents: async () => {
    logger.info("store", "fetchAgents called");
    try {
      const agents = await client.listAgents();
      set({ agents });
      logger.info("store", `fetchAgents: loaded ${agents.length} agents`);
    } catch (e: any) {
      logger.error("store", "fetchAgents failed", { error: e.message });
    }
  },

  fetchProviders: async () => {
    logger.info("store", "fetchProviders called");
    try {
      const providers = await client.listConfigProviders();
      set({ providers });
      const defaults = providers.default;
      const firstDefault = Object.entries(defaults)[0];
      if (firstDefault && !get().selectedModel) {
        const [providerID, modelID] = firstDefault;
        set({ selectedModel: { providerID, modelID } });
        logger.info("store", `fetchProviders: set default model`, { providerID, modelID });
      }
      logger.info("store", `fetchProviders: loaded ${providers.providers.length} providers`);
    } catch (e: any) {
      logger.error("store", "fetchProviders failed", { error: e.message });
    }
  },

  setSelectedAgent: (agent: string) => {
    logger.info("store", `Selected agent: ${agent}`);
    set({ selectedAgent: agent });
  },

  setSelectedModel: (model: { providerID: string; modelID: string } | null) => {
    logger.info("store", `Selected model`, model);
    set({ selectedModel: model });
  },

  fetchServers: async () => {
    logger.info("store", "fetchServers called");
    try {
      const data = await client.listServers();
      const active = data.servers.find((s) => s.id === data.activeServerId) || null;
      set({
        servers: data.servers,
        activeServerId: data.activeServerId || null,
        activeServerName: active?.name || "",
      });
      logger.info("store", `fetchServers: loaded ${data.servers.length} servers, active=${data.activeServerId}`);
    } catch (e: any) {
      logger.error("store", "fetchServers failed", { error: e.message });
    }
  },

  addServer: async (profile) => {
    logger.info("store", "addServer called", { url: profile.url, name: profile.name });
    const created = await client.addServer(profile);
    await get().fetchServers();
    return created;
  },

  updateServer: async (id, patch) => {
    logger.info("store", `updateServer ${id}`, patch);
    await client.updateServer(id, patch);
    await get().fetchServers();
  },

  deleteServer: async (id) => {
    logger.info("store", `deleteServer ${id}`);
    await client.deleteServer(id);
    await get().fetchServers();
  },

  testServer: async (id) => {
    logger.info("store", `testServer ${id}`);
    const result = await client.testServer(id);
    logger.info("store", `testServer ${id} result`, result);
    return result;
  },

  activateServer: async (id) => {
    logger.info("store", `activateServer ${id}`);
    const result = await client.activateServer(id);
    set({
      activeServerId: result.activeServerId,
      activeServerName: get().servers.find((s) => s.id === result.activeServerId)?.name || "",
    });
    // Re-establish event stream + refresh data against the new backend.
    get().stopEventStream();
    get().startEventStream();
    set((state) => {
      const lastFetchTime = new Map(state.lastFetchTime);
      for (const key of state.lastFetchTime.keys()) lastFetchTime.set(key, 0);
      return { lastFetchTime };
    });
    get().fetchSessions();
    get().fetchAgents();
    get().fetchProviders();
    logger.info("store", `activateServer ${id} done`, { healthy: result.healthy, requiresAuth: result.requiresAuth });
  },

  clearSessionError: (sessionID: string) => {
    set((state) => {
      const sessionErrors = new Map(state.sessionErrors);
      sessionErrors.delete(sessionID);
      return { sessionErrors };
    });
  },

  fetchSessionTodos: async (sessionID: string) => {
    logger.info("store", `fetchSessionTodos called for ${sessionID}`);
    try {
      const todos = await client.getSessionTodos(sessionID);
      set((state) => {
        const todosMap = new Map(state.todos);
        todosMap.set(sessionID, todos);
        return { todos: todosMap };
      });
      logger.info("store", `fetchSessionTodos: loaded ${todos.length} todos for ${sessionID}`);
    } catch (e: any) {
      logger.error("store", `fetchSessionTodos failed for ${sessionID}`, { error: e.message });
    }
  },

  fetchSessionDiff: async (sessionID: string) => {
    logger.info("store", `fetchSessionDiff called for ${sessionID}`);
    try {
      const diff = await client.getSessionDiff(sessionID);
      if (diff) {
        set((state) => {
          const diffs = new Map(state.diffs);
          diffs.set(sessionID, diff);
          return { diffs };
        });
        logger.info("store", `fetchSessionDiff: loaded ${diff.length} diff entries for ${sessionID}`);
      }
    } catch (e: any) {
      logger.debug("store", `fetchSessionDiff failed for ${sessionID} (endpoint may not exist)`, { error: e.message });
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
      logger.info("store", `fetchMessages: loaded ${entries.length} messages (limit=${limit})`, {
        partCounts: entries.map(e => ({ id: e.info.id, role: e.info.role, parts: e.parts.length, partTypes: e.parts.map(p => p.type) })),
      });
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
        const existingMsgs = messages.get(sessionID) || [];
        const existingIds = new Set(existingMsgs.map((m) => m.id));
        const newMsgs = infoList.filter((m) => !existingIds.has(m.id));
        messages.set(sessionID, [...newMsgs, ...existingMsgs]);
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
      logger.info("store", `loadMoreMessages: prepended ${infoList.length - (get().messages.get(sessionID)?.length || 0)} new older messages (limit=${newLimit})`);
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
    const { selectedAgent, selectedModel, sessions } = get();
    const session = sessions.get(sessionID);
    const sessionModel = session?.model
      ? { providerID: session.model.providerID, modelID: session.model.id }
      : null;
    const sessionAgent = session?.agent || null;
    const modelMatchesSession =
      selectedModel &&
      sessionModel &&
      selectedModel.providerID === sessionModel.providerID &&
      selectedModel.modelID === sessionModel.modelID;
    const modelToSend = modelMatchesSession ? undefined : selectedModel || undefined;
    logger.info("store", `sendMessage to ${sessionID}`, {
      textLength: text.length,
      agent: selectedAgent,
      model: modelToSend,
      sessionModel,
      sessionAgent,
      matches: !!modelMatchesSession,
    });
    try {
      await client.sendPrompt(sessionID, text, {
        agent: selectedAgent !== "build" ? selectedAgent : undefined,
        model: modelToSend,
      });
      logger.info("store", "sendMessage success");
      setTimeout(() => {
        logger.debug("store", `sendMessage safety-net fetch for ${sessionID}`);
        set((state) => {
          const lastFetchTime = new Map(state.lastFetchTime);
          lastFetchTime.set(sessionID, 0);
          return { lastFetchTime };
        });
        get().fetchMessages(sessionID);
      }, 1500);
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

    storeSet = set;
    const url = client.getEventStreamUrl();
    logger.info("store", "Starting event stream", { url });
    sseManager.connect(url);
    startFlushTimer();

    sseManager.on("*", (event: Event) => {
      const { type, properties } = event as { type: string; properties: any };

      switch (type) {
        case "session.error": {
          const errMsg = (properties as any).error?.data?.message || (properties as any).error?.message || "Unknown session error";
          logger.error("store", `session.error for ${properties.sessionID}`, { message: errMsg });
          set((state) => {
            const sessionErrors = new Map(state.sessionErrors);
            sessionErrors.set(properties.sessionID, errMsg);
            return { sessionErrors };
          });
          break;
        }
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
          logger.info("store", `session.idle for ${properties.sessionID} — fetching messages`);
          flushDeltas();
          set((state) => {
            const sessionStatuses = new Map(state.sessionStatuses);
            sessionStatuses.set(properties.sessionID, { type: "idle" });
            const lastFetchTime = new Map(state.lastFetchTime);
            lastFetchTime.set(properties.sessionID, 0);
            return { sessionStatuses, lastFetchTime };
          });
          get().fetchMessages(properties.sessionID);
          break;
        }
        case "message.updated": {
          const msg = properties.info;
          logger.info("store", `message.updated: ${msg?.id} role=${msg?.role} session=${msg?.sessionID}`, {
            completed: msg?.time?.completed,
          });
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
            flushPartImmediately(part.sessionID, part.messageID, part.id);
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
            const key = `${sID}:${mID}:${pID}`;
            const existing = deltaBuffer.get(key);
            if (existing) {
              existing.push({ sessionID: sID, messageID: mID, partID: pID, delta });
            } else {
              deltaBuffer.set(key, [{ sessionID: sID, messageID: mID, partID: pID, delta }]);
            }
            startFlushTimer();
          }
          break;
        }
        case "message.part.removed": {
          const { sessionID: sID, messageID: mID, partID: pID } = properties;
          if (sID && mID && pID) {
            set((state) => {
              const parts = new Map(state.parts);
              const msgKey = `${sID}:${mID}`;
              const msgParts = parts.get(msgKey);
              if (msgParts) {
                const updated = new Map(msgParts);
                updated.delete(pID);
                if (updated.size === 0) {
                  parts.delete(msgKey);
                } else {
                  parts.set(msgKey, updated);
                }
              }
              return { parts };
            });
          }
          break;
        }
        case "message.removed": {
          const { sessionID: sID, messageID: mID } = properties;
          if (sID && mID) {
            set((state) => {
              const messages = new Map(state.messages);
              const sessionMsgs = messages.get(sID);
              if (sessionMsgs) {
                messages.set(sID, sessionMsgs.filter((m) => m.id !== mID));
              }
              const parts = new Map(state.parts);
              parts.delete(`${sID}:${mID}`);
              return { messages, parts };
            });
          }
          break;
        }
        case "file.edited":
          logger.info("store", "file.edited", properties);
          break;
        case "command.executed":
          logger.info("store", "command.executed", properties);
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
    stopFlushTimer();
    storeSet = null;
    sseManager.disconnect();
  },
}));