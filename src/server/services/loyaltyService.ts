import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { createAuditLog } from './auditService';
import { CustomerSessionContext } from './customerAuthService';
import { LoyaltyType, ProgramStatus, LoyaltyTransactionType, Prisma } from '@prisma/client';

export class LoyaltyOperationError extends Error {
  constructor(message: string, public code: string = 'LOYALTY_OPERATION_ERROR') {
    super(message);
    this.name = 'LoyaltyOperationError';
  }
}

// ============================================================================
// 1. BUSINESS LOYALTY PROGRAM MANAGEMENT
// ============================================================================

export interface UpsertLoyaltyProgramInput {
  id?: string;
  name: string;
  type: LoyaltyType;
  targetStamps?: number;
  pointsPerCurrencyMinor?: number;
  rewardTitle: string;
  status?: ProgramStatus;
  rulesConfig?: Prisma.InputJsonValue;
}

/**
 * Retrieves the loyalty program for the current business tenant,
 * along with participation metrics.
 */
export async function getBusinessLoyaltyProgram(ctx: TenantContext) {
  requirePermission(ctx, 'LOYALTY_VIEW');

  // Fetch active program (or most recently updated program if none is active)
  const activeProgram = await prisma.loyaltyProgram.findFirst({
    where: {
      businessId: ctx.businessId,
      status: 'ACTIVE',
    },
    include: {
      _count: {
        select: { cards: true },
      },
    },
  });

  const allPrograms = await prisma.loyaltyProgram.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: { cards: true },
      },
    },
  });

  // Calculate real participation aggregates
  const [totalCards, totalStampsAwarded, totalPointsEarned, transactionCount] = await Promise.all([
    prisma.loyaltyCard.count({
      where: { businessId: ctx.businessId },
    }),
    prisma.loyaltyTransaction.aggregate({
      where: {
        businessId: ctx.businessId,
        deltaStamps: { gt: 0 },
      },
      _sum: { deltaStamps: true },
    }),
    prisma.loyaltyTransaction.aggregate({
      where: {
        businessId: ctx.businessId,
        deltaPoints: { gt: 0 },
      },
      _sum: { deltaPoints: true },
    }),
    prisma.loyaltyTransaction.count({
      where: { businessId: ctx.businessId },
    }),
  ]);

  return {
    activeProgram,
    programs: allPrograms,
    metrics: {
      totalCards,
      totalStampsAwarded: totalStampsAwarded._sum.deltaStamps || 0,
      totalPointsEarned: totalPointsEarned._sum.deltaPoints || 0,
      transactionCount,
    },
  };
}

/**
 * Creates or updates a loyalty program with strict validation.
 * Enforces the One Active Primary Program invariant per business.
 */
