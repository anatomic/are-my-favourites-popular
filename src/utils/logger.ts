/* eslint-disable no-console */
/**
 * Logger Utility
 *
 * Provides structured logging that only outputs in development.
 * In production builds, log/debug/info calls are no-ops.
 * Warnings and errors always log (important for debugging production issues).
 */

interface LoggerOptions {
  /** Prefix for all log messages */
  prefix?: string;
}

const isDev = import.meta.env.DEV;

/**
 * Create a logger with an optional prefix
 */
function createLogger(options: LoggerOptions = {}) {
  const prefix = options.prefix ? `[${options.prefix}]` : '';

  return {
    /**
     * Debug level - verbose information for development
     * Only logs in development
     */
    debug: (...args: unknown[]): void => {
      if (isDev) {
        console.debug(prefix, ...args);
      }
    },

    /**
     * Info level - general information
     * Only logs in development
     */
    info: (...args: unknown[]): void => {
      if (isDev) {
        console.info(prefix, ...args);
      }
    },

    /**
     * Log level - alias for info
     * Only logs in development
     */
    log: (...args: unknown[]): void => {
      if (isDev) {
        console.log(prefix, ...args);
      }
    },

    /**
     * Warning level - potential issues
     * Always logs (important for production debugging)
     */
    warn: (...args: unknown[]): void => {
      console.warn(prefix, ...args);
    },

    /**
     * Error level - actual errors
     * Always logs (critical for production debugging)
     */
    error: (...args: unknown[]): void => {
      console.error(prefix, ...args);
    },
  };
}

// Default logger instance
export const logger = createLogger();

// Pre-configured loggers for different modules
export const loggers = {
  auth: createLogger({ prefix: 'Auth' }),
  player: createLogger({ prefix: 'Player' }),
  cache: createLogger({ prefix: 'Cache' }),
  api: createLogger({ prefix: 'API' }),
  app: createLogger({ prefix: 'App' }),
} as const;

export { createLogger };
