import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConnectionConfig, Session, Message, Part, PermissionRequest, QuestionRequest, Todo } from "../types/opencode";
import { logger } from "../utils/logger";

const CONNECTION_KEY = "@opencode_connection";

export async function saveConnection(config: ConnectionConfig): Promise<void> {
  await AsyncStorage.setItem(CONNECTION_KEY, JSON.stringify(config));
  logger.info("storage", "Connection saved", { url: config.bridgeUrl });
}

export async function loadConnection(): Promise<ConnectionConfig | null> {
  const raw = await AsyncStorage.getItem(CONNECTION_KEY);
  if (!raw) {
    logger.debug("storage", "No saved connection found");
    return null;
  }
  try {
    const config = JSON.parse(raw);
    logger.info("storage", "Loaded saved connection", { url: config.bridgeUrl });
    return config;
  } catch {
    logger.warn("storage", "Failed to parse saved connection");
    return null;
  }
}

export async function clearConnection(): Promise<void> {
  await AsyncStorage.removeItem(CONNECTION_KEY);
  logger.info("storage", "Connection cleared");
}

class OpenCodeClient {
  private baseUrl: string = "";
  private apiKey: string = "";

  configure(config: ConnectionConfig) {
    this.baseUrl = config.bridgeUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    logger.info("client", "Configured", { baseUrl: this.baseUrl, keyLength: this.apiKey.length });
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/api/opencode${path}`;
    const method = options?.method || "GET";
    logger.debug("client", `${method} ${path}`, { url });
    const startTime = Date.now();

    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          ...this.headers(),
          ...(options?.headers || {}),
        },
      });
      const elapsed = Date.now() - startTime;

      if (!res.ok) {
        const text = await res.text();
        logger.error("client", `${method} ${path} failed (${res.status}) in ${elapsed}ms`, { status: res.status, body: text });
        throw new Error(`API Error ${res.status}: ${text}`);
      }

      logger.debug("client", `${method} ${path} OK (${res.status}) in ${elapsed}ms`);
      return res.json();
    } catch (e: any) {
      const elapsed = Date.now() - startTime;
      if (e.message?.startsWith("API Error")) throw e;
      logger.error("client", `${method} ${path} network error in ${elapsed}ms`, { error: e.message, cause: e.cause });
      throw e;
    }
  }

  async checkHealth(): Promise<{ healthy: boolean; version?: string; bridgeEnabled?: boolean }> {
    const url = `${this.baseUrl}/api/health`;
    logger.info("client", "Health check starting", { url });

    try {
      const startTime = Date.now();
      const res = await fetch(url, {
        headers: this.headers(),
      });
      const elapsed = Date.now() - startTime;

      if (!res.ok) {
        const body = await res.text();
        logger.error("client", `Health check failed: HTTP ${res.status} in ${elapsed}ms`, { status: res.status, body });
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json();
      const result = {
        healthy: data.healthy === true || data.status === "ok",
        version: data.version,
        bridgeEnabled: data.bridgeEnabled,
      };
      logger.info("client", `Health check OK in ${elapsed}ms`, result);
      return result;
    } catch (e: any) {
      logger.error("client", "Health check network error", { error: e.message, cause: e.cause, url });
      return { healthy: false };
    }
  }

  async checkBridgeStatus(): Promise<{
    bridgeEnabled: boolean;
    connectedClients: number;
    opencodeUrl: string;
  }> {
    logger.debug("client", "Checking bridge status");
    const res = await fetch(`${this.baseUrl}/api/bridge/status`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Bridge status failed: ${res.status}`);
    const data = await res.json();
    logger.info("client", "Bridge status", data);
    return data;
  }

  async listSessions(directory?: string): Promise<Session[]> {
    const query = directory ? `?directory=${encodeURIComponent(directory)}` : "";
    const sessions = await this.request<Session[]>(`/session${query}`);
    logger.info("client", `Loaded ${sessions.length} sessions`);
    return sessions;
  }

  async getSession(sessionID: string): Promise<Session> {
    return this.request<Session>(`/session/${sessionID}`);
  }

  async getSessionStatus(
    directory?: string
  ): Promise<Record<string, { type: string }>> {
    const query = directory ? `?directory=${encodeURIComponent(directory)}` : "";
    return this.request<Record<string, { type: string }>>(`/session/status${query}`);
  }

  async getSessionMessages(
    sessionID: string,
    limit?: number
  ): Promise<Message[]> {
    const query = limit ? `?limit=${limit}` : "";
    const msgs = await this.request<Message[]>(`/session/${sessionID}/messages${query}`);
    logger.info("client", `Loaded ${msgs.length} messages for session ${sessionID}`);
    return msgs;
  }

  async getSessionTodos(sessionID: string): Promise<Todo[]> {
    const res = await this.request<{ todos: Todo[] }>(
      `/session/${sessionID}/todo`
    );
    return res.todos || [];
  }

  async sendPrompt(
    sessionID: string,
    text: string,
    options?: {
      agent?: string;
      model?: { providerID: string; modelID: string };
    }
  ): Promise<Message> {
    logger.info("client", `Sending prompt to ${sessionID}`, { textLength: text.length });
    return this.request<Message>(`/session/${sessionID}/prompt`, {
      method: "POST",
      body: JSON.stringify({
        parts: [{ type: "text", text }],
        ...options,
      }),
    });
  }

  async createSession(options?: {
    title?: string;
    directory?: string;
  }): Promise<Session> {
    logger.info("client", "Creating new session", options);
    return this.request<Session>("/session", {
      method: "POST",
      body: JSON.stringify(options || {}),
    });
  }

  async replyPermission(
    requestID: string,
    reply: "once" | "always" | "reject"
  ): Promise<void> {
    logger.info("client", `Replying to permission ${requestID}: ${reply}`);
    await this.request(`/permission/${requestID}/reply`, {
      method: "POST",
      body: JSON.stringify({ reply }),
    });
  }

  async replyQuestion(
    requestID: string,
    answers: string[][]
  ): Promise<void> {
    logger.info("client", `Replying to question ${requestID}`, { answers });
    await this.request(`/question/${requestID}/reply`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
  }

  async listPermissions(): Promise<PermissionRequest[]> {
    return this.request<PermissionRequest[]>("/permission");
  }

  async listQuestions(): Promise<QuestionRequest[]> {
    return this.request<QuestionRequest[]>("/question");
  }

  async abortSession(sessionID: string): Promise<void> {
    logger.info("client", `Aborting session ${sessionID}`);
    await this.request(`/session/${sessionID}/abort`, { method: "POST" });
  }

  getEventStreamUrl(): string {
    return `${this.baseUrl}/api/events?token=${encodeURIComponent(this.apiKey)}`;
  }

  getSyncEventStreamUrl(): string {
    return `${this.baseUrl}/api/sync-events?token=${encodeURIComponent(this.apiKey)}`;
  }
}

export const client = new OpenCodeClient();