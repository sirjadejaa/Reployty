import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { CustomerStatus, SegmentStatus, Prisma } from '@prisma/client';
import { createAuditLog } from './auditService';
import {
  CustomerTagItem,
  CustomerNoteItem,
  CustomerTimelineItem,
  SegmentCondition,
  SegmentRuleDefinition,
  CustomerSegmentItem,
  Customer360Detail,
} from '../../types/loyalty';

// ============================================================================
// Whitelist-Based Segment Evaluator
// ============================================================================

export const ALLOWED_SEGMENT_FIELDS = [
  'joinedAt',
  'lastVisitAt',
  'totalVisits',
  'totalSpendMinor',
  'pointsBalance',
  'stampsBalance',
  'status',
  'branchId',
  'tagId',
] as const;

export const ALLOWED_SEGMENT_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'within_days',
  'before_days',
  'contains',
] as const;

export type AllowedSegmentField = (typeof ALLOWED_SEGMENT_FIELDS)[number];
export type AllowedSegmentOperator = (typeof ALLOWED_SEGMENT_OPERATORS)[number];

export function validateSegmentRuleDefinition(ruleDef: any): SegmentRuleDefinition {
  if (!ruleDef || typeof ruleDef !== 'object') {
    throw new Error('Invalid segment rule definition: must be an object');
  }

  const matchType = ruleDef.matchType === 'ANY' ? 'ANY' : 'ALL';
  const rawConditions = Array.isArray(ruleDef.conditions) ? ruleDef.conditions : [];

  const conditions: SegmentCondition[] = [];

  for (const c of rawConditions) {
    if (!c || typeof c !== 'object') continue;
    if (!ALLOWED_SEGMENT_FIELDS.includes(c.field)) {
      throw new Error(`Invalid segment field: "${c.field}". Field is not whitelisted.`);
    }
    if (!ALLOWED_SEGMENT_OPERATORS.includes(c.operator)) {
      throw new Error(`Invalid segment operator: "${c.operator}". Operator is not whitelisted.`);
    }

    conditions.push({
      field: c.field,
      operator: c.operator,
      value: c.value,
    });
  }

  return { matchType, conditions };
}

export function compileSegmentWhere(
  ruleDef: SegmentRuleDefinition,
  businessId: string
): Prisma.CustomerWhereInput {
  const clauses: Prisma.CustomerWhereInput[] = [{ businessId }];

  const now = new Date();

  const conditionClauses: Prisma.CustomerWhereInput[] = [];

  for (const c of ruleDef.conditions) {
    const { field, operator, value } = c;

    switch (field) {
      case 'totalVisits':
      case 'totalSpendMinor':
      case 'pointsBalance':
      case 'stampsBalance': {
        const numVal = Number(value) || 0;
        if (operator === 'equals') conditionClauses.push({ [field]: numVal });
        else if (operator === 'not_equals') conditionClauses.push({ [field]: { not: numVal } });
        else if (operator === 'greater_than') conditionClauses.push({ [field]: { gt: numVal } });
        else if (operator === 'greater_than_or_equal') conditionClauses.push({ [field]: { gte: numVal } });
        else if (operator === 'less_than') conditionClauses.push({ [field]: { lt: numVal } });
        else if (operator === 'less_than_or_equal') conditionClauses.push({ [field]: { lte: numVal } });
        break;
      }

      case 'status': {
        const statusVal = String(value) as CustomerStatus;
        if (operator === 'equals') conditionClauses.push({ status: statusVal });
        else if (operator === 'not_equals') conditionClauses.push({ status: { not: statusVal } });
        break;
      }

      case 'branchId': {
        const branchVal = String(value);
        if (operator === 'equals') conditionClauses.push({ branchId: branchVal });
        else if (operator === 'not_equals') conditionClauses.push({ branchId: { not: branchVal } });
        break;
      }

      case 'tagId': {
        const tagVal = String(value);
        if (operator === 'equals') {
          conditionClauses.push({ tags: { some: { tagId: tagVal } } });
        } else if (operator === 'not_equals') {
          conditionClauses.push({ tags: { none: { tagId: tagVal } } });
        }
        break;
      }

      case 'lastVisitAt':
      case 'joinedAt': {
        const days = Number(value) || 0;
        if (operator === 'within_days') {
          const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          conditionClauses.push({ [field]: { gte: cutoff } });
        } else if (operator === 'before_days') {
          const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          conditionClauses.push({ [field]: { lt: cutoff } });
        } else if (operator === 'greater_than' || operator === 'greater_than_or_equal') {
          const dt = new Date(value);
          conditionClauses.push({ [field]: { gte: dt } });
        } else if (operator === 'less_than' || operator === 'less_than_or_equal') {
          const dt = new Date(value);
          conditionClauses.push({ [field]: { lte: dt } });
        }
        break;
      }
    }
  }

  if (conditionClauses.length > 0) {
    if (ruleDef.matchType === 'ANY') {
      clauses.push({ OR: conditionClauses });
    } else {
      clauses.push({ AND: conditionClauses });
    }
  }

  return { AND: clauses };
}

