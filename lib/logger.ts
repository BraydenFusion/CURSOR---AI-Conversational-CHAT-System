type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private log(level: LogLevel, message: string, data?: unknown, error?: Error) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      data,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        : undefined
    };

    const emoji: Record<LogLevel, string> = {
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
      debug: "🔍"
    };

    const logMessage = `${emoji[level]} [${entry.timestamp}] ${entry.message}`;

    if (level === "error") {
      console.error(logMessage, entry.data ?? "", entry.error ?? "");
    } else if (level === "warn") {
      console.warn(logMessage, entry.data ?? "");
    } else {
      console.log(logMessage, entry.data ?? "");
    }

    if (process.env.NODE_ENV === "production" && level === "error") {
      // TODO: integrate with external error tracking service
    }
  }

  info(message: string, data?: unknown) {
    this.log("info", message, data);
  }

  warn(message: string, data?: unknown) {
    this.log("warn", message, data);
  }

  error(message: string, error?: Error, data?: unknown) {
    this.log("error", message, data, error);
  }

  debug(message: string, data?: unknown) {
    if (process.env.NODE_ENV === "development") {
      this.log("debug", message, data);
    }
  }
}

export const logger = new Logger();

