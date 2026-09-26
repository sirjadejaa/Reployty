import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { requireFeature } from './entitlementService';
import {
  DateRangePreset,
  DateRangeInterval,
  MetricComparison,
  ChartDataPoint,
  AnalyticsOverview,
  CustomerAnalytics,
  RetentionAnalytics,
  LoyaltyAnalytics,
  RewardsAnalytics,
  OffersAnalytics,
  ReviewAnalytics,
  BranchAnalytics,
  AnalyticsQueryInput,
  ExportType,
} from '../../types/analytics';

export class AnalyticsOperationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'AnalyticsOperationError';
    this.statusCode = statusCode;
  }
}

export async function requireAnalyticsPermission(ctx: TenantContext) {
  if (!ctx.hasPermission('ANALYTICS_VIEW') && !ctx.isOwner && !ctx.isSuperAdmin) {
    throw new AnalyticsOperationError('Missing required permission: ANALYTICS_VIEW', 403);
  }
  await requireFeature(ctx, 'ANALYTICS');
}

/**
 * Resolves date boundaries for query and comparison periods.
 */
export function resolveDateRange(
  preset: DateRangePreset = '30d',
  customStart?: string,
  customEnd?: string
): {
  current: DateRangeInterval;
  previous: DateRangeInterval;
  compareEnabled: boolean;
} {
  const now = new Date();
  let start: Date;
  let end: Date = now;
  let label = 'Last 30 Days';

  switch (preset) {
    case 'today': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = now;
      label = 'Today';
      break;
    }
    case 'yesterday': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      label = 'Yesterday';
      break;
    }
    case '7d': {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      label = 'Last 7 Days';
      break;
    }
    case '30d': {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      label = 'Last 30 Days';
      break;
    }
    case '90d': {
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      label = 'Last 90 Days';
      break;
    }
    case 'this_month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      label = 'This Month';
      break;
    }
    case 'prev_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      label = 'Previous Month';
      break;
    }
    case 'this_year': {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      label = 'This Year';
      break;
    }
    case 'custom': {
      if (!customStart || !customEnd) {
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        label = 'Last 30 Days';
      } else {
        start = new Date(customStart);
        end = new Date(customEnd);
        label = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
      }
      break;
    }
    default: {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      label = 'Last 30 Days';
    }
  }

  // Calculate equivalent previous period
  const durationMs = Math.max(end.getTime() - start.getTime(), 1000 * 60 * 60 * 24);
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  const prevLabel = `Prior ${label}`;

  return {
    current: {
      start: start.toISOString(),
      end: end.toISOString(),
      label,
    },
    previous: {
      start: prevStart.toISOString(),
      end: prevEnd.toISOString(),
      label: prevLabel,
    },
    compareEnabled: true,
  };
}

/**
 * Computes difference and percentage change safely.
 */
export function computeMetricComparison(current: number, previous: number): MetricComparison {
  const delta = Number((current - previous).toFixed(2));
  let percentChange: number | null = null;

  if (previous === 0) {
    if (current === 0) {
      percentChange = 0;
    } else {
      percentChange = 100;
    }
  } else {
    percentChange = Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
  }

  return {
    current,
    previous,
    delta,
    percentChange,
  };
}

/**
 * Resolves effective branch filter respecting staff permissions.
 */
function resolveEffectiveBranch(ctx: TenantContext, requestedBranchId?: string): string | undefined {
  if (ctx.branchId) {
    // Staff user is hard-restricted to their assigned branch
    return ctx.branchId;
  }
  if (requestedBranchId && requestedBranchId !== 'ALL') {
    return requestedBranchId;
  }
  return undefined;
}

/**
 * [1] MAIN ANALYTICS OVERVIEW
 */