// ============================================================================
// 1. Customer Directory & Listing
// ============================================================================

export interface CustomerDirectoryQuery {
  search?: string;
  status?: CustomerStatus;
  branchId?: string;
  tagId?: string;
  segmentId?: string;
  sortBy?: 'lastVisitAt' | 'totalVisits' | 'totalSpendMinor' | 'pointsBalance' | 'stampsBalance' | 'joinedAt' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  offset?: number;
}

export async function getBusinessCustomers(
  ctx: TenantContext,
  query: CustomerDirectoryQuery = {}
) {
  requirePermission(ctx, 'CUSTOMERS_VIEW');

  const {
    search,
    status,
    branchId,
    tagId,
    segmentId,
    sortBy = 'lastVisitAt',
    sortOrder = 'desc',
    page = 1,
    limit = 25,
    offset,
  } = query;

  const actualLimit = Math.min(Math.max(1, limit), 100);
  const actualSkip = offset !== undefined ? offset : (Math.max(1, page) - 1) * actualLimit;

  // Base tenant isolation filter
  let where: Prisma.CustomerWhereInput = {
    businessId: ctx.businessId,
  };

  // Status filter
  if (status) {
    where.status = status;
  }

  // Branch filter
  if (branchId) {
    where.branchId = branchId;
  }

  // Tag filter
  if (tagId) {
    where.tags = {
      some: {
        tagId,
      },
    };
  }

  // Search filter (name, phone, email)
  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
      { email: { contains: term, mode: 'insensitive' } },
    ];
  }

  // Segment filter
  if (segmentId) {
    const segment = await prisma.customerSegment.findFirst({
      where: {
        id: segmentId,
        businessId: ctx.businessId,
        status: 'ACTIVE',
      },
    });

    if (segment) {
      const validatedRules = validateSegmentRuleDefinition(segment.ruleDefinition);
      const segmentWhere = compileSegmentWhere(validatedRules, ctx.businessId);
      where = {
        AND: [where, segmentWhere],
      };
    }
  }

  // Sorting
  const allowedSortFields = [
    'lastVisitAt',
    'totalVisits',
    'totalSpendMinor',
    'pointsBalance',
    'stampsBalance',
    'joinedAt',
    'name',
  ];
  const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'lastVisitAt';
  const orderBy: Prisma.CustomerOrderByWithRelationInput = {
    [orderField]: sortOrder === 'asc' ? 'asc' : 'desc',
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: actualSkip,
      take: actualLimit,
      orderBy,
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        loyaltyCards: {
          where: { status: 'ACTIVE' },
          take: 1,
          select: {
            id: true,
            stampsCollected: true,
            totalStampsNeeded: true,
            pointsBalance: true,
            status: true,
          },
        },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const totalPages = Math.ceil(total / actualLimit);
  const currentPage = Math.floor(actualSkip / actualLimit) + 1;

  return {
    data: customers,
    pagination: {
      total,
      page: currentPage,
      limit: actualLimit,
      totalPages,
      hasMore: actualSkip + customers.length < total,
    },
  };
}

// ============================================================================
// 2. Customer 360 & Profile
// ============================================================================

