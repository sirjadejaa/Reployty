import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { BusinessStatus, UserStatus, MembershipStatus } from '@prisma/client';
import { createAuditLog } from './auditService';

export interface PlatformPaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Platform Overview Metrics
 * Aggregates real metrics across the entire PostgreSQL database.
 */
export async function getPlatformOverview() {
  const [
    totalBusinesses,
    activeBusinesses,
    suspendedBusinesses,
    totalUsers,
    activeUsers,
    totalCustomers,
    totalLoyaltyCards,
    rewardsRedeemed,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { status: BusinessStatus.ACTIVE } }),
    prisma.business.count({ where: { status: BusinessStatus.SUSPENDED } }),
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.customer.count(),
    prisma.loyaltyCard.count(),
    prisma.rewardRedemption.count({ where: { status: 'REDEEMED' } }),
    prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        business: {
          select: { id: true, name: true, slug: true },
        },
      },
    }),
  ]);

  return {
    metrics: {
      totalBusinesses,
      activeBusinesses,
      suspendedBusinesses,
      totalUsers,
      activeUsers,
      totalCustomers,
      totalLoyaltyCards,
      rewardsRedeemed,
    },
    recentActivity: recentAuditLogs.map(log => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      actorName: log.actor?.name || 'System Admin',
      actorEmail: log.actor?.email || 'admin@reployty.com',
      businessName: log.business?.name || 'Global Platform',
      businessSlug: log.business?.slug || null,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}

/**
 * List Businesses with server-side pagination, search, and relation counts.
 */
export async function getPlatformBusinesses(params: PlatformPaginationParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
  const skip = (page - 1) * pageSize;

  const where: Record<string, any> = {};

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { slug: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
    ];
  }

  if (params.status && params.status !== 'ALL') {
    where.status = params.status as BusinessStatus;
  }

  if (params.category && params.category !== 'ALL') {
    where.category = params.category;
  }

  const [items, total] = await Promise.all([
    prisma.business.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            branches: true,
            staff: true,
            customers: true,
            loyaltyPrograms: true,
          },
        },
        staff: {
          where: { role: { name: 'OWNER' } },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          take: 1,
        },
      },
    }),
    prisma.business.count({ where }),
  ]);

  const mapped = items.map(biz => ({
    id: biz.id,
    name: biz.name,
    slug: biz.slug,
    category: biz.category,
    status: biz.status,
    phone: biz.phone,
    email: biz.email,
    address: biz.address,
    currency: biz.currency,
    timezone: biz.timezone,
    createdAt: biz.createdAt.toISOString(),
    ownerName: biz.staff[0]?.user?.name || 'Unassigned',
    ownerEmail: biz.staff[0]?.user?.email || null,
    branchesCount: biz._count.branches,
    staffCount: biz._count.staff,
    customersCount: biz._count.customers,
    programsCount: biz._count.loyaltyPrograms,
  }));

  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    items: mapped,
    businesses: mapped,
    total,
    totalCount: total,
    totalPages,
    page,
    pageSize,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * Get Detailed Business by ID.
 */
