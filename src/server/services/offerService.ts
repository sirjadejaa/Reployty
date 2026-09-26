import crypto from 'crypto';
import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { createAuditLog } from './auditService';
import { requireFeature, requireUsageLimit } from './entitlementService';
import { CustomerSessionContext } from './customerAuthService';
import { OfferType, OfferStatus, Prisma } from '@prisma/client';
// Types and interfaces for Offers & Promotions Engine
import {
  CreateOfferInput,
  UpdateOfferInput,
  RedeemOfferInput,
  OfferItem,
  OfferRedemptionItem,
  CustomerOfferItem,
  OfferEligibilityConfig,
} from '../../types/offers';

export class OfferOperationError extends Error {
  constructor(message: string, public code: string = 'OFFER_OPERATION_ERROR') {
    super(message);
    this.name = 'OfferOperationError';
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generates an unguessable, cryptographically random single-use redemption code.
 * Format: O-XXXX-XXXX (e.g., O-E4F2-99B1)
 */
export function generateOfferRedemptionCode(): string {
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `O-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/**
 * Normalizes user/staff inputted redemption codes.
 * Strips whitespace, hyphens, and standardizes to canonical O-XXXX-XXXX.
 */
export function normalizeOfferRedemptionCode(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.startsWith('O') && clean.length === 9) {
    return `O-${clean.slice(1, 5)}-${clean.slice(5, 9)}`;
  }
  if (clean.length === 8) {
    return `O-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  }
  return raw.trim().toUpperCase();
}

/**
 * Computes runtime effective status based on base status and calendar windows.
 */
export function computeEffectiveStatus(offer: {
  status: OfferStatus;
  startDate: Date;
  endDate: Date | null;
}): 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE' | 'DRAFT' {
  if (offer.status === 'INACTIVE') return 'INACTIVE';
  if (offer.status === 'DRAFT') return 'DRAFT';
  if (offer.status === 'EXPIRED') return 'EXPIRED';

  const now = new Date();
  if (now < offer.startDate) {
    return 'SCHEDULED';
  }
  if (offer.endDate && now > offer.endDate) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
}

// ============================================================================
// 1. BUSINESS OFFERS MANAGEMENT
// ============================================================================