export async function upsertLoyaltyProgram(
  ctx: TenantContext,
  input: UpsertLoyaltyProgramInput
) {
  requirePermission(ctx, 'LOYALTY_MANAGE');

  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new LoyaltyOperationError('Program name is required', 'VALIDATION_ERROR');
  }

  if (!['STAMP', 'POINTS'].includes(input.type)) {
    throw new LoyaltyOperationError('Program type must be STAMP or POINTS', 'VALIDATION_ERROR');
  }

  const trimmedReward = input.rewardTitle?.trim();
  if (!trimmedReward) {
    throw new LoyaltyOperationError('Reward title is required', 'VALIDATION_ERROR');
  }

  let targetStamps: number | null = null;
  let pointsPerCurrencyMinor: number | null = null;

  if (input.type === 'STAMP') {
    targetStamps = Number(input.targetStamps || 10);
    if (!Number.isInteger(targetStamps) || targetStamps <= 0 || targetStamps > 100) {
      throw new LoyaltyOperationError('Stamp goal must be an integer between 1 and 100', 'VALIDATION_ERROR');
    }
  } else if (input.type === 'POINTS') {
    pointsPerCurrencyMinor = Number(input.pointsPerCurrencyMinor || 1000);
    if (!Number.isInteger(pointsPerCurrencyMinor) || pointsPerCurrencyMinor <= 0) {
      throw new LoyaltyOperationError('Points conversion rate must be a positive integer in minor currency units', 'VALIDATION_ERROR');
    }
  }

  const desiredStatus: ProgramStatus = input.status || 'ACTIVE';

  return prisma.$transaction(async tx => {
    // Enforce One Active Program rule:
    // If making this program ACTIVE, pause other active programs for this business
    if (desiredStatus === 'ACTIVE') {
      await tx.loyaltyProgram.updateMany({
        where: {
          businessId: ctx.businessId,
          status: 'ACTIVE',
          ...(input.id ? { id: { not: input.id } } : {}),
        },
        data: { status: 'PAUSED' },
      });
    }

    let program;
    let isNew = false;

    if (input.id) {
      // Verify program exists and belongs to this business tenant
      const existing = await tx.loyaltyProgram.findFirst({
        where: { id: input.id, businessId: ctx.businessId },
      });
      if (!existing) {
        throw new LoyaltyOperationError('Loyalty program not found in this business', 'NOT_FOUND');
      }

      program = await tx.loyaltyProgram.update({
        where: { id: existing.id },
        data: {
          name: trimmedName,
          type: input.type,
          targetStamps,
          pointsPerCurrencyMinor,
          rewardTitle: trimmedReward,
          status: desiredStatus,
          rulesConfig: input.rulesConfig !== undefined 
            ? (input.rulesConfig as Prisma.InputJsonValue) 
            : (existing.rulesConfig as Prisma.InputJsonValue ?? Prisma.JsonNull),
        },
      });
    } else {
      isNew = true;
      program = await tx.loyaltyProgram.create({
        data: {
          businessId: ctx.businessId,
          name: trimmedName,
          type: input.type,
          targetStamps,
          pointsPerCurrencyMinor,
          rewardTitle: trimmedReward,
          status: desiredStatus,
          rulesConfig: input.rulesConfig || Prisma.JsonNull,
        },
      });
    }

    await createAuditLog(ctx, {
      action: isNew ? 'LOYALTY_PROGRAM_CREATED' : 'LOYALTY_PROGRAM_UPDATED',
      entityType: 'LoyaltyProgram',
      entityId: program.id,
      newState: {
        name: program.name,
        type: program.type,
        status: program.status,
        targetStamps: program.targetStamps,
        pointsPerCurrencyMinor: program.pointsPerCurrencyMinor,
      },
    });

    return program;
  });
}

/**
 * Activates or deactivates / pauses a loyalty program.
 */
export async function setLoyaltyProgramStatus(
  ctx: TenantContext,
  programId: string,
  status: ProgramStatus
) {
  requirePermission(ctx, 'LOYALTY_MANAGE');

  return prisma.$transaction(async tx => {
    const program = await tx.loyaltyProgram.findFirst({
      where: { id: programId, businessId: ctx.businessId },
    });

    if (!program) {
      throw new LoyaltyOperationError('Loyalty program not found in this business tenant', 'NOT_FOUND');
    }

    // If activating, pause any other active program to preserve single-active invariant
    if (status === 'ACTIVE') {
      await tx.loyaltyProgram.updateMany({
        where: {
          businessId: ctx.businessId,
          status: 'ACTIVE',
          id: { not: program.id },
        },
        data: { status: 'PAUSED' },
      });
    }

    const updated = await tx.loyaltyProgram.update({
      where: { id: program.id },
      data: { status },
    });

    await createAuditLog(ctx, {
      action: status === 'ACTIVE' ? 'LOYALTY_PROGRAM_ACTIVATED' : 'LOYALTY_PROGRAM_DEACTIVATED',
      entityType: 'LoyaltyProgram',
      entityId: program.id,
      previousState: { status: program.status },
      newState: { status },
    });

    return updated;
  });
}

// ============================================================================
// 2. STAFF LOYALTY AWARDING & ADJUSTMENT TERMINAL
// ============================================================================

export interface AwardStampsInput {
  customerId: string;
  stampsToAdd?: number;
  idempotencyKey?: string;
  branchId?: string | null;
}

/**
 * Awards stamps to a customer card inside an atomic transaction.
 * Enforces server-side permissions, tenant isolation, branch validity,
 * idempotency, and immutable ledger recording.
 */
