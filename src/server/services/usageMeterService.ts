import { prisma } from '../db/client';
import { logger } from '../utils/logger';
import {
  UsageMeterType,
  CampaignChannel,
  SubscriptionStatus,
  Prisma,
} from '@prisma/client';
import { getBusinessSubscription } from './entitlementService';
import { createAuditLog } from './auditService';
import { TenantContext, requireSuperAdmin } from '../auth/tenantContext';

export class UsageLimitReachedError extends Error {
  code = 'USAGE_LIMIT_REACHED';
  meterType: UsageMeterType;
  limit: number;
  current: number;

  constructor(meterType: UsageMeterType, limit: number, current: number, message?: string) {
    super(
      message ||
        `Usage limit reached for [${meterType}]. Current usage: ${current}, Plan allowance: ${limit}.`
    );
    this.name = 'UsageLimitReachedError';
    this.meterType = meterType;
    this.limit = limit;
    this.current = current;
  }
}

export class UsageOverageBlockedError extends Error {
  code = 'USAGE_OVERAGE_NOT_ALLOWED';
  meterType: UsageMeterType;

  constructor(meterType: UsageMeterType, message?: string) {
    super(
      message ||
        `Usage for [${meterType}] has exceeded your plan allowance and your subscription does not permit overage.`
    );
    this.name = 'UsageOverageBlockedError';
    this.meterType = meterType;
  }
}

export type OveragePolicy = 'BLOCK' | 'ALLOW_OVERAGE' | 'WARN_ONLY';
export type UsageState = 'NORMAL' | 'NEAR_LIMIT' | 'LIMIT_REACHED' | 'OVERAGE' | 'BLOCKED';

export interface PlanUsageAllowance {
  included: number | null; // null = unlimited
  policy: OveragePolicy;
  overagePriceMinor: number | null; // in minor units (e.g. paise)
}

export interface RecordUsageParams {
  businessId: string;
  meterType: UsageMeterType;
  quantity?: number;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  channel?: CampaignChannel | null;
  customerId?: string | null;
  campaignId?: string | null;
  campaignDeliveryId?: string | null;
  automationExecutionId?: string | null;
  metadata?: Record<string, any> | null;
  occurredAt?: Date;
}

export interface MeterSummaryItem {
  meterType: UsageMeterType;
  name: string;
  used: number;
  included: number | null;
  remaining: number | null;
  overage: number;
  utilizationPercent: number;
  status: UsageState;
  policy: OveragePolicy;
  overagePriceMinor: number | null;
  estimatedOverageCostMinor: number;
}

export interface UsageSummaryResponse {
  billingPeriod: {
    start: Date;
    end: Date;
    interval: string;
    status: SubscriptionStatus;
  };
  plan: {
    id: string;
    name: string;
    slug: string;
    currency: string;
  };
  meters: MeterSummaryItem[];
  channels: {
    SMS: number;
    WHATSAPP: number;
    EMAIL: number;
  };
  totalEstimatedOverageCostMinor: number;
  currency: string;
}

/**
 * Returns default allowance & overage config for a plan based on its slug and limits JSON.
 */
