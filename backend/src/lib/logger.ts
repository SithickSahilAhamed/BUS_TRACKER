/**
 * STRUCTURED LOGGING UTILITY
 * JSON-formatted logs for production monitoring
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private formatLog(level: LogLevel, message: string, context?: any, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context }),
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: this.isDevelopment ? error.stack : undefined,
        },
      }),
    };
  }

  private output(entry: LogEntry): void {
    const logStr = JSON.stringify(entry);
    
    if (this.isDevelopment) {
      // Pretty print for development
      const colors = {
        debug: '\x1b[36m',   // Cyan
        info: '\x1b[32m',    // Green
        warn: '\x1b[33m',    // Yellow
        error: '\x1b[31m',   // Red
        fatal: '\x1b[31m',   // Red
        reset: '\x1b[0m',
      };
      const color = colors[entry.level] || colors.info;
      console.log(`${color}[${entry.level.toUpperCase()}]${colors.reset} ${entry.message}`, entry.context || '');
    } else {
      // JSON for production
      console.log(logStr);
    }
  }

  debug(message: string, context?: any) {
    this.output(this.formatLog('debug', message, context));
  }

  info(message: string, context?: any) {
    this.output(this.formatLog('info', message, context));
  }

  warn(message: string, context?: any) {
    this.output(this.formatLog('warn', message, context));
  }

  error(message: string, error?: Error, context?: any) {
    this.output(this.formatLog('error', message, context, error));
  }

  fatal(message: string, error?: Error, context?: any) {
    this.output(this.formatLog('fatal', message, context, error));
  }
}

export default new Logger();
