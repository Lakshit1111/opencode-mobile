import type { Event } from "../types/opencode";

type EventHandler = (event: Event) => void;

class SSEManager {
  private eventSource: EventSource | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string = "";

  connect(url: string) {
    this.disconnect();
    this.url = url;
    this.reconnectAttempts = 0;
    this._connect();
  }

  private _connect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn("SSE: Max reconnect attempts reached");
      return;
    }

    try {
      this.eventSource = new EventSource(this.url);

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
      };

      this.eventSource.onmessage = (msg) => {
        try {
          const event: Event = JSON.parse(msg.data);
          this.emit(event.type, event);
          this.emit("*", event);
        } catch (e) {
          // ignore parse errors for non-JSON messages
        }
      };

      this.eventSource.onerror = () => {
        this.eventSource?.close();
        this.eventSource = null;
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectTimer = setTimeout(() => this._connect(), delay);
      };
    } catch (e) {
      console.error("SSE connect error:", e);
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  private emit(eventType: string, event: Event) {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(event);
        } catch (e) {
          console.error("SSE handler error:", e);
        }
      });
    }
  }

  get connected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

export const sseManager = new SSEManager();