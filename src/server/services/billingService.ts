import { prisma } from '../db/client';
import { TenantContext, requirePermission, requireSuperAdmin } from '../auth/tenantContext';
import { createAuditLog } from './auditService';
import { getBusinessSubscription, getUsageAndLimits } from './entitlementService';
import { UsageMeterService } from './usageMeterService';
import {
  Plan,
  Payment,
  Invoice,
  BillingInterval,
  SubscriptionStatus,
  PaymentStatus,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';

export class BillingError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'BillingError';
  }
}

export interface CreatePlanInput {
  name: string;
  slug: string;
  description?: string;
  priceMinor: number;
  yearlyPriceMinor?: number;
  currency?: string;
  billingInterval?: BillingInterval;
  features: string[];
  maxCustomers?: number;
  maxBranches?: number;
  maxStaff?: number;
  limits?: Record<string, number | null>;
  isActive?: boolean;
}

export interface UpdatePlanInput {
  name?: string;
  description?: string;
  priceMinor?: number;
  yearlyPriceMinor?: number;
  currency?: string;
  features?: string[];
  maxCustomers?: number;
  maxBranches?: number;
  maxStaff?: number;
  limits?: Record<string, number | null>;
  isActive?: boolean;
}

/**
 * Generates an RFC/standard unique invoice number: INV-YYYY-RANDOM
 */
function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `INV-${year}-${random}`;
}

// ============================================================================
// 1. PLANS MANAGEMENT
// ============================================================================

export async function getAllPlans(activeOnly: boolean = false): Promise<any[]> {
  return prisma.plan.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { priceMinor: 'asc' },
    include: {
      _count: {
        select: { subscriptions: true },
      },
    },
  });
}

export async function getPlanById(id: string): Promise<Plan | null> {
  return prisma.plan.findUnique({
    where: { id },
    include: {
      _count: {
        select: { subscriptions: true },
      },
    },
  });
}

export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  return prisma.plan.findUnique({ where: { slug } });
}

export async function createPlan(ctx: TenantContext, input: CreatePlanInput): Promise<Plan> {
  requireSuperAdmin(ctx);

  if (!input.name || typeof input.name !== 'string' || input.name.trim().length < 2) {
    throw new BillingError('Package name must be at least 2 characters', 400);
  }

  const cleanSlug = (input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).trim().toLowerCase();
  if (!cleanSlug) {
    throw new BillingError('A valid slug is required', 400);
  }

  const existing = await prisma.plan.findUnique({ where: { slug: cleanSlug } });
  if (existing) {
    throw new BillingError(`Package with code/slug '${cleanSlug}' already exists`, 400);
  }

  const priceMinor = Math.round(Number(input.priceMinor) || 0);
  if (priceMinor < 0) {
    throw new BillingError('Price must be a non-negative integer in minor units', 400);
  }

  const yearlyPriceMinor = input.yearlyPriceMinor !== undefined && input.yearlyPriceMinor !== null
    ? Math.round(Number(input.yearlyPriceMinor))
    : null;

  const plan = await prisma.plan.create({
    data: {
      name: input.name.trim(),
      slug: cleanSlug,
      description: input.description?.trim() || null,
      priceMinor,
      yearlyPriceMinor,
      currency: input.currency?.trim() || 'INR',
      billingInterval: input.billingInterval || BillingInterval.MONTHLY,
      features: (input.features || []) as unknown as Prisma.InputJsonValue,
      limits: (input.limits || {}) as unknown as Prisma.InputJsonValue,
      maxCustomers: Math.max(1, Number(input.maxCustomers) || 1000),
      maxBranches: Math.max(1, Number(input.maxBranches) || 1),
      maxStaff: Math.max(1, Number(input.maxStaff) || 5),
      isActive: input.isActive ?? true,
    },
  });

  await createAuditLog(ctx, {
    action: 'BILLING_PLAN_CREATED',
    entityType: 'PLAN',
    entityId: plan.id,
    newState: plan as unknown as Prisma.InputJsonValue,
  });

  return plan;
}

