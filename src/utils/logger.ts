type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const PII_FIELDS = /password|token|secret|authorization|cookie|api_key/i;

function redact(obj: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.test(key)) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      cleaned[key] = redact(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

class Logger {
  private level: number;

  constructor() {
    const envLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
    this.level = LEVELS[envLevel] ?? LEVELS.info;
  }

  private log(severity: LogLevel, message: string, meta?: Record<string, any>) {
    if (LEVELS[severity] < this.level) return;

    const entry = {
      timestamp: new Date().toISOString(),
      severity: severity.toUpperCase(),
      message,
      ...(meta ? redact(meta) : {}),
    };

    const output = JSON.stringify(entry);
    if (severity === 'error' || severity === 'fatal') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }

  debug(message: string, meta?: Record<string, any>) { this.log('debug', message, meta); }
  info(message: string, meta?: Record<string, any>) { this.log('info', message, meta); }
  warn(message: string, meta?: Record<string, any>) { this.log('warn', message, meta); }
  error(message: string, meta?: Record<string, any>) { this.log('error', message, meta); }
  fatal(message: string, meta?: Record<string, any>) { this.log('fatal', message, meta); }
}

export const logger = new Logger();
