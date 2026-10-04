import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { Prisma } from '@prisma/client';

export interface AuditLogParams {
  action: string;
  entityType: string;
  entityId: string;
  businessId?: string | null;
  previousState?: Prisma.InputJsonValue;
  newState?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwordhash/i,
  /sessiontoken/i,
  /rawtoken/i,
  /tokenhash/i,
  /codehash/i,
  /secret/i,
  /apikey/i,
  /api[_-]?key/i,
  /otp/i,
  /cvv/i,
  /authorization/i,
  /cookie/i,
];

/**
 * Recursively redacts sensitive values (passwords, hashes, tokens, secrets)
 * before persisting state into audit logs.
 */
export function sanitizeAuditState(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;

  if (Array.isArray(val)) {
    return val.map(sanitizeAuditState);
  }

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(k));
    if (isSensitive) {
      sanitized[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = sanitizeAuditState(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

export async function createAuditLog(
  ctx: TenantContext,
  params: AuditLogParams
) {
  const targetBusinessId = params.businessId !== undefined ? params.businessId : (ctx.businessId || null);
  let validActorUserId: string | null = null;
  if (ctx.user?.id) {
    const userExists = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { id: true },
    });
    if (userExists) {
      validActorUserId = userExists.id;
    }
  }

  return prisma.auditLog.create({
    data: {
      businessId: targetBusinessId,
      actorUserId: validActorUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      previousState: params.previousState ? sanitizeAuditState(params.previousState) : undefined,
      newState: params.newState ? sanitizeAuditState(params.newState) : undefined,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}

/**
 * Creates an audit log entry for system-level, public, or pre-authentication actions
 * where a full verified TenantContext is not available.
 */
export async function createSystemAuditLog(params: {
  action: string;
  entityType: string;
  entityId: string;
  businessId?: string | null;
  actorUserId?: string | null;
  previousState?: any;
  newState?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  return prisma.auditLog.create({
    data: {
      businessId: params.businessId || null,
      actorUserId: params.actorUserId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      previousState: params.previousState ? sanitizeAuditState(params.previousState) : undefined,
      newState: params.newState ? sanitizeAuditState(params.newState) : undefined,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}