export async function getBusinessOffers(
  ctx: TenantContext,
  filters?: {
    status?: string;
    branchId?: string;
    search?: string;
  }
): Promise<OfferItem[]> {
  requirePermission(ctx, 'OFFERS_VIEW');

  const where: Prisma.OfferWhereInput = {
    businessId: ctx.businessId,
  };

  if (filters?.status && filters.status !== 'ALL') {
    where.status = filters.status as OfferStatus;
  }

  if (filters?.search) {
    const q = filters.search.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }
  }

  const offers = await prisma.offer.findMany({
    where,
    include: {
      _count: {
        select: { redemptions: true },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  // Collect branch IDs to resolve branch names
  const branchIds = new Set<string>();
  offers.forEach((o) => {
    const cfg = o.eligibilityConfig as OfferEligibilityConfig | null;
    if (cfg?.branchId) {
      branchIds.add(cfg.branchId);
    }
  });

  const branches = branchIds.size > 0
    ? await prisma.branch.findMany({
        where: { id: { in: Array.from(branchIds) }, businessId: ctx.businessId },
        select: { id: true, name: true },
      })
    : [];
  const branchMap = new Map<string, string>(branches.map((b) => [b.id, b.name]));

  return offers
    .map((o) => {
      const cfg = o.eligibilityConfig as OfferEligibilityConfig | null;
      const targetBranchId = cfg?.branchId || null;
      const branchName = targetBranchId ? branchMap.get(targetBranchId) || null : null;
      const effectiveStatus = computeEffectiveStatus({
        status: o.status,
        startDate: o.startDate,
        endDate: o.endDate,
      });

      return {
        id: o.id,
        businessId: o.businessId,
        title: o.title,
        description: o.description,
        type: o.type,
        discountValue: o.discountValue,
        minPurchaseMinor: o.minPurchaseMinor,
        maxDiscountMinor: o.maxDiscountMinor,
        startDate: o.startDate,
        endDate: o.endDate,
        usageLimitTotal: o.usageLimitTotal,
        usageLimitPerCustomer: o.usageLimitPerCustomer,
        status: o.status,
        eligibilityConfig: cfg,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        redemptionsCount: o._count.redemptions,
        effectiveStatus,
        branchName,
      };
    })
    .filter((item) => {
      if (filters?.branchId && filters.branchId !== 'ALL') {
        const itemBranch = item.eligibilityConfig?.branchId || null;
        if (itemBranch !== filters.branchId) {
          return false;
        }
      }
      return true;
    });
}

export async function getOfferById(ctx: TenantContext, offerId: string): Promise<OfferItem> {
  requirePermission(ctx, 'OFFERS_VIEW');

  const offer = await prisma.offer.findFirst({
    where: {
      id: offerId,
      businessId: ctx.businessId,
    },
    include: {
      _count: {
        select: { redemptions: true },
      },
    },
  });

  if (!offer) {
    throw new OfferOperationError('Offer not found', 'NOT_FOUND');
  }

  const cfg = offer.eligibilityConfig as OfferEligibilityConfig | null;
  let branchName: string | null = null;
  if (cfg?.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: cfg.branchId, businessId: ctx.businessId },
      select: { name: true },
    });
    branchName = branch?.name || null;
  }

  return {
    id: offer.id,
    businessId: offer.businessId,
    title: offer.title,
    description: offer.description,
    type: offer.type,
    discountValue: offer.discountValue,
    minPurchaseMinor: offer.minPurchaseMinor,
    maxDiscountMinor: offer.maxDiscountMinor,
    startDate: offer.startDate,
    endDate: offer.endDate,
    usageLimitTotal: offer.usageLimitTotal,
    usageLimitPerCustomer: offer.usageLimitPerCustomer,
    status: offer.status,
    eligibilityConfig: cfg,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    redemptionsCount: offer._count.redemptions,
    effectiveStatus: computeEffectiveStatus({
      status: offer.status,
      startDate: offer.startDate,
      endDate: offer.endDate,
    }),
    branchName,
  };
}

export async function createOffer(ctx: TenantContext, input: CreateOfferInput): Promise<OfferItem> {
  requirePermission(ctx, 'OFFERS_MANAGE');
  await requireFeature(ctx, 'OFFERS');
  await requireUsageLimit(ctx.businessId, 'maxOffers');

  const title = input.title?.trim();
  if (!title) {
    throw new OfferOperationError('Offer title is required', 'VALIDATION_ERROR');
  }

  const discountValue = Number(input.discountValue ?? 0);
  if (isNaN(discountValue) || discountValue < 0) {
    throw new OfferOperationError('Discount value must be a non-negative number', 'VALIDATION_ERROR');
  }

  const startDate = input.startDate ? new Date(input.startDate) : new Date();
  if (isNaN(startDate.getTime())) {
    throw new OfferOperationError('Invalid start date', 'VALIDATION_ERROR');
  }

  let endDate: Date | null = null;
  if (input.endDate) {
    endDate = new Date(input.endDate);
    if (isNaN(endDate.getTime())) {
      throw new OfferOperationError('Invalid end date', 'VALIDATION_ERROR');
    }
    if (endDate < startDate) {
      throw new OfferOperationError('End date must be greater than or equal to start date', 'VALIDATION_ERROR');
    }
  }

  // Validate branch if targeted
  let cfg = input.eligibilityConfig || {};
  if (cfg.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: cfg.branchId, businessId: ctx.businessId },
    });
    if (!branch) {
      throw new OfferOperationError('Target branch does not exist for this business', 'VALIDATION_ERROR');
    }
  }

  const offer = await prisma.offer.create({
    data: {
      businessId: ctx.businessId,
      title,
      description: input.description?.trim() || null,
      type: (input.type as OfferType) || 'PERCENTAGE_DISCOUNT',
      discountValue,
      minPurchaseMinor: input.minPurchaseMinor !== undefined && input.minPurchaseMinor !== null ? Number(input.minPurchaseMinor) : null,
      maxDiscountMinor: input.maxDiscountMinor !== undefined && input.maxDiscountMinor !== null ? Number(input.maxDiscountMinor) : null,
      startDate,
      endDate,
      usageLimitTotal: input.usageLimitTotal !== undefined && input.usageLimitTotal !== null ? Number(input.usageLimitTotal) : null,
      usageLimitPerCustomer: input.usageLimitPerCustomer !== undefined && input.usageLimitPerCustomer !== null ? Number(input.usageLimitPerCustomer) : null,
      status: (input.status as OfferStatus) || 'ACTIVE',
      eligibilityConfig: cfg as Prisma.InputJsonValue,
    },
  });

  await createAuditLog(ctx, {
    action: 'OFFER_CREATED',
    entityType: 'Offer',
    entityId: offer.id,
    newState: {
      title: offer.title,
      type: offer.type,
      discountValue: offer.discountValue,
      status: offer.status,
    },
  });

  return getOfferById(ctx, offer.id);
}