export async function awardStamps(
  ctx: TenantContext,
  input: AwardStampsInput | string,
  legacyStampsCount?: number
) {
  // Support both object input and legacy signature: (ctx, customerId, stampsToAdd)
  const normalizedInput: AwardStampsInput = typeof input === 'string'
    ? { customerId: input, stampsToAdd: legacyStampsCount ?? 1 }
    : input;

  requirePermission(ctx, 'LOYALTY_MANAGE');

  const stampsToAdd = Number(normalizedInput.stampsToAdd ?? 1);
  if (!Number.isInteger(stampsToAdd) || stampsToAdd <= 0) {
    throw new LoyaltyOperationError('Stamp count must be a positive integer', 'INVALID_QUANTITY');
  }

  if (stampsToAdd > 100) {
    throw new LoyaltyOperationError('Cannot award more than 100 stamps in a single transaction', 'EXCESSIVE_QUANTITY');
  }

  // Idempotency check: If an idempotencyKey was provided, check if already recorded
  if (normalizedInput.idempotencyKey) {
    const existingTx = await prisma.loyaltyTransaction.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: ctx.businessId,
          idempotencyKey: normalizedInput.idempotencyKey,
        },
      },
      include: { card: true },
    });

    if (existingTx && existingTx.card) {
      return existingTx.card;
    }
  }

  return prisma.$transaction(async tx => {
    // 1. Verify customer belongs to this business tenant
    const customer = await tx.customer.findFirst({
      where: {
        id: normalizedInput.customerId,
        businessId: ctx.businessId,
      },
    });

    if (!customer) {
      throw new LoyaltyOperationError('Customer not found in this business tenant', 'CUSTOMER_NOT_FOUND');
    }

    // 2. Resolve branch context if specified
    const branchId = normalizedInput.branchId || ctx.branchId || null;
    if (branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, businessId: ctx.businessId },
      });
      if (!branch) {
        throw new LoyaltyOperationError('Branch not found in this business tenant', 'BRANCH_NOT_FOUND');
      }
    }

    // 3. Fetch active STAMP loyalty program
    const program = await tx.loyaltyProgram.findFirst({
      where: {
        businessId: ctx.businessId,
        status: 'ACTIVE',
        type: 'STAMP',
      },
    });

    if (!program) {
      throw new LoyaltyOperationError('No active stamp loyalty program found for this business', 'PROGRAM_NOT_FOUND');
    }

    const targetStamps = program.targetStamps || 10;

    // 4. Ensure loyalty card exists atomically with ON CONFLICT DO NOTHING to avoid race conditions
    await tx.$executeRaw`
      INSERT INTO loyalty_cards (id, "businessId", "customerId", "programId", "totalStampsNeeded", "stampsCollected", "pointsBalance", status, "issuedAt", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${ctx.businessId}, ${customer.id}, ${program.id}, ${targetStamps}, 0, 0, 'ACTIVE'::"CardStatus", NOW(), NOW(), NOW())
      ON CONFLICT ("customerId", "programId") DO NOTHING
    `;

    const card = await tx.loyaltyCard.findUniqueOrThrow({
      where: {
        customerId_programId: {
          customerId: customer.id,
          programId: program.id,
        },
      },
    });

    // 5. Update card progress atomically
    const updatedCard = await tx.loyaltyCard.update({
      where: { id: card.id },
      data: {
        stampsCollected: { increment: stampsToAdd },
      },
    });

    const newStamps = updatedCard.stampsCollected;
    const isCompleted = newStamps >= targetStamps;
    if (isCompleted && updatedCard.status !== 'COMPLETED') {
      await tx.loyaltyCard.update({
        where: { id: card.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    // 6. Update customer stamp balance & visit metrics
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        stampsBalance: { increment: stampsToAdd },
        totalVisits: { increment: 1 },
        lastVisitAt: new Date(),
        status: customer.status === 'INACTIVE' ? 'ACTIVE' : customer.status,
      },
    });

    // 7. Record immutable transaction log with idempotencyKey
    await tx.loyaltyTransaction.create({
      data: {
        businessId: ctx.businessId,
        branchId,
        customerId: customer.id,
        cardId: card.id,
        type: 'STAMP_ADDED',
        deltaStamps: stampsToAdd,
        deltaPoints: 0,
        idempotencyKey: normalizedInput.idempotencyKey || null,
        createdByUserId: ctx.user.id,
        metadata: {
          previousCount: card.stampsCollected,
          newCount: newStamps,
          targetStamps,
        },
      },
    });

    // 8. Record Customer Event
    await tx.customerEvent.create({
      data: {
        businessId: ctx.businessId,
        customerId: customer.id,
        type: 'STAMP_ADDED',
        metadata: {
          stampsAwarded: stampsToAdd,
          cardCompleted: isCompleted,
          totalStamps: newStamps,
        },
      },
    });

    // 9. Record Audit Log
    await createAuditLog(ctx, {
      action: 'LOYALTY_STAMP_AWARDED',
      entityType: 'LoyaltyCard',
      entityId: card.id,
      newState: {
        deltaStamps: stampsToAdd,
        stampsCollected: newStamps,
        customerId: customer.id,
      },
    });

    return updatedCard;
  });
}

