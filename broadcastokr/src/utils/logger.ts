type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = import.meta.env.DEV ? 'debug' : 'info';

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (LOG_LEVELS.debug >= LOG_LEVELS[MIN_LEVEL]) {
      console.debug(formatLog('debug', message, context));
    }
  },

  info(message: string, context?: LogContext) {
    if (LOG_LEVELS.info >= LOG_LEVELS[MIN_LEVEL]) {
      console.info(formatLog('info', message, context));
    }
  },

  warn(message: string, context?: LogContext) {
    if (LOG_LEVELS.warn >= LOG_LEVELS[MIN_LEVEL]) {
      console.warn(formatLog('warn', message, context));
    }
  },

  error(message: string, error?: unknown, context?: LogContext) {
    const errorContext: LogContext = { ...context };
    if (error instanceof Error) {
      errorContext.errorMessage = error.message;
      errorContext.stack = error.stack;
    } else if (error !== undefined) {
      errorContext.errorMessage = String(error);
    }
    console.error(formatLog('error', message, errorContext));
  },
};
