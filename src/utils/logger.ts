/**
 * Simple logger utility for Anode ClawdBot
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private minLevel: LogLevel;
  private prefix: string;

  constructor(prefix: string = 'ClawdBot', minLevel: LogLevel = LogLevel.INFO) {
    this.prefix = prefix;
    this.minLevel = minLevel;
  }

  private log(level: LogLevel, levelName: string, ...args: any[]): void {
    if (level < this.minLevel) return;

    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] [${this.prefix}] [${levelName}]`;

    // Format args to handle Java exceptions from Javet
    // Java exceptions don't have enumerable JS properties and appear as {} when logged
    const formatted = args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}`;
      }
      if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
        try {
          // Try String() first — Java exceptions often have a meaningful toString()
          const str = String(arg);
          if (str && str !== '[object Object]') return str;
          // Try .message property
          if ('message' in arg && arg.message) return arg.message;
          // Fallback to JSON (may produce {} for Java objects)
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return arg;
    });

    console.log(message, ...formatted);
  }

  debug(...args: any[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', ...args);
  }

  info(...args: any[]): void {
    this.log(LogLevel.INFO, 'INFO', ...args);
  }

  warn(...args: any[]): void {
    this.log(LogLevel.WARN, 'WARN', ...args);
  }

  error(...args: any[]): void {
    this.log(LogLevel.ERROR, 'ERROR', ...args);
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

// Global logger instance
export const logger = new Logger('ClawdBot', LogLevel.DEBUG);
