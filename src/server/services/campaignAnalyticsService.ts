/**
 * Reployty V2 — Phase 26 Campaign Analytics Service
 * Real PostgreSQL-backed Campaign Performance, Funnel Metrics,
 * Engagement (Opens/Clicks/Reads), and Conversion Attribution Aggregations.
 */

import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { CampaignChannel, DeliveryStatus } from '@prisma/client';
import {
  CampaignAnalyticsSummary,
  AttributedConversionItem,
  CampaignTimelineEvent,
  DeliveryFunnelMetrics,
  EngagementMetrics,
  ConversionMetrics,
} from '../../types/analytics';
import { maskPhone } from '../providers/common/phoneUtils';

export class CampaignAnalyticsNotFoundError extends Error {
  code = 'CAMPAIGN_NOT_FOUND';
  constructor(campaignId: string) {
    super(`Campaign [${campaignId}] was not found`);
    this.name = 'CampaignAnalyticsNotFoundError';
  }
}

/**
 * Computes comprehensive server-side analytics for a given campaign.
 * Zero Math.random, zero fabricated numbers. All metrics derive from persisted PostgreSQL records.
 */
export async function getCampaignAnalytics(
  ctx: TenantContext,
  campaignId: string,
  options: { startDate?: Date; endDate?: Date } = {}
): Promise<CampaignAnalyticsSummary> {
  requirePermission(ctx, 'CAMPAIGNS_VIEW');
  const businessId = ctx.businessId;

  // 1. Verify campaign tenant ownership
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      businessId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      channel: true,
      type: true,
      attributionWindowDays: true,
    },
  });

  if (!campaign) {
    throw new CampaignAnalyticsNotFoundError(campaignId);
  }

  const dateFilter: any = {};
  if (options.startDate) {
    dateFilter.gte = options.startDate;
  }
  if (options.endDate) {
    dateFilter.lte = options.endDate;
  }
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  const deliveryWhere: any = {
    campaignId,
    businessId,
    ...(hasDateFilter ? { createdAt: dateFilter } : {}),
  };

  // 2. Aggregate delivery funnel counts by status
  const deliveryStatusGroups = await prisma.campaignDelivery.groupBy({
    by: ['status'],
    where: deliveryWhere,
    _count: { id: true },
  });

  const statusCounts: Record<string, number> = {};
  for (const group of deliveryStatusGroups) {
    statusCounts[group.status] = group._count.id;
  }

  const queued = statusCounts[DeliveryStatus.QUEUED] || 0;
  const processing = statusCounts[DeliveryStatus.PROCESSING] || 0;
  const failed = statusCounts[DeliveryStatus.FAILED] || 0;
  const cancelled = statusCounts[DeliveryStatus.CANCELLED] || 0;

  // Deliveries that progressed past provider dispatch
  const explicitlySent = statusCounts[DeliveryStatus.SENT] || 0;
  const delivered =
    (statusCounts[DeliveryStatus.DELIVERED] || 0) +
    (statusCounts[DeliveryStatus.OPENED] || 0) +
    (statusCounts[DeliveryStatus.CLICKED] || 0) +
    (statusCounts[DeliveryStatus.REDEEMED] || 0);

  const sent = explicitlySent + delivered;
  const totalRecipients = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  // Delivery & failure rates (safe against divide-by-zero)
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 1000) / 1000 : 0;
  const totalAttempted = sent + failed;
  const failureRate = totalAttempted > 0 ? Math.round((failed / totalAttempted) * 1000) / 1000 : 0;

  const deliveryMetrics: DeliveryFunnelMetrics = {
    totalRecipients,
    queued,
    processing,
    sent,
    delivered,
    failed,
    skipped: cancelled,
    cancelled,
    deliveryRate,
    failureRate,
  };

  // 3. Aggregate engagement metrics
  const [
    totalOpensCount,
    uniqueOpenersCount,
    totalClicksCount,
    uniqueClickersCount,
    totalReadsCount,
    bouncesCount,
    spamReportsCount,
  ] = await Promise.all([
    // Total opens recorded
    prisma.campaignDelivery.count({
      where: {
        ...deliveryWhere,
        openedAt: { not: null },
      },
    }),
    // Unique customers who opened
    prisma.campaignDelivery
      .findMany({
        where: {
          ...deliveryWhere,
          openedAt: { not: null },
        },
        distinct: ['customerId'],
        select: { customerId: true },
      })
      .then((res) => res.length),
    // Total clicks recorded on tracking links
    prisma.campaignClickEvent.count({
      where: {
        campaignId,
        businessId,
        ...(hasDateFilter ? { clickedAt: dateFilter } : {}),
      },
    }),
    // Unique clickers
    prisma.campaignClickEvent
      .findMany({
        where: {
          campaignId,
          businessId,
          ...(hasDateFilter ? { clickedAt: dateFilter } : {}),
        },
        distinct: ['customerId'],
        select: { customerId: true },
      })
      .then((res) => res.length),
    // WhatsApp reads
    prisma.campaignDelivery.count({
      where: {
        ...deliveryWhere,
        readAt: { not: null },
      },
    }),
    // Bounces from analytics events
    prisma.campaignAnalyticsEvent.count({
      where: {
        campaignId,
        businessId,
        eventType: 'BOUNCED',
        ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
      },
    }),
    // Spam reports from analytics events
    prisma.campaignAnalyticsEvent.count({
      where: {
        campaignId,
        businessId,
        eventType: 'SPAM_REPORTED',
        ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
      },
    }),
  ]);

  const openRate = delivered > 0 ? Math.round((totalOpensCount / delivered) * 1000) / 1000 : 0;
  const clickRate = delivered > 0 ? Math.round((totalClicksCount / delivered) * 1000) / 1000 : 0;
  const readRate = delivered > 0 ? Math.round((totalReadsCount / delivered) * 1000) / 1000 : 0;

  const engagementMetrics: EngagementMetrics = {
    opens: totalOpensCount,
    uniqueOpens: uniqueOpenersCount,
    openRate,
    clicks: totalClicksCount,
    uniqueClicks: uniqueClickersCount,
    clickRate,
    reads: totalReadsCount,
    readRate,
    bounces: bouncesCount,
    spamReports: spamReportsCount,
  };

  // 4. Aggregate conversion metrics
  const conversionWhere: any = {
    campaignId,
    businessId,
    ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
  };

  const [conversionGroups, uniqueConvertedCount] = await Promise.all([
    prisma.campaignConversion.groupBy({
      by: ['conversionType'],
      where: conversionWhere,
      _count: { id: true },
    }),
    prisma.campaignConversion
      .findMany({
        where: conversionWhere,
        distinct: ['customerId'],
        select: { customerId: true },
      })
      .then((res) => res.length),
  ]);

  const byType: Record<string, number> = {};
  let totalConversions = 0;
  for (const group of conversionGroups) {
    byType[group.conversionType] = group._count.id;
    totalConversions += group._count.id;
  }

  const conversionRate = delivered > 0 ? Math.round((totalConversions / delivered) * 1000) / 1000 : 0;

  const conversionMetrics: ConversionMetrics = {
    totalConversions,
    uniqueConvertedCustomers: uniqueConvertedCount,
    conversionRate,
    byType,
  };

  // 5. Channel breakdown
  const channelGroups = await prisma.campaignDelivery.groupBy({
    by: ['channel', 'status'],
    where: deliveryWhere,
    _count: { id: true },
  });

  const channelBreakdown: Record<CampaignChannel, any> = {
    [CampaignChannel.WHATSAPP]: { sent: 0, delivered: 0, failed: 0, reads: 0 },
    [CampaignChannel.SMS]: { sent: 0, delivered: 0, failed: 0 },
    [CampaignChannel.EMAIL]: { sent: 0, delivered: 0, failed: 0, opens: 0, clicks: 0 },
    [CampaignChannel.IN_APP]: { sent: 0, delivered: 0, failed: 0 },
  };

  for (const cg of channelGroups) {
    const ch = cg.channel;
    const count = cg._count.id;
    if (cg.status === DeliveryStatus.FAILED) {
      channelBreakdown[ch].failed += count;
    } else if (
      cg.status === DeliveryStatus.DELIVERED ||
      cg.status === DeliveryStatus.OPENED ||
      cg.status === DeliveryStatus.CLICKED ||
      cg.status === DeliveryStatus.REDEEMED
    ) {
      channelBreakdown[ch].delivered += count;
      channelBreakdown[ch].sent += count;
    } else if (cg.status === DeliveryStatus.SENT) {
      channelBreakdown[ch].sent += count;
    }
  }

  channelBreakdown[CampaignChannel.WHATSAPP].reads = totalReadsCount;
  channelBreakdown[CampaignChannel.EMAIL].opens = totalOpensCount;
  channelBreakdown[CampaignChannel.EMAIL].clicks = totalClicksCount;

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    status: campaign.status,
    channel: campaign.channel,
    type: campaign.type,
    attributionWindowDays: campaign.attributionWindowDays,
    delivery: deliveryMetrics,
    engagement: engagementMetrics,
    conversions: conversionMetrics,
    channelBreakdown,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Returns paginated attributed conversions for a campaign with masked customer privacy.
 */
