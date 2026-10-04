/**
 * Reployty V2 — Phase 22 Campaign Scheduling & Delivery Queue Engine
 * Campaign Queue Service
 * 
 * PostgreSQL-backed durable queue engine with atomic row claiming (FOR UPDATE SKIP LOCKED),
 * concurrency safety, bounded exponential backoff retries, error classification,
 * stale processing recovery, and provider-independent delivery dispatching.
 */

import { prisma } from '../db/client';
import { logger } from '../utils/logger';
import { recordRetentionEvent } from './retentionEventService';
import { isCustomerInCooldown } from './campaignExecutionService';
import {
  CampaignChannel,
  CampaignStatus,
  CustomerEventType,
  DeliveryStatus,
  UsageMeterType,
  Prisma,
} from '@prisma/client';
import {
  UsageMeterService,
  getMeterTypeForChannel,
} from './usageMeterService';

export type ErrorCategory = 'TRANSIENT' | 'PERMANENT' | 'UNKNOWN';

export interface RetryPolicy {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  jitterMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  baseDelayMs: 60_000,     // 1 minute
  maxDelayMs: 3_600_000,  // 1 hour
  maxAttempts: 5,
  jitterMs: 1000,
};

export interface DeliveryDispatchResult {
  success: boolean;
  status: DeliveryStatus;
  provider?: string;
  errorCategory?: ErrorCategory;
  errorMessage?: string;
  externalMessageId?: string;
}

export type SimulatedDispatchHook = (delivery: any) => Promise<DeliveryDispatchResult> | DeliveryDispatchResult;

let customSimulatedAdapter: SimulatedDispatchHook | null = null;

export function setSimulatedDeliveryAdapter(adapter: SimulatedDispatchHook | null) {
  customSimulatedAdapter = adapter;
}

export function resetSimulatedDeliveryAdapter() {
  customSimulatedAdapter = null;
}

/**
 * Calculates exponential backoff delay with jitter.
 */
export function calculateNextRetryDelay(
  attemptCount: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): number {
  const exponent = Math.max(0, attemptCount - 1);
  const backoff = policy.baseDelayMs * Math.pow(2, exponent);
  const bounded = Math.min(backoff, policy.maxDelayMs);
  const jitter = Math.floor(Math.random() * policy.jitterMs);
  return bounded + jitter;
}

/**
 * Classifies an error as TRANSIENT or PERMANENT.
 */
export function classifyDeliveryError(errorMessage?: string | null): ErrorCategory {
  if (!errorMessage) return 'UNKNOWN';
  const lower = errorMessage.toLowerCase();
  if (
    lower.includes('invalid') ||
    lower.includes('unreachable') ||
    lower.includes('blocked') ||
    lower.includes('unsubscribed') ||
    lower.includes('opted out') ||
    lower.includes('not found') ||
    lower.includes('unsupported') ||
    lower.includes('permanent')
  ) {
    return 'PERMANENT';
  }
  if (
    lower.includes('timeout') ||
    lower.includes('rate limit') ||
    lower.includes('busy') ||
    lower.includes('unavailable') ||
    lower.includes('econnreset') ||
    lower.includes('network') ||
    lower.includes('temporary') ||
    lower.includes('transient')
  ) {
    return 'TRANSIENT';
  }
  return 'TRANSIENT';
}

/**
 * Atomically claims up to `limit` pending deliveries using PostgreSQL row-locking
 * (FOR UPDATE SKIP LOCKED) to guarantee concurrency safety across multiple workers.
 */
