/**
 * Reployty Structured Production Logging Layer
 * Enforces JSON formatting in production, correlation tracking, and strict
 * PII/secret scrubbing so credentials and tokens are NEVER written to logs.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'security';

export interface LogContext {
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  businessId?: string;
  userId?: string;
  errorCode?: string;
  [key: string]: any;
}

const SENSITIVE_KEY_REGEX = /(password|hash|secret|token|otp|authorization|cookie|session|key|credential|signature)/i;

/**
 * Recursively scrubs sensitive fields from log metadata objects.
 */
export function sanitizeLogMetadata(data: any, depth = 0): any {
  if (depth > 5 || data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogMetadata(item, depth + 1));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogMetadata(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

class Logger {
  private isProd = process.env.NODE_ENV === 'production';

  private output(level: LogLevel, message: string, context?: LogContext) {
    const sanitizedCtx = context ? sanitizeLogMetadata(context) : undefined;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      environment: process.env.NODE_ENV || 'development',
      ...sanitizedCtx,
    };

    if (this.isProd) {
      // In production, emit single-line structured JSON for log aggregators (CloudWatch, Datadog, etc.)
      const json = JSON.stringify(entry);
      if (level === 'error') {
        console.error(json);
      } else if (level === 'warn') {
        console.warn(json);
      } else {
        console.log(json);
      }
    } else {
      // Clean readable format for local development & testing
      const reqInfo = entry.requestId ? `[${entry.requestId}] ` : '';
      const statusInfo = entry.statusCode ? `${entry.statusCode} ` : '';
      const methodInfo = entry.method ? `${entry.method} ` : '';
      const routeInfo = entry.route ? `${entry.route} ` : '';
      const durInfo = entry.durationMs !== undefined ? `(${entry.durationMs}ms)` : '';

      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] ${reqInfo}`;
      const line = `${prefix}${message} ${methodInfo}${routeInfo}${statusInfo}${durInfo}`.trim();

      if (level === 'error') {
        console.error(line);
      } else if (level === 'warn') {
        console.warn(line);
      } else {
        console.log(line);
      }
    }
  }

  info(message: string, context?: LogContext) {
    this.output('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.output('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.output('error', message, context);
  }

  security(message: string, context?: LogContext) {
    this.output('security', `[SECURITY ALERT] ${message}`, context);
  }
}

export const logger = new Logger();