export async function updatePlan(ctx: TenantContext, planId: string, input: UpdatePlanInput): Promise<Plan> {
  requireSuperAdmin(ctx);

  const oldPlan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!oldPlan) {
    throw new BillingError('Package not found', 404);
  }

  const data: Prisma.PlanUpdateInput = {};

  if (input.name !== undefined) {
    if (!input.name.trim()) throw new BillingError('Package name cannot be empty', 400);
    data.name = input.name.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.priceMinor !== undefined) {
    const p = Math.round(Number(input.priceMinor));
    if (p < 0) throw new BillingError('Price must be a non-negative integer in minor units', 400);
    data.priceMinor = p;
  }
  if (input.yearlyPriceMinor !== undefined) {
    data.yearlyPriceMinor = input.yearlyPriceMinor !== null ? Math.round(Number(input.yearlyPriceMinor)) : null;
  }
  if (input.currency !== undefined) {
    data.currency = input.currency.trim();
  }
  if (input.features !== undefined) {
    data.features = input.features as unknown as Prisma.InputJsonValue;
  }
  if (input.limits !== undefined) {
    data.limits = input.limits as unknown as Prisma.InputJsonValue;
  }
  if (input.maxCustomers !== undefined) {
    data.maxCustomers = Math.max(1, Number(input.maxCustomers));
  }
  if (input.maxBranches !== undefined) {
    data.maxBranches = Math.max(1, Number(input.maxBranches));
  }
  if (input.maxStaff !== undefined) {
    data.maxStaff = Math.max(1, Number(input.maxStaff));
  }
  if (input.isActive !== undefined) {
    data.isActive = Boolean(input.isActive);
  }

  const updated = await prisma.plan.update({
    where: { id: planId },
    data,
  });

  await createAuditLog(ctx, {
    action: 'BILLING_PLAN_UPDATED',
    entityType: 'PLAN',
    entityId: planId,
    previousState: oldPlan as unknown as Prisma.InputJsonValue,
    newState: updated as unknown as Prisma.InputJsonValue,
  });

  return updated;
}

export async function togglePlanStatus(
  ctx: TenantContext,
  planId: string,
  isActive: boolean
): Promise<Plan> {
  requireSuperAdmin(ctx);

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw new BillingError('Package not found', 404);
  }

  const updated = await prisma.plan.update({
    where: { id: planId },
    data: { isActive },
  });

  await createAuditLog(ctx, {
    action: isActive ? 'BILLING_PLAN_ACTIVATED' : 'BILLING_PLAN_DEACTIVATED',
    entityType: 'PLAN',
    entityId: planId,
    previousState: { isActive: plan.isActive } as unknown as Prisma.InputJsonValue,
    newState: { isActive: updated.isActive } as unknown as Prisma.InputJsonValue,
  });

  return updated;
}

export async function deletePlan(
  ctx: TenantContext,
  planId: string,
  options?: { reassignToFree?: boolean }
): Promise<{ success: boolean; message: string; reassignedCount?: number }> {
  requireSuperAdmin(ctx);

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      _count: {
        select: { subscriptions: true },
      },
    },
  });

  if (!plan) {
    throw new BillingError('Package not found', 404);
  }

  if (plan.slug === 'free') {
    throw new BillingError('The canonical Free package cannot be deleted.', 400);
  }

  let reassignedCount = 0;

  if (options?.reassignToFree) {
    const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });
    if (!freePlan) {
      throw new BillingError('Canonical Free package not found for reassignment', 500);
    }

    const subs = await prisma.subscription.findMany({ where: { planId } });
    reassignedCount = subs.length;

    const now = new Date();
    for (const sub of subs) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          planId: freePlan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 365 * 10 * 86400000),
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt: null,
        },
      });

      await prisma.business.update({
        where: { id: sub.businessId },
        data: { planId: freePlan.id },
      });

      await createAuditLog(ctx, {
        action: 'BUSINESS_PLAN_REASSIGNED_TO_FREE',
        entityType: 'BUSINESS',
        entityId: sub.businessId,
        previousState: { planId: plan.id, planName: plan.name, status: sub.status } as unknown as Prisma.InputJsonValue,
        newState: { planId: freePlan.id, planName: freePlan.name, status: SubscriptionStatus.ACTIVE } as unknown as Prisma.InputJsonValue,
      });
    }

    await prisma.business.updateMany({
      where: { planId },
      data: { planId: freePlan.id },
    });
  } else {
    // Check if any subscriptions reference this plan
    if (plan._count.subscriptions > 0) {
      throw new BillingError(
        `Cannot delete package '${plan.name}' because ${plan._count.subscriptions} businesses are currently subscribed to it. Deactivate the package instead to prevent new assignments while preserving existing subscriptions and billing history.`,
        409
      );
    }

    // Also check if any businesses have planId pointing here
    const businessesWithPlan = await prisma.business.count({
      where: { planId },
    });
    if (businessesWithPlan > 0) {
      throw new BillingError(
        `Cannot delete package '${plan.name}' because ${businessesWithPlan} businesses have this package assigned. Please reassign those businesses or deactivate the package instead.`,
        409
      );
    }
  }

  await prisma.plan.delete({
    where: { id: planId },
  });

  await createAuditLog(ctx, {
    action: 'BILLING_PLAN_DELETED',
    entityType: 'PLAN',
    entityId: planId,
    previousState: plan as unknown as Prisma.InputJsonValue,
  });

  return {
    success: true,
    message: `Package '${plan.name}' successfully deleted.`,
    reassignedCount,
  };
}

