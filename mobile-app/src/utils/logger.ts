export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  tag: string;
  message: string;
  data?: unknown;
}

const MAX_ENTRIES = 300;

class Logger {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private listeners: Set<(entries: LogEntry[]) => void> = new Set();

  log(level: LogLevel, tag: string, message: string, data?: unknown) {
    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      level,
      tag,
      message,
      data,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }

    const prefix = `[${new Date(entry.timestamp).toISOString()}] [${level.toUpperCase()}] [${tag}]`;
    if (data !== undefined) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }

    this.notify();
  }

  debug(tag: string, message: string, data?: unknown) {
    this.log("debug", tag, message, data);
  }

  info(tag: string, message: string, data?: unknown) {
    this.log("info", tag, message, data);
  }

  warn(tag: string, message: string, data?: unknown) {
    this.log("warn", tag, message, data);
  }

  error(tag: string, message: string, data?: unknown) {
    this.log("error", tag, message, data);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getFilteredEntries(levelFilter?: LogLevel): LogEntry[] {
    if (!levelFilter) return this.getEntries();
    return this.entries.filter((e) => e.level === levelFilter);
  }

  clear() {
    this.entries = [];
    this.notify();
  }

  subscribe(listener: (entries: LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getEntries());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const snapshot = this.getEntries();
    this.listeners.forEach((l) => {
      try {
        l(snapshot);
      } catch (e) {
        // ignore listener errors
      }
    });
  }
}

export const logger = new Logger();