export async function getPlatformBusinessById(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      branches: {
        orderBy: { createdAt: 'asc' },
      },
      staff: {
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true, avatarUrl: true, status: true },
          },
          role: {
            select: { id: true, name: true, description: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      loyaltyPrograms: {
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: {
          customers: true,
          rewards: true,
          offers: true,
        },
      },
    },
  });

  if (!business) return null;

  const recentLogs = await prisma.auditLog.findMany({
    where: { businessId },
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    category: business.category,
    status: business.status,
    phone: business.phone,
    email: business.email,
    address: business.address,
    timezone: business.timezone,
    currency: business.currency,
    primaryColor: business.primaryColor,
    secondaryColor: business.secondaryColor,
    createdAt: business.createdAt.toISOString(),
    branches: business.branches.map(b => ({
      id: b.id,
      name: b.name,
      code: b.code,
      address: b.address,
      status: b.status,
      isMainBranch: b.isMainBranch,
    })),
    staff: business.staff.map(s => ({
      id: s.id,
      user: s.user,
      role: s.role.name,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
    staffMemberships: business.staff.map(s => ({
      id: s.id,
      user: s.user,
      role: s.role.name,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
    _count: business._count,
    customersCount: business._count.customers,
    rewardsCount: business._count.rewards,
    offersCount: business._count.offers,
    loyaltyPrograms: business.loyaltyPrograms.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      status: p.status,
      rewardTitle: p.rewardTitle,
      targetStamps: p.targetStamps,
    })),
    auditLogs: recentLogs.map(l => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      actorEmail: l.actor?.email || 'System',
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

/**
 * Update Business Status (ACTIVE | SUSPENDED).
 * Never permanently deletes business.
 */
export async function updatePlatformBusinessStatus(
  ctx: TenantContext,
  businessId: string,
  newStatus: BusinessStatus,
  reason?: string
) {
  const current = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!current) {
    throw new Error('Business not found');
  }

  if (current.status === newStatus) {
    return current;
  }

  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { status: newStatus },
  });

  await createAuditLog(ctx, {
    action: newStatus === BusinessStatus.SUSPENDED ? 'BUSINESS_SUSPENDED' : 'BUSINESS_REACTIVATED',
    entityType: 'Business',
    entityId: businessId,
    businessId: businessId,
    previousState: { status: current.status },
    newState: { status: newStatus, reason: reason || null },
  });

  return updated;
}

/**
 * List Users with server-side pagination, search, and memberships.
 * Critical: passwordHash is NEVER selected or returned.
 */
export async function getPlatformUsers(params: PlatformPaginationParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
  const skip = (page - 1) * pageSize;

  const where: Record<string, any> = {};

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
    ];
  }

  if (params.status && params.status !== 'ALL') {
    where.status = params.status as UserStatus;
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        status: true,
        isSuperAdmin: true,
        createdAt: true,
        memberships: {
          include: {
            business: { select: { id: true, name: true, slug: true } },
            role: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const mapped = items.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    status: u.status,
    isSuperAdmin: u.isSuperAdmin,
    createdAt: u.createdAt.toISOString(),
    memberships: u.memberships.map(m => ({
      businessId: m.business.id,
      businessName: m.business.name,
      businessSlug: m.business.slug,
      role: m.role.name,
      status: m.status,
    })),
  }));

  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    items: mapped,
    users: mapped,
    total,
    totalPages,
    page,
    pageSize,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * Update User Status (ACTIVE | SUSPENDED | DISABLED).
 * Prevents self-lockout by active Super Admin.
 */
export async function updatePlatformUserStatus(
  ctx: TenantContext,
  targetUserId: string,
  newStatus: UserStatus,
  reason?: string
) {
  // 1. Self-lockout protection invariant
  if (ctx.user.id === targetUserId) {
    throw new Error('Self-lockout prevented: You cannot suspend or disable your own active Super Admin account.');
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!target) {
    throw new Error('User not found');
  }

  if (target.status === newStatus) {
    return target;
  }

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: { status: newStatus },
      select: { id: true, name: true, email: true, status: true },
    }),
    // If user is being suspended or disabled, revoke all active sessions immediately
    ...(newStatus !== UserStatus.ACTIVE
      ? [
          prisma.session.updateMany({
            where: { userId: targetUserId, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]
      : []),
  ]);

  let action = 'USER_REACTIVATED';
  if (newStatus === UserStatus.SUSPENDED) action = 'USER_SUSPENDED';
  if (newStatus === UserStatus.DISABLED) action = 'USER_DISABLED';

  await createAuditLog(ctx, {
    action,
    entityType: 'User',
    entityId: targetUserId,
    previousState: { status: target.status },
    newState: { status: newStatus, reason: reason || null },
  });

  return updated;
}

/**
 * List Memberships across all businesses.
 */
export async function getPlatformMemberships(params: PlatformPaginationParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
  const skip = (page - 1) * pageSize;

  const where: Record<string, any> = {};

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    where.OR = [
      { user: { name: { contains: term, mode: 'insensitive' } } },
      { user: { email: { contains: term, mode: 'insensitive' } } },
      { business: { name: { contains: term, mode: 'insensitive' } } },
    ];
  }

  if (params.status && params.status !== 'ALL') {
    where.status = params.status as MembershipStatus;
  }

  const [items, total] = await Promise.all([
    prisma.staffMembership.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        business: { select: { id: true, name: true, slug: true, category: true } },
        role: { select: { id: true, name: true } },
      },
    }),
    prisma.staffMembership.count({ where }),
  ]);

  const mapped = items.map(m => ({
    id: m.id,
    userId: m.user.id,
    userName: m.user.name,
    userEmail: m.user.email,
    businessId: m.business.id,
    businessName: m.business.name,
    businessSlug: m.business.slug,
    businessCategory: m.business.category,
    role: m.role.name,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  }));

  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    items: mapped,
    memberships: mapped,
    total,
    totalPages,
    page,
    pageSize,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * Update Staff Membership Status.
 */