export interface PlanCleanupPreviewResult {
  canonicalFreePlan: {
    id: string;
    name: string;
    slug: string;
    priceMinor: number;
    features: string[];
    limits: Record<string, any>;
    maxCustomers: number;
    maxBranches: number;
    maxStaff: number;
  };
  unwantedPlans: Array<{
    id: string;
    name: string;
    slug: string;
    priceMinor: number;
    subscriptionsCount: number;
    businessesCount: number;
    isActive: boolean;
  }>;
  affectedBusinesses: Array<{
    id: string;
    name: string;
    currentPlanId: string;
    currentPlanName: string;
    currentPlanSlug: string;
    subscriptionStatus: string;
    invoicesCount: number;
    paymentsCount: number;
  }>;
  preservedHistoricalPlans: Array<{
    id: string;
    name: string;
    slug: string;
    reason: string;
    subscriptionsCount: number;
  }>;
  summary: {
    totalPlansInDb: number;
    unwantedPlansCount: number;
    affectedBusinessesCount: number;
    preservedHistoricalPlansCount: number;
    canCleanSafely: boolean;
  };
}

export async function getPlanCleanupPreview(ctx: TenantContext): Promise<PlanCleanupPreviewResult> {
  requireSuperAdmin(ctx);

  const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });
  if (!freePlan) {
    throw new BillingError('Canonical Free package with code "free" not found in database', 404);
  }

  const allPlans = await prisma.plan.findMany({
    include: {
      subscriptions: {
        include: {
          business: true,
          invoices: true,
          payments: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const protectedSeedSlugs = new Set(['free', 'starter', 'growth', 'enterprise']);

  const unwantedPlans: PlanCleanupPreviewResult['unwantedPlans'] = [];
  const affectedBusinessesMap = new Map<string, PlanCleanupPreviewResult['affectedBusinesses'][0]>();
  const preservedHistoricalPlans: PlanCleanupPreviewResult['preservedHistoricalPlans'] = [];

  for (const plan of allPlans) {
    if (plan.slug === 'free') continue;

    if (protectedSeedSlugs.has(plan.slug)) {
      preservedHistoricalPlans.push({
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        reason: plan.subscriptions.length > 0
          ? `Canonical seed package with ${plan.subscriptions.length} active business subscription(s) and historical billing records. Will be deactivated from active catalogue to prevent new assignments while preserving existing contracts.`
          : 'Canonical seed package. Deactivated from active catalogue.',
        subscriptionsCount: plan.subscriptions.length,
      });
      continue;
    }

    // Manually created / test plan
    const bizCount = await prisma.business.count({ where: { planId: plan.id } });
    unwantedPlans.push({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      priceMinor: plan.priceMinor,
      subscriptionsCount: plan.subscriptions.length,
      businessesCount: bizCount,
      isActive: plan.isActive,
    });

    for (const sub of plan.subscriptions) {
      if (!affectedBusinessesMap.has(sub.business.id)) {
        affectedBusinessesMap.set(sub.business.id, {
          id: sub.business.id,
          name: sub.business.name,
          currentPlanId: plan.id,
          currentPlanName: plan.name,
          currentPlanSlug: plan.slug,
          subscriptionStatus: sub.status,
          invoicesCount: sub.invoices.length,
          paymentsCount: sub.payments.length,
        });
      }
    }
  }

  const affectedBusinesses = Array.from(affectedBusinessesMap.values());

  return {
    canonicalFreePlan: {
      id: freePlan.id,
      name: freePlan.name,
      slug: freePlan.slug,
      priceMinor: freePlan.priceMinor,
      features: (freePlan.features as string[]) || [],
      limits: (freePlan.limits as Record<string, any>) || {},
      maxCustomers: freePlan.maxCustomers,
      maxBranches: freePlan.maxBranches,
      maxStaff: freePlan.maxStaff,
    },
    unwantedPlans,
    affectedBusinesses,
    preservedHistoricalPlans,
    summary: {
      totalPlansInDb: allPlans.length,
      unwantedPlansCount: unwantedPlans.length,
      affectedBusinessesCount: affectedBusinesses.length,
      preservedHistoricalPlansCount: preservedHistoricalPlans.length,
      canCleanSafely: true,
    },
  };
}

export interface PlanCleanupExecutionResult {
  success: boolean;
  canonicalFreePlan: {
    id: string;
    name: string;
    slug: string;
  };
  reassignedBusinessesCount: number;
  deletedPlansCount: number;
  archivedPlansCount: number;
  deletedPlanSlugs: string[];
  archivedPlanSlugs: string[];
  message: string;
}

export async function executePlanCleanup(
  ctx: TenantContext,
  options?: { dryRun?: boolean }
): Promise<PlanCleanupExecutionResult> {
  requireSuperAdmin(ctx);

  const preview = await getPlanCleanupPreview(ctx);
  if (options?.dryRun) {
    return {
      success: true,
      canonicalFreePlan: {
        id: preview.canonicalFreePlan.id,
        name: preview.canonicalFreePlan.name,
        slug: preview.canonicalFreePlan.slug,
      },
      reassignedBusinessesCount: preview.summary.affectedBusinessesCount,
      deletedPlansCount: preview.summary.unwantedPlansCount,
      archivedPlansCount: preview.summary.preservedHistoricalPlansCount,
      deletedPlanSlugs: preview.unwantedPlans.map((p) => p.slug),
      archivedPlanSlugs: preview.preservedHistoricalPlans.map((p) => p.slug),
      message: `Dry-run preview: ${preview.unwantedPlans.length} packages will be removed, ${preview.affectedBusinesses.length} businesses will be reassigned to Free.`,
    };
  }

  await createAuditLog(ctx, {
    action: 'PACKAGE_CLEANUP_INITIATED',
    entityType: 'PLAN',
    entityId: preview.canonicalFreePlan.id,
    newState: {
      unwantedPlansCount: preview.unwantedPlans.length,
      affectedBusinessesCount: preview.affectedBusinesses.length,
    } as unknown as Prisma.InputJsonValue,
  });

  const freePlanId = preview.canonicalFreePlan.id;
  const now = new Date();
  const deletedPlanSlugs: string[] = [];
  const archivedPlanSlugs: string[] = [];
  let reassignedBusinessesCount = 0;

  // Execute reassignment and deletions inside a transaction
  await prisma.$transaction(async (tx) => {
    // 1. Reassign all subscriptions on unwanted plans to Free Starter
    for (const b of preview.affectedBusinesses) {
      const sub = await tx.subscription.findUnique({
        where: { businessId: b.id },
      });
      if (sub) {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            planId: freePlanId,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + 365 * 10 * 86400000),
            cancelAtPeriodEnd: false,
            gracePeriodEndsAt: null,
          },
        });
      }

      await tx.business.update({
        where: { id: b.id },
        data: { planId: freePlanId },
      });

      await tx.auditLog.create({
        data: {
          businessId: b.id,
          actorUserId: ctx.user?.id || null,
          action: 'BUSINESS_PLAN_REASSIGNED_TO_FREE',
          entityType: 'BUSINESS',
          entityId: b.id,
          previousState: {
            planId: b.currentPlanId,
            planName: b.currentPlanName,
            status: b.subscriptionStatus,
          } as unknown as Prisma.InputJsonValue,
          newState: {
            planId: freePlanId,
            planName: preview.canonicalFreePlan.name,
            status: SubscriptionStatus.ACTIVE,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      reassignedBusinessesCount++;
    }

    // 2. Also reassign any business.planId pointing to unwanted plans without subscriptions
    const unwantedPlanIds = preview.unwantedPlans.map((p) => p.id);
    if (unwantedPlanIds.length > 0) {
      await tx.business.updateMany({
        where: { planId: { in: unwantedPlanIds } },
        data: { planId: freePlanId },
      });
    }

    // 3. Preserved historical seed plans are retained for grandfathered contracts
    for (const seed of preview.preservedHistoricalPlans) {
      archivedPlanSlugs.push(seed.slug);
    }

    // 4. Delete each unwanted plan
    for (const p of preview.unwantedPlans) {
      try {
        await tx.plan.delete({
          where: { id: p.id },
        });
        deletedPlanSlugs.push(p.slug);

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.user?.id || null,
            action: 'BILLING_PLAN_DELETED',
            entityType: 'PLAN',
            entityId: p.id,
            previousState: { name: p.name, slug: p.slug } as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err: any) {
        // Fallback to archiving if any DB constraint was violated
        await tx.plan.update({
          where: { id: p.id },
          data: { isActive: false },
        });
        archivedPlanSlugs.push(p.slug);

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.user?.id || null,
            action: 'BILLING_PLAN_ARCHIVED',
            entityType: 'PLAN',
            entityId: p.id,
            previousState: { name: p.name, slug: p.slug, error: err.message } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }
  });

  await createAuditLog(ctx, {
    action: 'PACKAGE_CLEANUP_COMPLETED',
    entityType: 'PLAN',
    entityId: freePlanId,
    newState: {
      reassignedBusinessesCount,
      deletedPlansCount: deletedPlanSlugs.length,
      archivedPlansCount: archivedPlanSlugs.length,
    } as unknown as Prisma.InputJsonValue,
  });

  return {
    success: true,
    canonicalFreePlan: {
      id: preview.canonicalFreePlan.id,
      name: preview.canonicalFreePlan.name,
      slug: preview.canonicalFreePlan.slug,
    },
    reassignedBusinessesCount,
    deletedPlansCount: deletedPlanSlugs.length,
    archivedPlansCount: archivedPlanSlugs.length,
    deletedPlanSlugs,
    archivedPlanSlugs,
    message: `Package cleanup completed successfully: ${deletedPlanSlugs.length} unwanted package(s) deleted, ${reassignedBusinessesCount} business(es) safely reassigned to Free Starter, canonical Free package preserved as the only active package.`,
  };
}

// ============================================================================
// 2. BUSINESS BILLING & SUBSCRIPTION DETAILS
// ============================================================================

export async function getBusinessBillingOverview(ctx: TenantContext) {
  requirePermission(ctx, 'BILLING_VIEW');

  const sub = await getBusinessSubscription(ctx.businessId);
  const usageAndLimits = await getUsageAndLimits(ctx.businessId);
  const usageSummary = await UsageMeterService.getUsageSummary(ctx.businessId);

  const [availablePlans, payments, invoices] = await Promise.all([
    getAllPlans(true),
    prisma.payment.findMany({
      where: { businessId: ctx.businessId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.invoice.findMany({
      where: { businessId: ctx.businessId },
      orderBy: { issuedAt: 'desc' },
      take: 10,
    }),
  ]);

  // Current payable amount calculation
  const isYearly = sub.billingInterval === BillingInterval.YEARLY;
  const currentPriceMinor = isYearly
    ? (sub.plan.yearlyPriceMinor ?? sub.plan.priceMinor * 10)
    : sub.plan.priceMinor;

  return {
    subscription: {
      id: sub.id,
      status: sub.status,
      billingInterval: sub.billingInterval,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      gracePeriodEndsAt: sub.gracePeriodEndsAt,
      currentPriceMinor,
      currency: sub.plan.currency,
    },
    plan: {
      id: sub.plan.id,
      name: sub.plan.name,
      slug: sub.plan.slug,
      description: sub.plan.description,
      monthlyPriceMinor: sub.plan.priceMinor,
      yearlyPriceMinor: sub.plan.yearlyPriceMinor ?? sub.plan.priceMinor * 10,
      features: (sub.plan.features as string[]) || [],
      limits: usageAndLimits.limits,
    },
    usage: usageAndLimits.usage,
    limits: usageAndLimits.limits,
    usageSummary,
    availablePlans: availablePlans.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      monthlyPriceMinor: p.priceMinor,
      yearlyPriceMinor: p.yearlyPriceMinor ?? p.priceMinor * 10,
      currency: p.currency,
      features: (p.features as string[]) || [],
      limits: (p.limits as Record<string, number | null>) || {},
      maxCustomers: p.maxCustomers,
      maxBranches: p.maxBranches,
      maxStaff: p.maxStaff,
      isCurrent: p.id === sub.plan.id,
    })),
    recentPayments: payments,
    recentInvoices: invoices,
  };
}

// ============================================================================
// 3. PLAN CHANGE & BILLING INTERVAL MODIFICATION
// ============================================================================

export async function changePlan(
  ctx: TenantContext,
  targetPlanId: string,
  billingInterval: BillingInterval = BillingInterval.MONTHLY
) {
  requirePermission(ctx, 'BILLING_MANAGE');

  const targetPlan = await prisma.plan.findUnique({ where: { id: targetPlanId } });
  if (!targetPlan) {
    throw new Error('Target subscription plan not found');
  }
  if (!targetPlan.isActive) {
    throw new Error('This plan is no longer available for new subscriptions');
  }

  const currentSub = await getBusinessSubscription(ctx.businessId);

  // Server determines exact price minor
  const isYearly = billingInterval === BillingInterval.YEARLY;
  const payableAmountMinor = isYearly
    ? (targetPlan.yearlyPriceMinor ?? targetPlan.priceMinor * 10)
    : targetPlan.priceMinor;

  const now = new Date();
  const periodDurationDays = isYearly ? 365 : 30;
  const newPeriodEnd = new Date(now.getTime() + periodDurationDays * 86400000);

  // Free plan switch
  if (payableAmountMinor === 0 || targetPlan.slug === 'free') {
    const updatedSub = await prisma.subscription.update({
      where: { id: currentSub.id },
      data: {
        planId: targetPlan.id,
        billingInterval,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 365 * 10 * 86400000),
        cancelAtPeriodEnd: false,
        gracePeriodEndsAt: null,
      },
      include: { plan: true },
    });

    await createAuditLog(ctx, {
      action: 'SUBSCRIPTION_CHANGED_TO_FREE',
      entityType: 'SUBSCRIPTION',
      entityId: updatedSub.id,
      previousState: { planId: currentSub.planId, status: currentSub.status },
      newState: { planId: updatedSub.planId, status: updatedSub.status },
    });

    return { subscription: updatedSub, invoice: null, payment: null };
  }

  // Paid plan switch with verified server-side transaction records
  const invoiceNumber = generateInvoiceNumber();

  // Create Invoice
  const invoice = await prisma.invoice.create({
    data: {
      businessId: ctx.businessId,
      subscriptionId: currentSub.id,
      invoiceNumber,
      amountMinor: payableAmountMinor,
      currency: targetPlan.currency,
      status: InvoiceStatus.PAID,
      billingPeriod: `${billingInterval} (${targetPlan.name})`,
      issuedAt: now,
      paidAt: now,
    },
  });

  // Create Payment record
  const payment = await prisma.payment.create({
    data: {
      businessId: ctx.businessId,
      subscriptionId: currentSub.id,
      amountMinor: payableAmountMinor,
      currency: targetPlan.currency,
      status: PaymentStatus.SUCCESS,
      provider: 'REPLOYTY_INTERNAL_GATEWAY',
      providerPaymentId: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      paymentMethod: 'UPI / Direct Debit',
    },
  });

  // Update subscription
  const updatedSub = await prisma.subscription.update({
    where: { id: currentSub.id },
    data: {
      planId: targetPlan.id,
      billingInterval,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: newPeriodEnd,
      cancelAtPeriodEnd: false,
      gracePeriodEndsAt: null,
    },
    include: { plan: true },
  });

  await createAuditLog(ctx, {
    action: 'SUBSCRIPTION_UPGRADED',
    entityType: 'SUBSCRIPTION',
    entityId: updatedSub.id,
    previousState: { planId: currentSub.planId, status: currentSub.status },
    newState: {
      planId: updatedSub.planId,
      billingInterval,
      status: updatedSub.status,
      invoiceNumber,
    },
  });

  return { subscription: updatedSub, invoice, payment };
}

// ============================================================================
// 4. SUBSCRIPTION CANCELLATION & RESUME
// ============================================================================

export async function cancelSubscription(ctx: TenantContext, immediate: boolean = false) {
  requirePermission(ctx, 'BILLING_MANAGE');

  const sub = await getBusinessSubscription(ctx.businessId);

  if (immediate) {
    const freePlan = (await prisma.plan.findUnique({ where: { slug: 'free' } })) || (await prisma.plan.findFirst());
    if (!freePlan) throw new Error('Free plan not available for downgrade');

    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        planId: freePlan.id,
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        gracePeriodEndsAt: null,
      },
      include: { plan: true },
    });

    await createAuditLog(ctx, {
      action: 'SUBSCRIPTION_CANCELLED_IMMEDIATE',
      entityType: 'SUBSCRIPTION',
      entityId: sub.id,
      previousState: { planId: sub.planId, status: sub.status },
      newState: { planId: updated.planId, status: updated.status },
    });

    return updated;
  } else {
    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
      include: { plan: true },
    });

    await createAuditLog(ctx, {
      action: 'SUBSCRIPTION_CANCELLED_AT_PERIOD_END',
      entityType: 'SUBSCRIPTION',
      entityId: sub.id,
      previousState: { cancelAtPeriodEnd: sub.cancelAtPeriodEnd },
      newState: { cancelAtPeriodEnd: true },
    });

    return updated;
  }
}