export interface AwardPointsInput {
  customerId: string;
  purchaseAmountMinor: number;
  idempotencyKey?: string;
  branchId?: string | null;
}

/**
 * Awards loyalty points based on integer purchase amount.
 * Uses integer arithmetic strictly: points = floor(amountMinor / pointsPerCurrencyMinor).
 */
export async function awardPoints(ctx: TenantContext, input: AwardPointsInput) {
  requirePermission(ctx, 'LOYALTY_MANAGE');

  const purchaseAmountMinor = Number(input.purchaseAmountMinor);
  if (!Number.isInteger(purchaseAmountMinor) || purchaseAmountMinor <= 0) {
    throw new LoyaltyOperationError('Purchase amount must be a positive integer in minor units', 'INVALID_AMOUNT');
  }

  // Idempotency check
  if (input.idempotencyKey) {
    const existingTx = await prisma.loyaltyTransaction.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: ctx.businessId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      include: { card: true },
    });

    if (existingTx && existingTx.card) {
      return existingTx.card;
    }
  }

  return prisma.$transaction(async tx => {
    // 1. Verify customer belongs to this business tenant
    const customer = await tx.customer.findFirst({
      where: {
        id: input.customerId,
        businessId: ctx.businessId,
      },
    });

    if (!customer) {
      throw new LoyaltyOperationError('Customer not found in this business tenant', 'CUSTOMER_NOT_FOUND');
    }

    // 2. Resolve branch context
    const branchId = input.branchId || ctx.branchId || null;
    if (branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, businessId: ctx.businessId },
      });
      if (!branch) {
        throw new LoyaltyOperationError('Branch not found in this business tenant', 'BRANCH_NOT_FOUND');
      }
    }

    // 3. Fetch active POINTS loyalty program
    const program = await tx.loyaltyProgram.findFirst({
      where: {
        businessId: ctx.businessId,
        status: 'ACTIVE',
        type: 'POINTS',
      },
    });

    if (!program) {
      throw new LoyaltyOperationError('No active points loyalty program found for this business', 'PROGRAM_NOT_FOUND');
    }

    const pointsRateMinor = program.pointsPerCurrencyMinor || 1000;
    // Pure integer arithmetic
    const pointsEarned = Math.floor(purchaseAmountMinor / pointsRateMinor);

    if (pointsEarned <= 0) {
      throw new LoyaltyOperationError(
        `Purchase amount is below the minimum threshold to earn 1 point (requires at least ${pointsRateMinor} minor units)`,
        'THRESHOLD_NOT_MET'
      );
    }

    // 4. Ensure card exists atomically with ON CONFLICT DO NOTHING
    await tx.$executeRaw`
      INSERT INTO loyalty_cards (id, "businessId", "customerId", "programId", "totalStampsNeeded", "stampsCollected", "pointsBalance", status, "issuedAt", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${ctx.businessId}, ${customer.id}, ${program.id}, 10, 0, 0, 'ACTIVE'::"CardStatus", NOW(), NOW(), NOW())
      ON CONFLICT ("customerId", "programId") DO NOTHING
    `;

    const card = await tx.loyaltyCard.findUniqueOrThrow({
      where: {
        customerId_programId: {
          customerId: customer.id,
          programId: program.id,
        },
      },
    });

    // 5. Update card
    const updatedCard = await tx.loyaltyCard.update({
      where: { id: card.id },
      data: { pointsBalance: { increment: pointsEarned } },
    });

    const newPoints = updatedCard.pointsBalance;

    // 6. Update customer balance & metrics
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        pointsBalance: { increment: pointsEarned },
        totalSpendMinor: { increment: purchaseAmountMinor },
        totalVisits: { increment: 1 },
        lastVisitAt: new Date(),
        status: customer.status === 'INACTIVE' ? 'ACTIVE' : customer.status,
      },
    });

    // 7. Record immutable transaction log
    await tx.loyaltyTransaction.create({
      data: {
        businessId: ctx.businessId,
        branchId,
        customerId: customer.id,
        cardId: card.id,
        type: 'POINTS_EARNED',
        deltaStamps: 0,
        deltaPoints: pointsEarned,
        idempotencyKey: input.idempotencyKey || null,
        createdByUserId: ctx.user.id,
        metadata: {
          purchaseAmountMinor,
          pointsEarned,
          pointsRateMinor,
          newPoints,
        },
      },
    });

    // 8. Record Customer Event
    await tx.customerEvent.create({
      data: {
        businessId: ctx.businessId,
        customerId: customer.id,
        type: 'POINTS_ADDED',
        metadata: {
          pointsEarned,
          purchaseAmountMinor,
        },
      },
    });

    // 9. Record Audit Log
    await createAuditLog(ctx, {
      action: 'LOYALTY_POINTS_AWARDED',
      entityType: 'LoyaltyCard',
      entityId: card.id,
      newState: {
        pointsEarned,
        purchaseAmountMinor,
        newPoints,
        customerId: customer.id,
      },
    });

    return updatedCard;
  });
}

