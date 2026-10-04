import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { Plan, Subscription, SubscriptionStatus } from '@prisma/client';

export type FeatureKey =
  | 'CUSTOMER_CRM'
  | 'LOYALTY'
  | 'REWARDS'
  | 'OFFERS'
  | 'REVIEWS'
  | 'CATALOG'
  | 'BRANCHES'
  | 'STAFF'
  | 'ANALYTICS'
  | 'AI_REVIEW_ASSISTANT'
  | 'EXPORTS'
  | 'CAMPAIGNS';

export type LimitKey =
  | 'maxCustomers'
  | 'maxBranches'
  | 'maxStaff'
  | 'maxRewards'
  | 'maxOffers'
  | 'monthlyAiDrafts'
  | 'maxActiveCampaigns';

export class FeatureNotIncludedError extends Error {
  code = 'FEATURE_NOT_INCLUDED';
  featureKey: FeatureKey;
  constructor(featureKey: FeatureKey, message?: string) {
    super(message || `Feature [${featureKey}] is not included in your current subscription plan`);
    this.name = 'FeatureNotIncludedError';
    this.featureKey = featureKey;
  }
}

export class UsageLimitExceededError extends Error {
  code = 'LIMIT_EXCEEDED';
  limitKey: LimitKey;
  limit: number;
  current: number;
  constructor(limitKey: LimitKey, limit: number, current: number, message?: string) {
    super(message || `Usage limit exceeded for [${limitKey}]. Current: ${current}, Limit: ${limit}`);
    this.name = 'UsageLimitExceededError';
    this.limitKey = limitKey;
    this.limit = limit;
    this.current = current;
  }
}

/**
 * Returns a fallback default Free plan in case database lookup fails or none exists yet.
 */
function getDefaultFreePlan(): Partial<Plan> {
  return {
    id: 'plan_fallback_free',
    name: 'Free Forever',
    slug: 'free',
    description: 'Essential customer retention for solo shops and early startups.',
    priceMinor: 0,
    yearlyPriceMinor: 0,
    currency: 'INR',
    features: ['CUSTOMER_CRM', 'LOYALTY', 'CATALOG', 'BRANCHES', 'STAFF'],
    maxCustomers: 100,
    maxBranches: 1,
    maxStaff: 2,
    limits: {
      maxRewards: 2,
      maxOffers: 1,
      monthlyAiDrafts: 0,
    },
    isActive: true,
  };
}

/**
 * Resolves the business subscription with automated grace period and overdue expiration handling.
 * Never grants premium features if subscription is missing, suspended, or expired beyond grace.
 */
export async function getBusinessSubscription(businessId: string): Promise<Subscription & { plan: Plan }> {
  let sub = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });

  const freePlan = (await prisma.plan.findUnique({ where: { slug: 'free' } })) || (getDefaultFreePlan() as Plan);

  // If no subscription exists, auto-provision a Free plan subscription
  if (!sub) {
    sub = await prisma.subscription.create({
      data: {
        businessId,
        planId: freePlan.id,
        status: SubscriptionStatus.ACTIVE,
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 10 * 86400000), // 10 years for free
      },
      include: { plan: true },
    });
    return sub;
  }

  const now = new Date();

  // 1. Check if ACTIVE/TRIAL period has ended without renewal -> move to GRACE_PERIOD / OVERDUE
  if (
    (sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.TRIAL) &&
    sub.currentPeriodEnd < now &&
    sub.plan.slug !== 'free'
  ) {
    // 7-day grace period
    const graceEnd = sub.gracePeriodEndsAt || new Date(now.getTime() + 7 * 86400000);
    sub = await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.GRACE_PERIOD,
        gracePeriodEndsAt: graceEnd,
      },
      include: { plan: true },
    });
  }

  // 2. Check if GRACE_PERIOD or PAYMENT_FAILED has expired -> move to OVERDUE or downgrade to FREE
  if (
    (sub.status === SubscriptionStatus.GRACE_PERIOD ||
      sub.status === SubscriptionStatus.PAYMENT_FAILED ||
      sub.status === SubscriptionStatus.OVERDUE) &&
    sub.gracePeriodEndsAt &&
    sub.gracePeriodEndsAt < now &&
    sub.plan.slug !== 'free'
  ) {
    // Downgrade to Free plan without deleting data
    sub = await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        planId: freePlan.id,
        status: SubscriptionStatus.ACTIVE,
        billingInterval: 'MONTHLY',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 365 * 10 * 86400000),
        cancelAtPeriodEnd: false,
        gracePeriodEndsAt: null,
      },
      include: { plan: true },
    });
  }

  return sub;
}

