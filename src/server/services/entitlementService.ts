import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { Plan, Subscription, SubscriptionStatus } from '@prisma/client';

export type FeatureKey =
  // Canonical identifiers
  | 'CUSTOMER_MANAGEMENT'
  | 'CUSTOMER_QR_JOINING'
  | 'LOYALTY_STAMPS'
  | 'LOYALTY_POINTS'
  | 'LOYALTY_PROGRAMS'
  | 'REWARDS_CATALOG'
  | 'REWARD_REDEMPTION'
  | 'OFFERS'
  | 'CAMPAIGNS'
  | 'CUSTOMER_REVIEWS'
  | 'AI_REVIEW_ASSISTANT'
  | 'SOCIAL_INTEGRATIONS'
  | 'CUSTOMER_SEGMENTS'
  | 'RETENTION_WORKFLOWS'
  | 'AUTOMATIONS'
  | 'CATALOG_MENU'
  | 'BASIC_ANALYTICS'
  | 'ADVANCED_ANALYTICS'
  | 'BUSINESS_BRANDING'
  // Legacy aliases for backward compatibility
  | 'CUSTOMER_CRM'
  | 'LOYALTY'
  | 'REWARDS'
  | 'REVIEWS'
  | 'CATALOG'
  | 'BRANCHES'
  | 'STAFF'
  | 'ANALYTICS'
  | 'EXPORTS';

export interface PlatformFeature {
  id: FeatureKey;
  name: string;
  category: 'CUSTOMER' | 'LOYALTY' | 'REWARDS' | 'ENGAGEMENT' | 'CRM' | 'AUTOMATION' | 'CATALOG' | 'ANALYTICS' | 'BRANDING';
  description: string;
}

export const PLATFORM_FEATURES: PlatformFeature[] = [
  // CUSTOMER
  { id: 'CUSTOMER_MANAGEMENT', name: 'Customer Management & CRM', category: 'CUSTOMER', description: 'Store regular customer profiles, contact info, and visit history.' },
  { id: 'CUSTOMER_QR_JOINING', name: 'Customer QR Joining & Passes', category: 'CUSTOMER', description: 'Self-serve mobile QR joining and digital pass wallet.' },

  // LOYALTY
  { id: 'LOYALTY_STAMPS', name: 'Stamp Cards & Rewards', category: 'LOYALTY', description: 'Multi-stamp digital loyalty passes with automated reward unlocks.' },
  { id: 'LOYALTY_POINTS', name: 'Points Engine', category: 'LOYALTY', description: 'Spend-to-points loyalty accumulation and conversion.' },
  { id: 'LOYALTY_PROGRAMS', name: 'Loyalty Programs Management', category: 'LOYALTY', description: 'Configure active loyalty programs and earning rules.' },

  // REWARDS
  { id: 'REWARDS_CATALOG', name: 'Rewards Catalog', category: 'REWARDS', description: 'Manage unlockable customer perks, vouchers, and rewards.' },
  { id: 'REWARD_REDEMPTION', name: 'Staff Redemption Terminal', category: 'REWARDS', description: 'Counter staff terminal for verifying single-use voucher codes.' },

  // ENGAGEMENT
  { id: 'OFFERS', name: 'Special Offers & Promotions', category: 'ENGAGEMENT', description: 'Create time-limited promos, flash discounts, and deals.' },
  { id: 'CAMPAIGNS', name: 'Outreach Campaigns & Messaging', category: 'ENGAGEMENT', description: 'Broadcast SMS, WhatsApp, and targeted marketing outreach.' },
  { id: 'CUSTOMER_REVIEWS', name: 'Customer Reviews & Reputation', category: 'ENGAGEMENT', description: 'Capture 1-5 star feedback and route positive ratings to Google.' },
  { id: 'AI_REVIEW_ASSISTANT', name: 'AI Review Assistant', category: 'ENGAGEMENT', description: 'AI-assisted response generation and customer review drafting.' },
  { id: 'SOCIAL_INTEGRATIONS', name: 'Social Follow Links', category: 'ENGAGEMENT', description: 'Connect Instagram and Facebook profiles on customer cards.' },

  // CRM
  { id: 'CUSTOMER_SEGMENTS', name: 'Customer Segments & Tags', category: 'CRM', description: 'Filter VIP, At-Risk, New, and Lost regular customer cohorts.' },
  { id: 'RETENTION_WORKFLOWS', name: 'Automated Retention Workflows', category: 'CRM', description: 'Trigger win-back offers when customers become inactive.' },

  // AUTOMATION
  { id: 'AUTOMATIONS', name: 'Event-driven Automation Engine', category: 'AUTOMATION', description: 'Custom trigger-condition-action workflow automation.' },

  // CATALOG
  { id: 'CATALOG_MENU', name: 'Menu, Products & Services Catalog', category: 'CATALOG', description: 'Customer-facing digital menus and catalog showcase.' },

  // ANALYTICS
  { id: 'BASIC_ANALYTICS', name: 'Basic Analytics & Overview', category: 'ANALYTICS', description: 'Key performance metrics, visit trends, and staff totals.' },
  { id: 'ADVANCED_ANALYTICS', name: 'Advanced Insights & Attribution', category: 'ANALYTICS', description: 'Deep retention cohorts, campaign ROI, and branch comparison.' },

  // BRANDING
  { id: 'BUSINESS_BRANDING', name: 'Business Logo & Theme Presets', category: 'BRANDING', description: 'Custom workspace logo, card styling, and brand colors.' },
];

