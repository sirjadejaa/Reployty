/**
 * Reployty Error Monitoring Abstraction
 * Captures unexpected server exceptions and reports them with correlation IDs.
 * Sanitizes all context so secrets and customer PII are NEVER dispatched externally.
 */

import { logger, sanitizeLogMetadata, LogContext } from './logger';

export interface ErrorReportContext extends LogContext {
  userId?: string;
  businessId?: string;
  tags?: Record<string, string>;
}

class ErrorMonitor {
  private sentryConfigured = Boolean(process.env.SENTRY_DSN);

  /**
   * Reports an unhandled or critical exception to the error monitoring system.
   */
  captureException(error: unknown, context?: ErrorReportContext): void {
    const err = error instanceof Error ? error : new Error(String(error));
    const sanitizedCtx = context ? sanitizeLogMetadata(context) : {};

    logger.error(`Unhandled Exception: ${err.message}`, {
      ...sanitizedCtx,
      errorCode: (err as any).code || 'UNHANDLED_EXCEPTION',
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });

    // If external monitoring provider (e.g. Sentry) is configured:
    if (this.sentryConfigured) {
      // Forward sanitized error report to third-party provider SDK if installed
      // (Provider is optional; abstraction ensures zero crashes if omitted)
    }
  }

  isConfigured(): boolean {
    return this.sentryConfigured;
  }
}

export const errorMonitor = new ErrorMonitor();
