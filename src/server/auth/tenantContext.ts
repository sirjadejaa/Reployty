/**
 * Reployty Server-Side Tenant Authorization Layer
 * 
 * CRITICAL TENANT SECURITY INVARIANT:
 * Never trust business_id, tenant_id, or branch_id provided directly by the client.
 * The backend MUST always derive the business context through:
 * Authenticated Session -> User Identity -> Business Membership -> Role/Permission -> Tenant -> Resource.
 */

import { prisma } from '../db/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export interface TenantContext {
  user: AuthenticatedUser;
  businessId: string;
  businessName: string;
  businessCategory?: string;
  branchId?: string | null;
  roleName: string;
  permissions: Set<string>;
  hasPermission: (permissionCode: string) => boolean;
  isOwner: boolean;
  isSuperAdmin: boolean;
}

export class TenantAuthorizationError extends Error {
  constructor(message: string = 'Access denied: User is not authorized for this business tenant') {
    super(message);
    this.name = 'TenantAuthorizationError';
  }
}

export class PermissionDeniedError extends Error {
  constructor(permissionCode: string) {
    super(`Permission denied: Missing required permission [${permissionCode}]`);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Resolves a verified, server-side TenantContext from userId and businessId.
 * Verifies that the user has an ACTIVE membership in the requested business.
 */
export async function getTenantContext(
  userId: string,
  targetBusinessId: string,
  requestedBranchId?: string | null
): Promise<TenantContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: {
          businessId: targetBusinessId,
          status: 'ACTIVE',
        },
        include: {
          business: true,
          branch: true,
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new TenantAuthorizationError('User does not exist');
  }

  if (user.status !== 'ACTIVE') {
    throw new TenantAuthorizationError(`User account is ${user.status.toLowerCase()}`);
  }

  // SuperAdmin override if needed, otherwise verify membership
  const membership = user.memberships[0];
  if (!membership && !user.isSuperAdmin) {
    throw new TenantAuthorizationError(
      `User ${user.email} is not a member of business ${targetBusinessId}`
    );
  }

  // Check business status
  if (membership?.business && membership.business.status === 'SUSPENDED') {
    throw new TenantAuthorizationError('Business account is currently suspended');
  }

  const permissions = new Set<string>();
  if (membership?.role?.rolePermissions) {
    for (const rp of membership.role.rolePermissions) {
      permissions.add(rp.permission.code);
    }
  }

  const roleName = membership?.role?.name || (user.isSuperAdmin ? 'SUPER_ADMIN' : 'STAFF');
  const isOwner = roleName === 'OWNER' || user.isSuperAdmin;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    },
    businessId: targetBusinessId,
    businessName: membership?.business?.name || 'Reployty Platform',
    businessCategory: (membership?.business?.category || 'CAFE').toLowerCase(),
    branchId: requestedBranchId ?? membership?.branchId ?? null,
    roleName,
    permissions,
    hasPermission: (code: string) => isOwner || permissions.has(code),
    isOwner,
    isSuperAdmin: user.isSuperAdmin,
  };
}

/**
 * Resolves a verified TenantContext directly from an active session token.
 */
export async function resolveSessionTenantContext(sessionToken: string): Promise<TenantContext> {
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
    },
  });

  if (!session || session.revokedAt !== null || session.expiresAt < new Date()) {
    throw new TenantAuthorizationError('Session is invalid or expired');
  }

  if (session.user.status !== 'ACTIVE') {
    throw new TenantAuthorizationError(`User account is ${session.user.status.toLowerCase()}`);
  }

  let targetBusinessId = session.businessId;
  if (!targetBusinessId) {
    const firstMembership = session.user.memberships[0];
    targetBusinessId = firstMembership?.businessId ?? null;
  }

  if (!targetBusinessId && !session.user.isSuperAdmin) {
    throw new TenantAuthorizationError('No active business membership found for this user');
  }

  return getTenantContext(session.userId, targetBusinessId || 'platform_admin');
}

/**
 * Enforces a specific permission within the tenant context.
 */
export function requirePermission(ctx: TenantContext, permissionCode: string): void {
  if (!ctx.hasPermission(permissionCode)) {
    throw new PermissionDeniedError(permissionCode);
  }
}

/**
 * Enforces a role within the tenant context.
 */
export function requireRole(ctx: TenantContext, allowedRoles: string[]): void {
  if (!allowedRoles.includes(ctx.roleName) && !ctx.isSuperAdmin) {
    throw new TenantAuthorizationError(
      `Role [${ctx.roleName}] is not authorized for this action. Required: ${allowedRoles.join(', ')}`
    );
  }
}

/**
 * Enforces SuperAdmin platform permission.
 */
export function requireSuperAdmin(ctx: TenantContext): void {
  if (!ctx.isSuperAdmin) {
    throw new TenantAuthorizationError('SuperAdmin platform permission required');
  }
}
