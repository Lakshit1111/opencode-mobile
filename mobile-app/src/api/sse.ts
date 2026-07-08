import EventSource from "react-native-sse";
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
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimeoutMs = 30000;

  connect(url: string) {
    logger.info("sse", "connect() called", { url });
    this.disconnect();
    this.url = url;
    this.reconnectAttempts = 0;
    this.eventCount = 0;
    this._connect();
  }

  private resetWatchdog() {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      logger.warn("sse", `Watchdog: no events for ${this.watchdogTimeoutMs}ms, forcing reconnect`);
      this.eventSource?.close();
      this.eventSource = null;
      this.scheduleReconnect();
    }, this.watchdogTimeoutMs);
  }

  private _connect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("sse", `Max reconnect attempts (${this.maxReconnectAttempts}) reached — giving up`);
      return;
    }

    logger.info("sse", `Connecting (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`, { url: this.url });

    try {
      this.eventSource = new EventSource(this.url, {
        headers: { Accept: "text/event-stream" },
        pollingInterval: 0,
        withCredentials: false,
      });

      this.eventSource.addEventListener("open", () => {
        logger.info("sse", "Connection opened");
        this.reconnectAttempts = 0;
        this.resetWatchdog();
      });

      this.eventSource.addEventListener("message", (msg: any) => {
        try {
          this.resetWatchdog();
          const raw = msg.data;
          logger.debug("sse", `raw message data`, { preview: raw?.substring?.(0, 300) });
          let parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && "payload" in parsed && parsed.payload?.type) {
            parsed = parsed.payload;
          }
          const event = parsed as Event;
          if ((event as any).type === "sync") return;
          this.eventCount++;
          logger.info("sse", `Event #${this.eventCount}: ${event.type}`, { sessionID: (event as any).properties?.sessionID });
          this.emit(event.type, event);
          this.emit("*", event);
        } catch (e: any) {
          logger.warn("sse", "Failed to parse SSE message", { data: msg.data?.substring?.(0, 200), error: e.message });
        }
      });

      this.eventSource.addEventListener("error", (e: any) => {
        logger.error("sse", `Connection error`, { attempt: this.reconnectAttempts + 1, error: e?.message || "unknown" });
        this.eventSource?.close();
        this.eventSource = null;
        if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
        this.scheduleReconnect();
      });

      this.eventSource.addEventListener("close", () => {
        logger.warn("sse", "Connection closed by server — scheduling reconnect");
        this.eventSource = null;
        if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
        this.scheduleReconnect();
      });
    } catch (e: any) {
      logger.error("sse", "Failed to create EventSource", { error: e.message, url: this.url });
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      logger.debug("sse", "scheduleReconnect: already pending, skipping");
      return;
    }
    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error("sse", `Max reconnect attempts (${this.maxReconnectAttempts}) reached — giving up`);
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    logger.info("sse", `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, delay);
  }

  disconnect() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
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
    return this.eventSource !== null;
  }
}

export const sseManager = new SSEManager();