export async function claimPendingDeliveries(options: {
  limit?: number;
  workerId?: string;
  businessId?: string;
  campaignId?: string;
} = {}) {
  const limit = Math.min(Math.max(options.limit || 50, 1), 500);
  const workerId = options.workerId || `worker_${process.pid}_${Date.now().toString(36)}`;

  return await prisma.$transaction(async (tx) => {
    // Atomic lock & claim via raw query
    const claimedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT cd.id
      FROM "campaign_deliveries" cd
      JOIN "campaigns" c ON cd."campaignId" = c.id
      WHERE cd.status IN ('QUEUED'::"DeliveryStatus", 'RETRY_WAIT'::"DeliveryStatus")
        AND (cd."availableAt" IS NULL OR cd."availableAt" <= NOW())
        AND (cd."nextRetryAt" IS NULL OR cd."nextRetryAt" <= NOW())
        AND cd."attemptCount" < cd."maxAttempts"
        AND c.status NOT IN ('CANCELLED'::"CampaignStatus", 'COMPLETED'::"CampaignStatus")
        ${options.businessId ? Prisma.sql`AND cd."businessId" = ${options.businessId}` : Prisma.empty}
        ${options.campaignId ? Prisma.sql`AND cd."campaignId" = ${options.campaignId}` : Prisma.empty}
      ORDER BY cd."createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE OF cd SKIP LOCKED
    `;

    if (!claimedRows || claimedRows.length === 0) {
      return [];
    }

    const ids = claimedRows.map((r) => r.id);
    const now = new Date();

    await tx.campaignDelivery.updateMany({
      where: { id: { in: ids } },
      data: {
        status: DeliveryStatus.PROCESSING,
        lockedAt: now,
        lockedBy: workerId,
        lastAttemptAt: now,
      },
    });

    return await tx.campaignDelivery.findMany({
      where: { id: { in: ids } },
      include: {
        campaign: {
          select: {
            id: true,
            businessId: true,
            branchId: true,
            name: true,
            channel: true,
            messageTemplate: true,
            status: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            branchId: true,
          },
        },
        execution: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  });
}

/**
 * Creates durable CampaignDelivery queue records for a campaign execution,
 * checking consent, contact cooldown, and deterministic idempotency.
 */
export async function createExecutionQueue(params: {
  campaign: {
    id: string;
    businessId: string;
    branchId?: string | null;
    channel: CampaignChannel;
    messageTemplate: string;
    scheduledAt?: Date | null;
  };
  execution: {
    id: string;
  };
  audience: {
    totalAudienceCount: number;
    consentedCustomerCount: number;
    eligibleCustomers: Array<{
      id: string;
      name: string;
      phone: string;
      email: string | null;
      branchId: string | null;
    }>;
    suppressedConsentCount: number;
  };
  cooldownHours?: number;
}) {
  const { campaign, execution, audience } = params;
  const cooldownHours = params.cooldownHours ?? 24;

  let queuedCount = 0;
  let suppressedCooldownCount = 0;
  let skippedDuplicateCount = 0;

  for (const customer of audience.eligibleCustomers) {
    // 1. Cooldown check
    const inCooldown = await isCustomerInCooldown(campaign.businessId, customer.id, cooldownHours);
    if (inCooldown) {
      suppressedCooldownCount++;
      continue;
    }

    // 2. Deterministic idempotency key: campaign + execution + customer + channel
    const idempotencyKey = `camp_${campaign.id}_exec_${execution.id}_cust_${customer.id}_${campaign.channel}`;

    // 3. Database check for existing delivery
    const existing = await prisma.campaignDelivery.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      skippedDuplicateCount++;
      continue;
    }

    try {
      await prisma.campaignDelivery.create({
        data: {
          campaignId: campaign.id,
          customerId: customer.id,
          businessId: campaign.businessId,
          branchId: customer.branchId || campaign.branchId || null,
          executionId: execution.id,
          channel: campaign.channel,
          status: DeliveryStatus.QUEUED,
          scheduledAt: campaign.scheduledAt || new Date(),
          availableAt: campaign.scheduledAt || new Date(),
          attemptCount: 0,
          maxAttempts: 5,
          idempotencyKey,
          metadata: {
            executionId: execution.id,
            channel: campaign.channel,
            templateSnippet: campaign.messageTemplate.slice(0, 50),
          },
        },
      });
      queuedCount++;
    } catch (err: any) {
      // P2002 is Prisma unique constraint violation code
      if (err.code === 'P2002' || err.message?.includes('idempotencyKey')) {
        skippedDuplicateCount++;
      } else {
        throw err;
      }
    }
  }

  // Update Execution status and counters
  const isFinishedImmediately = queuedCount === 0;
  await prisma.campaignExecution.update({
    where: { id: execution.id },
    data: {
      totalAudience: audience.totalAudienceCount,
      eligibleCount: audience.consentedCustomerCount,
      queuedCount,
      skippedCount: skippedDuplicateCount + suppressedCooldownCount + audience.suppressedConsentCount,
      status: isFinishedImmediately ? 'COMPLETED' : 'QUEUED',
      completedAt: isFinishedImmediately ? new Date() : null,
    },
  });

  // If 0 deliveries were queued, mark campaign as COMPLETED immediately
  if (isFinishedImmediately) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: CampaignStatus.COMPLETED,
        lastRunAt: new Date(),
      },
    });
  }

  return {
    executionId: execution.id,
    queuedCount,
    suppressedCooldownCount,
    skippedDuplicateCount,
    suppressedConsentCount: audience.suppressedConsentCount,
  };
}

/**
 * Dispatches a delivery through the simulated provider adapter.
 */
async function dispatchSimulatedDelivery(delivery: any): Promise<DeliveryDispatchResult> {
  if (customSimulatedAdapter) {
    return await customSimulatedAdapter(delivery);
  }

  // Built-in deterministic simulation logic:
  // Check customer phone or message template for test directives
  const phone = delivery.customer?.phone || '';
  if (phone.includes('9999900001')) {
    // Transient failure test number
    return {
      success: false,
      status: DeliveryStatus.RETRY_WAIT,
      errorCategory: 'TRANSIENT',
      errorMessage: 'Temporary network timeout connecting to SMS gateway',
    };
  }

  if (phone.includes('9999900002')) {
    // Permanent failure test number
    return {
      success: false,
      status: DeliveryStatus.FAILED,
      errorCategory: 'PERMANENT',
      errorMessage: 'Invalid phone number or recipient opted out permanently',
    };
  }

  // Check if real or mock provider is active / configured for this business and channel
  const businessId = delivery.campaign?.businessId || delivery.businessId;
  if (businessId) {
    const { resolveActiveProviderConfig, dispatchDeliveryToProvider } = await import('./messagingProviderService');
    const config = await resolveActiveProviderConfig(businessId, delivery.channel);
    if (config.isConfigured) {
      const providerRes = await dispatchDeliveryToProvider(delivery);
      return {
        success: providerRes.success,
        status: providerRes.status,
        provider: providerRes.provider,
        errorCategory: providerRes.errorCategory,
        errorMessage: providerRes.errorMessage,
        externalMessageId: providerRes.providerMessageId,
      };
    }
  }

  // Default: immediate simulated delivery success
  return {
    success: true,
    status: DeliveryStatus.DELIVERED,
    provider: 'SIMULATED',
    externalMessageId: `sim_msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  };
}

/**
 * Processes claimed pending deliveries from the queue, recording attempt results,
 * handling transient vs permanent failures, backoff delays, and terminal campaign completion.
 */
export async function processDeliveryQueue(options: {
  limit?: number;
  workerId?: string;
  businessId?: string;
  campaignId?: string;
  retryPolicy?: RetryPolicy;
} = {}) {
  const policy = options.retryPolicy || DEFAULT_RETRY_POLICY;
  const claimed = await claimPendingDeliveries(options);

  if (claimed.length === 0) {
    return { claimedCount: 0, processedCount: 0, deliveredCount: 0, retryingCount: 0, failedCount: 0 };
  }

  // Update campaign to PROCESSING if currently QUEUED or SCHEDULED
  if (options.campaignId) {
    await prisma.campaign.updateMany({
      where: {
        id: options.campaignId,
        status: { in: [CampaignStatus.QUEUED, CampaignStatus.SCHEDULED] },
      },
      data: { status: CampaignStatus.PROCESSING },
    });
  }

  let deliveredCount = 0;
  let retryingCount = 0;
  let failedCount = 0;

  for (const delivery of claimed) {
    // 1. If parent campaign is cancelled, mark delivery as cancelled
    if (delivery.campaign?.status === CampaignStatus.CANCELLED) {
      await prisma.campaignDelivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.CANCELLED,
          cancelledAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
      continue;
    }

    const currentAttempt = delivery.attemptCount + 1;
    const now = new Date();

    const businessId = delivery.campaign?.businessId || delivery.businessId;
    const meterType = getMeterTypeForChannel(delivery.channel);

    // Pre-dispatch allowance check (server-side hard limit enforcement)
    if (businessId) {
      try {
        const allowance = await UsageMeterService.checkAllowance(businessId, meterType, 1);
        if (!allowance.allowed) {
          logger.warn(
            `[CampaignQueueService] Delivery ${delivery.id} blocked: Plan usage allowance reached for ${meterType} (business: ${businessId})`
          );
          await prisma.campaignDelivery.update({
            where: { id: delivery.id },
            data: {
              status: DeliveryStatus.FAILED,
              failedAt: now,
              attemptCount: currentAttempt,
              lastError: `Plan usage allowance exhausted for ${meterType}`,
              failedReason: `USAGE_LIMIT_REACHED: Included plan allowance for ${meterType} reached and overage is blocked.`,
              lockedAt: null,
              lockedBy: null,
            },
          });
          if (delivery.executionId) {
            await prisma.campaignExecution.update({
              where: { id: delivery.executionId },
              data: { failedCount: { increment: 1 } },
            });
          }
          failedCount++;
          continue;
        }
      } catch (err: any) {
        logger.warn(`[CampaignQueueService] Allowance check skipped on error: ${err.message}`);
      }
    }

    try {
      const result = await dispatchSimulatedDelivery(delivery);

      if (result.success) {
        // SUCCESS
        await prisma.campaignDelivery.update({
          where: { id: delivery.id },
          data: {
            status: result.status || DeliveryStatus.DELIVERED,
            sentAt: now,
            deliveredAt: result.status === DeliveryStatus.DELIVERED ? now : null,
            completedAt: result.status === DeliveryStatus.DELIVERED ? now : null,
            provider: result.provider || delivery.provider || 'SIMULATED',
            providerMessageId: result.externalMessageId || delivery.providerMessageId || null,
            attemptCount: currentAttempt,
            lockedAt: null,
            lockedBy: null,
            lastError: null,
            metadata: {
              ...(typeof delivery.metadata === 'object' && delivery.metadata ? delivery.metadata : {}),
              externalMessageId: result.externalMessageId,
              provider: result.provider,
            },
          },
        });

        // Record billable usage (Idempotent per delivery)
        if (businessId) {
          try {
            await UsageMeterService.recordUsageIdempotent({
              businessId,
              meterType,
              quantity: 1,
              sourceType: 'CAMPAIGN_DELIVERY',
              sourceId: delivery.id,
              idempotencyKey: `msg_${delivery.id}`,
              channel: delivery.channel,
              customerId: delivery.customerId,
              campaignId: delivery.campaignId,
              campaignDeliveryId: delivery.id,
              automationExecutionId: (delivery.metadata as any)?.automationExecutionId || null,
              occurredAt: now,
            });

            await UsageMeterService.recordUsageIdempotent({
              businessId,
              meterType: UsageMeterType.CAMPAIGN_DELIVERY,
              quantity: 1,
              sourceType: 'CAMPAIGN_DELIVERY',
              sourceId: delivery.id,
              idempotencyKey: `dlv_${delivery.id}`,
              channel: delivery.channel,
              customerId: delivery.customerId,
              campaignId: delivery.campaignId,
              campaignDeliveryId: delivery.id,
              automationExecutionId: (delivery.metadata as any)?.automationExecutionId || null,
              occurredAt: now,
            });
          } catch (err: any) {
            logger.warn(`Failed to record usage meter event for delivery ${delivery.id}: ${err.message}`);
          }
        }

        // Record retention touchpoint
        try {
          await recordRetentionEvent(
            { businessId: delivery.campaign.businessId } as any,
            {
              customerId: delivery.customerId,
              eventType: CustomerEventType.CAMPAIGN_TOUCHPOINT,
              metadata: {
                campaignId: delivery.campaignId,
                campaignName: delivery.campaign.name,
                channel: delivery.channel,
                deliveryId: delivery.id,
                executionId: delivery.executionId,
              },
              createdAt: now,
            }
          );
        } catch (err: any) {
          logger.warn(`Failed to record retention event for customer ${delivery.customerId}: ${err.message}`);
        }

        if (delivery.executionId) {
          await prisma.campaignExecution.update({
            where: { id: delivery.executionId },
            data: { deliveredCount: { increment: 1 } },
          });
        }

        deliveredCount++;
      } else {
        // FAILURE: classify error
        const category = result.errorCategory || classifyDeliveryError(result.errorMessage);
        const isExhausted = currentAttempt >= delivery.maxAttempts;

        if (category === 'PERMANENT' || isExhausted) {
          // PERMANENT FAILURE
          await prisma.campaignDelivery.update({
            where: { id: delivery.id },
            data: {
              status: DeliveryStatus.FAILED,
              failedAt: now,
              attemptCount: currentAttempt,
              lastError: result.errorMessage || 'Delivery failed',
              failedReason: isExhausted
                ? `Max retry attempts exhausted: ${result.errorMessage || 'Delivery failed'}`
                : (result.errorMessage || 'Permanent error'),
              lockedAt: null,
              lockedBy: null,
            },
          });

          if (delivery.executionId) {
            await prisma.campaignExecution.update({
              where: { id: delivery.executionId },
              data: { failedCount: { increment: 1 } },
            });
          }

          failedCount++;
        } else {
          // TRANSIENT FAILURE -> RETRY_WAIT
          const delayMs = calculateNextRetryDelay(currentAttempt, policy);
          const nextRetryAt = new Date(Date.now() + delayMs);

          await prisma.campaignDelivery.update({
            where: { id: delivery.id },
            data: {
              status: DeliveryStatus.RETRY_WAIT,
              nextRetryAt,
              attemptCount: currentAttempt,
              lastError: result.errorMessage || 'Transient delivery failure',
              lockedAt: null,
              lockedBy: null,
            },
          });

          retryingCount++;
        }
      }
    } catch (err: any) {
      // Unexpected exception during delivery dispatch
      const delayMs = calculateNextRetryDelay(currentAttempt, policy);
      const nextRetryAt = new Date(Date.now() + delayMs);
      const isExhausted = currentAttempt >= delivery.maxAttempts;

      await prisma.campaignDelivery.update({
        where: { id: delivery.id },
        data: {
          status: isExhausted ? DeliveryStatus.FAILED : DeliveryStatus.RETRY_WAIT,
          failedAt: isExhausted ? now : null,
          nextRetryAt: isExhausted ? null : nextRetryAt,
          attemptCount: currentAttempt,
          lastError: err.message,
          failedReason: isExhausted ? 'Max retry attempts exhausted' : null,
          lockedAt: null,
          lockedBy: null,
        },
      });

      if (isExhausted) failedCount++;
      else retryingCount++;
    }

    // Check if execution has finished all items
    if (delivery.executionId) {
      await checkAndFinalizeExecution(delivery.executionId, delivery.campaignId);
    }
  }

  return {
    claimedCount: claimed.length,
    processedCount: claimed.length,
    deliveredCount,
    retryingCount,
    failedCount,
  };
}

/**
 * Checks if all deliveries for an execution are terminal, and updates execution and campaign status.
 */
async function checkAndFinalizeExecution(executionId: string, campaignId: string) {
  const pendingCount = await prisma.campaignDelivery.count({
    where: {
      executionId,
      status: { in: [DeliveryStatus.QUEUED, DeliveryStatus.PROCESSING, DeliveryStatus.RETRY_WAIT] },
    },
  });

  if (pendingCount === 0) {
    const counts = await prisma.campaignDelivery.groupBy({
      by: ['status'],
      where: { executionId },
      _count: { _all: true },
    });

    const statusMap: Record<string, number> = {};
    for (const c of counts) {
      statusMap[c.status] = c._count._all;
    }

    const totalDelivered = statusMap[DeliveryStatus.DELIVERED] || 0;
    const totalFailed = statusMap[DeliveryStatus.FAILED] || 0;
    const finalExecStatus = totalDelivered > 0 ? 'COMPLETED' : totalFailed > 0 ? 'FAILED' : 'COMPLETED';

    await prisma.campaignExecution.update({
      where: { id: executionId },
      data: {
        status: finalExecStatus,
        completedAt: new Date(),
      },
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: finalExecStatus === 'COMPLETED' ? CampaignStatus.COMPLETED : CampaignStatus.FAILED,
        lastRunAt: new Date(),
      },
    });
  }
}

/**
 * Recovers deliveries abandoned in PROCESSING state by crashed workers.
 */
export async function recoverStaleDeliveries(timeoutMinutes: number = 5): Promise<number> {
  const staleThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);

  const result = await prisma.campaignDelivery.updateMany({
    where: {
      status: DeliveryStatus.PROCESSING,
      lockedAt: { lte: staleThreshold },
    },
    data: {
      status: DeliveryStatus.RETRY_WAIT,
      lockedAt: null,
      lockedBy: null,
      nextRetryAt: new Date(),
    },
  });

  if (result.count > 0) {
    logger.info(`Recovered ${result.count} stale PROCESSING deliveries back to RETRY_WAIT`);
  }
  return result.count;
}
