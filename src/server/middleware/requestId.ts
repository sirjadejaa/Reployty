/**
 * Reployty Request Correlation & Access Logging Middleware
 * Injects or preserves a unique X-Request-Id on every incoming HTTP request.
 * Logs duration, status code, and route upon response completion.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use incoming X-Request-Id if valid or generate fresh cryptographically random ID
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.length <= 64
    ? incomingId.replace(/[^a-zA-Z0-9_-]/g, '')
    : crypto.randomUUID();

  req.id = requestId;
  req.startTime = Date.now();
  res.setHeader('X-Request-Id', requestId);

  // Log on response completion
  res.on('finish', () => {
    const durationMs = req.startTime ? Date.now() - req.startTime : 0;
    const statusCode = res.statusCode;

    // Skip noisy healthcheck spam from info logs in high-traffic production
    if (req.path === '/health' || req.path === '/api/health') {
      return;
    }

    const logMethod = statusCode >= 500 ? logger.error.bind(logger) : statusCode >= 400 ? logger.warn.bind(logger) : logger.info.bind(logger);

    logMethod(`HTTP ${req.method} ${req.originalUrl || req.url}`, {
      requestId,
      method: req.method,
      route: req.baseUrl ? `${req.baseUrl}${req.path}` : req.path,
      statusCode,
      durationMs,
      ip: req.ip || req.socket.remoteAddress,
    });
  });

  next();
}