/**
 * Returns the effective plan for a business.
 */
export async function getBusinessPlan(businessId: string): Promise<Plan> {
  const sub = await getBusinessSubscription(businessId);
  return sub.plan;
}

/**
 * Checks whether a business is entitled to a specific feature.
 * One source of truth for all feature access checks.
 */
export async function hasFeature(businessId: string, featureKey: FeatureKey): Promise<boolean> {
  const sub = await getBusinessSubscription(businessId);

  // Suspended businesses have no feature access
  if (sub.status === SubscriptionStatus.SUSPENDED) {
    return false;
  }

  const features = (sub.plan.features as string[]) || [];

  if (featureKey === 'CAMPAIGNS') {
    return features.includes('CAMPAIGNS') || sub.plan.slug !== 'free';
  }

  return features.includes(featureKey);
}

/**
 * Enforces feature entitlement. Throws FeatureNotIncludedError if business does not have the feature.
 */
export async function requireFeature(ctx: TenantContext, featureKey: FeatureKey): Promise<void> {
  const allowed = await hasFeature(ctx.businessId, featureKey);
  if (!allowed) {
    throw new FeatureNotIncludedError(featureKey);
  }
}

/**
 * Calculates current actual database counts and limits for the business.
 */
export async function getUsageAndLimits(businessId: string) {
  const sub = await getBusinessSubscription(businessId);
  const plan = sub.plan;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Limits from Plan model
  const planLimits = (plan.limits as Record<string, number | null>) || {};

  const limits: Record<LimitKey, number | null> = {
    maxCustomers: plan.maxCustomers,
    maxBranches: plan.maxBranches,
    maxStaff: plan.maxStaff,
    maxRewards: planLimits.maxRewards ?? (plan.slug === 'free' ? 2 : null),
    maxOffers: planLimits.maxOffers ?? (plan.slug === 'free' ? 1 : null),
    monthlyAiDrafts: planLimits.monthlyAiDrafts ?? (plan.slug === 'growth' || plan.slug === 'enterprise' ? 100 : 0),
    maxActiveCampaigns: planLimits.maxActiveCampaigns ?? (plan.slug === 'free' ? 0 : plan.slug === 'starter' ? 5 : 25),
  };

  // Live database counts
  const [
    customerCount,
    branchCount,
    staffCount,
    activeRewardCount,
    activeOfferCount,
    monthlyAiDraftsCount,
    activeCampaignCount,
  ] = await Promise.all([
    prisma.customer.count({ where: { businessId } }),
    prisma.branch.count({ where: { businessId, status: { not: 'INACTIVE' } } }),
    prisma.staffMembership.count({ where: { businessId, status: 'ACTIVE' } }),
    prisma.reward.count({ where: { businessId, status: 'ACTIVE' } }),
    prisma.offer.count({ where: { businessId, status: 'ACTIVE' } }),
    prisma.reviewGeneration.count({ where: { businessId, createdAt: { gte: startOfMonth } } }),
    prisma.campaign.count({ where: { businessId, status: 'ACTIVE' } }),
  ]);

  const usage: Record<LimitKey, number> = {
    maxCustomers: customerCount,
    maxBranches: branchCount,
    maxStaff: staffCount,
    maxRewards: activeRewardCount,
    maxOffers: activeOfferCount,
    monthlyAiDrafts: monthlyAiDraftsCount,
    maxActiveCampaigns: activeCampaignCount,
  };

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      billingInterval: sub.billingInterval,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      gracePeriodEndsAt: sub.gracePeriodEndsAt,
      features: (plan.features as string[]) || [],
    },
    usage,
    limits,
  };
}

/**
 * Checks whether an increment of usage is allowed under current plan limits.
 */
export async function checkUsageLimit(
  businessId: string,
  limitKey: LimitKey
): Promise<{ allowed: boolean; current: number; limit: number | null }> {
  const { usage, limits } = await getUsageAndLimits(businessId);
  const current = usage[limitKey];
  const limit = limits[limitKey];

  if (limit === null || limit === undefined) {
    return { allowed: true, current, limit: null };
  }

  return {
    allowed: current < limit,
    current,
    limit,
  };
}

/**
 * Enforces usage limit before creating a new resource.
 * Throws UsageLimitExceededError if limit is reached or exceeded.
 */
export async function requireUsageLimit(businessId: string, limitKey: LimitKey): Promise<void> {
  const check = await checkUsageLimit(businessId, limitKey);
  if (!check.allowed && check.limit !== null) {
    throw new UsageLimitExceededError(limitKey, check.limit, check.current);
  }
}