export interface AdjustLoyaltyInput {
  customerId: string;
  deltaStamps?: number;
  deltaPoints?: number;
  reason: string;
  branchId?: string | null;
}

/**
 * Controlled staff manual adjustment.
 * Requires permission, mandatory reason, and prevents balances from dropping below 0.
 */
export async function adjustLoyaltyBalance(ctx: TenantContext, input: AdjustLoyaltyInput) {
  requirePermission(ctx, 'LOYALTY_MANAGE');

  const reason = input.reason?.trim();
  if (!reason) {
    throw new LoyaltyOperationError('An adjustment reason is strictly required', 'VALIDATION_ERROR');
  }

  const deltaStamps = input.deltaStamps ? Number(input.deltaStamps) : 0;
  const deltaPoints = input.deltaPoints ? Number(input.deltaPoints) : 0;

  if (deltaStamps === 0 && deltaPoints === 0) {
    throw new LoyaltyOperationError('Adjustment must have a non-zero stamp or point delta', 'VALIDATION_ERROR');
  }

  return prisma.$transaction(async tx => {
    const customer = await tx.customer.findFirst({
      where: {
        id: input.customerId,
        businessId: ctx.businessId,
      },
    });

    if (!customer) {
      throw new LoyaltyOperationError('Customer not found in this business tenant', 'CUSTOMER_NOT_FOUND');
    }

    const activeProgram = await tx.loyaltyProgram.findFirst({
      where: {
        businessId: ctx.businessId,
        status: 'ACTIVE',
      },
    });

    if (!activeProgram) {
      throw new LoyaltyOperationError('No active loyalty program found for this business', 'PROGRAM_NOT_FOUND');
    }

    let card = await tx.loyaltyCard.findUnique({
      where: {
        customerId_programId: {
          customerId: customer.id,
          programId: activeProgram.id,
        },
      },
    });

    if (!card) {
      card = await tx.loyaltyCard.create({
        data: {
          businessId: ctx.businessId,
          customerId: customer.id,
          programId: activeProgram.id,
          stampsCollected: 0,
          pointsBalance: 0,
          status: 'ACTIVE',
        },
      });
    }

    const targetStamps = card.stampsCollected + deltaStamps;
    const targetPoints = card.pointsBalance + deltaPoints;

    if (targetStamps < 0 || (customer.stampsBalance + deltaStamps) < 0) {
      throw new LoyaltyOperationError('Adjustment cannot result in negative stamp balance', 'INVALID_BALANCE');
    }

    if (targetPoints < 0 || (customer.pointsBalance + deltaPoints) < 0) {
      throw new LoyaltyOperationError('Adjustment cannot result in negative points balance', 'INVALID_BALANCE');
    }

    const updatedCard = await tx.loyaltyCard.update({
      where: { id: card.id },
      data: {
        stampsCollected: targetStamps,
        pointsBalance: targetPoints,
      },
    });

    await tx.customer.update({
      where: { id: customer.id },
      data: {
        stampsBalance: customer.stampsBalance + deltaStamps,
        pointsBalance: customer.pointsBalance + deltaPoints,
      },
    });

    await tx.loyaltyTransaction.create({
      data: {
        businessId: ctx.businessId,
        branchId: input.branchId || ctx.branchId || null,
        customerId: customer.id,
        cardId: card.id,
        type: 'ADJUSTMENT',
        deltaStamps,
        deltaPoints,
        createdByUserId: ctx.user.id,
        metadata: {
          reason,
          adjustedBy: ctx.user.name,
          previousStamps: card.stampsCollected,
          newStamps: targetStamps,
          previousPoints: card.pointsBalance,
          newPoints: targetPoints,
        },
      },
    });

    await createAuditLog(ctx, {
      action: 'LOYALTY_ADJUSTED',
      entityType: 'LoyaltyCard',
      entityId: card.id,
      newState: {
        deltaStamps,
        deltaPoints,
        reason,
        newStamps: targetStamps,
        newPoints: targetPoints,
      },
    });

    return updatedCard;
  });
}