export async function getCustomer360(
  ctx: TenantContext,
  customerId: string
): Promise<Customer360Detail> {
  requirePermission(ctx, 'CUSTOMERS_VIEW');

  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      businessId: ctx.businessId, // HARD TENANT ISOLATION
    },
    include: {
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      tags: {
        include: {
          tag: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      loyaltyCards: {
        where: { status: 'ACTIVE' },
        include: {
          program: {
            select: {
              id: true,
              name: true,
              type: true,
              rewardTitle: true,
            },
          },
        },
        take: 1,
      },
      consents: true,
      notes: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      },
    },
  });

  if (!customer) {
    const error: any = new Error('Customer not found in this business');
    error.code = 'CUSTOMER_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  // Aggregate redemption stats and active vouchers
  const [totalRewardsClaimed, totalRewardsRedeemed, activeVouchers, lifetimeLoyalty] = await Promise.all([
    prisma.rewardRedemption.count({
      where: {
        businessId: ctx.businessId,
        customerId,
      },
    }),
    prisma.rewardRedemption.count({
      where: {
        businessId: ctx.businessId,
        customerId,
        status: 'REDEEMED',
      },
    }),
    prisma.rewardRedemption.findMany({
      where: {
        businessId: ctx.businessId,
        customerId,
        status: 'CLAIMED',
      },
      include: {
        reward: {
          select: { id: true, title: true },
        },
      },
      orderBy: { claimedAt: 'desc' },
      take: 10,
    }),
    prisma.loyaltyTransaction.aggregate({
      where: {
        businessId: ctx.businessId,
        customerId,
      },
      _sum: {
        deltaStamps: true,
        deltaPoints: true,
      },
    }),
  ]);

  const activeCard = customer.loyaltyCards[0] || null;

  return {
    customer: {
      id: customer.id,
      businessId: customer.businessId,
      branchId: customer.branchId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      birthday: customer.birthday ? customer.birthday.toISOString() : null,
      status: customer.status,
      marketingConsent: customer.marketingConsent,
      totalVisits: customer.totalVisits,
      totalSpendMinor: customer.totalSpendMinor,
      stampsBalance: customer.stampsBalance,
      pointsBalance: customer.pointsBalance,
      joinedAt: customer.joinedAt.toISOString(),
      lastVisitAt: customer.lastVisitAt ? customer.lastVisitAt.toISOString() : null,
      branch: customer.branch,
    },
    loyalty: {
      activeCard: activeCard
        ? {
            id: activeCard.id,
            programId: activeCard.programId,
            stampsCollected: activeCard.stampsCollected,
            totalStampsNeeded: activeCard.totalStampsNeeded,
            pointsBalance: activeCard.pointsBalance,
            status: activeCard.status,
            program: activeCard.program
              ? {
                  id: activeCard.program.id,
                  name: activeCard.program.name,
                  type: activeCard.program.type,
                  rewardTitle: activeCard.program.rewardTitle,
                }
              : undefined,
          }
        : null,
      lifetimeStampsEarned: Math.max(0, lifetimeLoyalty._sum.deltaStamps || 0),
      lifetimePointsEarned: Math.max(0, lifetimeLoyalty._sum.deltaPoints || 0),
    },
    rewardsSummary: {
      totalClaimed: totalRewardsClaimed,
      totalRedeemed: totalRewardsRedeemed,
      activeVouchers: activeVouchers.map(v => ({
        id: v.id,
        redemptionCode: v.redemptionCode,
        claimedAt: v.claimedAt.toISOString(),
        expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
        reward: {
          id: v.reward.id,
          title: v.reward.title,
        },
      })),
    },
    tags: customer.tags.map(t => ({
      id: t.tag.id,
      name: t.tag.name,
      color: t.tag.color,
      assignedAt: t.createdAt.toISOString(),
    })),
    notes: customer.notes.map(n => ({
      id: n.id,
      customerId: n.customerId,
      authorId: n.authorId,
      content: n.content,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      author: n.author,
    })),
    consents: customer.consents.map(c => ({
      channel: c.channel,
      granted: c.granted,
      version: c.version,
      grantedAt: c.grantedAt.toISOString(),
    })),
  };
}

export interface UpdateCustomerProfileDTO {
  name?: string;
  email?: string | null;
  birthday?: Date | string | null;
  status?: CustomerStatus;
  branchId?: string | null;
}

export async function updateCustomerProfile(
  ctx: TenantContext,
  customerId: string,
  dto: UpdateCustomerProfileDTO
) {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const existing = await prisma.customer.findFirst({
    where: {
      id: customerId,
      businessId: ctx.businessId, // HARD TENANT ISOLATION
    },
  });

  if (!existing) {
    const error: any = new Error('Customer not found in this business');
    error.code = 'CUSTOMER_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const data: Prisma.CustomerUpdateInput = {};

  if (dto.name !== undefined) {
    const trimmed = dto.name.trim();
    if (!trimmed) throw new Error('Customer name cannot be empty');
    data.name = trimmed;
  }

  if (dto.email !== undefined) {
    data.email = dto.email ? dto.email.trim().toLowerCase() : null;
  }

  if (dto.birthday !== undefined) {
    data.birthday = dto.birthday ? new Date(dto.birthday) : null;
  }

  if (dto.status !== undefined) {
    data.status = dto.status;
  }

  if (dto.branchId !== undefined) {
    if (dto.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: dto.branchId, businessId: ctx.businessId },
      });
      if (!branch) throw new Error('Branch not found in this business');
      data.branch = { connect: { id: dto.branchId } };
    } else {
      data.branch = { disconnect: true };
    }
  }

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data,
  });

  // Audit log
  await createAuditLog(ctx, {
    action: 'CUSTOMER_UPDATED',
    entityType: 'Customer',
    entityId: customerId,
    previousState: {
      name: existing.name,
      email: existing.email,
      status: existing.status,
      branchId: existing.branchId,
    },
    newState: {
      name: updated.name,
      email: updated.email,
      status: updated.status,
      branchId: updated.branchId,
    },
  });

  return updated;
}

