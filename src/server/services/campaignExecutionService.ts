/**
 * Reployty V2 — Phase 20 Retention Architecture
 * Campaign Execution Service
 * 
 * Defines execution boundaries, enforces customer consent, contact cooldown,
 * idempotency, and prepares provider-independent delivery records
 * using a safe staging simulation adapter without external messaging costs.
 */

import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { resolveCampaignAudience } from './campaignAudienceService';
import { recordRetentionEvent } from './retentionEventService';
import { CampaignNotFoundError } from './campaignService';
import { CampaignStatus, CustomerEventType, DeliveryStatus } from '@prisma/client';
import { logger } from '../utils/logger';

export interface CampaignExecutionOptions {
  campaignId: string;
  cooldownHours?: number; // Default 24 hours between messages to same customer
  simulateDelivery?: boolean; // In staging/local: simulate immediate delivery transition
}

export interface ExecutionResultSummary {
  campaignId: string;
  totalAudience: number;
  eligibleCount: number;
  suppressedConsentCount: number;
  suppressedCooldownCount: number;
  deliveredCount: number;
  queuedCount: number;
  skippedCount: number;
  executionId: string;
}

export class CampaignExecutionError extends Error {
  code = 'CAMPAIGN_EXECUTION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'CampaignExecutionError';
  }
}

/**
 * Checks contact cooldown for a customer in a business.
 * Returns true if customer was contacted within cooldown period.
 */
export async function isCustomerInCooldown(
  businessId: string,
  customerId: string,
  cooldownHours: number = 24
): Promise<boolean> {
  if (cooldownHours <= 0) {
    return false;
  }
  const cooldownThreshold = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

  const recentDelivery = await prisma.campaignDelivery.findFirst({
    where: {
      customerId,
      campaign: { businessId },
      status: { in: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED, DeliveryStatus.QUEUED, DeliveryStatus.PROCESSING] },
      createdAt: { gte: cooldownThreshold },
    },
    select: { id: true },
  });

  return recentDelivery !== null;
}

/**
 * Executes or simulates execution for a campaign within tenant safety boundaries.
 */
export async function executeCampaign(
  ctx: TenantContext,
  options: CampaignExecutionOptions
): Promise<ExecutionResultSummary> {
  const businessId = ctx.businessId;

  // 1. Fetch Campaign with tenant ownership check
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: options.campaignId,
      businessId,
    },
    include: {
      offer: true,
      branch: true,
    },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(options.campaignId);
  }

  // 2. Validate Campaign Status
  if (campaign.status === CampaignStatus.CANCELLED || campaign.status === CampaignStatus.COMPLETED) {
    throw new CampaignExecutionError(`Cannot execute campaign with status [${campaign.status}]`);
  }

  // 3. Resolve Audience with strict consent filtering
  const audience = await resolveCampaignAudience(ctx, {
    audienceType: campaign.audienceType,
    segmentId: campaign.segmentId,
    branchId: campaign.branchId,
    channel: campaign.channel,
    audienceFilter: (campaign.audienceFilter as Record<string, any>) || null,
  });

  const cooldownHours = options.cooldownHours ?? 24;
  const runTimestamp = new Date();
  const runDateStr = runTimestamp.toISOString().slice(0, 10); // YYYY-MM-DD
  const executionId = `exec_${campaign.id}_${Date.now()}`;

  let deliveredCount = 0;
  let queuedCount = 0;
  let suppressedCooldownCount = 0;
  let skippedCount = 0;

  // 4. Process each eligible customer
  for (const customer of audience.eligibleCustomers) {
    // 4a. Contact Cooldown check
    const inCooldown = await isCustomerInCooldown(businessId, customer.id, cooldownHours);
    if (inCooldown) {
      suppressedCooldownCount++;
      continue;
    }

    // 4b. Idempotency Key generation
    const idempotencyKey = `camp_${campaign.id}_cust_${customer.id}_${runDateStr}`;

    // 4c. Check if delivery already exists for this idempotency key
    const existingDelivery = await prisma.campaignDelivery.findUnique({
      where: { idempotencyKey },
    });

    if (existingDelivery) {
      skippedCount++;
      continue;
    }

    // 4d. Safe Staging Simulation Delivery Adapter
    // (NO external messaging costs; simulated delivery lifecycle)
    const initialStatus = options.simulateDelivery !== false
      ? DeliveryStatus.DELIVERED
      : DeliveryStatus.QUEUED;

    const delivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaign.id,
        customerId: customer.id,
        channel: campaign.channel,
        status: initialStatus,
        sentAt: runTimestamp,
        deliveredAt: initialStatus === DeliveryStatus.DELIVERED ? runTimestamp : null,
        idempotencyKey,
        metadata: {
          executionId,
          simulated: true,
          channel: campaign.channel,
          templateSnippet: campaign.messageTemplate.slice(0, 50),
        },
      },
    });

    if (delivery.status === DeliveryStatus.DELIVERED) {
      deliveredCount++;
    } else {
      queuedCount++;
    }

    // 4e. Record Retention Touchpoint on Customer Event Timeline
    try {
      await recordRetentionEvent(ctx, {
        customerId: customer.id,
        eventType: CustomerEventType.CAMPAIGN_TOUCHPOINT,
        metadata: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          channel: campaign.channel,
          deliveryId: delivery.id,
          executionId,
        },
        createdAt: runTimestamp,
      });
    } catch (err: any) {
      logger.warn(`Failed to record retention event for customer ${customer.id}: ${err.message}`);
    }
  }

  // 5. Update Campaign Status and metadata
  const newStatus = campaign.type === 'ONE_TIME'
    ? CampaignStatus.COMPLETED
    : campaign.status === CampaignStatus.DRAFT
      ? CampaignStatus.ACTIVE
      : campaign.status;

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: newStatus,
      lastRunAt: runTimestamp,
      totalAudience: audience.totalAudienceCount,
    },
  });

  return {
    campaignId: campaign.id,
    totalAudience: audience.totalAudienceCount,
    eligibleCount: audience.consentedCustomerCount,
    suppressedConsentCount: audience.suppressedConsentCount,
    suppressedCooldownCount,
    deliveredCount,
    queuedCount,
    skippedCount,
    executionId,
  };
}