// ============================================================================
// 3. BUSINESS LOYALTY HISTORY & CUSTOMER LOOKUP
// ============================================================================

export interface LoyaltyHistoryFilters {
  page?: number;
  limit?: number;
  type?: LoyaltyTransactionType;
  branchId?: string;
  customerId?: string;
}

/**
 * Retrieves paginated business loyalty transaction ledger.
 */
export async function getBusinessLoyaltyHistory(
  ctx: TenantContext,
  filters: LoyaltyHistoryFilters = {}
) {
  requirePermission(ctx, 'LOYALTY_VIEW');

  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 20)));
  const skip = (page - 1) * limit;

  const whereClause: Prisma.LoyaltyTransactionWhereInput = {
    businessId: ctx.businessId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.loyaltyTransaction.findMany({
      where: whereClause,
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.loyaltyTransaction.count({ where: whereClause }),
  ]);

  return {
    transactions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Searches customers for the staff awarding terminal.
 * Returns customers matching name/phone with their active loyalty card.
 */
export async function searchLoyaltyCustomers(ctx: TenantContext, query?: string) {
  requirePermission(ctx, 'LOYALTY_VIEW');

  const trimmed = query?.trim() || '';

  const activeProgram = await prisma.loyaltyProgram.findFirst({
    where: { businessId: ctx.businessId, status: 'ACTIVE' },
  });

  const customers = await prisma.customer.findMany({
    where: {
      businessId: ctx.businessId,
      ...(trimmed
        ? {
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' } },
              { phone: { contains: trimmed } },
            ],
          }
        : {}),
    },
    take: 20,
    orderBy: { lastVisitAt: 'desc' },
    select: {
      id: true,
      name: true,
      phone: true,
      totalVisits: true,
      stampsBalance: true,
      pointsBalance: true,
      lastVisitAt: true,
      loyaltyCards: activeProgram
        ? {
            where: { programId: activeProgram.id },
            select: {
              id: true,
              stampsCollected: true,
              totalStampsNeeded: true,
              pointsBalance: true,
              status: true,
            },
          }
        : false,
    },
  });

  return customers.map(c => {
    const card = (c as any).loyaltyCards?.[0] || null;
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      totalVisits: c.totalVisits,
      stampsBalance: c.stampsBalance,
      pointsBalance: c.pointsBalance,
      lastVisitAt: c.lastVisitAt,
      card,
      activeProgramType: activeProgram?.type || 'STAMP',
      targetStamps: activeProgram?.targetStamps || 10,
    };
  });
}

// ============================================================================
// 4. CUSTOMER PWA LOYALTY VIEWS
// ============================================================================

/**
 * Retrieves the customer's live loyalty pass state.
 * Scoped strictly to the authenticated customer session.
 */