// ============================================================================
// 3. Unified Chronological Activity Timeline
// ============================================================================

export interface CustomerTimelineQuery {
  page?: number;
  limit?: number;
  offset?: number;
  typeFilter?: string;
}

export async function getCustomerTimeline(
  ctx: TenantContext,
  customerId: string,
  params: CustomerTimelineQuery = {}
) {
  requirePermission(ctx, 'CUSTOMERS_VIEW');

  // Verify customer belongs to tenant
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: ctx.businessId },
    select: { id: true, name: true },
  });

  if (!customer) {
    const error: any = new Error('Customer not found in this business');
    error.code = 'CUSTOMER_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const { page = 1, limit = 25, offset, typeFilter } = params;
  const actualLimit = Math.min(Math.max(1, limit), 100);
  const actualSkip = offset !== undefined ? offset : (Math.max(1, page) - 1) * actualLimit;

  // 1. Fetch CustomerEvent stream
  const events = await prisma.customerEvent.findMany({
    where: {
      businessId: ctx.businessId,
      customerId,
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  // 2. Fetch LoyaltyTransaction stream
  const loyaltyTxs = await prisma.loyaltyTransaction.findMany({
    where: {
      businessId: ctx.businessId,
      customerId,
    },
    include: {
      card: {
        include: {
          program: {
            select: { name: true, type: true },
          },
        },
      },
      branch: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  // 3. Fetch RewardRedemption stream
  const redemptions = await prisma.rewardRedemption.findMany({
    where: {
      businessId: ctx.businessId,
      customerId,
    },
    include: {
      reward: {
        select: { title: true, stampsRequired: true, pointsRequired: true },
      },
      branch: {
        select: { name: true },
      },
      redeemedBy: {
        select: { name: true, email: true },
      },
    },
    orderBy: { claimedAt: 'desc' },
    take: 300,
  });

  // 4. Fetch Staff Notes for Timeline
  const notes = await prisma.customerNote.findMany({
    where: {
      customerId,
      OR: [
        { businessId: ctx.businessId },
        { businessId: null },
      ],
    },
    include: {
      author: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  // Normalization
  const items: CustomerTimelineItem[] = [];

  for (const ev of events) {
    let title = ev.type.replace(/_/g, ' ');
    let color = '#4F6BFF';
    let label = 'Event';

    if (ev.type === 'CUSTOMER_JOINED') {
      title = 'Customer Joined';
      color = '#10B981';
      label = 'Registration';
    } else if (ev.type === 'VISIT_RECORDED') {
      title = 'Visit Recorded';
      color = '#3B82F6';
      label = 'Visit';
    } else if (ev.type === 'PURCHASE_RECORDED') {
      title = 'Purchase Recorded';
      color = '#10B981';
      label = 'Purchase';
    } else if (ev.type === 'STAMP_ADDED') {
      title = 'Stamp Added';
      color = '#10B981';
      label = 'Stamp';
    } else if (ev.type === 'POINTS_ADDED') {
      title = 'Points Added';
      color = '#10B981';
      label = 'Points';
    } else if (ev.type === 'REWARD_EARNED') {
      title = 'Reward Earned';
      color = '#8B5CF6';
      label = 'Reward';
    } else if (ev.type === 'REWARD_REDEEMED') {
      title = 'Reward Redeemed';
      color = '#6366F1';
      label = 'Reward';
    } else if (ev.type === 'CUSTOMER_BECAME_VIP') {
      title = 'Customer Became VIP';
      color = '#F59E0B';
      label = 'VIP';
    }

    items.push({
      id: `event_${ev.id}`,
      source: 'EVENT',
      type: ev.type,
      title,
      description: ev.metadata && typeof ev.metadata === 'object' ? JSON.stringify(ev.metadata) : null,
      timestamp: ev.createdAt.toISOString(),
      badgeColor: color,
      badgeLabel: label,
      metadata: (ev.metadata as Record<string, any>) || null,
      actor: null,
    });
  }

  for (const tx of loyaltyTxs) {
    let title = tx.type.replace(/_/g, ' ');
    let color = '#4F6BFF';
    const txMeta = tx.metadata as Record<string, any> | null;
    let desc: string | null = txMeta?.reason || null;

    if (tx.type === 'STAMP_ADDED') {
      title = `+${tx.deltaStamps} Stamp${tx.deltaStamps === 1 ? '' : 's'} Awarded`;
      color = '#10B981';
    } else if (tx.type === 'POINTS_EARNED') {
      title = `+${tx.deltaPoints} Points Awarded`;
      color = '#10B981';
    } else if (tx.type === 'STAMP_REDEEMED' || tx.type === 'POINTS_REDEEMED') {
      title = `Redeemed for Reward (${tx.deltaStamps ? `${tx.deltaStamps} stamps` : `${tx.deltaPoints} pts`})`;
      color = '#8B5CF6';
    } else if (tx.type === 'ADJUSTMENT') {
      title = `Balance Adjustment (${tx.deltaStamps ? `${tx.deltaStamps > 0 ? '+' : ''}${tx.deltaStamps} stamps` : `${tx.deltaPoints > 0 ? '+' : ''}${tx.deltaPoints} pts`})`;
      color = '#F59E0B';
    }

    if (tx.branch?.name) {
      desc = desc ? `${desc} (${tx.branch.name})` : `Branch: ${tx.branch.name}`;
    }

    items.push({
      id: `loyalty_${tx.id}`,
      source: 'LOYALTY',
      type: tx.type,
      title,
      description: desc,
      timestamp: tx.createdAt.toISOString(),
      badgeColor: color,
      badgeLabel: 'Loyalty',
      metadata: {
        deltaStamps: tx.deltaStamps,
        deltaPoints: tx.deltaPoints,
        branch: tx.branch?.name,
        program: tx.card?.program?.name,
      },
      actor: tx.createdByUserId || null,
    });
  }

  for (const red of redemptions) {
    const isRedeemed = red.status === 'REDEEMED';
    const isExpired = red.status === 'EXPIRED';
    const color = isRedeemed ? '#10B981' : isExpired ? '#EF4444' : '#3B82F6';
    const actionLabel = isRedeemed ? 'Redeemed' : isExpired ? 'Expired' : 'Claimed';

    items.push({
      id: `redemption_${red.id}`,
      source: 'REDEMPTION',
      type: `REWARD_${red.status}`,
      title: `Reward ${actionLabel}: ${red.reward?.title || 'Reward'}`,
      description: `Code: ${red.redemptionCode}${red.branch?.name ? ` • Branch: ${red.branch.name}` : ''}${red.redeemedBy?.name ? ` • Staff: ${red.redeemedBy.name}` : ''}`,
      timestamp: (red.redeemedAt || red.claimedAt).toISOString(),
      badgeColor: color,
      badgeLabel: 'Reward',
      metadata: {
        redemptionCode: red.redemptionCode,
        rewardTitle: red.reward?.title,
        status: red.status,
        branch: red.branch?.name,
      },
      actor: red.redeemedBy?.name || null,
    });
  }

  for (const n of notes) {
    items.push({
      id: `note_${n.id}`,
      source: 'EVENT',
      type: 'NOTE_ADDED',
      title: 'Staff Note Added',
      description: n.content,
      timestamp: n.createdAt.toISOString(),
      badgeColor: '#F59E0B',
      badgeLabel: 'Note',
      metadata: { noteId: n.id },
      actor: n.author?.name || null,
    });
  }

  // Strictly chronological: newest-first
  items.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return b.id.localeCompare(a.id);
  });

  // Filter if requested
  const filtered = typeFilter
    ? items.filter(i => i.source === typeFilter || i.type.includes(typeFilter))
    : items;

  const paginated = filtered.slice(actualSkip, actualSkip + actualLimit);

  return {
    data: paginated,
    pagination: {
      total: filtered.length,
      page: Math.floor(actualSkip / actualLimit) + 1,
      limit: actualLimit,
      hasMore: actualSkip + paginated.length < filtered.length,
    },
  };
}

// ============================================================================
// 4. Staff Notes Engine
// ============================================================================

export async function getCustomerNotes(
  ctx: TenantContext,
  customerId: string
): Promise<CustomerNoteItem[]> {
  requirePermission(ctx, 'CUSTOMERS_VIEW');

  // Verify customer belongs to tenant
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: ctx.businessId },
    select: { id: true },
  });

  if (!customer) {
    const error: any = new Error('Customer not found in this business');
    error.code = 'CUSTOMER_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const notes = await prisma.customerNote.findMany({
    where: {
      customerId,
      OR: [
        { businessId: ctx.businessId },
        { businessId: null },
      ],
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return notes.map(n => ({
    id: n.id,
    customerId: n.customerId,
    authorId: n.authorId,
    content: n.content,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    author: n.author,
  }));
}

export async function createCustomerNote(
  ctx: TenantContext,
  customerId: string,
  content: string
): Promise<CustomerNoteItem> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const trimmed = (content || '').trim();
  if (!trimmed) {
    throw new Error('Note content cannot be empty');
  }

  // Verify customer belongs to tenant
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: ctx.businessId },
    select: { id: true },
  });

  if (!customer) {
    const error: any = new Error('Customer not found in this business');
    error.code = 'CUSTOMER_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const note = await prisma.customerNote.create({
    data: {
      businessId: ctx.businessId,
      customerId,
      authorId: ctx.user.id,
      content: trimmed,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  // Audit log
  await createAuditLog(ctx, {
    action: 'CUSTOMER_NOTE_CREATED',
    entityType: 'CustomerNote',
    entityId: note.id,
    newState: { customerId, authorId: ctx.user.id, contentSnippet: trimmed.slice(0, 50) },
  });

  return {
    id: note.id,
    customerId: note.customerId,
    authorId: note.authorId,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    author: note.author,
  };
}

export async function updateCustomerNote(
  ctx: TenantContext,
  customerId: string,
  noteId: string,
  content: string
): Promise<CustomerNoteItem> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const trimmed = (content || '').trim();
  if (!trimmed) {
    throw new Error('Note content cannot be empty');
  }

  const existing = await prisma.customerNote.findFirst({
    where: {
      id: noteId,
      customerId,
      OR: [
        { businessId: ctx.businessId },
        { businessId: null },
      ],
    },
  });

  if (!existing) {
    const error: any = new Error('Note not found');
    error.code = 'NOTE_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const updated = await prisma.customerNote.update({
    where: { id: noteId },
    data: { content: trimmed },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_NOTE_UPDATED',
    entityType: 'CustomerNote',
    entityId: noteId,
    newState: { contentSnippet: trimmed.slice(0, 50) },
  });

  return {
    id: updated.id,
    customerId: updated.customerId,
    authorId: updated.authorId,
    content: updated.content,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    author: updated.author,
  };
}

export async function deleteCustomerNote(
  ctx: TenantContext,
  customerId: string,
  noteId: string
): Promise<{ success: boolean }> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const existing = await prisma.customerNote.findFirst({
    where: {
      id: noteId,
      customerId,
      OR: [
        { businessId: ctx.businessId },
        { businessId: null },
      ],
    },
  });

  if (!existing) {
    const error: any = new Error('Note not found');
    error.code = 'NOTE_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  await prisma.customerNote.delete({
    where: { id: noteId },
  });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_NOTE_DELETED',
    entityType: 'CustomerNote',
    entityId: noteId,
  });

  return { success: true };
}