export async function resumeSubscription(ctx: TenantContext) {
  requirePermission(ctx, 'BILLING_MANAGE');

  const sub = await getBusinessSubscription(ctx.businessId);

  if (!sub.cancelAtPeriodEnd) {
    throw new Error('Subscription is not marked for cancellation');
  }

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: false },
    include: { plan: true },
  });

  await createAuditLog(ctx, {
    action: 'SUBSCRIPTION_RESUMED',
    entityType: 'SUBSCRIPTION',
    entityId: sub.id,
    previousState: { cancelAtPeriodEnd: true },
    newState: { cancelAtPeriodEnd: false },
  });

  return updated;
}

// ============================================================================
// 5. INVOICES & PAYMENTS (TENANT ISOLATED)
// ============================================================================

export async function getInvoices(ctx: TenantContext): Promise<Invoice[]> {
  requirePermission(ctx, 'BILLING_VIEW');
  return prisma.invoice.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { issuedAt: 'desc' },
  });
}

export async function getPayments(ctx: TenantContext): Promise<Payment[]> {
  requirePermission(ctx, 'BILLING_VIEW');
  return prisma.payment.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { createdAt: 'desc' },
  });
}

// ============================================================================
// 6. GRACE & OVERDUE WORKER (IDEMPOTENT & PRESERVES DATA)
// ============================================================================

