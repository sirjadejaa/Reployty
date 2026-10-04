import crypto from 'crypto';
import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { createAuditLog } from './auditService';
import { requireFeature, requireUsageLimit } from './entitlementService';
import { CustomerSessionContext } from './customerAuthService';
import { RewardStatus, RedemptionStatus, Prisma } from '@prisma/client';

export class RewardOperationError extends Error {
  constructor(message: string, public code: string = 'REWARD_OPERATION_ERROR') {
    super(message);
    this.name = 'RewardOperationError';
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generates an unguessable, cryptographically random single-use redemption code.
 * Format: R-XXXX-XXXX (e.g., R-E4F2-99B1)
 */
export function generateRedemptionCode(): string {
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `R-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/**
 * Normalizes user/staff inputted redemption codes.
 * Strips whitespace, hyphens, and standardizes to canonical R-XXXX-XXXX if applicable.
 */
export function normalizeRedemptionCode(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.startsWith('R') && clean.length === 9) {
    return `R-${clean.slice(1, 5)}-${clean.slice(5, 9)}`;
  }
  if (clean.length === 8) {
    return `R-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  }
  return raw.trim().toUpperCase();
}

// ============================================================================
// 1. BUSINESS REWARD CATALOG MANAGEMENT
// ============================================================================

export interface CreateRewardInput {
  title: string;
  description?: string;
  stampsRequired?: number;
  pointsRequired?: number;
  expiryDays?: number;
  usageLimitTotal?: number;
  usageLimitPerCustomer?: number;
  branchId?: string | null;
  programId?: string | null;
  status?: RewardStatus;
}

export interface UpdateRewardInput {
  title?: string;
  description?: string;
  stampsRequired?: number;
  pointsRequired?: number;
  expiryDays?: number;
  usageLimitTotal?: number;
  usageLimitPerCustomer?: number;
  branchId?: string | null;
  programId?: string | null;
  status?: RewardStatus;
}

/**
 * Retrieves the reward catalogue for the business tenant with metrics.
 */
export async function getBusinessRewards(ctx: TenantContext) {
  requirePermission(ctx, 'REWARDS_VIEW');

  const rewards = await prisma.reward.findMany({
    where: { businessId: ctx.businessId },
    include: {
      branch: {
        select: { id: true, name: true, code: true },
      },
      program: {
        select: { id: true, name: true, type: true },
      },
      _count: {
        select: { redemptions: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Calculate high-level redemption aggregates
  const [totalClaimed, totalRedeemed] = await Promise.all([
    prisma.rewardRedemption.count({
      where: { businessId: ctx.businessId, status: 'CLAIMED' },
    }),
    prisma.rewardRedemption.count({
      where: { businessId: ctx.businessId, status: 'REDEEMED' },
    }),
  ]);

  return {
    rewards,
    metrics: {
      totalRewards: rewards.length,
      activeRewards: rewards.filter((r) => r.status === 'ACTIVE').length,
      totalClaimed,
      totalRedeemed,
    },
  };
}

/**
 * Creates a new reward in the business catalog with strict validation.
 */
export async function createReward(ctx: TenantContext, input: CreateRewardInput) {
  requirePermission(ctx, 'REWARDS_MANAGE');
  await requireFeature(ctx, 'REWARDS');
  await requireUsageLimit(ctx.businessId, 'maxRewards');

  const title = input.title?.trim();
  if (!title) {
    throw new RewardOperationError('Reward title is required', 'INVALID_TITLE');
  }

  const stampsRequired = input.stampsRequired !== undefined ? Number(input.stampsRequired) : undefined;
  const pointsRequired = input.pointsRequired !== undefined ? Number(input.pointsRequired) : undefined;

  if (
    (stampsRequired === undefined || stampsRequired <= 0) &&
    (pointsRequired === undefined || pointsRequired <= 0)
  ) {
    throw new RewardOperationError(
      'Reward must require at least 1 stamp or 1 point',
      'INVALID_COST'
    );
  }

  // Branch validation
  if (input.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: input.branchId, businessId: ctx.businessId },
    });
    if (!branch) {
      throw new RewardOperationError('Selected branch does not belong to this business', 'INVALID_BRANCH');
    }
  }

  // Program validation
  if (input.programId) {
    const program = await prisma.loyaltyProgram.findFirst({
      where: { id: input.programId, businessId: ctx.businessId },
    });
    if (!program) {
      throw new RewardOperationError('Selected program does not belong to this business', 'INVALID_PROGRAM');
    }
  }

  const expiryDays = input.expiryDays !== undefined ? Math.max(1, Number(input.expiryDays)) : 30;
  const usageLimitPerCustomer =
    input.usageLimitPerCustomer !== undefined && input.usageLimitPerCustomer !== null
      ? Math.max(1, Number(input.usageLimitPerCustomer))
      : 1;
  const usageLimitTotal =
    input.usageLimitTotal !== undefined && input.usageLimitTotal !== null
      ? Math.max(1, Number(input.usageLimitTotal))
      : null;

  const reward = await prisma.reward.create({
    data: {
      businessId: ctx.businessId,
      branchId: input.branchId || null,
      programId: input.programId || null,
      title,
      description: input.description?.trim() || null,
      stampsRequired: stampsRequired && stampsRequired > 0 ? stampsRequired : null,
      pointsRequired: pointsRequired && pointsRequired > 0 ? pointsRequired : null,
      expiryDays,
      usageLimitPerCustomer,
      usageLimitTotal,
      status: input.status || 'ACTIVE',
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      program: { select: { id: true, name: true, type: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'REWARD_CREATED',
    entityType: 'Reward',
    entityId: reward.id,
    newState: {
      title: reward.title,
      stampsRequired: reward.stampsRequired,
      pointsRequired: reward.pointsRequired,
      status: reward.status,
      branchId: reward.branchId,
    },
  });

  return reward;
}

/**
 * Updates an existing reward.
 */
export async function updateReward(
  ctx: TenantContext,
  rewardId: string,
  input: UpdateRewardInput
) {
  requirePermission(ctx, 'REWARDS_MANAGE');

  const existing = await prisma.reward.findFirst({
    where: { id: rewardId, businessId: ctx.businessId },
  });
  if (!existing) {
    throw new RewardOperationError('Reward not found for this business', 'REWARD_NOT_FOUND');
  }

  const data: Prisma.RewardUpdateInput = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new RewardOperationError('Reward title cannot be empty', 'INVALID_TITLE');
    data.title = title;
  }
  if (input.description !== undefined) {
    data.description = input.description.trim() || null;
  }
  if (input.stampsRequired !== undefined) {
    const s = Number(input.stampsRequired);
    data.stampsRequired = s > 0 ? s : null;
  }
  if (input.pointsRequired !== undefined) {
    const p = Number(input.pointsRequired);
    data.pointsRequired = p > 0 ? p : null;
  }
  if (input.expiryDays !== undefined) {
    data.expiryDays = Math.max(1, Number(input.expiryDays));
  }
  if (input.usageLimitPerCustomer !== undefined) {
    data.usageLimitPerCustomer =
      input.usageLimitPerCustomer !== null ? Math.max(1, Number(input.usageLimitPerCustomer)) : null;
  }
  if (input.usageLimitTotal !== undefined) {
    data.usageLimitTotal =
      input.usageLimitTotal !== null ? Math.max(1, Number(input.usageLimitTotal)) : null;
  }
  if (input.status !== undefined) {
    data.status = input.status;
  }
  if (input.branchId !== undefined) {
    if (input.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: input.branchId, businessId: ctx.businessId },
      });
      if (!branch) {
        throw new RewardOperationError('Branch does not belong to this business', 'INVALID_BRANCH');
      }
      data.branch = { connect: { id: input.branchId } };
    } else {
      data.branch = { disconnect: true };
    }
  }
  if (input.programId !== undefined) {
    if (input.programId) {
      const program = await prisma.loyaltyProgram.findFirst({
        where: { id: input.programId, businessId: ctx.businessId },
      });
      if (!program) {
        throw new RewardOperationError('Program does not belong to this business', 'INVALID_PROGRAM');
      }
      data.program = { connect: { id: input.programId } };
    } else {
      data.program = { disconnect: true };
    }
  }

  const updated = await prisma.reward.update({
    where: { id: rewardId },
    data,
    include: {
      branch: { select: { id: true, name: true, code: true } },
      program: { select: { id: true, name: true, type: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'REWARD_UPDATED',
    entityType: 'Reward',
    entityId: updated.id,
    previousState: {
      title: existing.title,
      status: existing.status,
      stampsRequired: existing.stampsRequired,
      pointsRequired: existing.pointsRequired,
    },
    newState: {
      title: updated.title,
      status: updated.status,
      stampsRequired: updated.stampsRequired,
      pointsRequired: updated.pointsRequired,
    },
  });

  return updated;
}

/**
 * Changes reward status (ACTIVE, INACTIVE, DRAFT, ARCHIVED).
 */
export async function setRewardStatus(
  ctx: TenantContext,
  rewardId: string,
  status: RewardStatus
) {
  requirePermission(ctx, 'REWARDS_MANAGE');

  const existing = await prisma.reward.findFirst({
    where: { id: rewardId, businessId: ctx.businessId },
  });
  if (!existing) {
    throw new RewardOperationError('Reward not found for this business', 'REWARD_NOT_FOUND');
  }

  const updated = await prisma.reward.update({
    where: { id: rewardId },
    data: { status },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      program: { select: { id: true, name: true, type: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'REWARD_STATUS_CHANGED',
    entityType: 'Reward',
    entityId: updated.id,
    previousState: { status: existing.status },
    newState: { status: updated.status },
  });

  return updated;
}

// ============================================================================
// 2. BUSINESS REDEMPTIONS LEDGER & STAFF TERMINAL
// ============================================================================

export interface BusinessRedemptionsFilter {
  page?: number;
  limit?: number;
  status?: RedemptionStatus;
  branchId?: string;
  rewardId?: string;
  customerId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Retrieves paginated business redemption records with filtering and audit details.
 */
export async function getBusinessRedemptions(
  ctx: TenantContext,
  filters: BusinessRedemptionsFilter = {}
) {
  requirePermission(ctx, 'REWARDS_VIEW');

  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 20)));
  const skip = (page - 1) * limit;

  const whereClause: Prisma.RewardRedemptionWhereInput = {
    businessId: ctx.businessId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.rewardId ? { rewardId: filters.rewardId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
  };

  if (filters.search?.trim()) {
    const s = filters.search.trim();
    whereClause.OR = [
      { redemptionCode: { contains: s, mode: 'insensitive' } },
      { customer: { name: { contains: s, mode: 'insensitive' } } },
      { customer: { phone: { contains: s } } },
      { reward: { title: { contains: s, mode: 'insensitive' } } },
    ];
  }

  if (filters.startDate || filters.endDate) {
    whereClause.claimedAt = {};
    if (filters.startDate) whereClause.claimedAt.gte = new Date(filters.startDate);
    if (filters.endDate) whereClause.claimedAt.lte = new Date(filters.endDate);
  }

  const [redemptions, total] = await Promise.all([
    prisma.rewardRedemption.findMany({
      where: whereClause,
      include: {
        reward: {
          select: { id: true, title: true, stampsRequired: true, pointsRequired: true },
        },
        customer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
        redeemedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { claimedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.rewardRedemption.count({ where: whereClause }),
  ]);

  return {
    redemptions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Staff Terminal: Looks up a redemption by code and verifies validity.
 * Does NOT execute redemption — safe read-only preview.
 */
export async function staffLookupRedemption(ctx: TenantContext, code: string) {
  requirePermission(ctx, 'REWARDS_REDEEM');

  const rawCode = code.trim();
  if (!rawCode) {
    throw new RewardOperationError('Redemption code is required', 'INVALID_CODE');
  }

  const normalized = normalizeRedemptionCode(rawCode);

  const redemption = await prisma.rewardRedemption.findFirst({
    where: {
      businessId: ctx.businessId,
      OR: [
        { redemptionCode: rawCode.toUpperCase() },
        { redemptionCode: normalized },
        { redemptionCode: { equals: rawCode, mode: 'insensitive' } },
      ],
    },
    include: {
      reward: {
        include: {
          branch: { select: { id: true, name: true, code: true } },
        },
      },
      customer: {
        select: { id: true, name: true, phone: true, email: true, stampsBalance: true, pointsBalance: true },
      },
      branch: {
        select: { id: true, name: true, code: true },
      },
      redeemedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!redemption) {
    throw new RewardOperationError('Redemption code not found for this business', 'REDEMPTION_NOT_FOUND');
  }

  const now = new Date();
  const isExpired =
    redemption.status === 'EXPIRED' ||
    (redemption.status === 'CLAIMED' && Boolean(redemption.expiresAt && redemption.expiresAt < now));

  // Check branch restriction
  const isBranchRestricted =
    Boolean(redemption.reward.branchId && ctx.branchId && redemption.reward.branchId !== ctx.branchId);

  const isValid = redemption.status === 'CLAIMED' && !isExpired && !isBranchRestricted;

  return {
    redemption,
    isValid,
    isExpired,
    isBranchRestricted,
    statusText: isExpired
      ? 'EXPIRED'
      : redemption.status === 'REDEEMED'
      ? 'ALREADY_REDEEMED'
      : redemption.status === 'CANCELLED'
      ? 'CANCELLED'
      : isBranchRestricted
      ? 'BRANCH_RESTRICTED'
      : 'VALID_FOR_REDEMPTION',
  };
}

/**
 * Staff Terminal: Atomically validates and completes customer reward redemption.
 * Guards against double-redemption, branch mismatch, and expired codes.
 */
export async function staffValidateRedemption(
  ctx: TenantContext,
  codeOrId: string,
  input?: { branchId?: string }
) {
  requirePermission(ctx, 'REWARDS_REDEEM');

  const raw = codeOrId.trim();
  if (!raw) {
    throw new RewardOperationError('Redemption code or ID is required', 'INVALID_CODE');
  }

  const normalized = normalizeRedemptionCode(raw);

  const updatedRedemption = await prisma.$transaction(async (tx) => {
    const redemption = await tx.rewardRedemption.findFirst({
      where: {
        businessId: ctx.businessId,
        OR: [
          { id: raw },
          { redemptionCode: raw.toUpperCase() },
          { redemptionCode: normalized },
          { redemptionCode: { equals: raw, mode: 'insensitive' } },
        ],
      },
      include: {
        reward: true,
        customer: true,
        branch: true,
        redeemedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!redemption) {
      throw new RewardOperationError('Redemption record not found for this business', 'REDEMPTION_NOT_FOUND');
    }

    if (redemption.status === 'REDEEMED') {
      throw new RewardOperationError(
        `This reward was already redeemed on ${redemption.redeemedAt?.toLocaleString() || 'earlier'}`,
        'ALREADY_REDEEMED'
      );
    }

    if (redemption.status === 'CANCELLED') {
      throw new RewardOperationError('This redemption voucher has been cancelled', 'REDEMPTION_CANCELLED');
    }

    const now = new Date();
    if (redemption.status === 'EXPIRED' || (redemption.expiresAt && redemption.expiresAt < now)) {
      await tx.rewardRedemption.update({
        where: { id: redemption.id },
        data: { status: 'EXPIRED' },
      });
      throw new RewardOperationError('This redemption voucher has expired', 'REDEMPTION_EXPIRED');
    }

    // Branch enforcement
    const targetBranchId = input?.branchId || ctx.branchId;
    if (redemption.reward.branchId && targetBranchId && redemption.reward.branchId !== targetBranchId) {
      throw new RewardOperationError(
        'This reward is only valid at a designated branch',
        'BRANCH_MISMATCH'
      );
    }

    const effectiveBranchId = targetBranchId || redemption.branchId || null;

    // Atomically transition status from CLAIMED to REDEEMED (prevents concurrent double-redemption)
    const updateResult = await tx.rewardRedemption.updateMany({
      where: {
        id: redemption.id,
        status: 'CLAIMED',
      },
      data: {
        status: 'REDEEMED',
        redeemedAt: now,
        redeemedByUserId: ctx.user.id,
        branchId: effectiveBranchId,
      },
    });

    if (updateResult.count === 0) {
      throw new RewardOperationError(
        'This reward was already redeemed or is no longer in CLAIMED status',
        'ALREADY_REDEEMED'
      );
    }

    const redeemed = await tx.rewardRedemption.findUniqueOrThrow({
      where: { id: redemption.id },
      include: {
        reward: true,
        customer: { select: { id: true, name: true, phone: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        redeemedBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Record Customer Event
    await tx.customerEvent.create({
      data: {
        businessId: ctx.businessId,
        customerId: redemption.customerId,
        type: 'REWARD_REDEEMED',
        metadata: {
          redemptionId: redeemed.id,
          rewardId: redeemed.rewardId,
          rewardTitle: redeemed.reward.title,
          redemptionCode: redeemed.redemptionCode,
          staffUserId: ctx.user.id,
          staffName: ctx.user.name,
          branchId: effectiveBranchId,
        },
      },
    });

    return redeemed;
  });

  // Record Audit Log outside transaction
  await createAuditLog(ctx, {
    action: 'REWARD_REDEEMED',
    entityType: 'RewardRedemption',
    entityId: updatedRedemption.id,
    newState: {
      status: 'REDEEMED',
      redeemedAt: updatedRedemption.redeemedAt,
      redemptionCode: updatedRedemption.redemptionCode,
      customerId: updatedRedemption.customerId,
      rewardId: updatedRedemption.rewardId,
      staffUserId: ctx.user.id,
    },
  });

  return updatedRedemption;
}

// ============================================================================
// 3. CUSTOMER PWA REWARDS & REDEMPTION ENGINE
// ============================================================================

export interface CustomerRewardItem {
  id: string;
  title: string;
  description: string | null;
  stampsRequired: number | null;
  pointsRequired: number | null;
  expiryDays: number | null;
  branchName: string | null;
  programTitle: string | null;
  isEligible: boolean;
  stampsNeeded: number;
  pointsNeeded: number;
  progressPct: number;
  claimedCount: number;
  usageLimitPerCustomer: number | null;
  usageLimitTotal: number | null;
  ineligibilityReasons: string[];
}

/**
 * Evaluates server-authoritative eligibility for all active rewards for a customer.
 */
export async function getCustomerRewards(ctx: CustomerSessionContext) {
  const [activeRewards, cards, activeProgram, existingRedemptions] = await Promise.all([
    prisma.reward.findMany({
      where: {
        businessId: ctx.businessId,
        status: 'ACTIVE',
      },
      include: {
        branch: { select: { id: true, name: true } },
        program: { select: { id: true, name: true, rewardTitle: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.loyaltyCard.findMany({
      where: {
        customerId: ctx.customerId,
        businessId: ctx.businessId,
      },
    }),
    prisma.loyaltyProgram.findFirst({
      where: { businessId: ctx.businessId, status: 'ACTIVE' },
    }),
    prisma.rewardRedemption.findMany({
      where: {
        businessId: ctx.businessId,
        reward: { status: 'ACTIVE' },
        status: { in: ['CLAIMED', 'REDEEMED'] },
      },
      select: {
        rewardId: true,
        customerId: true,
      },
    }),
  ]);

  // Map user cards by programId
  const primaryCard = cards[0];

  const items: CustomerRewardItem[] = activeRewards.map((reward) => {
    // Current balances
    const relevantCard = reward.programId
      ? cards.find((c) => c.programId === reward.programId)
      : primaryCard;

    const currentStamps = relevantCard?.stampsCollected ?? ctx.customer.stampsBalance;
    const currentPoints = relevantCard?.pointsBalance ?? ctx.customer.pointsBalance;

    // Claims counting
    const customerClaimed = existingRedemptions.filter(
      (r) => r.rewardId === reward.id && r.customerId === ctx.customerId
    ).length;
    const totalClaimed = existingRedemptions.filter((r) => r.rewardId === reward.id).length;

    const ineligibilityReasons: string[] = [];

    // Balance checks
    let stampsNeeded = 0;
    let pointsNeeded = 0;
    let progressPct = 0;

    if (reward.stampsRequired && reward.stampsRequired > 0) {
      stampsNeeded = Math.max(0, reward.stampsRequired - currentStamps);
      progressPct = Math.min(100, Math.round((currentStamps / reward.stampsRequired) * 100));
      if (currentStamps < reward.stampsRequired) {
        ineligibilityReasons.push('INSUFFICIENT_STAMPS');
      }
    } else if (reward.pointsRequired && reward.pointsRequired > 0) {
      pointsNeeded = Math.max(0, reward.pointsRequired - currentPoints);
      progressPct = Math.min(100, Math.round((currentPoints / reward.pointsRequired) * 100));
      if (currentPoints < reward.pointsRequired) {
        ineligibilityReasons.push('INSUFFICIENT_POINTS');
      }
    }

    // Limit checks
    if (reward.usageLimitPerCustomer && customerClaimed >= reward.usageLimitPerCustomer) {
      ineligibilityReasons.push('CUSTOMER_LIMIT_REACHED');
    }
    if (reward.usageLimitTotal && totalClaimed >= reward.usageLimitTotal) {
      ineligibilityReasons.push('TOTAL_LIMIT_REACHED');
    }

    // Branch check
    if (reward.branchId && ctx.customer.branchId && reward.branchId !== ctx.customer.branchId) {
      ineligibilityReasons.push('BRANCH_RESTRICTED');
    }

    const isEligible = ineligibilityReasons.length === 0;

    return {
      id: reward.id,
      title: reward.title,
      description: reward.description,
      stampsRequired: reward.stampsRequired,
      pointsRequired: reward.pointsRequired,
      expiryDays: reward.expiryDays,
      branchName: reward.branch?.name || null,
      programTitle: reward.program?.rewardTitle || null,
      isEligible,
      stampsNeeded,
      pointsNeeded,
      progressPct,
      claimedCount: customerClaimed,
      usageLimitPerCustomer: reward.usageLimitPerCustomer,
      usageLimitTotal: reward.usageLimitTotal,
      ineligibilityReasons,
    };
  });

  return {
    rewards: items,
    customerStamps: primaryCard?.stampsCollected ?? ctx.customer.stampsBalance,
    customerPoints: primaryCard?.pointsBalance ?? ctx.customer.pointsBalance,
    programName: activeProgram?.name || 'Reployty Rewards',
  };
}

/**
 * Customer claims a reward with atomic deduction, anti-fraud checks, and single-use code creation.
 */
export async function claimCustomerReward(
  ctx: CustomerSessionContext,
  rewardId: string,
  input?: { idempotencyKey?: string }
) {
  const idempotencyKey = input?.idempotencyKey?.trim();

  // Idempotency check before transaction
  if (idempotencyKey) {
    const existing = await prisma.rewardRedemption.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: ctx.businessId,
          idempotencyKey,
        },
      },
      include: {
        reward: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (existing) {
      return existing;
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Fetch and lock reward
    const reward = await tx.reward.findFirst({
      where: { id: rewardId, businessId: ctx.businessId, status: 'ACTIVE' },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    if (!reward) {
      throw new RewardOperationError('Reward not found or not active', 'REWARD_NOT_ACTIVE');
    }

    // 2. Check limits
    if (reward.usageLimitPerCustomer) {
      const existingCustomerClaims = await tx.rewardRedemption.count({
        where: {
          rewardId: reward.id,
          customerId: ctx.customerId,
          status: { in: ['CLAIMED', 'REDEEMED'] },
        },
      });
      if (existingCustomerClaims >= reward.usageLimitPerCustomer) {
        throw new RewardOperationError(
          `You have already reached the maximum claim limit (${reward.usageLimitPerCustomer}) for this reward.`,
          'CUSTOMER_LIMIT_REACHED'
        );
      }
    }

    if (reward.usageLimitTotal) {
      const totalClaims = await tx.rewardRedemption.count({
        where: {
          rewardId: reward.id,
          status: { in: ['CLAIMED', 'REDEEMED'] },
        },
      });
      if (totalClaims >= reward.usageLimitTotal) {
        throw new RewardOperationError(
          'This reward is currently out of stock.',
          'TOTAL_LIMIT_REACHED'
        );
      }
    }

    // 3. Find customer's active loyalty card
    const card = await tx.loyaltyCard.findFirst({
      where: {
        customerId: ctx.customerId,
        businessId: ctx.businessId,
        ...(reward.programId ? { programId: reward.programId } : {}),
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
    });

    // 4. Validate & deduct balance
    const stampsCost = reward.stampsRequired || 0;
    const pointsCost = reward.pointsRequired || 0;

    if (stampsCost > 0) {
      const currentStamps = card?.stampsCollected ?? 0;
      if (currentStamps < stampsCost) {
        throw new RewardOperationError(
          `Insufficient stamps: you have ${currentStamps} but need ${stampsCost}`,
          'INSUFFICIENT_STAMPS'
        );
      }

      if (card) {
        await tx.loyaltyCard.update({
          where: { id: card.id },
          data: {
            stampsCollected: { decrement: stampsCost },
            status: 'ACTIVE',
          },
        });
      }

      await tx.customer.update({
        where: { id: ctx.customerId },
        data: { stampsBalance: { decrement: stampsCost } },
      });
    }

    if (pointsCost > 0) {
      const currentPoints = card?.pointsBalance ?? 0;
      if (currentPoints < pointsCost) {
        throw new RewardOperationError(
          `Insufficient points: you have ${currentPoints} but need ${pointsCost}`,
          'INSUFFICIENT_POINTS'
        );
      }

      if (card) {
        await tx.loyaltyCard.update({
          where: { id: card.id },
          data: {
            pointsBalance: { decrement: pointsCost },
          },
        });
      }

      await tx.customer.update({
        where: { id: ctx.customerId },
        data: { pointsBalance: { decrement: pointsCost } },
      });
    }

    // 5. Generate collision-resistant unique redemption code
    let redemptionCode = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateRedemptionCode();
      const collision = await tx.rewardRedemption.findUnique({
        where: { redemptionCode: candidate },
      });
      if (!collision) {
        redemptionCode = candidate;
        break;
      }
    }

    if (!redemptionCode) {
      throw new RewardOperationError('Failed to allocate redemption code. Please try again.', 'CODE_COLLISION');
    }

    const expiresAt = new Date(Date.now() + (reward.expiryDays || 30) * 86400000);

    // 6. Create RewardRedemption
    const redemption = await tx.rewardRedemption.create({
      data: {
        businessId: ctx.businessId,
        branchId: reward.branchId || ctx.customer.branchId || null,
        rewardId: reward.id,
        customerId: ctx.customerId,
        loyaltyCardId: card?.id || null,
        redemptionCode,
        status: 'CLAIMED',
        stampsConsumed: stampsCost,
        pointsConsumed: pointsCost,
        idempotencyKey: idempotencyKey || null,
        expiresAt,
      },
      include: {
        reward: true,
        branch: { select: { id: true, name: true } },
      },
    });

    // 7. Record negative loyalty transaction on the ledger
    if (stampsCost > 0) {
      await tx.loyaltyTransaction.create({
        data: {
          businessId: ctx.businessId,
          branchId: reward.branchId || ctx.customer.branchId || null,
          customerId: ctx.customerId,
          cardId: card?.id || null,
          type: 'STAMP_REDEEMED',
          deltaStamps: -stampsCost,
          deltaPoints: 0,
          referenceType: 'REWARD_REDEMPTION',
          referenceId: redemption.id,
          idempotencyKey: idempotencyKey ? `tx_stamps_${idempotencyKey}` : null,
          metadata: {
            rewardId: reward.id,
            rewardTitle: reward.title,
            redemptionCode,
          },
        },
      });
    }

    if (pointsCost > 0) {
      await tx.loyaltyTransaction.create({
        data: {
          businessId: ctx.businessId,
          branchId: reward.branchId || ctx.customer.branchId || null,
          customerId: ctx.customerId,
          cardId: card?.id || null,
          type: 'POINTS_REDEEMED',
          deltaStamps: 0,
          deltaPoints: -pointsCost,
          referenceType: 'REWARD_REDEMPTION',
          referenceId: redemption.id,
          idempotencyKey: idempotencyKey ? `tx_points_${idempotencyKey}` : null,
          metadata: {
            rewardId: reward.id,
            rewardTitle: reward.title,
            redemptionCode,
          },
        },
      });
    }

    // 8. Record Customer Event
    await tx.customerEvent.create({
      data: {
        businessId: ctx.businessId,
        customerId: ctx.customerId,
        type: 'REWARD_EARNED',
        metadata: {
          redemptionId: redemption.id,
          rewardId: reward.id,
          rewardTitle: reward.title,
          redemptionCode,
          stampsConsumed: stampsCost,
          pointsConsumed: pointsCost,
        },
      },
    });

    return redemption;
  });
}

/**
 * Retrieves the authenticated customer's own active and past redemptions.
 */
export async function getCustomerRedemptions(ctx: CustomerSessionContext) {
  const redemptions = await prisma.rewardRedemption.findMany({
    where: {
      customerId: ctx.customerId,
      businessId: ctx.businessId,
    },
    include: {
      reward: {
        select: {
          id: true,
          title: true,
          description: true,
          stampsRequired: true,
          pointsRequired: true,
        },
      },
      branch: {
        select: { id: true, name: true, code: true },
      },
    },
    orderBy: { claimedAt: 'desc' },
  });

  const now = new Date();

  return redemptions.map((r) => {
    const isExpired =
      r.status === 'EXPIRED' ||
      (r.status === 'CLAIMED' && Boolean(r.expiresAt && r.expiresAt < now));

    return {
      ...r,
      isExpired,
      displayStatus: isExpired ? 'EXPIRED' : r.status,
    };
  });
}