// ============================================================================
// 5. Customer Tags Catalogue & Assignment
// ============================================================================

export async function getBusinessTags(ctx: TenantContext): Promise<CustomerTagItem[]> {
  requirePermission(ctx, 'CUSTOMERS_VIEW');

  const tags = await prisma.customerTag.findMany({
    where: { businessId: ctx.businessId },
    include: {
      _count: {
        select: {
          assignments: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return tags.map(t => ({
    id: t.id,
    businessId: t.businessId,
    name: t.name,
    color: t.color,
    createdAt: t.createdAt.toISOString(),
    _count: t._count,
  }));
}

export async function createBusinessTag(
  ctx: TenantContext,
  data: { name: string; color?: string }
): Promise<CustomerTagItem> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const trimmedName = (data.name || '').trim();
  if (!trimmedName) {
    throw new Error('Tag name is required');
  }

  const existing = await prisma.customerTag.findUnique({
    where: {
      businessId_name: {
        businessId: ctx.businessId,
        name: trimmedName,
      },
    },
  });

  if (existing) {
    const err: any = new Error(`Tag "${trimmedName}" already exists`);
    err.code = 'TAG_ALREADY_EXISTS';
    err.status = 409;
    throw err;
  }

  const color = data.color?.trim() || '#4F6BFF';

  const tag = await prisma.customerTag.create({
    data: {
      businessId: ctx.businessId,
      name: trimmedName,
      color,
    },
    include: {
      _count: {
        select: { assignments: true },
      },
    },
  });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_TAG_CREATED',
    entityType: 'CustomerTag',
    entityId: tag.id,
    newState: { name: tag.name, color: tag.color },
  });

  return {
    id: tag.id,
    businessId: tag.businessId,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
    _count: tag._count,
  };
}

export async function updateBusinessTag(
  ctx: TenantContext,
  tagId: string,
  data: { name?: string; color?: string }
): Promise<CustomerTagItem> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const existing = await prisma.customerTag.findFirst({
    where: { id: tagId, businessId: ctx.businessId },
  });

  if (!existing) {
    const err: any = new Error('Tag not found');
    err.code = 'TAG_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const updateData: Prisma.CustomerTagUpdateInput = {};
  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new Error('Tag name cannot be empty');
    updateData.name = trimmed;
  }
  if (data.color !== undefined) {
    updateData.color = data.color.trim();
  }

  const updated = await prisma.customerTag.update({
    where: { id: tagId },
    data: updateData,
    include: {
      _count: {
        select: { assignments: true },
      },
    },
  });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_TAG_UPDATED',
    entityType: 'CustomerTag',
    entityId: tagId,
    newState: { name: updated.name, color: updated.color },
  });

  return {
    id: updated.id,
    businessId: updated.businessId,
    name: updated.name,
    color: updated.color,
    createdAt: updated.createdAt.toISOString(),
    _count: updated._count,
  };
}

