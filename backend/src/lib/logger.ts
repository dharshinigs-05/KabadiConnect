import { env } from '../config/env.js';

type LogMeta = Record<string, unknown>;

function formatMessage(level: string, message: string, meta?: LogMeta): string {
  const base = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  return JSON.stringify(base);
}

export const logger = {
  info(message: string, meta?: LogMeta): void {
    console.log(formatMessage('info', message, meta));
  },
  warn(message: string, meta?: LogMeta): void {
    console.warn(formatMessage('warn', message, meta));
  },
  error(message: string, meta?: LogMeta): void {
    console.error(formatMessage('error', message, meta));
  },
  debug(message: string, meta?: LogMeta): void {
    if (env.NODE_ENV !== 'production') {
      console.debug(formatMessage('debug', message, meta));
    }
  },
};
