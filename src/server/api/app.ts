import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { authRouter } from './authRoutes';
import { adminRouter } from './adminRoutes';
import { businessRouter } from './businessRoutes';
import { customerRouter } from './customerRoutes';
import { resolveSessionTenantContext, TenantContext } from '../auth/tenantContext';
import { getCustomers, getCustomerById } from '../services/customerService';
import { awardStamps, redeemReward } from '../services/loyaltyService';
import { handlePaymentWebhook } from '../services/billingService';
import { webhookRateLimiter } from '../auth/rateLimiter';
import { webhookRouter } from './webhookRoutes';
import { trackingRouter } from './trackingRoutes';
import { publicRouter } from './publicRoutes';

import { requestIdMiddleware } from '../middleware/requestId';
import { checkDatabaseHealth } from '../db/client';
import { getRateLimiterStatus } from '../auth/rateLimiter';
import { errorMonitor } from '../utils/errorMonitor';

export const apiApp = express();

// Trust reverse proxy (e.g. AWS ALB, Cloudflare, NGINX) in production
if (process.env.NODE_ENV === 'production') {
  apiApp.set('trust proxy', 1);
}

// 0. Request Correlation & Access Logging
apiApp.use(requestIdMiddleware);

apiApp.use(express.json({ limit: '1mb' }));
apiApp.use(cookieParser());

// 1. Production Security Headers
apiApp.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// 2. Safe CORS / Origin Validation (Never allow wildcard * for credentialed requests)
apiApp.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  if (origin) {
    let isAllowed = false;
    if (allowedOrigins.length > 0) {
      isAllowed = allowedOrigins.includes(origin);
    } else if (!isProd) {
      // In dev and test environments, allow localhost loopback
      const host = req.headers.host;
      if (host && (origin.includes(host) || origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        isAllowed = true;
      }
    }

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Webhook-Secret, X-Reployty-Signature, X-Request-Id');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Mount Public Routes (Onboarding requests, invitation token verification & setup)
apiApp.use('/public', publicRouter);

// Mount Authentication Routes
apiApp.use('/auth', authRouter);

// Mount Provider Webhooks
apiApp.use('/webhooks', webhookRouter);

// Mount Campaign Tracking Routes (Clicks & Opens)
apiApp.use('/track', trackingRouter);
apiApp.use('/t', trackingRouter);

// Mount Public Webhook Route (Provider callback with auth & rate limiting)
apiApp.post('/billing/webhook', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const rateCheck = webhookRateLimiter.consume(ip);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: `Webhook rate limit exceeded. Retry in ${rateCheck.retryAfterSeconds}s`,
      code: 'RATE_LIMIT_EXCEEDED',
    });
    return;
  }

  // Webhook signature/secret verification
  const configuredSecret = process.env.BILLING_WEBHOOK_SECRET;
  const headerSecret = (req.headers['x-webhook-secret'] || req.headers['x-reployty-signature']) as string | undefined;

  if (configuredSecret || process.env.NODE_ENV === 'production' || headerSecret) {
    const expectedSecret = configuredSecret || 'reployty_billing_webhook_secret_2026';
    if (!headerSecret) {
      res.status(401).json({ error: 'Unauthorized: Missing webhook secret header', code: 'UNAUTHORIZED_WEBHOOK' });
      return;
    }
    try {
      const a = Buffer.from(headerSecret);
      const b = Buffer.from(expectedSecret);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.status(401).json({ error: 'Unauthorized: Invalid webhook secret', code: 'UNAUTHORIZED_WEBHOOK' });
        return;
      }
    } catch {
      res.status(401).json({ error: 'Unauthorized: Webhook verification failed', code: 'UNAUTHORIZED_WEBHOOK' });
      return;
    }
  }

  try {
    const result = await handlePaymentWebhook(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message, code: 'WEBHOOK_ERROR' });
  }
});

// Extend Express Request with verified TenantContext
export interface TenantRequest extends Request {
  tenantContext?: TenantContext;
}

/**
 * Middleware: Enforces that the request has an active, authenticated session
 * and the user is verified to be a platform Super Admin.
 */
export async function requireSuperAdminMiddleware(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.['reployty_session'] || 
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);

  if (!token) {
    res.status(401).json({ error: 'Unauthenticated: Super Admin session required', code: 'UNAUTHENTICATED' });
    return;
  }

  try {
    const ctx = await resolveSessionTenantContext(token);
    if (!ctx.isSuperAdmin) {
      res.status(403).json({ error: 'Forbidden: Super Admin access required', code: 'FORBIDDEN_SUPER_ADMIN' });
      return;
    }
    req.tenantContext = ctx;
    next();
  } catch (err: any) {
    const msg = (err.message || '').toLowerCase();
    const isUnauthenticated =
      err.name === 'TenantAuthorizationError' &&
      (msg.includes('expired') || msg.includes('invalid') || msg.includes('not exist'));
    const statusCode = isUnauthenticated ? 401 : 403;

    res.status(statusCode).json({
      error: isUnauthenticated ? 'Unauthenticated: Invalid or expired session' : (err.message || 'Super Admin authorization failed'),
      code: isUnauthenticated ? 'UNAUTHENTICATED' : 'FORBIDDEN_SUPER_ADMIN',
    });
  }
}