export async function deleteBusinessTag(
  ctx: TenantContext,
  tagId: string
): Promise<{ success: boolean }> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const existing = await prisma.customerTag.findFirst({
    where: { id: tagId, businessId: ctx.businessId },
  });

  if (!existing) {
    const err: any = new Error('Tag not found');
    err.code = 'TAG_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  await prisma.customerTag.delete({
    where: { id: tagId },
  });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_TAG_DELETED',
    entityType: 'CustomerTag',
    entityId: tagId,
    previousState: { name: existing.name },
  });

  return { success: true };
}

export async function assignCustomerTag(
  ctx: TenantContext,
  customerId: string,
  tagId: string
): Promise<{ success: boolean; tag: CustomerTagItem }> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  // Verify customer belongs to tenant
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: ctx.businessId },
  });
  if (!customer) {
    const err: any = new Error('Customer not found');
    err.code = 'CUSTOMER_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  // Verify tag belongs to tenant
  const tag = await prisma.customerTag.findFirst({
    where: { id: tagId, businessId: ctx.businessId },
  });
  if (!tag) {
    const err: any = new Error('Tag not found');
    err.code = 'TAG_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  // Upsert assignment
  await prisma.customerTagAssignment.upsert({
    where: {
      customerId_tagId: {
        customerId,
        tagId,
      },
    },
    create: {
      customerId,
      tagId,
    },
    update: {},
  });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_TAG_ASSIGNED',
    entityType: 'CustomerTagAssignment',
    entityId: `${customerId}_${tagId}`,
    newState: { customerId, tagId, tagName: tag.name },
  });

  return {
    success: true,
    tag: {
      id: tag.id,
      businessId: tag.businessId,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt.toISOString(),
    },
  };
}