export function getPlanAllowanceForMeter(
  planSlug: string,
  limitsJson: any,
  meterType: UsageMeterType
): PlanUsageAllowance {
  const limits = (typeof limitsJson === 'object' && limitsJson ? limitsJson : {}) as Record<string, any>;

  // Defaults per plan tier if not explicitly customized in Plan.limits
  const defaults: Record<string, Record<UsageMeterType, PlanUsageAllowance>> = {
    free: {
      SMS_MESSAGE: { included: 100, policy: 'BLOCK', overagePriceMinor: null },
      WHATSAPP_MESSAGE: { included: 50, policy: 'BLOCK', overagePriceMinor: null },
      EMAIL_MESSAGE: { included: 100, policy: 'BLOCK', overagePriceMinor: null },
      CAMPAIGN_DELIVERY: { included: 50, policy: 'BLOCK', overagePriceMinor: null },
      AUTOMATION_EXECUTION: { included: 100, policy: 'BLOCK', overagePriceMinor: null },
    },
    starter: {
      SMS_MESSAGE: { included: 500, policy: 'BLOCK', overagePriceMinor: null },
      WHATSAPP_MESSAGE: { included: 0, policy: 'BLOCK', overagePriceMinor: null },
      EMAIL_MESSAGE: { included: 1000, policy: 'BLOCK', overagePriceMinor: null },
      CAMPAIGN_DELIVERY: { included: 20, policy: 'BLOCK', overagePriceMinor: null },
      AUTOMATION_EXECUTION: { included: 500, policy: 'BLOCK', overagePriceMinor: null },
    },
    growth: {
      SMS_MESSAGE: { included: 2500, policy: 'ALLOW_OVERAGE', overagePriceMinor: 50 },
      WHATSAPP_MESSAGE: { included: 1000, policy: 'ALLOW_OVERAGE', overagePriceMinor: 90 },
      EMAIL_MESSAGE: { included: 5000, policy: 'ALLOW_OVERAGE', overagePriceMinor: 10 },
      CAMPAIGN_DELIVERY: { included: 100, policy: 'ALLOW_OVERAGE', overagePriceMinor: 200 },
      AUTOMATION_EXECUTION: { included: 5000, policy: 'ALLOW_OVERAGE', overagePriceMinor: 25 },
    },
    enterprise: {
      SMS_MESSAGE: { included: 10000, policy: 'ALLOW_OVERAGE', overagePriceMinor: 35 },
      WHATSAPP_MESSAGE: { included: 5000, policy: 'ALLOW_OVERAGE', overagePriceMinor: 75 },
      EMAIL_MESSAGE: { included: 25000, policy: 'ALLOW_OVERAGE', overagePriceMinor: 5 },
      CAMPAIGN_DELIVERY: { included: null, policy: 'ALLOW_OVERAGE', overagePriceMinor: null }, // unlimited
      AUTOMATION_EXECUTION: { included: null, policy: 'ALLOW_OVERAGE', overagePriceMinor: null }, // unlimited
    },
  };

  const tier = defaults[planSlug] || defaults.free;
  const baseDefault = tier[meterType] || { included: 0, policy: 'BLOCK', overagePriceMinor: null };

  // Explicit limits overrides from Plan.limits JSON
  let included = baseDefault.included;
  let policy = baseDefault.policy;
  let overagePriceMinor = baseDefault.overagePriceMinor;

  if (meterType === 'SMS_MESSAGE') {
    if (limits.includedSms !== undefined) included = limits.includedSms;
    if (limits.overagePricePerSmsMinor !== undefined) overagePriceMinor = limits.overagePricePerSmsMinor;
  } else if (meterType === 'WHATSAPP_MESSAGE') {
    if (limits.includedWhatsApp !== undefined) included = limits.includedWhatsApp;
    if (limits.overagePricePerWhatsAppMinor !== undefined) overagePriceMinor = limits.overagePricePerWhatsAppMinor;
  } else if (meterType === 'EMAIL_MESSAGE') {
    if (limits.includedEmail !== undefined) included = limits.includedEmail;
    if (limits.overagePricePerEmailMinor !== undefined) overagePriceMinor = limits.overagePricePerEmailMinor;
  } else if (meterType === 'CAMPAIGN_DELIVERY') {
    if (limits.includedCampaignDeliveries !== undefined) included = limits.includedCampaignDeliveries;
    if (limits.overagePricePerDeliveryMinor !== undefined) overagePriceMinor = limits.overagePricePerDeliveryMinor;
  } else if (meterType === 'AUTOMATION_EXECUTION') {
    if (limits.includedAutomationExecutions !== undefined) included = limits.includedAutomationExecutions;
    if (limits.overagePricePerExecutionMinor !== undefined) overagePriceMinor = limits.overagePricePerExecutionMinor;
  }

  if (limits.overagePolicy !== undefined) {
    policy = limits.overagePolicy;
  }

  return { included, policy, overagePriceMinor };
}