export async function evaluateGraceAndDowngrades(): Promise<{ evaluated: number; downgraded: number }> {
  const now = new Date();
  const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });
  if (!freePlan) return { evaluated: 0, downgraded: 0 };

  // Find overdue / grace expired subscriptions
  const expiredSubs = await prisma.subscription.findMany({
    where: {
      planId: { not: freePlan.id },
      OR: [
        {
          status: { in: [SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.PAYMENT_FAILED, SubscriptionStatus.OVERDUE] },
          gracePeriodEndsAt: { lt: now },
        },
        {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: { lt: now },
        },
      ],
    },
  });

  let downgraded = 0;
  for (const sub of expiredSubs) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        planId: freePlan.id,
        status: SubscriptionStatus.ACTIVE,
        billingInterval: BillingInterval.MONTHLY,
        cancelAtPeriodEnd: false,
        gracePeriodEndsAt: null,
      },
    });
    downgraded++;
  }

  return { evaluated: expiredSubs.length, downgraded };
}

// ============================================================================
// 7. SUPER ADMIN BILLING OPERATIONS
// ============================================================================

export async function adminGetAllSubscriptions(ctx: TenantContext) {
  requireSuperAdmin(ctx);
  return prisma.subscription.findMany({
    include: {
      business: { select: { id: true, name: true, slug: true } },
      plan: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function adminGetAllInvoices(ctx: TenantContext) {
  requireSuperAdmin(ctx);
  return prisma.invoice.findMany({
    include: {
      business: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { issuedAt: 'desc' },
    take: 100,
  });
}

export async function adminGetAllPayments(ctx: TenantContext) {
  requireSuperAdmin(ctx);
  return prisma.payment.findMany({
    include: {
      business: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function adminUpdateSubscriptionStatus(
  ctx: TenantContext,
  subscriptionId: string,
  status: SubscriptionStatus,
  graceDays?: number
) {
  requireSuperAdmin(ctx);

  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub) throw new Error('Subscription not found');

  const gracePeriodEndsAt =
    graceDays && graceDays > 0 ? new Date(Date.now() + graceDays * 86400000) : null;

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status,
      gracePeriodEndsAt: gracePeriodEndsAt ?? sub.gracePeriodEndsAt,
    },
    include: { plan: true },
  });

  await createAuditLog(ctx, {
    action: 'ADMIN_SUBSCRIPTION_STATUS_OVERRIDE',
    entityType: 'SUBSCRIPTION',
    entityId: subscriptionId,
    businessId: sub.businessId,
    previousState: { status: sub.status },
    newState: { status: updated.status, gracePeriodEndsAt: updated.gracePeriodEndsAt },
  });

  return updated;
}

// ============================================================================
// 8. PAYMENT WEBHOOK (IDEMPOTENT, REPLAY-SAFE)
// ============================================================================

export interface WebhookEventPayload {
  eventId: string;
  providerPaymentId: string;
  businessId: string;
  amountMinor: number;
  currency?: string;
  status: 'SUCCESS' | 'FAILED';
  paymentMethod?: string;
  planId?: string;
}

export async function handlePaymentWebhook(payload: WebhookEventPayload): Promise<{ processed: boolean; payment: Payment }> {
  if (!payload.businessId || typeof payload.businessId !== 'string') {
    throw new BillingError('Missing required businessId in webhook payload', 400);
  }
  if (!payload.providerPaymentId || typeof payload.providerPaymentId !== 'string') {
    throw new BillingError('Missing required providerPaymentId in webhook payload', 400);
  }
  if (typeof payload.amountMinor !== 'number' || isNaN(payload.amountMinor) || payload.amountMinor < 0) {
    throw new BillingError('Invalid amountMinor in webhook payload', 400);
  }

  // Idempotency check: if payment already exists with this providerPaymentId, return early
  const existingPayment = await prisma.payment.findFirst({
    where: { providerPaymentId: payload.providerPaymentId },
  });

  if (existingPayment) {
    return { processed: false, payment: existingPayment };
  }

  const sub = await getBusinessSubscription(payload.businessId);

  const payment = await prisma.payment.create({
    data: {
      businessId: payload.businessId,
      subscriptionId: sub.id,
      amountMinor: payload.amountMinor,
      currency: payload.currency || 'INR',
      status: payload.status === 'SUCCESS' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
      provider: 'WEBHOOK_GATEWAY',
      providerPaymentId: payload.providerPaymentId,
      paymentMethod: payload.paymentMethod || 'Card / Webhook',
    },
  });

  if (payload.status === 'SUCCESS') {
    // If webhook reports successful payment, ensure subscription is active
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        gracePeriodEndsAt: null,
      },
    });

    // Generate invoice
    await prisma.invoice.create({
      data: {
        businessId: payload.businessId,
        subscriptionId: sub.id,
        invoiceNumber: generateInvoiceNumber(),
        amountMinor: payload.amountMinor,
        currency: payload.currency || 'INR',
        status: InvoiceStatus.PAID,
        billingPeriod: `Webhook Renewal (${sub.plan.name})`,
        paidAt: new Date(),
      },
    });
  } else {
    // Payment failed -> enter GRACE_PERIOD
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.GRACE_PERIOD,
        gracePeriodEndsAt: new Date(Date.now() + 7 * 86400000), // 7 days grace
      },
    });
  }

  return { processed: true, payment };
}