export async function updateOffer(
  ctx: TenantContext,
  offerId: string,
  input: UpdateOfferInput
): Promise<OfferItem> {
  requirePermission(ctx, 'OFFERS_MANAGE');

  const existing = await prisma.offer.findFirst({
    where: { id: offerId, businessId: ctx.businessId },
  });
  if (!existing) {
    throw new OfferOperationError('Offer not found', 'NOT_FOUND');
  }

  const data: Prisma.OfferUpdateInput = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) {
      throw new OfferOperationError('Offer title cannot be empty', 'VALIDATION_ERROR');
    }
    data.title = title;
  }

  if (input.description !== undefined) {
    data.description = input.description ? input.description.trim() : null;
  }

  if (input.type !== undefined) {
    data.type = input.type as OfferType;
  }

  if (input.discountValue !== undefined) {
    const val = Number(input.discountValue);
    if (isNaN(val) || val < 0) {
      throw new OfferOperationError('Discount value must be a non-negative number', 'VALIDATION_ERROR');
    }
    data.discountValue = val;
  }

  if (input.minPurchaseMinor !== undefined) {
    data.minPurchaseMinor = input.minPurchaseMinor !== null ? Number(input.minPurchaseMinor) : null;
  }

  if (input.maxDiscountMinor !== undefined) {
    data.maxDiscountMinor = input.maxDiscountMinor !== null ? Number(input.maxDiscountMinor) : null;
  }

  let finalStartDate = existing.startDate;
  if (input.startDate !== undefined) {
    const s = new Date(input.startDate);
    if (isNaN(s.getTime())) {
      throw new OfferOperationError('Invalid start date', 'VALIDATION_ERROR');
    }
    data.startDate = s;
    finalStartDate = s;
  }

  if (input.endDate !== undefined) {
    if (input.endDate === null) {
      data.endDate = null;
    } else {
      const e = new Date(input.endDate);
      if (isNaN(e.getTime())) {
        throw new OfferOperationError('Invalid end date', 'VALIDATION_ERROR');
      }
      if (e < finalStartDate) {
        throw new OfferOperationError('End date must be greater than or equal to start date', 'VALIDATION_ERROR');
      }
      data.endDate = e;
    }
  }

  if (input.usageLimitTotal !== undefined) {
    data.usageLimitTotal = input.usageLimitTotal !== null ? Number(input.usageLimitTotal) : null;
  }

  if (input.usageLimitPerCustomer !== undefined) {
    data.usageLimitPerCustomer = input.usageLimitPerCustomer !== null ? Number(input.usageLimitPerCustomer) : null;
  }

  if (input.status !== undefined) {
    data.status = input.status as OfferStatus;
  }

  if (input.eligibilityConfig !== undefined) {
    const cfg = input.eligibilityConfig || {};
    if (cfg.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: cfg.branchId, businessId: ctx.businessId },
      });
      if (!branch) {
        throw new OfferOperationError('Target branch does not exist for this business', 'VALIDATION_ERROR');
      }
    }
    data.eligibilityConfig = cfg as Prisma.InputJsonValue;
  }

  const updated = await prisma.offer.update({
    where: { id: existing.id },
    data,
  });

  await createAuditLog(ctx, {
    action: 'OFFER_UPDATED',
    entityType: 'Offer',
    entityId: updated.id,
    previousState: {
      title: existing.title,
      status: existing.status,
      discountValue: existing.discountValue,
    },
    newState: {
      title: updated.title,
      status: updated.status,
      discountValue: updated.discountValue,
    },
  });

  return getOfferById(ctx, updated.id);
}