export async function removeCustomerTag(
  ctx: TenantContext,
  customerId: string,
  tagId: string
): Promise<{ success: boolean }> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  // Verify customer belongs to tenant
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: ctx.businessId },
  });
  if (!customer) {
    const err: any = new Error('Customer not found');
    err.code = 'CUSTOMER_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  // Verify tag belongs to tenant
  const tag = await prisma.customerTag.findFirst({
    where: { id: tagId, businessId: ctx.businessId },
  });
  if (!tag) {
    const err: any = new Error('Tag not found');
    err.code = 'TAG_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  await prisma.customerTagAssignment.deleteMany({
    where: {
      customerId,
      tagId,
    },
  });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_TAG_REMOVED',
    entityType: 'CustomerTagAssignment',
    entityId: `${customerId}_${tagId}`,
    newState: { customerId, tagId, tagName: tag.name },
  });

  return { success: true };
}

// ============================================================================
// 6. Customer Segments Engine
// ============================================================================

export async function getBusinessSegments(ctx: TenantContext): Promise<CustomerSegmentItem[]> {
  requirePermission(ctx, 'CUSTOMERS_VIEW');

  const segments = await prisma.customerSegment.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { createdAt: 'desc' },
  });

  // Calculate live customer counts for each segment dynamically
  const result: CustomerSegmentItem[] = [];

  for (const seg of segments) {
    let customerCount = 0;
    try {
      const validatedRules = validateSegmentRuleDefinition(seg.ruleDefinition);
      const segmentWhere = compileSegmentWhere(validatedRules, ctx.businessId);
      customerCount = await prisma.customer.count({ where: segmentWhere });
    } catch (err) {
      console.error(`Error calculating count for segment ${seg.id}:`, err);
    }

    result.push({
      id: seg.id,
      businessId: seg.businessId,
      name: seg.name,
      description: seg.description,
      ruleDefinition: seg.ruleDefinition as unknown as SegmentRuleDefinition,
      status: seg.status,
      customerCount,
      createdAt: seg.createdAt.toISOString(),
      updatedAt: seg.updatedAt.toISOString(),
    });
  }

  return result;
}