/**
 * Returns human readable name for a meter type.
 */
export function getMeterName(type: UsageMeterType): string {
  switch (type) {
    case 'SMS_MESSAGE':
      return 'SMS Messages';
    case 'WHATSAPP_MESSAGE':
      return 'WhatsApp Messages';
    case 'EMAIL_MESSAGE':
      return 'Email Messages';
    case 'CAMPAIGN_DELIVERY':
      return 'Campaign Deliveries';
    case 'AUTOMATION_EXECUTION':
      return 'Automation Executions';
    default:
      return type;
  }
}

/**
 * Maps campaign channel to the corresponding message meter type.
 */
export function getMeterTypeForChannel(channel: CampaignChannel): UsageMeterType {
  switch (channel) {
    case CampaignChannel.SMS:
      return UsageMeterType.SMS_MESSAGE;
    case CampaignChannel.WHATSAPP:
      return UsageMeterType.WHATSAPP_MESSAGE;
    case CampaignChannel.EMAIL:
      return UsageMeterType.EMAIL_MESSAGE;
    case CampaignChannel.IN_APP:
    default:
      return UsageMeterType.CAMPAIGN_DELIVERY;
  }
}

/**
 * Service class implementing the authoritative V2 billing metering engine.
 */
export class UsageMeterService {
  /**
   * Idempotently records a billable usage event.
   * If an event with the same idempotency key already exists for this business,
   * returns the existing record without incrementing usage.
   * Concurrency-safe via PostgreSQL unique constraint.
   */
  static async recordUsageIdempotent(params: RecordUsageParams) {
    const {
      businessId,
      meterType,
      quantity = 1,
      sourceType,
      sourceId,
      idempotencyKey,
      channel,
      customerId,
      campaignId,
      campaignDeliveryId,
      automationExecutionId,
      metadata,
      occurredAt = new Date(),
    } = params;

    // 1. Fast check if already recorded
    const existing = await prisma.usageMeterEvent.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      logger.info(
        `[UsageMeterService] Duplicate usage suppressed for key ${idempotencyKey} (business: ${businessId})`
      );
      return { event: existing, isDuplicate: true };
    }

    // 2. Resolve authoritative subscription and billing period
    const sub = await getBusinessSubscription(businessId);
    const plan = sub.plan;
    const periodStart = sub.currentPeriodStart;
    const periodEnd = sub.currentPeriodEnd;

    // 3. Check current period usage to determine if this event is an overage
    const currentPeriodCount = await this.getCurrentPeriodUsageForMeter(
      businessId,
      meterType,
      periodStart,
      periodEnd
    );

    const allowance = getPlanAllowanceForMeter(plan.slug, plan.limits, meterType);
    const isOverage =
      allowance.included !== null && currentPeriodCount + quantity > allowance.included;

