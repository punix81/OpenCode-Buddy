import type { LogLevel } from './config.js';

export interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
  protocol(direction: 'in' | 'out', type: string, seq: number, bytes: number): void;
}

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

// Removes content that must never reach a log: URLs, e-mail addresses, absolute
// paths and long token-like strings. Messages passed to this logger are already
// expected to contain only type names, counters and error classes.
export function sanitize(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/(?<![\w.])(?:\/[\w.-]+){2,}/g, '[path]')
    .replace(/\b[A-Za-z0-9+/_-]{40,}\b/g, '[redacted]')
    .slice(0, 200);
}

export class ConsoleLogger implements Logger {
  constructor(private readonly level: LogLevel = 'info') {}

  private emit(level: LogLevel, message: string): void {
    if (LEVELS[level] > LEVELS[this.level]) {
      return;
    }
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${sanitize(message)}`;
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  error(message: string): void {
    this.emit('error', message);
  }
  warn(message: string): void {
    this.emit('warn', message);
  }
  info(message: string): void {
    this.emit('info', message);
  }
  debug(message: string): void {
    this.emit('debug', message);
  }
  protocol(direction: 'in' | 'out', type: string, seq: number, bytes: number): void {
    this.emit('debug', `protocol ${direction} type=${type} seq=${seq} bytes=${bytes}`);
  }
}

export class NullLogger implements Logger {
  error(): void {}
  warn(): void {}
  info(): void {}
  debug(): void {}
  protocol(): void {}
}