export async function createBusinessSegment(
  ctx: TenantContext,
  data: {
    name: string;
    description?: string | null;
    ruleDefinition: SegmentRuleDefinition;
  }
): Promise<CustomerSegmentItem> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const trimmedName = (data.name || '').trim();
  if (!trimmedName) {
    throw new Error('Segment name is required');
  }

  const validatedRules = validateSegmentRuleDefinition(data.ruleDefinition);

  const segment = await prisma.customerSegment.create({
    data: {
      businessId: ctx.businessId,
      name: trimmedName,
      description: data.description ? data.description.trim() : null,
      ruleDefinition: validatedRules as unknown as Prisma.InputJsonValue,
      status: 'ACTIVE',
    },
  });

  // Calculate initial count
  const segmentWhere = compileSegmentWhere(validatedRules, ctx.businessId);
  const customerCount = await prisma.customer.count({ where: segmentWhere });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_SEGMENT_CREATED',
    entityType: 'CustomerSegment',
    entityId: segment.id,
    newState: { name: segment.name, ruleDefinition: validatedRules as unknown as Prisma.InputJsonValue },
  });

  return {
    id: segment.id,
    businessId: segment.businessId,
    name: segment.name,
    description: segment.description,
    ruleDefinition: validatedRules,
    status: segment.status,
    customerCount,
    createdAt: segment.createdAt.toISOString(),
    updatedAt: segment.updatedAt.toISOString(),
  };
}

export async function updateBusinessSegment(
  ctx: TenantContext,
  segmentId: string,
  data: {
    name?: string;
    description?: string | null;
    ruleDefinition?: SegmentRuleDefinition;
    status?: SegmentStatus;
  }
): Promise<CustomerSegmentItem> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const existing = await prisma.customerSegment.findFirst({
    where: { id: segmentId, businessId: ctx.businessId },
  });

  if (!existing) {
    const err: any = new Error('Segment not found');
    err.code = 'SEGMENT_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const updateData: Prisma.CustomerSegmentUpdateInput = {};

  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new Error('Segment name cannot be empty');
    updateData.name = trimmed;
  }

  if (data.description !== undefined) {
    updateData.description = data.description ? data.description.trim() : null;
  }

  if (data.status !== undefined) {
    updateData.status = data.status;
  }

  let finalRules = existing.ruleDefinition as unknown as SegmentRuleDefinition;
  if (data.ruleDefinition !== undefined) {
    finalRules = validateSegmentRuleDefinition(data.ruleDefinition);
    updateData.ruleDefinition = finalRules as unknown as Prisma.InputJsonValue;
  }

  const updated = await prisma.customerSegment.update({
    where: { id: segmentId },
    data: updateData,
  });

  const segmentWhere = compileSegmentWhere(finalRules, ctx.businessId);
  const customerCount = await prisma.customer.count({ where: segmentWhere });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_SEGMENT_UPDATED',
    entityType: 'CustomerSegment',
    entityId: segmentId,
    newState: { name: updated.name, status: updated.status },
  });

  return {
    id: updated.id,
    businessId: updated.businessId,
    name: updated.name,
    description: updated.description,
    ruleDefinition: finalRules,
    status: updated.status,
    customerCount,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteBusinessSegment(
  ctx: TenantContext,
  segmentId: string
): Promise<{ success: boolean }> {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const existing = await prisma.customerSegment.findFirst({
    where: { id: segmentId, businessId: ctx.businessId },
  });

  if (!existing) {
    const err: any = new Error('Segment not found');
    err.code = 'SEGMENT_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  await prisma.customerSegment.delete({
    where: { id: segmentId },
  });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_SEGMENT_DELETED',
    entityType: 'CustomerSegment',
    entityId: segmentId,
    previousState: { name: existing.name },
  });

  return { success: true };
}

export async function getSegmentCustomers(
  ctx: TenantContext,
  segmentId: string,
  params: { page?: number; limit?: number } = {}
) {
  requirePermission(ctx, 'CUSTOMERS_VIEW');

  const segment = await prisma.customerSegment.findFirst({
    where: { id: segmentId, businessId: ctx.businessId },
  });

  if (!segment) {
    const err: any = new Error('Segment not found');
    err.code = 'SEGMENT_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const { page = 1, limit = 25 } = params;
  const actualLimit = Math.min(Math.max(1, limit), 100);
  const actualSkip = (Math.max(1, page) - 1) * actualLimit;

  const validatedRules = validateSegmentRuleDefinition(segment.ruleDefinition);
  const segmentWhere = compileSegmentWhere(validatedRules, ctx.businessId);

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where: segmentWhere,
      skip: actualSkip,
      take: actualLimit,
      orderBy: { lastVisitAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        tags: { include: { tag: true } },
        loyaltyCards: { where: { status: 'ACTIVE' }, take: 1 },
      },
    }),
    prisma.customer.count({ where: segmentWhere }),
  ]);

  return {
    segment: {
      id: segment.id,
      name: segment.name,
      description: segment.description,
      status: segment.status,
    },
    data: customers,
    pagination: {
      total,
      page,
      limit: actualLimit,
      totalPages: Math.ceil(total / actualLimit),
      hasMore: actualSkip + customers.length < total,
    },
  };
}
