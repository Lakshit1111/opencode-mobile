import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConnectionConfig, Session, Message, Part, PermissionRequest, QuestionRequest, Todo } from "../types/opencode";

const CONNECTION_KEY = "@opencode_connection";

export async function saveConnection(config: ConnectionConfig): Promise<void> {
  await AsyncStorage.setItem(CONNECTION_KEY, JSON.stringify(config));
}

export async function loadConnection(): Promise<ConnectionConfig | null> {
  const raw = await AsyncStorage.getItem(CONNECTION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearConnection(): Promise<void> {
  await AsyncStorage.removeItem(CONNECTION_KEY);
}

class OpenCodeClient {
  private baseUrl: string = "";
  private apiKey: string = "";

  configure(config: ConnectionConfig) {
    this.baseUrl = config.bridgeUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/api/opencode${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...this.headers(),
        ...(options?.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API Error ${res.status}: ${text}`);
    }
    return res.json();
  }

  async checkHealth(): Promise<{ healthy: boolean; version?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        headers: this.headers(),
      });
      if (res.ok) return await res.json();
      throw new Error(`Health check failed: ${res.status}`);
    } catch (e) {
      return { healthy: false };
    }
  }

  async checkBridgeStatus(): Promise<{
    bridgeEnabled: boolean;
    connectedClients: number;
    opencodeUrl: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/bridge/status`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Bridge status failed: ${res.status}`);
    return res.json();
  }

  async listSessions(directory?: string): Promise<Session[]> {
    const query = directory ? `?directory=${encodeURIComponent(directory)}` : "";
    return this.request(`/session${query}`);
  }

  async getSession(sessionID: string): Promise<Session> {
    return this.request(`/session/${sessionID}`);
  }

  async getSessionStatus(
    directory?: string
  ): Promise<Record<string, { type: string }>> {
    const query = directory ? `?directory=${encodeURIComponent(directory)}` : "";
    return this.request(`/session/status${query}`);
  }

  async getSessionMessages(
    sessionID: string,
    limit?: number
  ): Promise<Message[]> {
    const query = limit ? `?limit=${limit}` : "";
    return this.request(`/session/${sessionID}/messages${query}`);
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
    return this.request(`/session/${sessionID}/prompt`, {
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
    return this.request("/session", {
      method: "POST",
      body: JSON.stringify(options || {}),
    });
  }

  async replyPermission(
    requestID: string,
    reply: "once" | "always" | "reject"
  ): Promise<void> {
    await this.request(`/permission/${requestID}/reply`, {
      method: "POST",
      body: JSON.stringify({ reply }),
    });
  }

  async replyQuestion(
    requestID: string,
    answers: string[][]
  ): Promise<void> {
    await this.request(`/question/${requestID}/reply`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
  }

  async listPermissions(): Promise<PermissionRequest[]> {
    return this.request("/permission");
  }

  async listQuestions(): Promise<QuestionRequest[]> {
    return this.request("/question");
  }

  async abortSession(sessionID: string): Promise<void> {
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