    try {
      const event = await prisma.usageMeterEvent.create({
        data: {
          businessId,
          subscriptionId: sub.id,
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          meterType,
          quantity,
          sourceType,
          sourceId,
          channel: channel || null,
          customerId: customerId || null,
          campaignId: campaignId || null,
          campaignDeliveryId: campaignDeliveryId || null,
          automationExecutionId: automationExecutionId || null,
          unitPriceMinor: isOverage ? allowance.overagePriceMinor : null,
          currency: plan.currency || 'INR',
          isOverage,
          idempotencyKey,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
          occurredAt,
        },
      });

      logger.info(
        `[UsageMeterService] Usage recorded: ${meterType} x${quantity} for business ${businessId} (idempotencyKey: ${idempotencyKey}, overage: ${isOverage})`
      );

      return { event, isDuplicate: false };
    } catch (err: any) {
      // Handle race condition where another concurrent worker inserted with same key
      if (err.code === 'P2002' || (err.message && err.message.includes('idempotencyKey'))) {
        const concurrentExisting = await prisma.usageMeterEvent.findUnique({
          where: { idempotencyKey },
        });
        if (concurrentExisting) {
          logger.info(
            `[UsageMeterService] Concurrent duplicate usage caught for key ${idempotencyKey}`
          );
          return { event: concurrentExisting, isDuplicate: true };
        }
      }
      throw err;
    }
  }

  /**
   * Calculates the current billing period consumption for a specific meter type
   * using PostgreSQL aggregation (SUM of quantity).
   */
  static async getCurrentPeriodUsageForMeter(
    businessId: string,
    meterType: UsageMeterType,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
    const aggregate = await prisma.usageMeterEvent.aggregate({
      where: {
        businessId,
        meterType,
        occurredAt: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    return aggregate._sum.quantity || 0;
  }

  /**
   * Pre-dispatch allowance check.
   * Answers: "Has this business reached or exceeded the usage included in its subscription plan?"
   * Enforces plan policy: BLOCK, ALLOW_OVERAGE, or WARN_ONLY.
   */
  static async checkAllowance(
    businessId: string,
    meterType: UsageMeterType,
    requestedCount: number = 1
  ): Promise<{
    allowed: boolean;
    policy: OveragePolicy;
    used: number;
    included: number | null;
    remaining: number | null;
    overage: number;
    isOverage: boolean;
  }> {
    const sub = await getBusinessSubscription(businessId);
    const plan = sub.plan;
    const periodStart = sub.currentPeriodStart;
    const periodEnd = sub.currentPeriodEnd;

    const used = await this.getCurrentPeriodUsageForMeter(
      businessId,
      meterType,
      periodStart,
      periodEnd
    );

    const allowance = getPlanAllowanceForMeter(plan.slug, plan.limits, meterType);

    if (allowance.included === null) {
      // Unlimited
      return {
        allowed: true,
        policy: allowance.policy,
        used,
        included: null,
        remaining: null,
        overage: 0,
        isOverage: false,
      };
    }

    const remaining = Math.max(allowance.included - used, 0);
    const isExceeded = used + requestedCount > allowance.included;
    const overage = Math.max(used - allowance.included, 0);

    let allowed = true;
    if (isExceeded) {
      if (allowance.policy === 'BLOCK') {
        allowed = false;
      }
    }

    return {
      allowed,
      policy: allowance.policy,
      used,
      included: allowance.included,
      remaining,
      overage,
      isOverage: isExceeded,
    };
  }

  /**
   * Enforces usage allowance. Throws UsageLimitReachedError or UsageOverageBlockedError
   * if dispatch is blocked by plan policy.
   */
  static async requireAllowance(
    businessId: string,
    meterType: UsageMeterType,
    requestedCount: number = 1
  ) {
    const check = await this.checkAllowance(businessId, meterType, requestedCount);
    if (!check.allowed) {
      if (check.policy === 'BLOCK') {
        throw new UsageLimitReachedError(
          meterType,
          check.included || 0,
          check.used,
          `Message delivery blocked: You have used ${check.used} of ${check.included} included ${getMeterName(
            meterType
          )} for your current billing period.`
        );
      } else {
        throw new UsageOverageBlockedError(meterType);
      }
    }
    return check;
  }

  /**
   * Returns a complete, production-safe usage summary for the active billing period.
   * All metrics calculated via PostgreSQL aggregation.
   */
  static async getUsageSummary(businessId: string): Promise<UsageSummaryResponse> {
    const sub = await getBusinessSubscription(businessId);
    const plan = sub.plan;
    const periodStart = sub.currentPeriodStart;
    const periodEnd = sub.currentPeriodEnd;

    // 1. PostgreSQL Group By query for meter totals within current billing period
    const meterAggregates = await prisma.usageMeterEvent.groupBy({
      by: ['meterType'],
      where: {
        businessId,
        occurredAt: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const usageByMeter: Record<UsageMeterType, number> = {
      SMS_MESSAGE: 0,
      WHATSAPP_MESSAGE: 0,
      EMAIL_MESSAGE: 0,
      CAMPAIGN_DELIVERY: 0,
      AUTOMATION_EXECUTION: 0,
    };

    for (const agg of meterAggregates) {
      usageByMeter[agg.meterType] = agg._sum.quantity || 0;
    }

    // 2. Channel aggregates
    const channelAggregates = await prisma.usageMeterEvent.groupBy({
      by: ['channel'],
      where: {
        businessId,
        occurredAt: {
          gte: periodStart,
          lt: periodEnd,
        },
        channel: { not: null },
      },
      _sum: {
        quantity: true,
      },
    });

    const channels = {
      SMS: 0,
      WHATSAPP: 0,
      EMAIL: 0,
    };

    for (const ch of channelAggregates) {
      if (ch.channel === CampaignChannel.SMS) channels.SMS = ch._sum.quantity || 0;
      if (ch.channel === CampaignChannel.WHATSAPP) channels.WHATSAPP = ch._sum.quantity || 0;
      if (ch.channel === CampaignChannel.EMAIL) channels.EMAIL = ch._sum.quantity || 0;
    }

    // 3. Compile meter summary items
    const metersToInclude: UsageMeterType[] = [
      UsageMeterType.SMS_MESSAGE,
      UsageMeterType.WHATSAPP_MESSAGE,
      UsageMeterType.EMAIL_MESSAGE,
      UsageMeterType.CAMPAIGN_DELIVERY,
      UsageMeterType.AUTOMATION_EXECUTION,
    ];

    let totalEstimatedOverageCostMinor = 0;

    const meters: MeterSummaryItem[] = metersToInclude.map((meterType) => {
      const used = usageByMeter[meterType] || 0;
      const allowance = getPlanAllowanceForMeter(plan.slug, plan.limits, meterType);
      const included = allowance.included;
      const remaining = included !== null ? Math.max(included - used, 0) : null;
      const overage = included !== null ? Math.max(used - included, 0) : 0;

      let utilizationPercent = 0;
      if (included !== null && included > 0) {
        utilizationPercent = Math.min(Math.round((used / included) * 1000) / 10, 999.9);
      } else if (included === 0 && used > 0) {
        utilizationPercent = 100;
      }

      // Determine state: NORMAL (<80%), NEAR_LIMIT (80-99%), LIMIT_REACHED (100%), OVERAGE (>100%), BLOCKED
      let status: UsageState = 'NORMAL';
      if (included !== null) {
        if (used === 0 && included === 0) {
          status = 'LIMIT_REACHED';
        } else if (used >= included) {
          status = overage > 0 ? (allowance.policy === 'BLOCK' ? 'BLOCKED' : 'OVERAGE') : 'LIMIT_REACHED';
        } else if (utilizationPercent >= 80) {
          status = 'NEAR_LIMIT';
        }
      }

      let estimatedOverageCostMinor = 0;
      if (overage > 0 && allowance.overagePriceMinor) {
        estimatedOverageCostMinor = overage * allowance.overagePriceMinor;
        totalEstimatedOverageCostMinor += estimatedOverageCostMinor;
      }

      return {
        meterType,
        name: getMeterName(meterType),
        used,
        included,
        remaining,
        overage,
        utilizationPercent,
        status,
        policy: allowance.policy,
        overagePriceMinor: allowance.overagePriceMinor,
        estimatedOverageCostMinor,
      };
    });

    return {
      billingPeriod: {
        start: periodStart,
        end: periodEnd,
        interval: sub.billingInterval,
        status: sub.status,
      },
      plan: {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        currency: plan.currency || 'INR',
      },
      meters,
      channels,
      totalEstimatedOverageCostMinor,
      currency: plan.currency || 'INR',
    };
  }

  /**
   * Returns campaign-specific billable usage breakdown.
   */
  static async getCampaignUsage(businessId: string, campaignId: string) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
    });
    if (!campaign) {
      throw new Error('Campaign not found or does not belong to this business');
    }

    const aggregates = await prisma.usageMeterEvent.groupBy({
      by: ['meterType', 'channel'],
      where: {
        businessId,
        campaignId,
      },
      _sum: {
        quantity: true,
      },
    });

    const breakdown = aggregates.map((agg) => ({
      meterType: agg.meterType,
      name: getMeterName(agg.meterType),
      channel: agg.channel,
      quantity: agg._sum.quantity || 0,
    }));

    const totalQuantity = breakdown.reduce((sum, item) => sum + item.quantity, 0);

    return {
      campaignId,
      campaignName: campaign.name,
      totalBillableMessages: totalQuantity,
      breakdown,
    };
  }

  /**
   * Returns deterministic, paginated usage history with server-side filtering.
   */
  static async getUsageHistory(
    businessId: string,
    options: {
      page?: number;
      limit?: number;
      meterType?: UsageMeterType;
      channel?: CampaignChannel;
      campaignId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    const page = Math.max(options.page || 1, 1);
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.UsageMeterEventWhereInput = {
      businessId,
      ...(options.meterType ? { meterType: options.meterType } : {}),
      ...(options.channel ? { channel: options.channel } : {}),
      ...(options.campaignId ? { campaignId: options.campaignId } : {}),
      ...(options.startDate || options.endDate
        ? {
            occurredAt: {
              ...(options.startDate ? { gte: options.startDate } : {}),
              ...(options.endDate ? { lt: options.endDate } : {}),
            },
          }
        : {}),
    };

    const [total, events] = await Promise.all([
      prisma.usageMeterEvent.count({ where }),
      prisma.usageMeterEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          meterType: true,
          quantity: true,
          sourceType: true,
          sourceId: true,
          channel: true,
          campaignId: true,
          customerId: true,
          isOverage: true,
          unitPriceMinor: true,
          currency: true,
          occurredAt: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      events: events.map((e) => ({
        ...e,
        meterName: getMeterName(e.meterType),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Super Admin privileged endpoint: View usage summary for any business.
   * Strictly verifies Super Admin permissions.
   */
  static async getAdminBusinessUsage(ctx: TenantContext, targetBusinessId: string) {
    requireSuperAdmin(ctx);
    const targetBusiness = await prisma.business.findUnique({
      where: { id: targetBusinessId },
    });
    if (!targetBusiness) {
      throw new Error(`Target business '${targetBusinessId}' not found`);
    }

    return this.getUsageSummary(targetBusinessId);
  }

  /**
   * Super Admin privileged endpoint: Record an append-only usage correction.
   * Never mutates or deletes historical rows.
   */
  static async recordUsageCorrection(
    ctx: TenantContext,
    targetBusinessId: string,
    params: {
      meterType: UsageMeterType;
      quantity: number; // can be negative or positive for correction
      reason: string;
    }
  ) {
    requireSuperAdmin(ctx);
    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error('A detailed reason is required to record a usage correction');
    }

    const sub = await getBusinessSubscription(targetBusinessId);
    const key = `correction_${targetBusinessId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const event = await prisma.usageMeterEvent.create({
      data: {
        businessId: targetBusinessId,
        subscriptionId: sub.id,
        billingPeriodStart: sub.currentPeriodStart,
        billingPeriodEnd: sub.currentPeriodEnd,
        meterType: params.meterType,
        quantity: params.quantity,
        sourceType: 'SYSTEM_CORRECTION',
        sourceId: ctx.user?.id || 'admin',
        unitPriceMinor: null,
        isOverage: false,
        idempotencyKey: key,
        metadata: {
          adminUserId: ctx.user?.id,
          reason: params.reason,
          correctionTimestamp: new Date().toISOString(),
        },
        occurredAt: new Date(),
      },
    });

    await createAuditLog(ctx, {
      action: 'USAGE_METER_CORRECTED',
      entityType: 'USAGE_METER',
      entityId: event.id,
      businessId: targetBusinessId,
      newState: {
        targetBusinessId,
        meterType: params.meterType,
        quantity: params.quantity,
        reason: params.reason,
      },
    });

    logger.info(
      `[UsageMeterService] Admin ${ctx.user?.id} applied usage correction of ${params.quantity} on ${params.meterType} for business ${targetBusinessId}`
    );

    return event;
  }
}