export async function updatePlatformMembershipStatus(
  ctx: TenantContext,
  membershipId: string,
  newStatus: MembershipStatus
) {
  const current = await prisma.staffMembership.findUnique({
    where: { id: membershipId },
    include: { business: true, user: true },
  });

  if (!current) {
    throw new Error('Membership not found');
  }

  const updated = await prisma.staffMembership.update({
    where: { id: membershipId },
    data: { status: newStatus },
  });

  await createAuditLog(ctx, {
    action: 'MEMBERSHIP_UPDATED',
    entityType: 'StaffMembership',
    entityId: membershipId,
    previousState: { status: current.status },
    newState: { status: newStatus },
  });

  return updated;
}

/**
 * List System Roles and their assigned granular permissions.
 */
export async function getPlatformRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    include: {
      rolePermissions: {
        include: { permission: true },
      },
      _count: {
        select: { memberships: true },
      },
    },
  });

  return roles.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    membershipsCount: r._count.memberships,
    permissions: r.rolePermissions.map(rp => ({
      id: rp.permission.id,
      code: rp.permission.code,
      name: rp.permission.name,
      category: rp.permission.category,
      description: rp.permission.description,
    })),
  }));
}

/**
 * List Audit Logs with filtering and pagination.
 * Secrets, password hashes, and session tokens are strictly excluded.
 */
export async function getPlatformAuditLogs(params: PlatformPaginationParams & { action?: string; businessId?: string }) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: Record<string, any> = {};

  if (params.action && params.action !== 'ALL') {
    where.action = params.action;
  }

  if (params.businessId && params.businessId !== 'ALL') {
    where.businessId = params.businessId;
  }

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    where.OR = [
      { action: { contains: term, mode: 'insensitive' } },
      { entityType: { contains: term, mode: 'insensitive' } },
      { entityId: { contains: term, mode: 'insensitive' } },
      { actor: { email: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        business: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const mapped = items.map(l => ({
    id: l.id,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    actorName: l.actor?.name || 'System',
    actorEmail: l.actor?.email || null,
    businessName: l.business?.name || 'Platform Global',
    businessSlug: l.business?.slug || null,
    ipAddress: l.ipAddress || null,
    userAgent: l.userAgent || null,
    previousState: l.previousState,
    newState: l.newState,
    createdAt: l.createdAt.toISOString(),
  }));

  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    items: mapped,
    logs: mapped,
    total,
    totalPages,
    page,
    pageSize,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * Platform Aggregate Analytics.
 * Computes database aggregations by time range (7d, 30d, 90d, all-time).
 */
export async function getPlatformAnalytics(timeRange: '7d' | '30d' | '90d' | 'all' = '30d') {
  let startDate: Date | null = null;
  const now = new Date();

  if (timeRange === '7d') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (timeRange === '30d') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (timeRange === '90d') {
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }

  const dateFilter = startDate ? { createdAt: { gte: startDate } } : {};

  const [
    newBusinessesCount,
    newUsersCount,
    newCustomersCount,
    loyaltyTransactionsCount,
    rewardRedemptionsCount,
    businessesByCategoryRaw,
  ] = await Promise.all([
    prisma.business.count({ where: dateFilter }),
    prisma.user.count({ where: dateFilter }),
    prisma.customer.count({ where: dateFilter }),
    prisma.loyaltyTransaction.count({ where: dateFilter }),
    prisma.rewardRedemption.count({ where: startDate ? { claimedAt: { gte: startDate } } : {} }),
    prisma.business.groupBy({
      by: ['category'],
      _count: { id: true },
    }),
  ]);

  return {
    timeRange,
    aggregates: {
      newBusinesses: newBusinessesCount,
      newUsers: newUsersCount,
      newCustomers: newCustomersCount,
      loyaltyTransactions: loyaltyTransactionsCount,
      rewardRedemptions: rewardRedemptionsCount,
    },
    categoryBreakdown: businessesByCategoryRaw.map(b => ({
      category: b.category,
      count: b._count.id,
    })),
  };
}
