import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/client';
import { createAuditLog } from '../services/auditService';
import { TenantContext } from './tenantContext';

const SESSION_EXPIRY_DAYS = 7;
const RESET_TOKEN_EXPIRY_HOURS = 1;

export class AuthError extends Error {
  constructor(message: string, public code: string = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Hashes a plaintext password using bcrypt with 10 salt rounds.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, 10);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Creates a server-persisted, cryptographically secure session.
 */
export async function createSession(
  userId: string,
  businessId?: string | null,
  ipAddress?: string,
  userAgent?: string
) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // If businessId not provided, default to user's first active membership
  let activeBusinessId = businessId;
  if (!activeBusinessId) {
    const firstMembership = await prisma.staffMembership.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    activeBusinessId = firstMembership?.businessId ?? null;
  }

  const session = await prisma.session.create({
    data: {
      sessionToken,
      userId,
      businessId: activeBusinessId,
      expiresAt,
      ipAddress,
      userAgent,
    },
    include: {
      user: true,
      business: true,
    },
  });

  return session;
}

/**
 * Validates a session token.
 * Ensures the session exists, is not revoked, has not expired, and the user is ACTIVE.
 */
export async function validateSession(sessionToken: string) {
  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: {
      user: {
        include: {
          memberships: {
            where: { status: 'ACTIVE' },
            include: {
              business: true,
              branch: true,
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      },
      business: true,
    },
  });

  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.user.status !== 'ACTIVE') return null;

  return session;
}

/**
 * Revokes an active session (e.g. on logout or security change).
 */
export async function revokeSession(sessionToken: string) {
  return prisma.session.updateMany({
    where: { sessionToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revokes all active sessions for a user (e.g. on password reset or account suspension).
 */
export async function revokeAllUserSessions(userId: string) {
  return prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Switches the active tenant on a valid session.
 * CRITICAL INVARIANT: The user MUST have an active membership in targetBusinessId.
 */
export async function switchSessionTenant(
  sessionToken: string,
  targetBusinessId: string,
  auditCtx?: TenantContext
) {
  const session = await validateSession(sessionToken);
  if (!session) {
    throw new AuthError('Invalid or expired session', 'INVALID_SESSION');
  }

  // Super admins may switch to any active business; normal users MUST have an active membership
  const hasMembership = session.user.memberships.some(
    m => m.businessId === targetBusinessId && m.status === 'ACTIVE'
  );

  if (!hasMembership && !session.user.isSuperAdmin) {
    throw new AuthError(
      'Unauthorized: User does not hold an active membership in the target business',
      'UNAUTHORIZED_TENANT_SWITCH'
    );
  }

  const updatedSession = await prisma.session.update({
    where: { id: session.id },
    data: { businessId: targetBusinessId },
    include: { business: true },
  });

  if (auditCtx) {
    await createAuditLog(auditCtx, {
      action: 'BUSINESS_SWITCHED',
      entityType: 'Business',
      entityId: targetBusinessId,
      previousState: { businessId: session.businessId },
      newState: { businessId: targetBusinessId },
    });
  }

  return updatedSession;
}

/**
 * Generates a cryptographically random password reset token and stores its SHA-256 hash.
 */
export async function createPasswordResetToken(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  // Return a generic success even if user not found to prevent account enumeration
  if (!user || user.status !== 'ACTIVE') {
    return null;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt,
    },
  });

  return { rawToken, email: user.email };
}

/**
 * Resets user password with a validated single-use token and revokes existing sessions.
 */
export async function resetPasswordWithToken(rawToken: string, newPasswordPlain: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
    throw new AuthError('Invalid or expired password reset token', 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await hashPassword(newPasswordPlain);

  await prisma.$transaction(async tx => {
    // 1. Mark token as used
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // 2. Update user password
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    // 3. Revoke all existing sessions for security
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 4. Record audit log entry
    await tx.auditLog.create({
      data: {
        actorUserId: record.userId,
        action: 'PASSWORD_RESET',
        entityType: 'User',
        entityId: record.userId,
      },
    });
  });

  return { success: true, email: record.user.email };
}