export async function setOfferStatus(
  ctx: TenantContext,
  offerId: string,
  status: OfferStatus
): Promise<OfferItem> {
  requirePermission(ctx, 'OFFERS_MANAGE');

  const existing = await prisma.offer.findFirst({
    where: { id: offerId, businessId: ctx.businessId },
  });
  if (!existing) {
    throw new OfferOperationError('Offer not found', 'NOT_FOUND');
  }

  const updated = await prisma.offer.update({
    where: { id: existing.id },
    data: { status },
  });

  await createAuditLog(ctx, {
    action: 'OFFER_STATUS_CHANGED',
    entityType: 'Offer',
    entityId: updated.id,
    previousState: { status: existing.status },
    newState: { status: updated.status },
  });

  return getOfferById(ctx, updated.id);
}

export async function deleteOffer(ctx: TenantContext, offerId: string): Promise<{ success: boolean; action: 'DELETED' | 'ARCHIVED' }> {
  requirePermission(ctx, 'OFFERS_MANAGE');

  const existing = await prisma.offer.findFirst({
    where: { id: offerId, businessId: ctx.businessId },
    include: {
      _count: { select: { redemptions: true } },
    },
  });
  if (!existing) {
    throw new OfferOperationError('Offer not found', 'NOT_FOUND');
  }

  if (existing._count.redemptions > 0) {
    // Preserve financial history: soft-archive
    await prisma.offer.update({
      where: { id: existing.id },
      data: { status: 'INACTIVE' },
    });

    await createAuditLog(ctx, {
      action: 'OFFER_ARCHIVED',
      entityType: 'Offer',
      entityId: existing.id,
      newState: { reason: 'Has existing redemptions, marked INACTIVE' },
    });

    return { success: true, action: 'ARCHIVED' };
  }

  await prisma.offer.delete({
    where: { id: existing.id },
  });

  await createAuditLog(ctx, {
    action: 'OFFER_DELETED',
    entityType: 'Offer',
    entityId: existing.id,
    previousState: { title: existing.title },
  });

  return { success: true, action: 'DELETED' };
}

// ============================================================================
// 2. REDEMPTION & VALIDATION ENGINE
// ============================================================================

