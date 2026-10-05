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

export async function getAllPlans(activeOnly: boolean = false): Promise<Plan[]> {
  return prisma.plan.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { priceMinor: 'asc' },
  });
}

export async function getPlanById(id: string): Promise<Plan | null> {
  return prisma.plan.findUnique({ where: { id } });
}

export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  return prisma.plan.findUnique({ where: { slug } });
}

export async function createPlan(ctx: TenantContext, input: CreatePlanInput): Promise<Plan> {
  requireSuperAdmin(ctx);

  const existing = await prisma.plan.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw new Error(`Plan with slug '${input.slug}' already exists`);
  }

  const plan = await prisma.plan.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      priceMinor: Math.round(input.priceMinor),
      yearlyPriceMinor: input.yearlyPriceMinor ? Math.round(input.yearlyPriceMinor) : null,
      currency: input.currency || 'INR',
      billingInterval: input.billingInterval || BillingInterval.MONTHLY,
      features: input.features as unknown as Prisma.InputJsonValue,
      limits: (input.limits || {}) as unknown as Prisma.InputJsonValue,
      maxCustomers: input.maxCustomers ?? 1000,
      maxBranches: input.maxBranches ?? 1,
      maxStaff: input.maxStaff ?? 5,
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
    throw new Error('Plan not found');
  }

  const updated = await prisma.plan.update({
    where: { id: planId },
    data: {
      name: input.name,
      description: input.description,
      priceMinor: input.priceMinor !== undefined ? Math.round(input.priceMinor) : undefined,
      yearlyPriceMinor: input.yearlyPriceMinor !== undefined ? Math.round(input.yearlyPriceMinor) : undefined,
      currency: input.currency,
      features: input.features !== undefined ? (input.features as unknown as Prisma.InputJsonValue) : undefined,
      limits: input.limits !== undefined ? (input.limits as unknown as Prisma.InputJsonValue) : undefined,
      maxCustomers: input.maxCustomers,
      maxBranches: input.maxBranches,
      maxStaff: input.maxStaff,
      isActive: input.isActive,
    },
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
