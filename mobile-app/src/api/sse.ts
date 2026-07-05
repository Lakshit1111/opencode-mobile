import type { Event } from "../types/opencode";
import { logger } from "../utils/logger";

type EventHandler = (event: Event) => void;

class SSEManager {
  private eventSource: EventSource | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string = "";
  private eventCount = 0;

  connect(url: string) {
    logger.info("sse", "connect() called", { url });
    this.disconnect();
    this.url = url;
    this.reconnectAttempts = 0;
    this.eventCount = 0;
    this._connect();
  }

  private _connect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("sse", `Max reconnect attempts (${this.maxReconnectAttempts}) reached — giving up`);
      return;
    }

    logger.info("sse", `Connecting (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`, { url: this.url });

    try {
      this.eventSource = new EventSource(this.url);

      this.eventSource.onopen = () => {
        logger.info("sse", "Connection opened");
        this.reconnectAttempts = 0;
      };

      this.eventSource.onmessage = (msg) => {
        try {
          const event: Event = JSON.parse(msg.data);
          this.eventCount++;
          if (this.eventCount <= 5 || this.eventCount % 50 === 0) {
            logger.debug("sse", `Event #${this.eventCount}: ${event.type}`);
          }
          this.emit(event.type, event);
          this.emit("*", event);
        } catch (e: any) {
          logger.warn("sse", "Failed to parse SSE message", { data: msg.data?.substring(0, 200), error: e.message });
        }
      };

      this.eventSource.onerror = (e: any) => {
        const readyState = this.eventSource?.readyState;
        logger.error("sse", `Connection error (readyState=${readyState})`, { attempt: this.reconnectAttempts + 1 });
        this.eventSource?.close();
        this.eventSource = null;
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        logger.info("sse", `Reconnecting in ${delay}ms`);
        this.reconnectTimer = setTimeout(() => this._connect(), delay);
      };
    } catch (e: any) {
      logger.error("sse", "Failed to create EventSource", { error: e.message, url: this.url });
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      logger.info("sse", "Disconnecting", { totalEvents: this.eventCount });
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
        } catch (e: any) {
          logger.error("sse", `Handler error for "${eventType}"`, { error: e.message });
        }
      });
    }
  }

  get connected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

export const sseManager = new SSEManager();