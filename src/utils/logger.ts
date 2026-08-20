/**
 * Lightweight structured logger.
 *
 * Avoids exposing sensitive values. Prefix all log output so it's easy to
 * grep in production.
 */

type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: Level, scope: string, message: string): string {
  return `[${timestamp()}] [${level}] [${scope}] ${message}`;
}

export const logger = {
  debug(scope: string, message: string): void {
    if (process.env["LOG_LEVEL"] === "debug") {
      // eslint-disable-next-line no-console
      console.debug(format("DEBUG", scope, message));
    }
  },

  info(scope: string, message: string): void {
    // eslint-disable-next-line no-console
    console.log(format("INFO", scope, message));
  },

  warn(scope: string, message: string): void {
    // eslint-disable-next-line no-console
    console.warn(format("WARN", scope, message));
  },

  error(scope: string, message: string, error?: unknown): void {
    // eslint-disable-next-line no-console
    console.error(format("ERROR", scope, message));
    if (error instanceof Error) {
      // eslint-disable-next-line no-console
      console.error(error.stack ?? error.message);
    }
  },
};
