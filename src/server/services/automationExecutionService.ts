/**
 * Reployty V2 — Phase 23 Automation Engine & Trigger Processors
 * Automation Execution & Trigger Processor Service
 * 
 * Flow:
 * Customer / Business Event
 *         ↓
 * Event Ingestion (recordAndProcessEvent)
 *         ↓
 * Trigger Processor (SUPPORTED_TRIGGERS)
 *         ↓
 * Automation Rule Matching (Tenant + Branch isolated)
 *         ↓
 * Recursion Guard (Max Depth = 2)
 *         ↓
 * Concurrency & Idempotency Lock
 *         ↓
 * Cooldown & Frequency Checks
 *         ↓
 * Condition Evaluation (Phase 21 Rule Engine)
 *         ↓
 * Eligibility & Consent Check (Phase 20/22 Consent)
 *         ↓
 * Automation Action Execution
 *         ↓
 * Phase 22 Campaign / Queue Integration
 *         ↓
 * Delivery
 */

import { prisma } from '../db/client';
import { CampaignStatus } from '@prisma/client';
import { TenantContext } from '../auth/tenantContext';
import { compileRuleDefinition } from './segmentationService';
import { resolveCampaignAudience, mapCampaignChannelToConsent } from './campaignAudienceService';
import { createExecutionQueue, processDeliveryQueue } from './campaignQueueService';
import {
  AutomationEventEnvelope,
  CustomerEventType,
  RuleStatus,
  ExecutionStatus,
  AutomationActionType,
  normalizeTriggerEvent,
} from '../../types/automation';
import { logger } from '../utils/logger';

export interface IngestEventParams {
  businessId?: string;
  customerId: string;
  eventType: CustomerEventType | string;
  branchId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  occurredAt?: Date;
}

export interface ProcessEventResult {
  eventId: string;
  eventType: CustomerEventType;
  event?: any;
  matchedRulesCount: number;
  executions: Array<{
    ruleId: string;
    executionId: string;
    status: ExecutionStatus;
    skipReason?: string | null;
    campaignExecutionId?: string | null;
    error?: string | null;
  }>;
}

const MAX_AUTOMATION_DEPTH = 2;

/**
 * Centrally ingests an event, records it in the retention timeline, and triggers matching automations.
 */
export async function recordAndProcessEvent(
  ctxOrParams: TenantContext | IngestEventParams,
  maybeParams?: IngestEventParams
): Promise<ProcessEventResult> {
  let ctx: TenantContext;
  let params: IngestEventParams;
  if (maybeParams) {
    ctx = ctxOrParams as TenantContext;
    params = maybeParams;
  } else {
    params = ctxOrParams as IngestEventParams;
    ctx = {
      businessId: params.businessId || '',
      userId: 'system',
      role: 'SYSTEM',
      permissions: ['*'],
      branchId: params.branchId || null,
    } as any;
  }

  const canonicalEventType = normalizeTriggerEvent(params.eventType);

  // Validate customer belongs to this business
  const customer = await prisma.customer.findFirst({
    where: {
      id: params.customerId,
      businessId: ctx.businessId,
    },
    select: { id: true, branchId: true },
  });

  if (!customer) {
    throw new Error(`Customer [${params.customerId}] not found in business [${ctx.businessId}]`);
  }

  // Derive branch context: explicit param > customer branch > ctx branch
  let eventBranchId: string | null = null;
  if (params.branchId !== undefined) {
    eventBranchId = params.branchId;
  } else if (customer.branchId) {
    eventBranchId = customer.branchId;
  } else if (ctx.branchId) {
    eventBranchId = ctx.branchId;
  }

  // 1. Persist Event
  const customerEvent = await prisma.customerEvent.create({
    data: {
      businessId: ctx.businessId,
      customerId: customer.id,
      branchId: eventBranchId,
      type: canonicalEventType,
      metadata: params.metadata || {},
      createdAt: params.occurredAt || new Date(),
    },
  });

  const envelope: AutomationEventEnvelope = {
    eventId: customerEvent.id,
    eventType: canonicalEventType,
    businessId: ctx.businessId,
    branchId: eventBranchId,
    customerId: customer.id,
    entityType: params.entityType,
    entityId: params.entityId,
    occurredAt: customerEvent.createdAt,
    metadata: params.metadata || {},
  };

  // 1b. Evaluate customer return / retention recovery
  try {
    const { handleCustomerReturn } = await import('./retentionWorkflowService');
    await handleCustomerReturn(ctx, customer.id, canonicalEventType, params.metadata);
  } catch (retErr: any) {
    logger.warn('Error handling customer return recovery', { error: retErr?.message || String(retErr) });
  }

  // 2. Dispatch Trigger Processor
  const result = await processAutomationEvent(ctx, envelope);
  return {
    ...result,
    event: customerEvent,
  };
}

