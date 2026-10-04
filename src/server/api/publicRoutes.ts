import { Router, Request, Response } from 'express';
import { onboardingSubmissionLimiter, invitationAttemptLimiter } from '../auth/rateLimiter';
import {
  submitClientOnboarding,
  verifyInvitationToken,
  completeInvitationSetup,
} from '../services/managedProvisioningService';

export const publicRouter = Router();

const COOKIE_NAME = 'reployty_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

// ============================================================================
// 1. POST /api/public/onboarding-requests
// Public Client Onboarding Form Submission
// ============================================================================
publicRouter.post('/onboarding-requests', async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const rateLimit = onboardingSubmissionLimiter.consume(ip);
  if (!rateLimit.allowed) {
    res.status(429).json({
      error: `Too many submissions. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
      code: 'RATE_LIMITED',
    });
    return;
  }

  try {
    const result = await submitClientOnboarding(req.body, { ipAddress: ip });
    // Section 12 requirement: Return professional confirmation, do not expose internal IDs/secrets
    res.status(201).json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    res.status(400).json({
      error: err.message || 'Failed to submit onboarding request',
      code: 'VALIDATION_ERROR',
    });
  }
});

// ============================================================================
// 2. GET /api/public/invitations/verify
// Verify secure owner invitation token
// ============================================================================
publicRouter.get('/invitations/verify', async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  if (!token) {
    res.status(400).json({ error: 'Invitation token is required', code: 'MISSING_TOKEN' });
    return;
  }

  const rateLimit = invitationAttemptLimiter.consume(`${ip}_verify`);
  if (!rateLimit.allowed) {
    res.status(429).json({
      error: `Too many verification attempts. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
      code: 'RATE_LIMITED',
    });
    return;
  }

  try {
    const info = await verifyInvitationToken(token);
    res.json({
      valid: true,
      businessName: info.businessName,
      ownerEmail: info.ownerEmail,
      ownerName: info.ownerName,
      category: info.businessCategory,
      expiresAt: info.expiresAt,
    });
  } catch (err: any) {
    res.status(400).json({
      valid: false,
      error: err.message || 'Invalid or expired invitation token',
      code: 'INVALID_INVITATION',
    });
  }
});

// ============================================================================
// 3. POST /api/public/invitations/complete
// Set initial password, activate owner account, and create session
// ============================================================================
publicRouter.post('/invitations/complete', async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { token, password } = req.body;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Invitation token is required', code: 'MISSING_TOKEN' });
    return;
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password is required', code: 'MISSING_PASSWORD' });
    return;
  }

  const rateLimit = invitationAttemptLimiter.consume(`${ip}_complete`);
  if (!rateLimit.allowed) {
    res.status(429).json({
      error: `Too many password setup attempts. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
      code: 'RATE_LIMITED',
    });
    return;
  }

  try {
    const setupResult = await completeInvitationSetup(token.trim(), password, { ipAddress: ip });

    // Set secure session cookie
    res.cookie(COOKIE_NAME, setupResult.sessionToken, COOKIE_OPTIONS);

    res.json({
      success: true,
      message: 'Password successfully set. Your Reployty workspace is ready.',
      sessionToken: setupResult.sessionToken,
      user: setupResult.user,
      business: setupResult.business,
    });
  } catch (err: any) {
    res.status(400).json({
      error: err.message || 'Failed to complete invitation setup',
      code: 'SETUP_FAILED',
    });
  }
});