export async function getBusinessOfferRedemptions(
  ctx: TenantContext,
  filters?: {
    offerId?: string;
    customerId?: string;
    branchId?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ redemptions: OfferRedemptionItem[]; total: number }> {
  requirePermission(ctx, 'OFFERS_VIEW');

  const where: Prisma.OfferRedemptionWhereInput = {
    businessId: ctx.businessId,
  };

  if (filters?.offerId) {
    where.offerId = filters.offerId;
  }
  if (filters?.customerId) {
    where.customerId = filters.customerId;
  }
  if (filters?.branchId && filters.branchId !== 'ALL') {
    where.branchId = filters.branchId;
  }

  const page = Math.max(1, filters?.page || 1);
  const limit = Math.min(100, Math.max(1, filters?.limit || 50));
  const skip = (page - 1) * limit;

  const [total, redemptions] = await Promise.all([
    prisma.offerRedemption.count({ where }),
    prisma.offerRedemption.findMany({
      where,
      include: {
        offer: { select: { id: true, title: true } },
        customer: { select: { id: true, name: true, phone: true } },
        redeemedBy: { select: { id: true, name: true } },
      },
      orderBy: { redeemedAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  // Collect branch names
  const branchIds = new Set<string>();
  redemptions.forEach((r) => {
    if (r.branchId) branchIds.add(r.branchId);
  });
  const branches = branchIds.size > 0
    ? await prisma.branch.findMany({
        where: { id: { in: Array.from(branchIds) }, businessId: ctx.businessId },
        select: { id: true, name: true },
      })
    : [];
  const branchMap = new Map<string, string>(branches.map((b) => [b.id, b.name]));

  return {
    total,
    redemptions: redemptions.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      branchId: r.branchId,
      branchName: r.branchId ? branchMap.get(r.branchId) || null : null,
      offerId: r.offerId,
      offerTitle: r.offer?.title,
      customerId: r.customerId,
      customerName: r.customer?.name,
      customerPhone: r.customer?.phone,
      redeemedByUserId: r.redeemedByUserId,
      redeemedByStaffName: r.redeemedBy?.name || null,
      status: r.status as any,
      redemptionCode: r.redemptionCode,
      idempotencyKey: r.idempotencyKey,
      redeemedAt: r.redeemedAt,
      createdAt: r.createdAt,
    })),
  };
}

export async function validateOfferForCustomer(
  ctx: TenantContext,
  input: {
    offerId: string;
    customerId: string;
    branchId?: string | null;
  }
): Promise<{
  isValid: boolean;
  reason?: string;
  offer: OfferItem;
  customer: { id: string; name: string; phone: string; totalVisits: number };
  priorRedemptionsCount: number;
  remainingUsage: number | null;
}> {
  requirePermission(ctx, 'OFFERS_VIEW');

  const [offer, customer] = await Promise.all([
    getOfferById(ctx, input.offerId),
    prisma.customer.findFirst({
      where: { id: input.customerId, businessId: ctx.businessId },
      select: { id: true, name: true, phone: true, status: true, totalVisits: true },
    }),
  ]);

  if (!customer) {
    throw new OfferOperationError('Customer not found for this business', 'NOT_FOUND');
  }

  // Base checks
  if (customer.status === 'INACTIVE') {
    return {
      isValid: false,
      reason: 'Customer account is not active',
      offer,
      customer,
      priorRedemptionsCount: 0,
      remainingUsage: 0,
    };
  }

  if (offer.status !== 'ACTIVE') {
    return {
      isValid: false,
      reason: `Offer is currently ${offer.status.toLowerCase()}`,
      offer,
      customer,
      priorRedemptionsCount: 0,
      remainingUsage: 0,
    };
  }

  const now = new Date();
  if (now < new Date(offer.startDate)) {
    return {
      isValid: false,
      reason: 'Offer has not started yet',
      offer,
      customer,
      priorRedemptionsCount: 0,
      remainingUsage: 0,
    };
  }

  if (offer.endDate && now > new Date(offer.endDate)) {
    return {
      isValid: false,
      reason: 'Offer has expired',
      offer,
      customer,
      priorRedemptionsCount: 0,
      remainingUsage: 0,
    };
  }

  // Branch check
  const targetBranchId = offer.eligibilityConfig?.branchId || null;
  const redeemingBranchId = input.branchId || ctx.branchId || null;
  if (targetBranchId && redeemingBranchId && targetBranchId !== redeemingBranchId) {
    return {
      isValid: false,
      reason: `Offer is only valid at branch: ${offer.branchName || 'designated branch'}`,
      offer,
      customer,
      priorRedemptionsCount: 0,
      remainingUsage: 0,
    };
  }

  // Audience check
  const audience = offer.eligibilityConfig?.targetAudience || 'ALL';
  if (audience === 'NEW_CUSTOMERS' && customer.totalVisits > 1) {
    return {
      isValid: false,
      reason: 'Offer is only valid for first-time / new customers',
      offer,
      customer,
      priorRedemptionsCount: 0,
      remainingUsage: 0,
    };
  }

  // Prior redemptions check
  const [totalRedeemed, customerRedeemed] = await Promise.all([
    prisma.offerRedemption.count({
      where: { businessId: ctx.businessId, offerId: offer.id, status: 'REDEEMED' },
    }),
    prisma.offerRedemption.count({
      where: { businessId: ctx.businessId, offerId: offer.id, customerId: customer.id, status: 'REDEEMED' },
    }),
  ]);

  if (offer.usageLimitTotal !== null && totalRedeemed >= offer.usageLimitTotal) {
    return {
      isValid: false,
      reason: 'Offer overall redemption limit reached',
      offer,
      customer,
      priorRedemptionsCount: customerRedeemed,
      remainingUsage: 0,
    };
  }

  if (offer.usageLimitPerCustomer !== null && customerRedeemed >= offer.usageLimitPerCustomer) {
    return {
      isValid: false,
      reason: `Customer has reached the redemption limit (${offer.usageLimitPerCustomer}) for this offer`,
      offer,
      customer,
      priorRedemptionsCount: customerRedeemed,
      remainingUsage: 0,
    };
  }

  const remaining = offer.usageLimitPerCustomer !== null
    ? Math.max(0, offer.usageLimitPerCustomer - customerRedeemed)
    : null;

  return {
    isValid: true,
    offer,
    customer,
    priorRedemptionsCount: customerRedeemed,
    remainingUsage: remaining,
  };
}

export async function redeemOffer(
  ctx: TenantContext,
  input: RedeemOfferInput
): Promise<OfferRedemptionItem> {
  requirePermission(ctx, 'OFFERS_REDEEM');

  if (!input.offerId?.trim() || !input.customerId?.trim()) {
    throw new OfferOperationError('Offer ID and Customer ID are required', 'VALIDATION_ERROR');
  }

  // 1. Check idempotency if key provided
  if (input.idempotencyKey) {
    const existing = await prisma.offerRedemption.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: ctx.businessId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      include: {
        offer: { select: { id: true, title: true } },
        customer: { select: { id: true, name: true, phone: true } },
        redeemedBy: { select: { id: true, name: true } },
      },
    });

    if (existing) {
      let branchName: string | null = null;
      if (existing.branchId) {
        const branch = await prisma.branch.findFirst({
          where: { id: existing.branchId, businessId: ctx.businessId },
          select: { name: true },
        });
        branchName = branch?.name || null;
      }

      return {
        id: existing.id,
        businessId: existing.businessId,
        branchId: existing.branchId,
        branchName,
        offerId: existing.offerId,
        offerTitle: existing.offer?.title,
        customerId: existing.customerId,
        customerName: existing.customer?.name,
        customerPhone: existing.customer?.phone,
        redeemedByUserId: existing.redeemedByUserId,
        redeemedByStaffName: existing.redeemedBy?.name || null,
        status: existing.status as any,
        redemptionCode: existing.redemptionCode,
        idempotencyKey: existing.idempotencyKey,
        redeemedAt: existing.redeemedAt,
        createdAt: existing.createdAt,
      };
    }
  }

  // Execute atomic transactional redemption with server-authoritative validations
  return prisma.$transaction(async (tx) => {
    // A. Verify Customer
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, businessId: ctx.businessId },
    });
    if (!customer) {
      throw new OfferOperationError('Customer not found for this business', 'NOT_FOUND');
    }
    if (customer.status === 'INACTIVE') {
      throw new OfferOperationError('Customer account is not active', 'CUSTOMER_INACTIVE');
    }

    // B. Verify Offer
    const offer = await tx.offer.findFirst({
      where: { id: input.offerId, businessId: ctx.businessId },
    });
    if (!offer) {
      throw new OfferOperationError('Offer not found for this business', 'NOT_FOUND');
    }
    if (offer.status !== 'ACTIVE') {
      throw new OfferOperationError(`Cannot redeem offer with status: ${offer.status}`, 'OFFER_INACTIVE');
    }

    // C. Scheduling window validation
    const now = new Date();
    if (now < offer.startDate) {
      throw new OfferOperationError('Offer is scheduled for a future date and is not yet active', 'OFFER_NOT_STARTED');
    }
    if (offer.endDate && now > offer.endDate) {
      throw new OfferOperationError('Offer has expired', 'OFFER_EXPIRED');
    }

    // D. Branch Targeting validation
    const cfg = (offer.eligibilityConfig as OfferEligibilityConfig | null) || {};
    const effectiveBranchId = input.branchId || ctx.branchId || null;
    if (cfg.branchId && effectiveBranchId && cfg.branchId !== effectiveBranchId) {
      throw new OfferOperationError('Offer is not valid at this branch', 'BRANCH_NOT_ELIGIBLE');
    }

    // E. Customer Audience validation
    if (cfg.targetAudience === 'NEW_CUSTOMERS' && customer.totalVisits > 1) {
      throw new OfferOperationError('Offer is strictly for new customers', 'AUDIENCE_NOT_ELIGIBLE');
    }

    // F. Usage limits validation
    if (offer.usageLimitTotal !== null) {
      const totalRedeemed = await tx.offerRedemption.count({
        where: { businessId: ctx.businessId, offerId: offer.id, status: 'REDEEMED' },
      });
      if (totalRedeemed >= offer.usageLimitTotal) {
        throw new OfferOperationError('Total redemption limit reached for this promotion', 'OFFER_TOTAL_LIMIT_REACHED');
      }
    }

    if (offer.usageLimitPerCustomer !== null) {
      const customerRedeemed = await tx.offerRedemption.count({
        where: { businessId: ctx.businessId, offerId: offer.id, customerId: customer.id, status: 'REDEEMED' },
      });
      if (customerRedeemed >= offer.usageLimitPerCustomer) {
        throw new OfferOperationError(`Customer has already reached the maximum ${offer.usageLimitPerCustomer} redemption(s) for this offer`, 'OFFER_CUSTOMER_LIMIT_REACHED');
      }
    }

    // G. Generate code and create redemption record
    const redemptionCode = generateOfferRedemptionCode();
    const redemption = await tx.offerRedemption.create({
      data: {
        businessId: ctx.businessId,
        offerId: offer.id,
        customerId: customer.id,
        branchId: effectiveBranchId,
        redeemedByUserId: ctx.user.id,
        status: 'REDEEMED',
        redemptionCode,
        idempotencyKey: input.idempotencyKey || null,
        redeemedAt: now,
      },
      include: {
        offer: { select: { id: true, title: true } },
        customer: { select: { id: true, name: true, phone: true } },
        redeemedBy: { select: { id: true, name: true } },
      },
    });

    // H. Create CustomerEvent
    await tx.customerEvent.create({
      data: {
        businessId: ctx.businessId,
        customerId: customer.id,
        type: 'OFFER_REDEEMED',
        metadata: {
          offerId: offer.id,
          offerTitle: offer.title,
          redemptionId: redemption.id,
          redemptionCode,
          discountValue: offer.discountValue,
          type: offer.type,
          staffId: ctx.user.id,
          branchId: effectiveBranchId,
        },
      },
    });

    // I. Audit log
    await createAuditLog(ctx, {
      action: 'OFFER_REDEEMED',
      entityType: 'OfferRedemption',
      entityId: redemption.id,
      newState: {
        offerId: offer.id,
        offerTitle: offer.title,
        customerId: customer.id,
        customerName: customer.name,
        redemptionCode,
      },
    });

    let branchName: string | null = null;
    if (effectiveBranchId) {
      const branch = await tx.branch.findFirst({
        where: { id: effectiveBranchId, businessId: ctx.businessId },
        select: { name: true },
      });
      branchName = branch?.name || null;
    }

    return {
      id: redemption.id,
      businessId: redemption.businessId,
      branchId: redemption.branchId,
      branchName,
      offerId: redemption.offerId,
      offerTitle: redemption.offer?.title,
      customerId: redemption.customerId,
      customerName: redemption.customer?.name,
      customerPhone: redemption.customer?.phone,
      redeemedByUserId: redemption.redeemedByUserId,
      redeemedByStaffName: redemption.redeemedBy?.name || null,
      status: redemption.status as any,
      redemptionCode: redemption.redemptionCode,
      idempotencyKey: redemption.idempotencyKey,
      redeemedAt: redemption.redeemedAt,
      createdAt: redemption.createdAt,
    };
  });
}