/**
 * Processes an automation event against all matching ACTIVE automation rules.
 */
export async function processAutomationEvent(
  ctx: TenantContext,
  envelope: AutomationEventEnvelope
): Promise<ProcessEventResult> {
  const { eventId, eventType, businessId, branchId, customerId, metadata = {} } = envelope;

  // 1. Recursion Guard
  const currentDepth = typeof metadata.automationDepth === 'number' ? metadata.automationDepth : 0;
  if (currentDepth >= MAX_AUTOMATION_DEPTH) {
    logger.warn(`Automation recursion depth limit reached for event [${eventId}]`);
    return {
      eventId,
      eventType,
      matchedRulesCount: 0,
      executions: [],
    };
  }

  // 2. Query ACTIVE rules matching event type and tenant
  // Branch behavior: A rule matching this branch OR business-wide (branchId == null)
  const branchConditions: any[] = [{ branchId: null }];
  if (branchId) {
    branchConditions.push({ branchId });
  }

  const matchingRules = await prisma.automationRule.findMany({
    where: {
      businessId,
      triggerEvent: eventType,
      status: RuleStatus.ACTIVE,
      OR: branchConditions,
    },
  });

  if (matchingRules.length === 0) {
    return {
      eventId,
      eventType,
      matchedRulesCount: 0,
      executions: [],
    };
  }

  const executionResults: ProcessEventResult['executions'] = [];

  // 3. Process each rule
  for (const rule of matchingRules) {
    const idempotencyKey = `rule_${rule.id}_evt_${eventId}`;

    // Concurrency & Idempotency: Create execution record in PENDING state
    let execution: any = null;
    try {
      execution = await prisma.automationExecution.create({
        data: {
          ruleId: rule.id,
          businessId,
          branchId: rule.branchId || branchId,
          customerId,
          eventId,
          triggerEvent: eventType,
          ruleVersion: rule.version,
          status: ExecutionStatus.PENDING,
          idempotencyKey,
          attemptCount: 1,
        },
      });
    } catch (createErr: any) {
      // Prisma P2002 = Unique constraint violation -> Already created/processed!
      if (createErr.code === 'P2002') {
        logger.info(`Idempotent skip: Execution already exists for key [${idempotencyKey}]`);
        continue;
      }
      logger.error('Failed to create automation execution record', createErr);
      continue;
    }

    // Process single execution safely
    try {
      // Transition to PROCESSING
      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.PROCESSING,
          startedAt: new Date(),
        },
      });

      // A. Cooldown Check (same-rule cooldown per customer)
      if (rule.cooldownMinutes > 0) {
        const cooldownThreshold = new Date(Date.now() - rule.cooldownMinutes * 60 * 1000);
        const priorRecent = await prisma.automationExecution.findFirst({
          where: {
            ruleId: rule.id,
            customerId,
            id: { not: execution.id },
            status: { in: [ExecutionStatus.COMPLETED, ExecutionStatus.PROCESSING] },
            executedAt: { gte: cooldownThreshold },
          },
        });

        if (priorRecent) {
          await finalizeExecution(execution.id, ExecutionStatus.SKIPPED, {
            skipReason: 'COOLDOWN_ACTIVE',
            resultMetadata: {
              cooldownMinutes: rule.cooldownMinutes,
              priorExecutionId: priorRecent.id,
            },
          });
          executionResults.push({
            ruleId: rule.id,
            executionId: execution.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'COOLDOWN_ACTIVE',
          });
          continue;
        }
      }

      // B. Max Executions per Customer Check
      if (rule.maxExecutionsPerCustomer !== null && rule.maxExecutionsPerCustomer > 0) {
        const completedCount = await prisma.automationExecution.count({
          where: {
            ruleId: rule.id,
            customerId,
            id: { not: execution.id },
            status: ExecutionStatus.COMPLETED,
          },
        });

        if (completedCount >= rule.maxExecutionsPerCustomer) {
          await finalizeExecution(execution.id, ExecutionStatus.SKIPPED, {
            skipReason: 'MAX_EXECUTIONS_REACHED',
            resultMetadata: {
              maxExecutionsPerCustomer: rule.maxExecutionsPerCustomer,
              previousCompleted: completedCount,
            },
          });
          executionResults.push({
            ruleId: rule.id,
            executionId: execution.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'MAX_EXECUTIONS_REACHED',
          });
          continue;
        }
      }

      // C. Condition Evaluation (Reusing Phase 21 segmentation compiler)
      if (
        rule.conditionConfig &&
        typeof rule.conditionConfig === 'object' &&
        Object.keys(rule.conditionConfig).length > 0 &&
        ((rule.conditionConfig as any).conditions || (rule.conditionConfig as any).groups)
      ) {
        const conditionWhere = compileRuleDefinition(
          rule.conditionConfig as any,
          rule.businessId,
          rule.branchId
        );

        const satisfiesCondition = await prisma.customer.findFirst({
          where: {
            AND: [{ id: customerId }, conditionWhere],
          },
          select: { id: true },
        });

        if (!satisfiesCondition) {
          await finalizeExecution(execution.id, ExecutionStatus.SKIPPED, {
            skipReason: 'CONDITIONS_NOT_MET',
          });
          executionResults.push({
            ruleId: rule.id,
            executionId: execution.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'CONDITIONS_NOT_MET',
          });
          continue;
        }
      }

      // D. Action Execution: SEND_CAMPAIGN
      if (rule.actionType === AutomationActionType.SEND_CAMPAIGN) {
        const actionConfig = rule.actionConfig as any;
        const campaignId = actionConfig.campaignId;

        const campaign = await prisma.campaign.findFirst({
          where: { id: campaignId, businessId },
        });

        if (!campaign) {
          await finalizeExecution(execution.id, ExecutionStatus.FAILED, {
            lastError: `Target campaign [${campaignId}] not found`,
          });
          executionResults.push({
            ruleId: rule.id,
            executionId: execution.id,
            status: ExecutionStatus.FAILED,
            error: 'Target campaign not found',
          });
          continue;
        }

        // Check customer consent for campaign channel
        const consentChannel = mapCampaignChannelToConsent(campaign.channel);
        const consentRecord = await prisma.customerConsent.findFirst({
          where: {
            customerId,
            channel: consentChannel,
            granted: true,
          },
        });

        if (!consentRecord) {
          await finalizeExecution(execution.id, ExecutionStatus.SKIPPED, {
            skipReason: 'CONSENT_NOT_GRANTED',
            resultMetadata: { channel: campaign.channel, consentChannel },
          });
          executionResults.push({
            ruleId: rule.id,
            executionId: execution.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'CONSENT_NOT_GRANTED',
          });
          continue;
        }

        // Single-Customer Resolution via Phase 22 Audience Service
        const audienceResult = await resolveCampaignAudience(ctx, {
          audienceType: 'SPECIFIC_CUSTOMER',
          channel: campaign.channel,
          specificCustomerIds: [customerId],
        });

        if (audienceResult.eligibleCustomers.length === 0) {
          await finalizeExecution(execution.id, ExecutionStatus.SKIPPED, {
            skipReason: 'CUSTOMER_NOT_ELIGIBLE',
            resultMetadata: {
              suppressedConsent: audienceResult.suppressedConsentCount > 0,
            },
          });
          executionResults.push({
            ruleId: rule.id,
            executionId: execution.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'CUSTOMER_NOT_ELIGIBLE',
          });
          continue;
        }

        // Trigger Phase 22 Campaign Execution Queue
        const campaignExecution = await prisma.campaignExecution.create({
          data: {
            campaignId: campaign.id,
            businessId,
            branchId: campaign.branchId || rule.branchId,
            triggerType: 'AUTOMATION',
            status: 'QUEUED',
            totalAudience: 1,
            eligibleCount: 1,
            startedAt: new Date(),
            metadata: {
              automationRuleId: rule.id,
              automationExecutionId: execution.id,
              triggerEvent: eventType,
              automationDepth: currentDepth + 1,
            },
          },
        });

        // Ensure campaign is ACTIVE for ongoing automation triggers
        if (campaign.status === CampaignStatus.COMPLETED) {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: CampaignStatus.ACTIVE },
          });
        }

        // Create delivery queue item with cooldown checks
        const queueResult = await createExecutionQueue({
          campaign,
          execution: campaignExecution,
          audience: audienceResult,
          cooldownHours: typeof actionConfig.cooldownHours === 'number' ? actionConfig.cooldownHours : 0,
        });

        if (queueResult.suppressedCooldownCount > 0) {
          // Suppressed by campaign customer cooldown
          await finalizeExecution(execution.id, ExecutionStatus.SKIPPED, {
            campaignExecutionId: campaignExecution.id,
            skipReason: 'CAMPAIGN_COOLDOWN_ACTIVE',
            resultMetadata: { cooldownHours: actionConfig.cooldownHours ?? 0 },
          });
          executionResults.push({
            ruleId: rule.id,
            executionId: execution.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'CAMPAIGN_COOLDOWN_ACTIVE',
            campaignExecutionId: campaignExecution.id,
          });
          continue;
        }

        // Process delivery queue
        const processResult = await processDeliveryQueue({
          campaignId: campaign.id,
          businessId,
          limit: 10,
        });

        // Finalize Automation Execution as COMPLETED
        await finalizeExecution(execution.id, ExecutionStatus.COMPLETED, {
          campaignExecutionId: campaignExecution.id,
          resultMetadata: {
            campaignId: campaign.id,
            deliveredCount: processResult.deliveredCount,
            failedCount: processResult.failedCount,
          },
        });

        executionResults.push({
          ruleId: rule.id,
          executionId: execution.id,
          status: ExecutionStatus.COMPLETED,
          campaignExecutionId: campaignExecution.id,
        });
      } else {
        // Fallback for other action types (e.g. AWARD_STAMPS, ADD_TAG)
        await finalizeExecution(execution.id, ExecutionStatus.COMPLETED, {
          resultMetadata: { actionType: rule.actionType, actionConfig: rule.actionConfig },
        });
        executionResults.push({
          ruleId: rule.id,
          executionId: execution.id,
          status: ExecutionStatus.COMPLETED,
        });
      }
    } catch (procErr: any) {
      logger.error(`Error executing automation rule [${rule.id}]`, procErr);
      await finalizeExecution(execution.id, ExecutionStatus.FAILED, {
        lastError: procErr.message || 'Execution processor error',
      });
      executionResults.push({
        ruleId: rule.id,
        executionId: execution.id,
        status: ExecutionStatus.FAILED,
        error: procErr.message,
      });
    }
  }

  return {
    eventId,
    eventType,
    matchedRulesCount: matchingRules.length,
    executions: executionResults,
  };
}

