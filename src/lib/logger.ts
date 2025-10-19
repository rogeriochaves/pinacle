/**
 * Centralized logging setup using Pino
 *
 * Usage:
 * ```typescript
 * import { logger } from '@/lib/logger';
 *
 * logger.info('Something happened');
 * logger.debug({ userId: '123' }, 'User action');
 * logger.error({ err }, 'Error occurred');
 * ```
 */

import pino from "pino";

// Create base logger
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",

  // Pretty print in development
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
            singleLine: false,
          },
        }
      : undefined,

  // Base fields for all logs
  base: {
    env: process.env.NODE_ENV,
  },

  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

// Create child loggers for different modules
export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

// Pre-configured child loggers for common modules
export const proxyLogger = createModuleLogger("proxy");
export const authLogger = createModuleLogger("auth");
export const podLogger = createModuleLogger("pod-orchestration");
export const dbLogger = createModuleLogger("database");
export const workerLogger = createModuleLogger("worker");

// Export types for convenience
export type Logger = typeof logger;