export async function getAnalyticsOverview(
  ctx: TenantContext,
  query: AnalyticsQueryInput = {}
): Promise<AnalyticsOverview> {
  await requireAnalyticsPermission(ctx);

  const effectiveBranchId = resolveEffectiveBranch(ctx, query.branchId);
  const { current, previous, compareEnabled } = resolveDateRange(
    query.preset,
    query.startDate,
    query.endDate
  );

  const curStart = new Date(current.start);
  const curEnd = new Date(current.end);
  const prevStart = new Date(previous.start);
  const prevEnd = new Date(previous.end);

  const baseWhere: any = { businessId: ctx.businessId };
  if (effectiveBranchId) {
    baseWhere.branchId = effectiveBranchId;
  }

  // Dual-Period Concurrent Aggregations
  const [
    // Current period
    totalCustomersCur,
    newCustomersCur,
    activeCustomersCur,
    totalVisitsCur,
    stampsCur,
    pointsCur,
    rewardsRedeemedCur,
    offersRedeemedCur,
    reviewsCur,
    // Previous period
    totalCustomersPrev,
    newCustomersPrev,
    activeCustomersPrev,
    totalVisitsPrev,
    stampsPrev,
    pointsPrev,
    rewardsRedeemedPrev,
    offersRedeemedPrev,
    reviewsPrev,
    // Daily trends (last 14 days or bucketed points)
    recentCustomerEvents,
    recentLoyaltyTransactions,
    recentVisits,
  ] = await Promise.all([
    // Current Period
    prisma.customer.count({ where: baseWhere }),
    prisma.customer.count({
      where: { ...baseWhere, createdAt: { gte: curStart, lte: curEnd } },
    }),
    prisma.customer.count({
      where: { ...baseWhere, lastVisitAt: { gte: curStart, lte: curEnd } },
    }),
    prisma.customer.aggregate({
      where: baseWhere,
      _sum: { totalVisits: true },
    }),
    prisma.loyaltyTransaction.aggregate({
      where: {
        ...baseWhere,
        createdAt: { gte: curStart, lte: curEnd },
        deltaStamps: { gt: 0 },
      },
      _sum: { deltaStamps: true },
    }),
    prisma.loyaltyTransaction.aggregate({
      where: {
        ...baseWhere,
        createdAt: { gte: curStart, lte: curEnd },
        deltaPoints: { gt: 0 },
      },
      _sum: { deltaPoints: true },
    }),
    prisma.rewardRedemption.count({
      where: {
        ...baseWhere,
        status: 'REDEEMED',
        redeemedAt: { gte: curStart, lte: curEnd },
      },
    }),
    prisma.offerRedemption.count({
      where: {
        ...baseWhere,
        redeemedAt: { gte: curStart, lte: curEnd },
      },
    }),
    prisma.reviewFeedback.aggregate({
      where: {
        ...baseWhere,
        createdAt: { gte: curStart, lte: curEnd },
      },
      _avg: { rating: true },
    }),

    // Previous Period
    prisma.customer.count({
      where: { ...baseWhere, createdAt: { lte: prevEnd } },
    }),
    prisma.customer.count({
      where: { ...baseWhere, createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    prisma.customer.count({
      where: { ...baseWhere, lastVisitAt: { gte: prevStart, lte: prevEnd } },
    }),
    prisma.customer.aggregate({
      where: { ...baseWhere, createdAt: { lte: prevEnd } },
      _sum: { totalVisits: true },
    }),
    prisma.loyaltyTransaction.aggregate({
      where: {
        ...baseWhere,
        createdAt: { gte: prevStart, lte: prevEnd },
        deltaStamps: { gt: 0 },
      },
      _sum: { deltaStamps: true },
    }),
    prisma.loyaltyTransaction.aggregate({
      where: {
        ...baseWhere,
        createdAt: { gte: prevStart, lte: prevEnd },
        deltaPoints: { gt: 0 },
      },
      _sum: { deltaPoints: true },
    }),
    prisma.rewardRedemption.count({
      where: {
        ...baseWhere,
        status: 'REDEEMED',
        redeemedAt: { gte: prevStart, lte: prevEnd },
      },
    }),
    prisma.offerRedemption.count({
      where: {
        ...baseWhere,
        redeemedAt: { gte: prevStart, lte: prevEnd },
      },
    }),
    prisma.reviewFeedback.aggregate({
      where: {
        ...baseWhere,
        createdAt: { gte: prevStart, lte: prevEnd },
      },
      _avg: { rating: true },
    }),

    // Trends Data
    prisma.customer.findMany({
      where: { ...baseWhere, createdAt: { gte: curStart, lte: curEnd } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.loyaltyTransaction.findMany({
      where: { ...baseWhere, createdAt: { gte: curStart, lte: curEnd } },
      select: { createdAt: true, deltaStamps: true, deltaPoints: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.customerEvent.findMany({
      where: {
        businessId: ctx.businessId,
        ...(effectiveBranchId ? { customer: { branchId: effectiveBranchId } } : {}),
        type: 'VISIT_RECORDED',
        createdAt: { gte: curStart, lte: curEnd },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Compute Returning Customers: customers with totalVisits > 1
  const [returningCustomersCur, returningCustomersPrev] = await Promise.all([
    prisma.customer.count({
      where: { ...baseWhere, totalVisits: { gt: 1 } },
    }),
    prisma.customer.count({
      where: { ...baseWhere, totalVisits: { gt: 1 }, createdAt: { lte: prevEnd } },
    }),
  ]);

  // Bucket Trends by day
  const customerGrowth = bucketByDay(recentCustomerEvents.map((c) => c.createdAt), curStart, curEnd);
  const visitsTimeline = bucketByDay(recentVisits.map((v) => v.createdAt), curStart, curEnd);
  const loyaltyActivity = bucketByDay(recentLoyaltyTransactions.map((l) => l.createdAt), curStart, curEnd);

  return {
    dateRange: { current, previous, compareEnabled },
    metrics: {
      totalCustomers: computeMetricComparison(totalCustomersCur, totalCustomersPrev),
      newCustomers: computeMetricComparison(newCustomersCur, newCustomersPrev),
      activeCustomers: computeMetricComparison(activeCustomersCur, activeCustomersPrev),
      returningCustomers: computeMetricComparison(returningCustomersCur, returningCustomersPrev),
      totalVisits: computeMetricComparison(
        totalVisitsCur._sum.totalVisits || 0,
        totalVisitsPrev._sum.totalVisits || 0
      ),
      stampsIssued: computeMetricComparison(
        stampsCur._sum.deltaStamps || 0,
        stampsPrev._sum.deltaStamps || 0
      ),
      pointsIssued: computeMetricComparison(
        pointsCur._sum.deltaPoints || 0,
        pointsPrev._sum.deltaPoints || 0
      ),
      rewardsRedeemed: computeMetricComparison(rewardsRedeemedCur, rewardsRedeemedPrev),
      offersRedeemed: computeMetricComparison(offersRedeemedCur, offersRedeemedPrev),
      averageRating: computeMetricComparison(
        Number(reviewsCur._avg.rating?.toFixed(1)) || 0,
        Number(reviewsPrev._avg.rating?.toFixed(1)) || 0
      ),
    },
    trends: {
      customerGrowth,
      visitsTimeline,
      loyaltyActivity,
    },
  };
}

/**
 * [2] CUSTOMER & ACQUISITION ANALYTICS
 */
export async function getCustomerAnalytics(
  ctx: TenantContext,
  query: AnalyticsQueryInput = {}
): Promise<CustomerAnalytics> {
  await requireAnalyticsPermission(ctx);

  const effectiveBranchId = resolveEffectiveBranch(ctx, query.branchId);
  const { current } = resolveDateRange(query.preset, query.startDate, query.endDate);
  const curStart = new Date(current.start);
  const curEnd = new Date(current.end);

  const baseWhere: any = { businessId: ctx.businessId };
  if (effectiveBranchId) baseWhere.branchId = effectiveBranchId;

  const [totalCustomers, statusGroups, newCustomersInPeriod, allCustomers] = await Promise.all([
    prisma.customer.count({ where: baseWhere }),
    prisma.customer.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { id: true },
    }),
    prisma.customer.count({
      where: { ...baseWhere, createdAt: { gte: curStart, lte: curEnd } },
    }),
    prisma.customer.findMany({
      where: { ...baseWhere, createdAt: { gte: curStart, lte: curEnd } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const statusMap: Record<string, number> = {
    ACTIVE: 0,
    INACTIVE: 0,
    VIP: 0,
    AT_RISK: 0,
    BLOCKED: 0,
  };

  for (const sg of statusGroups) {
    if (statusMap[sg.status] !== undefined) {
      statusMap[sg.status] = sg._count.id;
    }
  }

  const returningCount = Math.max(totalCustomers - newCustomersInPeriod, 0);
  const newPct = totalCustomers > 0 ? Math.round((newCustomersInPeriod / totalCustomers) * 100) : 0;
  const returningPct = totalCustomers > 0 ? 100 - newPct : 0;

  return {
    totalCustomers,
    statusDistribution: {
      active: statusMap.ACTIVE,
      inactive: statusMap.INACTIVE,
      vip: statusMap.VIP,
      atRisk: statusMap.AT_RISK,
      blocked: statusMap.BLOCKED,
    },
    growthTrend: bucketByDay(allCustomers.map((c) => c.createdAt), curStart, curEnd),
    acquisitionMix: {
      newCustomers: newCustomersInPeriod,
      returningCustomers: returningCount,
      newPct,
      returningPct,
    },
  };
}

/**
 * [3] RETENTION & REACTIVATION ANALYTICS
 */
export async function getRetentionAnalytics(
  ctx: TenantContext,
  query: AnalyticsQueryInput = {}
): Promise<RetentionAnalytics> {
  await requireAnalyticsPermission(ctx);

  const effectiveBranchId = resolveEffectiveBranch(ctx, query.branchId);
  const { current } = resolveDateRange(query.preset, query.startDate, query.endDate);
  const curStart = new Date(current.start);
  const curEnd = new Date(current.end);

  const baseWhere: any = { businessId: ctx.businessId };
  if (effectiveBranchId) baseWhere.branchId = effectiveBranchId;

  const [
    totalCustomersWithVisits,
    singleVisitCustomers,
    multiVisitCustomers,
    visitAgg,
    reactivatedCount,
    atRiskCustomerCount,
    inactiveCustomerCount,
  ] = await Promise.all([
    // Customers with at least 1 visit
    prisma.customer.count({
      where: { ...baseWhere, totalVisits: { gte: 1 } },
    }),
    // Customers with exactly 1 visit
    prisma.customer.count({
      where: { ...baseWhere, totalVisits: 1 },
    }),
    // Customers with more than 1 visit
    prisma.customer.count({
      where: { ...baseWhere, totalVisits: { gt: 1 } },
    }),
    // Total visits across all customers
    prisma.customer.aggregate({
      where: baseWhere,
      _sum: { totalVisits: true },
    }),
    // Reactivated customers: recorded CUSTOMER_REACTIVATED event during period
    prisma.customerEvent.count({
      where: {
        businessId: ctx.businessId,
        ...(effectiveBranchId ? { customer: { branchId: effectiveBranchId } } : {}),
        type: 'CUSTOMER_REACTIVATED',
        createdAt: { gte: curStart, lte: curEnd },
      },
    }),
    // At-Risk count
    prisma.customer.count({
      where: { ...baseWhere, status: 'AT_RISK' },
    }),
    // Inactive count
    prisma.customer.count({
      where: { ...baseWhere, status: 'INACTIVE' },
    }),
  ]);

  const totalVisits = visitAgg._sum.totalVisits || 0;
  const returningCustomerRate =
    totalCustomersWithVisits > 0
      ? Number(((multiVisitCustomers / totalCustomersWithVisits) * 100).toFixed(1))
      : 0;

  // Repeat visit rate: visits beyond first visit / total visits
  const repeatVisitCount = Math.max(totalVisits - totalCustomersWithVisits, 0);
  const repeatVisitRate =
    totalVisits > 0 ? Number(((repeatVisitCount / totalVisits) * 100).toFixed(1)) : 0;

  return {
    returningCustomerRate,
    repeatVisitRate,
    totalCustomersWithVisits,
    singleVisitCustomers,
    multiVisitCustomers,
    reactivatedCustomers: reactivatedCount,
    atRiskCustomerCount,
    inactiveCustomerCount,
    definitions: {
      activeCustomer: 'Customer who visited or engaged within the last 30 days.',
      returningCustomer: 'Customer who has completed more than 1 qualifying visit.',
      repeatVisit: 'Any visit made by a customer beyond their initial first visit.',
      newCustomer: 'Customer registered or joined during the selected date range.',
      reactivatedCustomer:
        'Customer who completed a visit after a prolonged 30+ day period of inactivity.',
      returningCustomerRate:
        'Percentage of all visiting customers who returned for 2 or more visits (Multi-Visit Customers / Visiting Customers).',
      repeatVisitRate:
        'Percentage of all recorded visits that represent repeat engagement (Repeat Visits / Total Visits).',
    },
  };
}

/**
 * [4] LOYALTY & REWARDS PERFORMANCE ANALYTICS
 */
export async function getLoyaltyAnalytics(
  ctx: TenantContext,
  query: AnalyticsQueryInput = {}
): Promise<LoyaltyAnalytics> {
  await requireAnalyticsPermission(ctx);

  const effectiveBranchId = resolveEffectiveBranch(ctx, query.branchId);
  const { current } = resolveDateRange(query.preset, query.startDate, query.endDate);
  const curStart = new Date(current.start);
  const curEnd = new Date(current.end);

  const baseWhere: any = { businessId: ctx.businessId };
  if (effectiveBranchId) baseWhere.branchId = effectiveBranchId;

  const [activeCardsCount, stampsSum, pointsSum, claimsCount, redemptionsCount, transactions] =
    await Promise.all([
      prisma.loyaltyCard.count({
        where: { businessId: ctx.businessId, status: 'ACTIVE' },
      }),
      prisma.loyaltyTransaction.aggregate({
        where: {
          ...baseWhere,
          createdAt: { gte: curStart, lte: curEnd },
          deltaStamps: { gt: 0 },
        },
        _sum: { deltaStamps: true },
      }),
      prisma.loyaltyTransaction.aggregate({
        where: {
          ...baseWhere,
          createdAt: { gte: curStart, lte: curEnd },
          deltaPoints: { gt: 0 },
        },
        _sum: { deltaPoints: true },
      }),
      prisma.rewardRedemption.count({
        where: {
          ...baseWhere,
          claimedAt: { gte: curStart, lte: curEnd },
        },
      }),
      prisma.rewardRedemption.count({
        where: {
          ...baseWhere,
          status: 'REDEEMED',
          redeemedAt: { gte: curStart, lte: curEnd },
        },
      }),
      prisma.loyaltyTransaction.findMany({
        where: { ...baseWhere, createdAt: { gte: curStart, lte: curEnd } },
        select: { createdAt: true, deltaStamps: true, deltaPoints: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

  const stampsIssued = stampsSum._sum.deltaStamps || 0;
  const pointsIssued = pointsSum._sum.deltaPoints || 0;
  const rewardRedemptionRate =
    claimsCount > 0 ? Number(((redemptionsCount / claimsCount) * 100).toFixed(1)) : 0;

  // Split time-series
  const stampsOverTime = bucketByDay(
    transactions.filter((t) => t.deltaStamps > 0).map((t) => t.createdAt),
    curStart,
    curEnd
  );
  const pointsOverTime = bucketByDay(
    transactions.filter((t) => t.deltaPoints > 0).map((t) => t.createdAt),
    curStart,
    curEnd
  );

  return {
    activeMembers: activeCardsCount,
    stampsIssued,
    pointsIssued,
    rewardsClaimed: claimsCount,
    rewardsRedeemed: redemptionsCount,
    rewardRedemptionRate,
    trends: {
      stampsOverTime,
      pointsOverTime,
    },
  };
}

/**
 * [5] REWARDS CATALOG PERFORMANCE
 */
export async function getRewardsAnalytics(
  ctx: TenantContext,
  query: AnalyticsQueryInput = {}
): Promise<RewardsAnalytics> {
  await requireAnalyticsPermission(ctx);

  const effectiveBranchId = resolveEffectiveBranch(ctx, query.branchId);
  const { current } = resolveDateRange(query.preset, query.startDate, query.endDate);
  const curStart = new Date(current.start);
  const curEnd = new Date(current.end);

  const baseWhere: any = { businessId: ctx.businessId };
  if (effectiveBranchId) baseWhere.branchId = effectiveBranchId;

  const [totalRewards, redemptions, branches] = await Promise.all([
    prisma.reward.count({ where: { businessId: ctx.businessId } }),
    prisma.rewardRedemption.findMany({
      where: {
        ...baseWhere,
        claimedAt: { gte: curStart, lte: curEnd },
      },
      select: {
        id: true,
        rewardId: true,
        branchId: true,
        status: true,
        reward: { select: { id: true, title: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.branch.findMany({
      where: { businessId: ctx.businessId },
      select: { id: true, name: true },
    }),
  ]);

  const totalClaimed = redemptions.length;
  const totalRedeemed = redemptions.filter((r) => r.status === 'REDEEMED').length;
  const overallRedemptionRate =
    totalClaimed > 0 ? Number(((totalRedeemed / totalClaimed) * 100).toFixed(1)) : 0;

  // Aggregate by reward
  const rewardStats: Record<string, { title: string; claimed: number; redeemed: number }> = {};
  for (const r of redemptions) {
    if (!rewardStats[r.rewardId]) {
      rewardStats[r.rewardId] = { title: r.reward.title, claimed: 0, redeemed: 0 };
    }
    rewardStats[r.rewardId].claimed++;
    if (r.status === 'REDEEMED') {
      rewardStats[r.rewardId].redeemed++;
    }
  }

  const topRewards = Object.entries(rewardStats)
    .map(([id, s]) => ({
      id,
      title: s.title,
      claimedCount: s.claimed,
      redeemedCount: s.redeemed,
      redemptionRate: s.claimed > 0 ? Number(((s.redeemed / s.claimed) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.redeemedCount - a.redeemedCount)
    .slice(0, 10);

  // Aggregate by branch
  const branchMap: Record<string, { name: string; count: number }> = {};
  for (const b of branches) {
    branchMap[b.id] = { name: b.name, count: 0 };
  }
  for (const r of redemptions) {
    if (r.branchId && branchMap[r.branchId]) {
      branchMap[r.branchId].count++;
    }
  }

  const branchDistribution = Object.entries(branchMap).map(([id, b]) => ({
    branchId: id,
    branchName: b.name,
    redemptions: b.count,
  }));

  return {
    totalRewards,
    totalClaimed,
    totalRedeemed,
    overallRedemptionRate,
    topRewards,
    branchDistribution,
  };
}

/**
 * [6] OFFERS & PROMOTIONS ANALYTICS
 */
export async function getOffersAnalytics(
  ctx: TenantContext,
  query: AnalyticsQueryInput = {}
): Promise<OffersAnalytics> {
  await requireAnalyticsPermission(ctx);

  const effectiveBranchId = resolveEffectiveBranch(ctx, query.branchId);
  const { current } = resolveDateRange(query.preset, query.startDate, query.endDate);
  const curStart = new Date(current.start);
  const curEnd = new Date(current.end);

  const baseWhere: any = { businessId: ctx.businessId };
  if (effectiveBranchId) baseWhere.branchId = effectiveBranchId;

  const [activeOffersCount, redemptions, branches] = await Promise.all([
    prisma.offer.count({
      where: { businessId: ctx.businessId, status: 'ACTIVE' },
    }),
    prisma.offerRedemption.findMany({
      where: {
        ...baseWhere,
        redeemedAt: { gte: curStart, lte: curEnd },
      },
      select: {
        id: true,
        offerId: true,
        branchId: true,
        redeemedAt: true,
        offer: {
          select: { id: true, title: true, type: true, discountValue: true },
        },
      },
      orderBy: { redeemedAt: 'asc' },
    }),
    prisma.branch.findMany({
      where: { businessId: ctx.businessId },
      select: { id: true, name: true },
    }),
  ]);

  const totalRedemptions = redemptions.length;

  // Aggregate by offer
  const offerStats: Record<string, { title: string; type: string; discountValue: number; count: number }> = {};
  for (const r of redemptions) {
    if (!offerStats[r.offerId]) {
      offerStats[r.offerId] = {
        title: r.offer.title,
        type: r.offer.type,
        discountValue: r.offer.discountValue,
        count: 0,
      };
    }
    offerStats[r.offerId].count++;
  }

  const topOffers = Object.entries(offerStats)
    .map(([id, o]) => ({
      id,
      title: o.title,
      type: o.type,
      discountValue: o.discountValue,
      redemptionCount: o.count,
    }))
    .sort((a, b) => b.redemptionCount - a.redemptionCount)
    .slice(0, 10);

  // Aggregate by branch
  const branchMap: Record<string, { name: string; count: number }> = {};
  for (const b of branches) {
    branchMap[b.id] = { name: b.name, count: 0 };
  }
  for (const r of redemptions) {
    if (r.branchId && branchMap[r.branchId]) {
      branchMap[r.branchId].count++;
    }
  }

  const branchDistribution = Object.entries(branchMap).map(([id, b]) => ({
    branchId: id,
    branchName: b.name,
    redemptions: b.count,
  }));

  const redemptionsOverTime = bucketByDay(redemptions.map((r) => r.redeemedAt), curStart, curEnd);

  return {
    activeOffersCount,
    totalRedemptions,
    topOffers,
    redemptionsOverTime,
    branchDistribution,
  };
}

/**
 * [7] REVIEW & REPUTATION ANALYTICS
 */
export async function getReviewAnalytics(
  ctx: TenantContext,
  query: AnalyticsQueryInput = {}
): Promise<ReviewAnalytics> {
  await requireAnalyticsPermission(ctx);

  const effectiveBranchId = resolveEffectiveBranch(ctx, query.branchId);
  const { current } = resolveDateRange(query.preset, query.startDate, query.endDate);
  const curStart = new Date(current.start);
  const curEnd = new Date(current.end);

  const baseWhere: any = { businessId: ctx.businessId };
  if (effectiveBranchId) baseWhere.branchId = effectiveBranchId;

  const reviews = await prisma.reviewFeedback.findMany({
    where: {
      ...baseWhere,
      createdAt: { gte: curStart, lte: curEnd },
    },
    select: {
      id: true,
      rating: true,
      sentiment: true,
      isPublicGoogleReviewTarget: true,
      createdAt: true,
      generations: { select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });

  const totalReviews = reviews.length;
  let totalRatingSum = 0;
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  let googleTargetCount = 0;
  let privateFeedbackCount = 0;
  let respondedCount = 0;

  for (const r of reviews) {
    totalRatingSum += r.rating;
    if (r.rating >= 1 && r.rating <= 5) {
      ratingDistribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
    }

    if (r.sentiment === 'POSITIVE') sentimentCounts.positive++;
    else if (r.sentiment === 'NEUTRAL') sentimentCounts.neutral++;
    else if (r.sentiment === 'NEGATIVE') sentimentCounts.negative++;

    if (r.isPublicGoogleReviewTarget) googleTargetCount++;
    else privateFeedbackCount++;

    if (r.generations.length > 0) respondedCount++;
  }

  const averageRating = totalReviews > 0 ? Number((totalRatingSum / totalReviews).toFixed(1)) : 0;
  const aiResponseCoverage =
    totalReviews > 0 ? Math.round((respondedCount / totalReviews) * 100) : 0;

  const reviewsOverTime = bucketByDay(reviews.map((r) => r.createdAt), curStart, curEnd);

  return {
    totalReviews,
    averageRating,
    ratingDistribution,
    sentimentCounts,
    googleTargetCount,
    privateFeedbackCount,
    aiResponseCoverage,
    reviewsOverTime,
  };
}

/**
 * [8] BRANCH PERFORMANCE COMPARISON
 */
export async function getBranchAnalytics(
  ctx: TenantContext,
  query: AnalyticsQueryInput = {}
): Promise<BranchAnalytics> {
  await requireAnalyticsPermission(ctx);

  const branches = await prisma.branch.findMany({
    where: { businessId: ctx.businessId },
    select: { id: true, name: true },
  });

  const { current } = resolveDateRange(query.preset, query.startDate, query.endDate);
  const curStart = new Date(current.start);
  const curEnd = new Date(current.end);

  const branchItems = await Promise.all(
    branches.map(async (b) => {
      const [customerCount, visitsAgg, stampsAgg, pointsAgg, rewardCount, offerCount, reviewAgg] =
        await Promise.all([
          prisma.customer.count({
            where: { businessId: ctx.businessId, branchId: b.id },
          }),
          prisma.customer.aggregate({
            where: { businessId: ctx.businessId, branchId: b.id },
            _sum: { totalVisits: true },
          }),
          prisma.loyaltyTransaction.aggregate({
            where: {
              businessId: ctx.businessId,
              branchId: b.id,
              deltaStamps: { gt: 0 },
              createdAt: { gte: curStart, lte: curEnd },
            },
            _sum: { deltaStamps: true },
          }),
          prisma.loyaltyTransaction.aggregate({
            where: {
              businessId: ctx.businessId,
              branchId: b.id,
              deltaPoints: { gt: 0 },
              createdAt: { gte: curStart, lte: curEnd },
            },
            _sum: { deltaPoints: true },
          }),
          prisma.rewardRedemption.count({
            where: {
              businessId: ctx.businessId,
              branchId: b.id,
              status: 'REDEEMED',
              redeemedAt: { gte: curStart, lte: curEnd },
            },
          }),
          prisma.offerRedemption.count({
            where: {
              businessId: ctx.businessId,
              branchId: b.id,
              redeemedAt: { gte: curStart, lte: curEnd },
            },
          }),
          prisma.reviewFeedback.aggregate({
            where: {
              businessId: ctx.businessId,
              branchId: b.id,
              createdAt: { gte: curStart, lte: curEnd },
            },
            _avg: { rating: true },
          }),
        ]);

      return {
        branchId: b.id,
        branchName: b.name,
        customerCount,
        visitCount: visitsAgg._sum.totalVisits || 0,
        stampsIssued: stampsAgg._sum.deltaStamps || 0,
        pointsIssued: pointsAgg._sum.deltaPoints || 0,
        rewardRedemptions: rewardCount,
        offerRedemptions: offerCount,
        averageRating: Number(reviewAgg._avg.rating?.toFixed(1)) || 0,
      };
    })
  );

  return { branches: branchItems };
}

/**
 * [9] CSV EXPORT GENERATOR
 * Builds compliant RFC 4180 CSV strings with strict tenant isolation.
 */
export function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Neutralize spreadsheet formula injection (=, +, -, @, \t, \r)
  const isPureNumber = typeof val === 'number' || /^-?\d+(\.\d+)?$/.test(str.trim());
  if (!isPureNumber && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportAnalyticsCsv(
  ctx: TenantContext,
  query: AnalyticsQueryInput = {},
  exportType: ExportType = 'overview'
): Promise<string> {
  await requireAnalyticsPermission(ctx);
  await requireFeature(ctx, 'EXPORTS');

  const escapeCsv = escapeCsvValue;

  if (exportType === 'customers') {
    const customers = await prisma.customer.findMany({
      where: {
        businessId: ctx.businessId,
        ...(query.branchId && query.branchId !== 'ALL' ? { branchId: query.branchId } : {}),
      },
      select: {
        name: true,
        phone: true,
        status: true,
        totalVisits: true,
        stampsBalance: true,
        pointsBalance: true,
        joinedAt: true,
        lastVisitAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const headers = [
      'Customer Name',
      'Phone',
      'Status',
      'Total Visits',
      'Stamps Balance',
      'Points Balance',
      'Joined Date',
      'Last Visit Date',
    ];

    const rows = customers.map((c) => [
      escapeCsv(c.name),
      escapeCsv(c.phone),
      escapeCsv(c.status),
      escapeCsv(c.totalVisits),
      escapeCsv(c.stampsBalance),
      escapeCsv(c.pointsBalance),
      escapeCsv(c.joinedAt.toISOString().split('T')[0]),
      escapeCsv(c.lastVisitAt ? c.lastVisitAt.toISOString().split('T')[0] : 'N/A'),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  if (exportType === 'loyalty') {
    const transactions = await prisma.loyaltyTransaction.findMany({
      where: {
        businessId: ctx.businessId,
        ...(query.branchId && query.branchId !== 'ALL' ? { branchId: query.branchId } : {}),
      },
      select: {
        id: true,
        type: true,
        deltaStamps: true,
        deltaPoints: true,
        createdAt: true,
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const headers = ['Transaction ID', 'Customer', 'Type', 'Stamps', 'Points', 'Timestamp'];
    const rows = transactions.map((t) => [
      escapeCsv(t.id),
      escapeCsv(t.customer?.name || t.customer?.phone || 'Customer'),
      escapeCsv(t.type),
      escapeCsv(t.deltaStamps),
      escapeCsv(t.deltaPoints),
      escapeCsv(t.createdAt.toISOString()),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  if (exportType === 'reviews') {
    const reviews = await prisma.reviewFeedback.findMany({
      where: {
        businessId: ctx.businessId,
        ...(query.branchId && query.branchId !== 'ALL' ? { branchId: query.branchId } : {}),
      },
      select: {
        id: true,
        rating: true,
        sentiment: true,
        feedbackText: true,
        isPublicGoogleReviewTarget: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const headers = [
      'Review ID',
      'Customer',
      'Rating',
      'Sentiment',
      'Target',
      'Feedback Comments',
      'Date',
    ];

    const rows = reviews.map((r) => [
      escapeCsv(r.id),
      escapeCsv(r.customer?.name || 'Anonymous'),
      escapeCsv(r.rating),
      escapeCsv(r.sentiment),
      escapeCsv(r.isPublicGoogleReviewTarget ? 'Google Review Target' : 'Private Feedback'),
      escapeCsv(r.feedbackText || ''),
      escapeCsv(r.createdAt.toISOString().split('T')[0]),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  // Default: Overview KPIs Export
  const overview = await getAnalyticsOverview(ctx, query);
  const headers = ['Metric', 'Current Period', 'Previous Period', 'Delta', 'Percentage Change'];
  const m = overview.metrics;

  const rows = [
    ['Total Customers', m.totalCustomers.current, m.totalCustomers.previous, m.totalCustomers.delta, `${m.totalCustomers.percentChange ?? 0}%`],
    ['New Customers', m.newCustomers.current, m.newCustomers.previous, m.newCustomers.delta, `${m.newCustomers.percentChange ?? 0}%`],
    ['Active Customers', m.activeCustomers.current, m.activeCustomers.previous, m.activeCustomers.delta, `${m.activeCustomers.percentChange ?? 0}%`],
    ['Returning Customers', m.returningCustomers.current, m.returningCustomers.previous, m.returningCustomers.delta, `${m.returningCustomers.percentChange ?? 0}%`],
    ['Total Visits', m.totalVisits.current, m.totalVisits.previous, m.totalVisits.delta, `${m.totalVisits.percentChange ?? 0}%`],
    ['Stamps Issued', m.stampsIssued.current, m.stampsIssued.previous, m.stampsIssued.delta, `${m.stampsIssued.percentChange ?? 0}%`],
    ['Points Issued', m.pointsIssued.current, m.pointsIssued.previous, m.pointsIssued.delta, `${m.pointsIssued.percentChange ?? 0}%`],
    ['Rewards Redeemed', m.rewardsRedeemed.current, m.rewardsRedeemed.previous, m.rewardsRedeemed.delta, `${m.rewardsRedeemed.percentChange ?? 0}%`],
    ['Offers Redeemed', m.offersRedeemed.current, m.offersRedeemed.previous, m.offersRedeemed.delta, `${m.offersRedeemed.percentChange ?? 0}%`],
    ['Average Rating', m.averageRating.current, m.averageRating.previous, m.averageRating.delta, `${m.averageRating.percentChange ?? 0}%`],
  ];

  return [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
}

/**
 * Helper: Day Bucketer for timeseries charts
 */
function bucketByDay(dates: Date[], start: Date, end: Date): ChartDataPoint[] {
  const counts: Record<string, number> = {};
  const current = new Date(start);

  while (current <= end) {
    const key = current.toISOString().split('T')[0];
    counts[key] = 0;
    current.setDate(current.getDate() + 1);
  }

  for (const d of dates) {
    const key = d.toISOString().split('T')[0];
    if (counts[key] !== undefined) {
      counts[key]++;
    }
  }

  return Object.entries(counts).map(([date, value]) => {
    const d = new Date(date);
    return {
      date,
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value,
    };
  });
}