export async function getCustomerLoyaltyState(customerCtx: CustomerSessionContext) {
  const businessId = customerCtx.businessId;
  const customerId = customerCtx.customerId;

  // Find active program for this business
  const program = await prisma.loyaltyProgram.findFirst({
    where: {
      businessId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      type: true,
      targetStamps: true,
      pointsPerCurrencyMinor: true,
      rewardTitle: true,
      status: true,
    },
  });

  // Fetch business branding and customer identity
  const [business, customer] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        category: true,
        themePreset: true,
        primaryColor: true,
        secondaryColor: true,
        logo: true,
        currency: true,
      },
    }),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        stampsBalance: true,
        pointsBalance: true,
        totalVisits: true,
        joinedAt: true,
        branch: {
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  if (!program) {
    return {
      hasActiveProgram: false,
      program: null,
      card: null,
      business,
      customer: customer ? {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        branch: customer.branch,
        joinedAt: customer.joinedAt,
      } : null,
      message: 'This business has not activated a loyalty program yet.',
    };
  }

  // Find or automatically enroll customer in the active program
  let card = await prisma.loyaltyCard.findUnique({
    where: {
      customerId_programId: {
        customerId,
        programId: program.id,
      },
    },
  });

  if (!card) {
    card = await prisma.loyaltyCard.create({
      data: {
        businessId,
        customerId,
        programId: program.id,
        totalStampsNeeded: program.targetStamps || 10,
        stampsCollected: 0,
        pointsBalance: 0,
        status: 'ACTIVE',
      },
    });

    await prisma.customerEvent.create({
      data: {
        businessId,
        customerId,
        type: 'CUSTOMER_JOINED',
        metadata: {
          programId: program.id,
          programName: program.name,
        },
      },
    });
  }

  // Recent transactions (last 5)
  const recentTransactions = await prisma.loyaltyTransaction.findMany({
    where: {
      businessId,
      customerId,
      cardId: card.id,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      type: true,
      deltaStamps: true,
      deltaPoints: true,
      createdAt: true,
      branch: {
        select: { name: true },
      },
    },
  });

  return {
    hasActiveProgram: true,
    program,
    business,
    customer: customer ? {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      branch: customer.branch,
      joinedAt: customer.joinedAt,
    } : null,
    card: {
      id: card.id,
      stampsCollected: card.stampsCollected,
      totalStampsNeeded: card.totalStampsNeeded,
      pointsBalance: card.pointsBalance,
      status: card.status,
      issuedAt: card.issuedAt,
    },
    progress: {
      currentStamps: card.stampsCollected,
      targetStamps: card.totalStampsNeeded,
      stampsRemaining: Math.max(0, card.totalStampsNeeded - card.stampsCollected),
      isComplete: card.stampsCollected >= card.totalStampsNeeded,
      currentPoints: card.pointsBalance,
      pointsConversionLabel: program.type === 'POINTS'
        ? `1 point per ₹${((program.pointsPerCurrencyMinor || 1000) / 100).toFixed(0)}`
        : null,
    },
    recentTransactions,
  };
}

/**
 * Retrieves the authenticated customer's own loyalty history.
 */
export async function getCustomerLoyaltyHistory(customerCtx: CustomerSessionContext) {
  const transactions = await prisma.loyaltyTransaction.findMany({
    where: {
      businessId: customerCtx.businessId,
      customerId: customerCtx.customerId,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      type: true,
      deltaStamps: true,
      deltaPoints: true,
      createdAt: true,
      branch: {
        select: { name: true },
      },
    },
  });

  return transactions;
}

// ============================================================================
// 5. LEGACY REDEMPTION PROTOTYPE
// ============================================================================

export async function redeemReward(ctx: TenantContext, redemptionCode: string) {
  requirePermission(ctx, 'REWARDS_REDEEM');

  return prisma.$transaction(async tx => {
    const redemption = await tx.rewardRedemption.findUnique({
      where: { redemptionCode },
      include: {
        reward: true,
        customer: true,
      },
    });

    if (!redemption) {
      throw new LoyaltyOperationError('Invalid redemption code', 'INVALID_CODE');
    }

    if (redemption.businessId !== ctx.businessId) {
      throw new LoyaltyOperationError('Reward does not belong to this business tenant', 'CROSS_TENANT_FORBIDDEN');
    }

    if (redemption.status === 'REDEEMED') {
      throw new LoyaltyOperationError('Reward has already been redeemed', 'ALREADY_REDEEMED');
    }

    if (redemption.status === 'EXPIRED' || (redemption.expiresAt && redemption.expiresAt < new Date())) {
      throw new LoyaltyOperationError('Reward redemption has expired', 'EXPIRED');
    }

    const updated = await tx.rewardRedemption.update({
      where: { id: redemption.id },
      data: {
        status: 'REDEEMED',
        redeemedAt: new Date(),
        redeemedByUserId: ctx.user.id,
        branchId: ctx.branchId,
      },
    });

    await tx.customerEvent.create({
      data: {
        businessId: ctx.businessId,
        customerId: redemption.customerId,
        type: 'REWARD_REDEEMED',
        metadata: {
          rewardTitle: redemption.reward.title,
          redemptionCode: redemption.redemptionCode,
        },
      },
    });

    await createAuditLog(ctx, {
      action: 'REWARD_REDEEMED',
      entityType: 'RewardRedemption',
      entityId: redemption.id,
      newState: { code: redemption.redemptionCode, redeemedBy: ctx.user.id },
    });

    return updated;
  });
}