// ============================================================================
// 3. CUSTOMER PWA EXPERIENCE
// ============================================================================

export async function getCustomerEligibleOffers(
  session: CustomerSessionContext
): Promise<CustomerOfferItem[]> {
  const now = new Date();

  // Active offers for this business
  const offers = await prisma.offer.findMany({
    where: {
      businessId: session.businessId,
      status: 'ACTIVE',
      startDate: { lte: now },
      OR: [
        { endDate: null },
        { endDate: { gte: now } },
      ],
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  if (offers.length === 0) {
    return [];
  }

  // Pre-fetch branch names if any
  const branchIds = new Set<string>();
  offers.forEach((o) => {
    const cfg = o.eligibilityConfig as OfferEligibilityConfig | null;
    if (cfg?.branchId) branchIds.add(cfg.branchId);
  });

  const branches = branchIds.size > 0
    ? await prisma.branch.findMany({
        where: { id: { in: Array.from(branchIds) }, businessId: session.businessId },
        select: { id: true, name: true },
      })
    : [];
  const branchMap = new Map<string, string>(branches.map((b) => [b.id, b.name]));

  // Customer redemptions counts per offer
  const customerRedemptions = await prisma.offerRedemption.groupBy({
    by: ['offerId'],
    where: {
      businessId: session.businessId,
      customerId: session.customerId,
      status: 'REDEEMED',
    },
    _count: { id: true },
  });
  const customerRedemptionMap = new Map<string, number>(
    customerRedemptions.map((r) => [r.offerId, r._count.id])
  );

  return offers.map((o) => {
    const cfg = o.eligibilityConfig as OfferEligibilityConfig | null;
    const branchName = cfg?.branchId ? branchMap.get(cfg.branchId) || null : null;
    const terms = cfg?.terms || null;
    const redeemedCount = customerRedemptionMap.get(o.id) || 0;

    let isEligible = true;
    let ineligibilityReason: string | null = null;
    let remainingPersonalUsage: number | null = null;

    if (o.usageLimitPerCustomer !== null) {
      remainingPersonalUsage = Math.max(0, o.usageLimitPerCustomer - redeemedCount);
      if (redeemedCount >= o.usageLimitPerCustomer) {
        isEligible = false;
        ineligibilityReason = 'Usage limit reached';
      }
    }

    if (isEligible && cfg?.targetAudience === 'NEW_CUSTOMERS' && session.customer.totalVisits > 1) {
      isEligible = false;
      ineligibilityReason = 'Valid for new customers only';
    }

    return {
      id: o.id,
      title: o.title,
      description: o.description,
      type: o.type,
      discountValue: o.discountValue,
      minPurchaseMinor: o.minPurchaseMinor,
      maxDiscountMinor: o.maxDiscountMinor,
      startDate: o.startDate,
      endDate: o.endDate,
      branchName,
      terms,
      isEligible,
      ineligibilityReason,
      remainingPersonalUsage,
    };
  });
}