/**
 * Updates execution record with terminal state and audit log.
 */
async function finalizeExecution(
  executionId: string,
  status: ExecutionStatus,
  details: {
    campaignExecutionId?: string | null;
    skipReason?: string | null;
    lastError?: string | null;
    resultMetadata?: any;
  }
) {
  const now = new Date();
  const data: any = {
    status,
    skipReason: details.skipReason || null,
    lastError: details.lastError || null,
    resultMetadata: details.resultMetadata || null,
    updatedAt: now,
  };

  if (details.campaignExecutionId) {
    data.campaignExecutionId = details.campaignExecutionId;
  }

  if (status === ExecutionStatus.COMPLETED) {
    data.completedAt = now;
  } else if (status === ExecutionStatus.FAILED) {
    data.failedAt = now;
  }

  const updated = await prisma.automationExecution.update({
    where: { id: executionId },
    data,
  });

  if (status === ExecutionStatus.COMPLETED && updated.businessId) {
    try {
      const { UsageMeterService } = await import('./usageMeterService');
      const { UsageMeterType } = await import('@prisma/client');
      await UsageMeterService.recordUsageIdempotent({
        businessId: updated.businessId,
        meterType: UsageMeterType.AUTOMATION_EXECUTION,
        quantity: 1,
        sourceType: 'AUTOMATION_EXECUTION',
        sourceId: executionId,
        idempotencyKey: `auto_${executionId}`,
        customerId: updated.customerId,
        automationExecutionId: executionId,
        occurredAt: now,
      });
    } catch (err: any) {
      logger.warn(`Failed to record automation execution usage meter: ${err.message}`);
    }
  }

  return updated;
}

/**
 * Recovers stale automation executions that may have been abandoned during server restart.
 */
export async function recoverStaleAutomationExecutions(
  timeoutMinutes = 30
): Promise<{ recoveredCount: number }> {
  const staleThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);

  const staleExecutions = await prisma.automationExecution.findMany({
    where: {
      status: { in: [ExecutionStatus.PENDING, ExecutionStatus.PROCESSING] },
      createdAt: { lte: staleThreshold },
    },
    take: 100,
  });

  for (const exec of staleExecutions) {
    await prisma.automationExecution.update({
      where: { id: exec.id },
      data: {
        status: ExecutionStatus.FAILED,
        failedAt: new Date(),
        lastError: 'Stale execution recovered after timeout',
      },
    });
  }

  return { recoveredCount: staleExecutions.length };
}