// Mount Super Admin Routes protected by requireSuperAdminMiddleware
apiApp.use('/admin', requireSuperAdminMiddleware, adminRouter);

/**
 * Middleware: Enforces that the request has an active, authenticated session
 * and resolves the verified TenantContext for that tenant.
 */
export async function requireAuthTenant(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.['reployty_session'] || 
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);

  if (!token) {
    res.status(401).json({ error: 'Unauthenticated: No session token provided', code: 'UNAUTHENTICATED' });
    return;
  }

  try {
    const ctx = await resolveSessionTenantContext(token);
    req.tenantContext = ctx;
    next();
  } catch (err: any) {
    const msg = (err.message || '').toLowerCase();
    const isUnauthenticated =
      err.name === 'TenantAuthorizationError' &&
      (msg.includes('expired') || msg.includes('invalid') || msg.includes('not exist'));
    const statusCode = isUnauthenticated ? 401 : 403;

    res.status(statusCode).json({
      error: isUnauthenticated ? 'Unauthenticated: Invalid or expired session' : (err.message || 'Tenant authorization failed'),
      code: isUnauthenticated ? 'UNAUTHENTICATED' : 'FORBIDDEN_TENANT',
    });
  }
}

// Mount Business Workspace Routes (Protected by requireAuthTenant)
apiApp.use('/business', requireAuthTenant, businessRouter);

// Mount Customer PWA Routes (Public QR/OTP + Customer Session Auth)
apiApp.use('/customer', customerRouter);

// ============================================================================
// Protected Tenant Endpoints (Demonstrates IDOR & Cross-Tenant Protection)
// ============================================================================

// GET /api/customers
apiApp.get('/customers', requireAuthTenant, async (req: TenantRequest, res: Response) => {
  try {
    const ctx = req.tenantContext!;
    const customers = await getCustomers(ctx, {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    });
    res.json(customers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id (Explicit IDOR Check)
apiApp.get('/customers/:id', requireAuthTenant, async (req: TenantRequest, res: Response) => {
  try {
    const ctx = req.tenantContext!;
    const customer = await getCustomerById(ctx, String(req.params.id));
    if (!customer) {
      // Return 404 if customer does not exist OR belongs to another tenant
      res.status(404).json({ error: 'Customer not found in this business tenant', code: 'NOT_FOUND' });
      return;
    }
    res.json(customer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loyalty/award-stamps
apiApp.post('/loyalty/award-stamps', requireAuthTenant, async (req: TenantRequest, res: Response) => {
  try {
    const ctx = req.tenantContext!;
    const { customerId, stamps } = req.body;
    const card = await awardStamps(ctx, customerId, Number(stamps || 1));
    res.json({ success: true, card });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/loyalty/redeem
apiApp.post('/loyalty/redeem', requireAuthTenant, async (req: TenantRequest, res: Response) => {
  try {
    const ctx = req.tenantContext!;
    const { redemptionCode } = req.body;
    const redeemed = await redeemReward(ctx, redemptionCode);
    res.json({ success: true, redemption: redeemed });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 1. Health Probe (Liveness - process is running: /health and /health/live)
apiApp.get(['/health', '/health/live'], (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    system: 'Reployty Multi-Tenant SaaS',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// 2. Readiness Probe (Readiness - checks database and critical infrastructure: /ready and /health/ready)
apiApp.get(['/ready', '/health/ready'], async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();
  const rateLimitStatus = getRateLimiterStatus();

  const isReady = dbHealth.status === 'healthy';
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? 'ready' : 'unready',
    database: {
      status: dbHealth.status,
      latencyMs: dbHealth.latencyMs,
    },
    rateLimiting: {
      backend: rateLimitStatus.backend,
      redisConfigured: rateLimitStatus.redisConfigured,
      redisConnected: rateLimitStatus.redisConnected,
    },
    timestamp: new Date().toISOString(),
  });
});

// Global Production Error Handling Middleware (no internal stacks or SQL leakage)
apiApp.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600
    ? err.status
    : typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;

  // Track error in centralized monitoring
  errorMonitor.captureException(err, {
    requestId: req.id,
    route: req.originalUrl || req.url,
    method: req.method,
    statusCode: status,
    errorCode: err.code,
  });

  const isProd = process.env.NODE_ENV === 'production';
  const safeMessage = isProd && status === 500
    ? 'An unexpected server error occurred'
    : (err.message || 'Internal server error');

  res.status(status).json({
    error: safeMessage,
    code: err.code || 'INTERNAL_ERROR',
    requestId: req.id,
  });
});

export default apiApp;