export async function getCampaignConversions(
  ctx: TenantContext,
  campaignId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ conversions: AttributedConversionItem[]; total: number }> {
  requirePermission(ctx, 'CAMPAIGNS_VIEW');
  const businessId = ctx.businessId;

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId },
  });
  if (!campaign) {
    throw new CampaignAnalyticsNotFoundError(campaignId);
  }

  const limit = Math.min(Math.max(options.limit || 20, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  const where = {
    campaignId,
    businessId,
  };

  const [total, rows] = await Promise.all([
    prisma.campaignConversion.count({ where }),
    prisma.campaignConversion.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);

  const conversions: AttributedConversionItem[] = rows.map((c) => ({
    id: c.id,
    campaignId: c.campaignId,
    campaignDeliveryId: c.campaignDeliveryId,
    customerId: c.customerId,
    customerName: c.customer?.name || 'Customer',
    customerPhoneMasked: maskPhone(c.customer?.phone || ''),
    conversionType: c.conversionType,
    sourceEventId: c.sourceEventId,
    attributionWindowDays: c.attributionWindowDays,
    occurredAt: c.occurredAt.toISOString(),
    metadata: c.metadata as any,
  }));

  return {
    conversions,
    total,
  };
}

/**
 * Returns chronological timeline connecting sent -> delivered -> engagement -> conversion.
 */
export async function getCampaignTimeline(
  ctx: TenantContext,
  campaignId: string,
  options: { limit?: number } = {}
): Promise<{ events: CampaignTimelineEvent[] }> {
  requirePermission(ctx, 'CAMPAIGNS_VIEW');
  const businessId = ctx.businessId;

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId },
  });
  if (!campaign) {
    throw new CampaignAnalyticsNotFoundError(campaignId);
  }

  const limit = Math.min(Math.max(options.limit || 50, 1), 200);

  // Fetch recent analytics events and conversions for this campaign
  const [analyticsEvents, conversions] = await Promise.all([
    prisma.campaignAnalyticsEvent.findMany({
      where: { campaignId, businessId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    }),
    prisma.campaignConversion.findMany({
      where: { campaignId, businessId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    }),
  ]);

  const timelineEvents: CampaignTimelineEvent[] = [];

  for (const ev of analyticsEvents) {
    timelineEvents.push({
      id: ev.id,
      eventType: ev.eventType,
      occurredAt: ev.occurredAt.toISOString(),
      channel: ev.channel,
      description: `Delivery event: ${ev.eventType}`,
      customerName: ev.customer?.name,
      customerPhoneMasked: ev.customer?.phone ? maskPhone(ev.customer.phone) : undefined,
      details: ev.metadata as any,
    });
  }

  for (const conv of conversions) {
    timelineEvents.push({
      id: conv.id,
      eventType: 'CONVERTED',
      occurredAt: conv.occurredAt.toISOString(),
      description: `Attributed conversion: ${conv.conversionType}`,
      customerName: conv.customer?.name,
      customerPhoneMasked: conv.customer?.phone ? maskPhone(conv.customer.phone) : undefined,
      details: {
        conversionType: conv.conversionType,
        attributionWindowDays: conv.attributionWindowDays,
      },
    });
  }

  // Sort merged events by occurredAt descending
  timelineEvents.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return {
    events: timelineEvents.slice(0, limit),
  };
}