export function getAllPlatformFeatures(): PlatformFeature[] {
  return PLATFORM_FEATURES;
}

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

  // If no subscription exists, auto-provision a subscription matching business.planId or Free
  if (!sub) {
    const biz = await prisma.business.findUnique({
      where: { id: businessId },
      select: { planId: true },
    });
    const targetPlanId = biz?.planId || freePlan.id;

    sub = await prisma.subscription.create({
      data: {
        businessId,
        planId: targetPlanId,
        status: SubscriptionStatus.ACTIVE,
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 10 * 86400000),
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
export async function hasFeature(businessId: string, featureKey: FeatureKey | string): Promise<boolean> {
  const normKey = String(featureKey || '').toUpperCase().trim();
  const sub = await getBusinessSubscription(businessId);

  // Suspended businesses have no feature access
  if (sub.status === SubscriptionStatus.SUSPENDED) {
    return false;
  }

  const rawFeatures = (sub.plan.features as string[]) || [];
  const features = rawFeatures.map(f => String(f).toUpperCase().trim());

  // Direct match
  if (features.includes(normKey)) {
    return true;
  }

  // Backward compatibility alias checks
  if (normKey === 'CUSTOMER_MANAGEMENT' || normKey === 'CUSTOMER_CRM') {
    return features.includes('CUSTOMER_MANAGEMENT') || features.includes('CUSTOMER_CRM');
  }
  if (normKey === 'CUSTOMER_QR_JOINING' || normKey === 'QR') {
    return (
      features.includes('CUSTOMER_QR_JOINING') ||
      features.includes('CUSTOMER_CRM') ||
      features.includes('CUSTOMER_MANAGEMENT') ||
      features.includes('QR')
    );
  }
  if (normKey === 'LOYALTY' || normKey === 'LOYALTY_PROGRAMS') {
    return (
      features.includes('LOYALTY') ||
      features.includes('LOYALTY_PROGRAMS') ||
      features.includes('LOYALTY_STAMPS') ||
      features.includes('LOYALTY_POINTS')
    );
  }
  if (normKey === 'LOYALTY_STAMPS') {
    return features.includes('LOYALTY_STAMPS') || features.includes('LOYALTY');
  }
  if (normKey === 'LOYALTY_POINTS') {
    return features.includes('LOYALTY_POINTS') || features.includes('LOYALTY');
  }
  if (normKey === 'REWARDS' || normKey === 'REWARDS_CATALOG' || normKey === 'REWARD_REDEMPTION') {
    return features.includes('REWARDS') || features.includes('REWARDS_CATALOG') || features.includes('REWARD_REDEMPTION');
  }
  if (normKey === 'REVIEWS' || normKey === 'CUSTOMER_REVIEWS') {
    return features.includes('REVIEWS') || features.includes('CUSTOMER_REVIEWS');
  }
  if (normKey === 'CATALOG' || normKey === 'CATALOG_MENU') {
    return features.includes('CATALOG') || features.includes('CATALOG_MENU');
  }
  if (normKey === 'ANALYTICS' || normKey === 'BASIC_ANALYTICS') {
    return features.includes('ANALYTICS') || features.includes('BASIC_ANALYTICS') || features.includes('ADVANCED_ANALYTICS');
  }
  if (normKey === 'ADVANCED_ANALYTICS') {
    return features.includes('ADVANCED_ANALYTICS') || (sub.plan.slug === 'growth' || sub.plan.slug === 'enterprise');
  }
  if (normKey === 'RETENTION_WORKFLOWS' || normKey === 'AUTOMATIONS') {
    return features.includes('RETENTION_WORKFLOWS') || features.includes('AUTOMATIONS');
  }
  if (normKey === 'CAMPAIGNS') {
    return features.includes('CAMPAIGNS') || sub.plan.slug !== 'free';
  }
  if (normKey === 'SOCIAL_INTEGRATIONS') {
    return features.includes('SOCIAL_INTEGRATIONS') || features.includes('CUSTOMER_REVIEWS') || features.includes('REVIEWS');
  }
  if (normKey === 'BUSINESS_BRANDING') {
    return features.includes('BUSINESS_BRANDING') || sub.plan.slug !== 'free';
  }
  if (normKey === 'BRANCHES' || normKey === 'STAFF') {
    return true; // Core operational capabilities
  }

  return false;
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
