import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConnectionConfig, Session, Message, Part, PermissionRequest, QuestionRequest, Todo, Project, Agent, ConfigProviders } from "../types/opencode";
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
      const res = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.setRequestHeader("Authorization", `Bearer ${this.apiKey}`);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.timeout = 30000;
        xhr.ontimeout = () => reject(new Error("Request timed out"));
        xhr.onerror = (e) => {
          logger.error("client", `XHR onerror for ${method} ${path}`, {
            status: xhr.status,
            statusText: xhr.statusText,
            responseLen: xhr.responseText?.length,
            responsePreview: xhr.responseText?.substring(0, 200),
          });
          reject(new Error(`Network request failed (status=${xhr.status})`));
        };
        xhr.onload = () => {
          const elapsed = Date.now() - startTime;
          logger.debug("client", `XHR onload for ${method} ${path}`, {
            status: xhr.status,
            elapsed,
            responseLen: xhr.responseText?.length,
          });
          const responseHeaders: Record<string, string> = {};
          const headerLines = xhr.getAllResponseHeaders().split("\r\n");
          for (const line of headerLines) {
            const idx = line.indexOf(":");
            if (idx > 0) {
              responseHeaders[line.substring(0, idx).trim().toLowerCase()] = line.substring(idx + 1).trim();
            }
          }
          const body = xhr.responseText;
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            statusText: xhr.statusText,
            headers: {
              get: (name: string) => responseHeaders[name.toLowerCase()] || null,
              forEach: (cb: (val: string, key: string) => void) => {
                Object.entries(responseHeaders).forEach(([k, v]) => cb(v, k));
              },
            },
            text: async () => body,
            json: async () => JSON.parse(body),
            arrayBuffer: async () => new ArrayBuffer(0),
            blob: async () => new Blob(),
          } as Response);
        };
        xhr.send(options?.body as string | undefined);
      });

      const elapsed = Date.now() - startTime;
      if (!res.ok) {
        const text = await res.text();
        logger.error("client", `${method} ${path} failed (${res.status}) in ${elapsed}ms`, { status: res.status, body: text });
        throw new Error(`API Error ${res.status}: ${text}`);
      }
      logger.debug("client", `${method} ${path} OK (${res.status}) in ${elapsed}ms`);
      const text = await res.text();
      if (res.status === 204 || !text) return undefined as T;
      return JSON.parse(text) as T;
    } catch (e: any) {
      const elapsed = Date.now() - startTime;
      if (e.message?.startsWith("API Error")) throw e;
      logger.error("client", `${method} ${path} network error in ${elapsed}ms`, { error: e.message, cause: e.cause });
      throw e;
    }
  }

  async checkHealth(): Promise<{ healthy: boolean; version?: string; bridgeEnabled?: boolean }> {
    const url = `${this.baseUrl}/api/health`;
    logger.info("client", "Health check starting", { url, baseUrl: this.baseUrl, keyLength: this.apiKey.length });

    try {
      const startTime = Date.now();
      logger.debug("client", "Fetching...", { url, method: "GET" });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        headers: this.headers(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;

      logger.info("client", `Health check response: HTTP ${res.status} in ${elapsed}ms`, {
        status: res.status,
        ok: res.ok,
        headers: { "content-type": res.headers.get("content-type") },
      });

      if (!res.ok) {
        const body = await res.text();
        logger.error("client", `Health check failed: HTTP ${res.status}`, { status: res.status, body: body.substring(0, 500) });
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json();
      const result = {
        healthy: data.healthy === true || data.status === "ok",
        version: data.version,
        bridgeEnabled: data.bridgeEnabled,
      };
      logger.info("client", `Health check OK`, result);
      return result;
    } catch (e: any) {
      logger.error("client", "Health check network error (fetch threw)", {
        error: e.message,
        cause: e.cause,
        name: e.name,
        stack: e.stack?.substring(0, 300),
        url,
        baseUrl: this.baseUrl,
      });
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
    logger.info("client", `Loaded ${sessions.length} sessions`, { directory });
    return sessions;
  }

  async listProjects(): Promise<Project[]> {
    const projects = await this.request<Project[]>("/project");
    logger.info("client", `Loaded ${projects.length} projects`);
    return projects;
  }

  async listAgents(): Promise<Agent[]> {
    const agents = await this.request<Agent[]>("/agent");
    logger.info("client", `Loaded ${agents.length} agents`);
    return agents;
  }

  async listConfigProviders(): Promise<ConfigProviders> {
    const result = await this.request<ConfigProviders>("/config/providers");
    logger.info("client", `Loaded ${result.providers.length} providers`);
    return result;
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
  ): Promise<{ info: Message; parts: Part[] }[]> {
    const query = limit ? `?limit=${limit}` : "";
    const msgs = await this.request<{ info: Message; parts: Part[] }[]>(
      `/session/${sessionID}/message${query}`
    );
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
  ): Promise<void> {
    const url = `${this.baseUrl}/api/opencode/session/${sessionID}/message`;
    const body = JSON.stringify({
      parts: [{ type: "text", text }],
      ...options,
    });
    logger.info("client", `Sending prompt to ${sessionID}`, { textLength: text.length, url, bodyLen: body.length });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      logger.info("client", `sendPrompt response: ${res.status} ${res.statusText}`);
      if (!res.ok) {
        const errText = await res.text();
        logger.error("client", `sendPrompt failed: ${res.status}`, { body: errText });
        throw new Error(`API Error ${res.status}: ${errText}`);
      }
    } catch (e: any) {
      logger.error("client", `sendPrompt network error`, { error: e.message, cause: e.cause?.message });
      throw e;
    }
  }

  async createSession(options?: {
    title?: string;
    directory?: string;
  }): Promise<Session> {
    const url = `${this.baseUrl}/api/opencode/session`;
    logger.info("client", "Creating new session", { ...options, url });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options || {}),
      });
      logger.info("client", `createSession response: ${res.status}`);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API Error ${res.status}: ${errText}`);
      }
      return await res.json() as Session;
    } catch (e: any) {
      logger.error("client", `createSession network error`, { error: e.message });
      throw e;
    }
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
}

export const client = new OpenCodeClient();