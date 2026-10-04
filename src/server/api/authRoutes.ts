import { Router, Request, Response } from 'express';
import { UserStatus } from '@prisma/client';
import { prisma } from '../db/client';
import {
  createSession,
  validateSession,
  revokeSession,
  switchSessionTenant,
  verifyPassword,
  createPasswordResetToken,
  resetPasswordWithToken,
} from '../auth/sessionService';
import { loginRateLimiter, passwordResetRateLimiter, resetPasswordAttemptLimiter } from '../auth/rateLimiter';
import { getTenantContext } from '../auth/tenantContext';
import { createAuditLog } from '../services/auditService';

export const authRouter = Router();

const COOKIE_NAME = 'reployty_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

function getSessionToken(req: Request): string | null {
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// ============================================================================
// POST /api/auth/login
// ============================================================================
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const clientKey = `${ip}_${String(email || '').toLowerCase()}`;

  // 1. Rate Limiting Check
  const rateLimit = loginRateLimiter.consume(clientKey);
  if (!rateLimit.allowed) {
    res.status(429).json({
      error: `Too many login attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
      code: 'RATE_LIMITED',
    });
    return;
  }

  // 2. Input Validation
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required', code: 'INVALID_INPUT' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 3. Look up user
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      memberships: {
        where: { status: 'ACTIVE' },
        include: {
          business: true,
          role: true,
        },
      },
    },
  });

  // Generic failure for security (prevents user enumeration)
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    return;
  }

  // 4. Verify password
  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    return;
  }

  // 5. Account Status Check
  if (user.status !== UserStatus.ACTIVE) {
    res.status(403).json({
      error: `Your account is ${user.status.toLowerCase()}. Please contact support.`,
      code: 'ACCOUNT_INACTIVE',
    });
    return;
  }

  // Reset rate limiter on successful credentials
  loginRateLimiter.reset(clientKey);

  // 6. Create Session
  const defaultBusinessId = user.memberships[0]?.businessId ?? null;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const session = await createSession(user.id, defaultBusinessId, ip, userAgent);

  // 7. Set Secure HttpOnly Cookie
  res.cookie(COOKIE_NAME, session.sessionToken, COOKIE_OPTIONS);

  // 8. Log Audit Event
  if (defaultBusinessId) {
    const tempCtx = await getTenantContext(user.id, defaultBusinessId);
    await createAuditLog(tempCtx, {
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });
  }

  // 9. Safe DTO Response (NO passwordHash!)
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isSuperAdmin: user.isSuperAdmin,
    },
    activeBusinessId: session.businessId,
    sessionToken: session.sessionToken, // also returned for header auth
  });
});

// ============================================================================
// POST /api/auth/logout
// ============================================================================
authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const token = getSessionToken(req);
  if (token) {
    const session = await validateSession(token);
    if (session && session.businessId) {
      try {
        const tempCtx = await getTenantContext(session.userId, session.businessId);
        await createAuditLog(tempCtx, {
          action: 'LOGOUT',
          entityType: 'User',
          entityId: session.userId,
          ipAddress: req.ip,
        });
      } catch {
        // Ignore audit failure on logout
      }
    }
    await revokeSession(token);
  }

  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true, message: 'Logged out successfully' });
});

// ============================================================================
// GET /api/auth/me
// ============================================================================
authRouter.get('/me', async (req: Request, res: Response): Promise<void> => {
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthenticated', code: 'NO_SESSION' });
    return;
  }

  const session = await validateSession(token);
  if (!session) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(401).json({ error: 'Session expired or invalid', code: 'INVALID_SESSION' });
    return;
  }

  const activeBusinessId = session.businessId || session.user.memberships[0]?.businessId;
  let tenantCtx = null;

  if (activeBusinessId) {
    try {
      tenantCtx = await getTenantContext(session.userId, activeBusinessId);
    } catch {
      // Membership might have changed
    }
  }

  // Format only authorized memberships the user belongs to
  const authorizedMemberships = (session.user.memberships as any[]).map((m: any) => ({
    businessId: m.businessId,
    businessName: m.business?.name || '',
    businessSlug: m.business?.slug || '',
    category: m.business?.category || '',
    logo: m.business?.logo || null,
    role: m.role?.name || '',
    status: m.status,
  }));

  res.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
      isSuperAdmin: session.user.isSuperAdmin,
    },
    currentBusiness: tenantCtx
      ? {
          id: tenantCtx.businessId,
          name: tenantCtx.businessName,
          category: tenantCtx.businessCategory || 'cafe',
          logo: tenantCtx.businessLogo || null,
          role: tenantCtx.roleName,
          isOwner: tenantCtx.isOwner,
        }
      : null,
    memberships: authorizedMemberships,
    permissions: tenantCtx ? Array.from(tenantCtx.permissions) : [],
    isSuperAdmin: session.user.isSuperAdmin,
  });
});

// ============================================================================
// POST /api/auth/switch-tenant
// ============================================================================
authRouter.post('/switch-tenant', async (req: Request, res: Response): Promise<void> => {
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthenticated', code: 'NO_SESSION' });
    return;
  }

  const { businessId } = req.body;
  if (!businessId || typeof businessId !== 'string') {
    res.status(400).json({ error: 'businessId is required', code: 'INVALID_INPUT' });
    return;
  }

  try {
    const session = await validateSession(token);
    if (!session) {
      res.status(401).json({ error: 'Invalid session', code: 'INVALID_SESSION' });
      return;
    }

    let auditCtx: any;
    if (session.businessId) {
      try {
        auditCtx = await getTenantContext(session.userId, session.businessId);
      } catch {}
    }

    // switchSessionTenant checks that the user holds an ACTIVE membership in businessId
    await switchSessionTenant(token, businessId, auditCtx);

    const newCtx = await getTenantContext(session.userId, businessId);

    res.json({
      success: true,
      currentBusiness: {
        id: newCtx.businessId,
        name: newCtx.businessName,
        category: newCtx.businessCategory || 'cafe',
        role: newCtx.roleName,
        isOwner: newCtx.isOwner,
      },
      permissions: Array.from(newCtx.permissions),
    });
  } catch (err: any) {
    res.status(403).json({
      error: err.message || 'Unauthorized to switch to this business',
      code: 'UNAUTHORIZED_TENANT',
    });
  }
});

// ============================================================================
// POST /api/auth/forgot-password
// ============================================================================
authRouter.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  const ip = req.ip || '127.0.0.1';

  const rateLimit = passwordResetRateLimiter.consume(ip);
  if (!rateLimit.allowed) {
    res.status(429).json({
      error: `Too many password reset requests. Please try again later.`,
      code: 'RATE_LIMITED',
    });
    return;
  }

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Valid email is required', code: 'INVALID_INPUT' });
    return;
  }

  const resetResult = await createPasswordResetToken(email);

  // Return generic confirmation regardless of email existence to prevent user enumeration
  res.json({
    success: true,
    message: 'If an active account exists for this email, password reset instructions have been dispatched.',
    // For development convenience only:
    devToken: process.env.NODE_ENV === 'development' && resetResult ? resetResult.rawToken : undefined,
  });
});

// ============================================================================
// POST /api/auth/reset-password
// ============================================================================
authRouter.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const rateLimit = resetPasswordAttemptLimiter.consume(ip);
  if (!rateLimit.allowed) {
    res.status(429).json({
      error: `Too many password reset attempts. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
      code: 'RATE_LIMITED',
    });
    return;
  }

  const { token, newPassword } = req.body;

  if (!token || typeof token !== 'string' || !newPassword || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'Token and new password are required', code: 'INVALID_INPUT' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({
      error: 'Password must be at least 8 characters long',
      code: 'WEAK_PASSWORD',
    });
    return;
  }

  try {
    await resetPasswordWithToken(token, newPassword);
    res.json({
      success: true,
      message: 'Password has been successfully reset. Please log in with your new password.',
    });
  } catch (err: any) {
    res.status(400).json({
      error: err.message || 'Invalid or expired token',
      code: 'INVALID_TOKEN',
    });
  }
});