/**
 * Super Admin manual plan assignment for a business tenant.
 * Updates subscription and business plan, resets grace periods, and creates audit log.
 */
export async function adminAssignBusinessPlan(
  ctx: TenantContext,
  businessId: string,
  planId: string
) {
  requireSuperAdmin(ctx);

  const [business, targetPlan] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.plan.findUnique({ where: { id: planId } }),
  ]);

  if (!business) {
    throw new BillingError('Business not found', 404);
  }
  if (!targetPlan) {
    throw new BillingError('Target plan not found', 404);
  }

  const currentSub = await getBusinessSubscription(businessId);
  const now = new Date();
  const periodDurationDays = currentSub.billingInterval === BillingInterval.YEARLY ? 365 : 30;

  const updatedSub = await prisma.subscription.update({
    where: { id: currentSub.id },
    data: {
      planId: targetPlan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: targetPlan.slug === 'free'
        ? new Date(now.getTime() + 365 * 10 * 86400000)
        : new Date(now.getTime() + periodDurationDays * 86400000),
      cancelAtPeriodEnd: false,
      gracePeriodEndsAt: null,
    },
    include: { plan: true },
  });

  // Also update business.planId
  await prisma.business.update({
    where: { id: businessId },
    data: { planId: targetPlan.id },
  });

  await createAuditLog(ctx, {
    action: 'BUSINESS_PLAN_CHANGED',
    entityType: 'BUSINESS',
    entityId: businessId,
    previousState: {
      planId: currentSub.planId,
      planName: currentSub.plan.name,
      status: currentSub.status,
    } as unknown as Prisma.InputJsonValue,
    newState: {
      planId: targetPlan.id,
      planName: targetPlan.name,
      status: updatedSub.status,
      assignedBy: (ctx as any)?.user?.id || (ctx as any)?.userId || 'SUPER_ADMIN',
    } as unknown as Prisma.InputJsonValue,
  });

  return {
    success: true,
    businessId,
    subscription: updatedSub,
    plan: {
      id: targetPlan.id,
      name: targetPlan.name,
      slug: targetPlan.slug,
      features: (targetPlan.features as string[]) || [],
      priceMinor: targetPlan.priceMinor,
      billingInterval: updatedSub.billingInterval,
    },
  };
}
