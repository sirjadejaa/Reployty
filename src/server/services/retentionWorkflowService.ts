/**
 * Reployty V2 — Phase 24 Retention Workflow Service
 * Inactivity Re-engagement, Win-back, Birthday & Time-based Retention Engine
 * 
 * Pipeline:
 * Time-based Retention Processor (Inactivity, Win-back, Birthday)
 *         ↓
 * Centralized Eligibility Engine (Tenant, Branch, Inactivity/Birthday math)
 *         ↓
 * Dynamic Segmentation Check (Phase 21 compileRuleDefinition)
 *         ↓
 * Consent & Cooldown Check (Phase 20/22 CustomerConsent & Frequency Policy)
 *         ↓
 * Idempotency & Concurrency Lock (Atomic DB key uniqueness)
 *         ↓
 * Automation Execution Record (Phase 23 AutomationExecution)
 *         ↓
 * Phase 22 Campaign Execution & Delivery Queue
 */

import { prisma } from '../db/client';
import {
  RetentionWorkflowType,
  RuleStatus,
  ExecutionStatus,
  AutomationActionType,
  CustomerEventType,
  CampaignStatus,
} from '@prisma/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { createAuditLog } from './auditService';
import { compileRuleDefinition, validateRuleDefinition } from './segmentationService';
import { resolveCampaignAudience, mapCampaignChannelToConsent } from './campaignAudienceService';
import { createExecutionQueue, processDeliveryQueue } from './campaignQueueService';
import {
  resolveBusinessOrBranchTimezone,
  isValidTimezone,
} from './campaignSchedulerService';
import {
  CreateRetentionWorkflowDTO,
  UpdateRetentionWorkflowDTO,
  RetentionPreviewParams,
  RetentionPreviewResult,
  RetentionSimulationParams,
  RetentionSimulationResult,
  RetentionSimulationTraceStep,
  LeapYearFeb29Policy,
} from '../../types/retention';
import { logger } from '../utils/logger';

export class RetentionValidationError extends Error {
  code = 'RETENTION_VALIDATION_ERROR';
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'RetentionValidationError';
  }
}

export class RetentionNotFoundError extends Error {
  code = 'RETENTION_NOT_FOUND';
  status = 404;
  constructor(message = 'Retention workflow not found') {
    super(message);
    this.name = 'RetentionNotFoundError';
  }
}

/**
 * Validates permission for managing retention workflows.
 */
export function requireRetentionManagePermission(ctx: TenantContext): void {
  if (!ctx.hasPermission('AUTOMATIONS_MANAGE') && !ctx.hasPermission('CAMPAIGNS_MANAGE')) {
    requirePermission(ctx, 'AUTOMATIONS_MANAGE');
  }
}

/**
 * Validates permission for viewing retention workflows.
 */
export function requireRetentionViewPermission(ctx: TenantContext): void {
  if (
    !ctx.hasPermission('AUTOMATIONS_VIEW') &&
    !ctx.hasPermission('CAMPAIGNS_VIEW') &&
    !ctx.hasPermission('AUTOMATIONS_MANAGE') &&
    !ctx.hasPermission('CAMPAIGNS_MANAGE')
  ) {
    requirePermission(ctx, 'AUTOMATIONS_VIEW');
  }
}

/**
 * Validates whether a year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Resolves local date parts (year, month 1-12, day 1-31) in a specific IANA timezone.
 */
export function getLocalDateParts(date: Date, timezone: string): { year: number; month: number; day: number } {
  const resolvedTz = isValidTimezone(timezone) ? timezone : 'UTC';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  let day = date.getUTCDate();

  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    if (p.type === 'month') month = parseInt(p.value, 10);
    if (p.type === 'day') day = parseInt(p.value, 10);
  }

  return { year, month, day };
}

/**
 * Evaluates whether a customer's birthday matches the target execution date
 * taking into account business timezone, daysBefore offset, and February 29 policy.
 */
export function evaluateBirthdayMatch(
  customerBirthday: Date,
  currentDate: Date,
  timezone: string,
  daysBefore = 0,
  leapYearPolicy: LeapYearFeb29Policy = 'FEB_28'
): { isMatch: boolean; birthdayYear: number; effectiveBirthdayDateStr: string } {
  const currentParts = getLocalDateParts(currentDate, timezone);
  const birthMonth = customerBirthday.getUTCMonth() + 1;
  const birthDay = customerBirthday.getUTCDate();

  const currentYear = currentParts.year;
  const currentYearIsLeap = isLeapYear(currentYear);

  let targetMonth = birthMonth;
  let targetDay = birthDay;

  // Handle Feb 29 for customers born on a leap day
  if (birthMonth === 2 && birthDay === 29) {
    if (!currentYearIsLeap) {
      if (leapYearPolicy === 'MAR_1') {
        targetMonth = 3;
        targetDay = 1;
      } else {
        // Default: FEB_28
        targetMonth = 2;
        targetDay = 28;
      }
    }
  }

  // Create date object for the celebration in the current year
  // Using UTC representation for pure calendar date calculations
  const celebrationDate = new Date(Date.UTC(currentYear, targetMonth - 1, targetDay));
  
  // Apply daysBefore offset
  const executionDate = new Date(celebrationDate.getTime() - daysBefore * 24 * 60 * 60 * 1000);
  const execParts = {
    year: executionDate.getUTCFullYear(),
    month: executionDate.getUTCMonth() + 1,
    day: executionDate.getUTCDate(),
  };

  const isMatch =
    execParts.year === currentParts.year &&
    execParts.month === currentParts.month &&
    execParts.day === currentParts.day;

  const effectiveBirthdayDateStr = `${currentYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

  return {
    isMatch,
    birthdayYear: currentYear,
    effectiveBirthdayDateStr,
  };
}

/**
 * Validates retention workflow configurations.
 */
export async function validateRetentionWorkflowConfig(
  businessId: string,
  workflowType: RetentionWorkflowType,
  config: any,
  branchId?: string | null
): Promise<{
  sanitizedConfig: Record<string, any>;
  triggerEvent: CustomerEventType;
  cooldownMinutes: number;
}> {
  if (!config || typeof config !== 'object') {
    throw new RetentionValidationError('Retention configuration is required');
  }

  if (!config.campaignId || typeof config.campaignId !== 'string') {
    throw new RetentionValidationError('Retention workflow requires a valid campaignId');
  }

  // Verify campaign belongs to tenant
  const campaign = await prisma.campaign.findFirst({
    where: { id: config.campaignId, businessId },
    select: { id: true, branchId: true },
  });

  if (!campaign) {
    throw new RetentionValidationError(`Campaign [${config.campaignId}] not found in this business`);
  }

  // Branch scope validation
  if (branchId && campaign.branchId && campaign.branchId !== branchId) {
    throw new RetentionValidationError(
      `Campaign belongs to branch [${campaign.branchId}] which conflicts with workflow branch [${branchId}]`
    );
  }

  let triggerEvent: CustomerEventType;
  let cooldownMinutes = 0;
  const sanitized: Record<string, any> = {
    campaignId: campaign.id,
    timezone: config.timezone || undefined,
    segmentId: config.segmentId || undefined,
  };

  if (workflowType === 'INACTIVITY') {
    const inactivityDays = Number(config.inactivityDays);
    if (!Number.isInteger(inactivityDays) || inactivityDays <= 0) {
      throw new RetentionValidationError('Inactivity workflow requires a positive integer for inactivityDays');
    }
    sanitized.inactivityDays = inactivityDays;
    sanitized.includeNeverVisited = Boolean(config.includeNeverVisited);
    triggerEvent = CustomerEventType.CUSTOMER_BECAME_INACTIVE;
    const cooldownDays = Number(config.cooldownDays ?? 14);
    cooldownMinutes = Math.max(0, cooldownDays * 24 * 60);
  } else if (workflowType === 'WIN_BACK') {
    const winBackThresholdDays = Number(config.winBackThresholdDays);
    if (!Number.isInteger(winBackThresholdDays) || winBackThresholdDays <= 0) {
      throw new RetentionValidationError('Win-back workflow requires a positive integer for winBackThresholdDays');
    }
    sanitized.winBackThresholdDays = winBackThresholdDays;
    triggerEvent = CustomerEventType.CUSTOMER_BECAME_INACTIVE;
    const cooldownDays = Number(config.cooldownDays ?? 30);
    cooldownMinutes = Math.max(0, cooldownDays * 24 * 60);
  } else if (workflowType === 'BIRTHDAY') {
    const daysBefore = Number(config.daysBefore ?? 0);
    if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 30) {
      throw new RetentionValidationError('Birthday workflow daysBefore must be an integer between 0 and 30');
    }
    const leapYearPolicy = config.leapYearFeb29Policy === 'MAR_1' ? 'MAR_1' : 'FEB_28';
    sanitized.daysBefore = daysBefore;
    sanitized.leapYearFeb29Policy = leapYearPolicy;
    triggerEvent = CustomerEventType.CUSTOMER_BIRTHDAY;
    const cooldownDays = Number(config.cooldownDays ?? 330);
    cooldownMinutes = Math.max(0, cooldownDays * 24 * 60);
  } else {
    throw new RetentionValidationError(`Unsupported retention workflow type: [${workflowType}]`);
  }

  return { sanitizedConfig: sanitized, triggerEvent, cooldownMinutes };
}

/**
 * Creates a new retention workflow rule.
 */
export async function createRetentionWorkflow(
  ctx: TenantContext,
  dto: CreateRetentionWorkflowDTO
) {
  requireRetentionManagePermission(ctx);

  if (!dto.name || typeof dto.name !== 'string' || dto.name.trim().length === 0) {
    throw new RetentionValidationError('Workflow name is required');
  }

  // Branch isolation verification
  let branchId: string | null = null;
  if (dto.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: dto.branchId, businessId: ctx.businessId },
      select: { id: true },
    });
    if (!branch) {
      throw new RetentionValidationError(`Branch [${dto.branchId}] not found in this business`);
    }
    branchId = branch.id;
  }

  const { sanitizedConfig, triggerEvent, cooldownMinutes } = await validateRetentionWorkflowConfig(
    ctx.businessId,
    dto.workflowType,
    dto.config,
    branchId
  );

  // Validate optional segment condition
  let conditionConfig: any = {};
  if (dto.conditionConfig && Object.keys(dto.conditionConfig).length > 0) {
    conditionConfig = validateRuleDefinition(dto.conditionConfig as any);
  }

  const rule = await prisma.automationRule.create({
    data: {
      businessId: ctx.businessId,
      branchId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      triggerEvent,
      workflowType: dto.workflowType,
      retentionConfig: sanitizedConfig,
      conditionConfig,
      actionType: AutomationActionType.SEND_CAMPAIGN,
      actionConfig: {
        campaignId: sanitizedConfig.campaignId,
        campaignCooldownHours: typeof (dto as any)?.campaignCooldownHours === 'number'
          ? (dto as any).campaignCooldownHours
          : 0,
      },
      status: RuleStatus.DRAFT,
      cooldownMinutes,
      maxExecutionsPerCustomer: dto.maxExecutionsPerCustomer ?? 1,
    },
    include: {
      branch: { select: { id: true, name: true } },
    },
  });

  await createAuditLog(ctx, {
    businessId: ctx.businessId,
    action: 'RETENTION_WORKFLOW_CREATED',
    entityType: 'AutomationRule',
    entityId: rule.id,
    newState: {
      name: rule.name,
      workflowType: rule.workflowType,
      retentionConfig: rule.retentionConfig,
    },
  });

  return rule;
}

/**
 * Updates an existing retention workflow rule.
 */
export async function updateRetentionWorkflow(
  ctx: TenantContext,
  ruleId: string,
  dto: UpdateRetentionWorkflowDTO
) {
  requireRetentionManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!existing || !existing.workflowType) {
    throw new RetentionNotFoundError();
  }

  if (existing.status === RuleStatus.ARCHIVED) {
    throw new RetentionValidationError('Archived retention workflows cannot be modified');
  }

  const dataToUpdate: any = {};

  if (dto.name !== undefined) {
    if (!dto.name.trim()) throw new RetentionValidationError('Name cannot be empty');
    dataToUpdate.name = dto.name.trim();
  }

  if (dto.description !== undefined) {
    dataToUpdate.description = dto.description?.trim() || null;
  }

  let effectiveBranchId = existing.branchId;
  if (dto.branchId !== undefined) {
    if (dto.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: dto.branchId, businessId: ctx.businessId },
      });
      if (!branch) throw new RetentionValidationError(`Branch [${dto.branchId}] not found`);
      effectiveBranchId = branch.id;
    } else {
      effectiveBranchId = null;
    }
    dataToUpdate.branchId = effectiveBranchId;
  }

  if (dto.config !== undefined) {
    const mergedConfig = {
      ...(existing.retentionConfig as Record<string, any> || {}),
      ...dto.config,
    };
    const { sanitizedConfig, triggerEvent, cooldownMinutes } = await validateRetentionWorkflowConfig(
      ctx.businessId,
      existing.workflowType,
      mergedConfig,
      effectiveBranchId
    );
    dataToUpdate.retentionConfig = sanitizedConfig;
    dataToUpdate.triggerEvent = triggerEvent;
    dataToUpdate.cooldownMinutes = cooldownMinutes;
    dataToUpdate.actionConfig = {
      campaignId: sanitizedConfig.campaignId,
      campaignCooldownHours: typeof (dto as any)?.campaignCooldownHours === 'number'
        ? (dto as any).campaignCooldownHours
        : 0,
    };
  }

  if (dto.conditionConfig !== undefined) {
    dataToUpdate.conditionConfig = Object.keys(dto.conditionConfig).length > 0
      ? validateRuleDefinition(dto.conditionConfig as any)
      : {};
  }

  if (dto.cooldownDays !== undefined) {
    dataToUpdate.cooldownMinutes = Math.max(0, dto.cooldownDays * 24 * 60);
  }

  if (dto.maxExecutionsPerCustomer !== undefined) {
    dataToUpdate.maxExecutionsPerCustomer = dto.maxExecutionsPerCustomer;
  }

  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data: dataToUpdate,
    include: {
      branch: { select: { id: true, name: true } },
    },
  });

  await createAuditLog(ctx, {
    businessId: ctx.businessId,
    action: 'RETENTION_WORKFLOW_UPDATED',
    entityType: 'AutomationRule',
    entityId: updated.id,
    previousState: { name: existing.name, retentionConfig: existing.retentionConfig },
    newState: { name: updated.name, retentionConfig: updated.retentionConfig },
  });

  return updated;
}

/**
 * Transitions workflow to ACTIVE.
 */
export async function activateRetentionWorkflow(ctx: TenantContext, ruleId: string) {
  requireRetentionManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!existing || !existing.workflowType) {
    throw new RetentionNotFoundError();
  }

  if (existing.status === RuleStatus.ARCHIVED) {
    throw new RetentionValidationError('Cannot activate an archived workflow');
  }

  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data: { status: RuleStatus.ACTIVE },
    include: { branch: { select: { id: true, name: true } } },
  });

  await createAuditLog(ctx, {
    businessId: ctx.businessId,
    action: 'RETENTION_WORKFLOW_ACTIVATED',
    entityType: 'AutomationRule',
    entityId: ruleId,
  });

  return updated;
}

/**
 * Transitions workflow to PAUSED.
 */
export async function pauseRetentionWorkflow(ctx: TenantContext, ruleId: string) {
  requireRetentionManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!existing || !existing.workflowType) {
    throw new RetentionNotFoundError();
  }

  if (existing.status === RuleStatus.ARCHIVED) {
    throw new RetentionValidationError('Cannot pause an archived workflow');
  }

  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data: { status: RuleStatus.PAUSED },
    include: { branch: { select: { id: true, name: true } } },
  });

  await createAuditLog(ctx, {
    businessId: ctx.businessId,
    action: 'RETENTION_WORKFLOW_PAUSED',
    entityType: 'AutomationRule',
    entityId: ruleId,
  });

  return updated;
}

/**
 * Transitions workflow to ARCHIVED.
 */
export async function archiveRetentionWorkflow(ctx: TenantContext, ruleId: string) {
  requireRetentionManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!existing || !existing.workflowType) {
    throw new RetentionNotFoundError();
  }

  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data: { status: RuleStatus.ARCHIVED },
    include: { branch: { select: { id: true, name: true } } },
  });

  await createAuditLog(ctx, {
    businessId: ctx.businessId,
    action: 'RETENTION_WORKFLOW_ARCHIVED',
    entityType: 'AutomationRule',
    entityId: ruleId,
  });

  return updated;
}

/**
 * Retrieves retention workflows for a tenant.
 */
export async function getRetentionWorkflows(
  ctx: TenantContext,
  params: {
    workflowType?: RetentionWorkflowType;
    status?: RuleStatus;
    branchId?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  requireRetentionViewPermission(ctx);

  const whereClause: any = {
    businessId: ctx.businessId,
    workflowType: params.workflowType ? params.workflowType : { not: null },
  };

  if (params.status) {
    whereClause.status = params.status;
  }

  if (params.branchId) {
    whereClause.branchId = params.branchId;
  }

  const [total, items] = await Promise.all([
    prisma.automationRule.count({ where: whereClause }),
    prisma.automationRule.findMany({
      where: whereClause,
      include: {
        branch: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit || 50,
      skip: params.offset || 0,
    }),
  ]);

  return { total, items };
}

/**
 * Retrieves a single retention workflow by ID with tenant security.
 */
export async function getRetentionWorkflowById(ctx: TenantContext, ruleId: string) {
  requireRetentionViewPermission(ctx);

  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
    include: {
      branch: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
  });

  if (!rule || !rule.workflowType) {
    throw new RetentionNotFoundError();
  }

  return rule;
}

/**
 * Evaluates retention eligibility for preview without mutating database or queueing messages.
 */
export async function previewRetentionWorkflow(
  ctx: TenantContext,
  params: RetentionPreviewParams
): Promise<RetentionPreviewResult> {
  requireRetentionViewPermission(ctx);

  const timezone = await resolveBusinessOrBranchTimezone(ctx.businessId, params.branchId);
  const now = new Date();

  const baseWhere: any = {
    businessId: ctx.businessId,
    status: { in: ['ACTIVE', 'VIP', 'INACTIVE', 'AT_RISK'] },
  };

  if (params.branchId) {
    baseWhere.branchId = params.branchId;
  }

  // Dynamic segment integration
  if (params.segmentId) {
    const segment = await prisma.customerSegment.findFirst({
      where: { id: params.segmentId, businessId: ctx.businessId },
    });
    if (segment) {
      const segWhere = compileRuleDefinition(segment.ruleDefinition as any, ctx.businessId, params.branchId);
      baseWhere.AND = [segWhere];
    }
  }

  let sampleCustomersRaw: any[] = [];
  let totalEligibleCount = 0;
  let summaryDetails: any = { timezone, evaluatedAt: now.toISOString(), branchScope: params.branchId || 'ALL_BRANCHES' };

  if (params.workflowType === 'INACTIVITY' || params.workflowType === 'WIN_BACK') {
    const thresholdDays = params.workflowType === 'INACTIVITY'
      ? Number(params.inactivityDays ?? 30)
      : Number(params.winBackThresholdDays ?? 60);

    summaryDetails.thresholdDays = thresholdDays;
    const cutoffDate = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);

    const inactivityConditions: any[] = [
      { lastVisitAt: { lte: cutoffDate } },
    ];

    if (params.includeNeverVisited) {
      inactivityConditions.push({
        lastVisitAt: null,
        joinedAt: { lte: cutoffDate },
      });
    }

    const where = {
      ...baseWhere,
      OR: inactivityConditions,
    };

    [totalEligibleCount, sampleCustomersRaw] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        take: 10,
        orderBy: { lastVisitAt: 'asc' },
        include: { branch: { select: { name: true } } },
      }),
    ]);
  } else if (params.workflowType === 'BIRTHDAY') {
    const daysBefore = Number(params.daysBefore ?? 0);
    summaryDetails.daysBefore = daysBefore;

    // Birthday query: Fetch customers with birthday set and evaluate matches in timezone
    const where = {
      ...baseWhere,
      birthday: { not: null },
    };

    const allBirthdayCandidates = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        birthday: true,
        lastVisitAt: true,
        branchId: true,
        marketingConsent: true,
        branch: { select: { name: true } },
      },
    });

    const matchingCandidates = allBirthdayCandidates.filter((c) => {
      if (!c.birthday) return false;
      const matchResult = evaluateBirthdayMatch(
        c.birthday,
        now,
        timezone,
        daysBefore,
        params.leapYearFeb29Policy || 'FEB_28'
      );
      return matchResult.isMatch;
    });

    totalEligibleCount = matchingCandidates.length;
    sampleCustomersRaw = matchingCandidates.slice(0, 10);
  }

  // Count consent
  const sampleCustomerIds = sampleCustomersRaw.map((c) => c.id);
  const consentedIds = new Set<string>();
  if (sampleCustomerIds.length > 0) {
    const consents = await prisma.customerConsent.findMany({
      where: {
        customerId: { in: sampleCustomerIds },
        granted: true,
      },
      select: { customerId: true },
    });
    consents.forEach((cs) => consentedIds.add(cs.customerId));
  }

  const sampleCustomers: RetentionPreviewResult['sampleCustomers'] = sampleCustomersRaw.map((c) => {
    let daysInactive: number | undefined;
    if (c.lastVisitAt) {
      daysInactive = Math.floor((now.getTime() - new Date(c.lastVisitAt).getTime()) / (24 * 60 * 60 * 1000));
    }
    const hasConsent = consentedIds.has(c.id) || c.marketingConsent;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email || null,
      lastVisitAt: c.lastVisitAt ? new Date(c.lastVisitAt).toISOString() : null,
      daysInactive,
      birthday: c.birthday ? new Date(c.birthday).toISOString() : null,
      branchId: c.branchId,
      branchName: c.branch?.name,
      marketingConsent: hasConsent,
    };
  });

  const consentedCount = sampleCustomers.filter((c) => c.marketingConsent).length;
  const unconsentedCount = sampleCustomers.length - consentedCount;

  return {
    workflowType: params.workflowType,
    totalEligibleCount,
    consentedCount,
    unconsentedCount,
    sampleCustomers,
    summary: summaryDetails,
  };
}

/**
 * Simulates a single retention workflow evaluation against a specific or mock customer.
 * Produces a full diagnostic trace without triggering real executions or queues.
 */
export async function simulateRetentionWorkflow(
  ctx: TenantContext,
  params: RetentionSimulationParams
): Promise<RetentionSimulationResult> {
  requireRetentionViewPermission(ctx);

  const rule = await prisma.automationRule.findFirst({
    where: { id: params.ruleId, businessId: ctx.businessId },
    include: { branch: true },
  });

  if (!rule || !rule.workflowType) {
    throw new RetentionNotFoundError();
  }

  const steps: RetentionSimulationTraceStep[] = [];
  let overallEligible = true;
  let skipReason: string | null = null;

  // Step 1: Rule active check
  if (rule.status !== RuleStatus.ACTIVE) {
    steps.push({
      name: 'WORKFLOW_STATUS',
      status: 'FAILED',
      detail: `Rule status is [${rule.status}], expected [ACTIVE] for production triggers (simulation continues)`,
    });
  } else {
    steps.push({
      name: 'WORKFLOW_STATUS',
      status: 'PASSED',
      detail: 'Rule is ACTIVE and ready to execute',
    });
  }

  // Resolve Customer
  let customer: any = null;
  if (params.customerId) {
    customer = await prisma.customer.findFirst({
      where: { id: params.customerId, businessId: ctx.businessId },
    });
    if (!customer) {
      throw new RetentionValidationError(`Customer [${params.customerId}] not found in business`);
    }
  } else if (params.mockCustomer) {
    customer = {
      id: 'mock_customer_sim',
      name: params.mockCustomer.name || 'Simulated Customer',
      phone: params.mockCustomer.phone || '+919876543210',
      lastVisitAt: params.mockCustomer.lastVisitAt ? new Date(params.mockCustomer.lastVisitAt) : null,
      birthday: params.mockCustomer.birthday ? new Date(params.mockCustomer.birthday) : null,
      marketingConsent: params.mockCustomer.marketingConsent ?? true,
      branchId: rule.branchId,
    };
  } else {
    // Pick first candidate from database
    customer = await prisma.customer.findFirst({
      where: { businessId: ctx.businessId },
    });
    if (!customer) {
      throw new RetentionValidationError('No customers found in business to simulate against');
    }
  }

  // Step 2: Branch scope check
  if (rule.branchId && customer.branchId && rule.branchId !== customer.branchId) {
    overallEligible = false;
    skipReason = 'BRANCH_MISMATCH';
    steps.push({
      name: 'BRANCH_SCOPE',
      status: 'FAILED',
      detail: `Rule scoped to branch [${rule.branchId}] does not match customer branch [${customer.branchId}]`,
    });
  } else {
    steps.push({
      name: 'BRANCH_SCOPE',
      status: 'PASSED',
      detail: 'Branch scope verified',
    });
  }

  // Step 3: Retention logic check (Inactivity / Win-back / Birthday)
  const config = (rule.retentionConfig as Record<string, any>) || {};
  const timezone = await resolveBusinessOrBranchTimezone(ctx.businessId, rule.branchId);
  const now = new Date();
  let idempotencyKey = '';

  if (rule.workflowType === 'INACTIVITY' || rule.workflowType === 'WIN_BACK') {
    const thresholdDays = rule.workflowType === 'INACTIVITY'
      ? Number(config.inactivityDays ?? 30)
      : Number(config.winBackThresholdDays ?? 60);

    const cycleKey = customer.lastVisitAt ? new Date(customer.lastVisitAt).toISOString().split('T')[0] : 'never';
    idempotencyKey = `retention_${rule.workflowType.toLowerCase()}_${rule.id}_${customer.id}_${thresholdDays}_${cycleKey}`;

    if (!customer.lastVisitAt) {
      if (config.includeNeverVisited) {
        steps.push({
          name: 'INACTIVITY_THRESHOLD',
          status: 'PASSED',
          detail: 'Customer has no visits but includeNeverVisited is enabled',
        });
      } else {
        overallEligible = false;
        skipReason = 'NEVER_VISITED_EXCLUDED';
        steps.push({
          name: 'INACTIVITY_THRESHOLD',
          status: 'FAILED',
          detail: 'Customer has never visited and includeNeverVisited is disabled',
        });
      }
    } else {
      const daysInactive = Math.floor((now.getTime() - new Date(customer.lastVisitAt).getTime()) / (24 * 60 * 60 * 1000));
      if (daysInactive >= thresholdDays) {
        steps.push({
          name: 'INACTIVITY_THRESHOLD',
          status: 'PASSED',
          detail: `Customer inactive for ${daysInactive} days (threshold: ${thresholdDays} days)`,
          metadata: { daysInactive, thresholdDays },
        });
      } else {
        overallEligible = false;
        skipReason = 'THRESHOLD_NOT_REACHED';
        steps.push({
          name: 'INACTIVITY_THRESHOLD',
          status: 'FAILED',
          detail: `Customer inactive for ${daysInactive} days, below required threshold of ${thresholdDays} days`,
          metadata: { daysInactive, thresholdDays },
        });
      }
    }
  } else if (rule.workflowType === 'BIRTHDAY') {
    const daysBefore = Number(config.daysBefore ?? 0);
    const targetYear = getLocalDateParts(now, timezone).year;
    idempotencyKey = `retention_birthday_${rule.id}_${customer.id}_${targetYear}_${daysBefore}`;

    if (!customer.birthday) {
      overallEligible = false;
      skipReason = 'NO_BIRTHDAY_RECORDED';
      steps.push({
        name: 'BIRTHDAY_CHECK',
        status: 'FAILED',
        detail: 'Customer has no birthday date on profile',
      });
    } else {
      const match = evaluateBirthdayMatch(
        new Date(customer.birthday),
        now,
        timezone,
        daysBefore,
        config.leapYearFeb29Policy || 'FEB_28'
      );
      if (match.isMatch) {
        steps.push({
          name: 'BIRTHDAY_CHECK',
          status: 'PASSED',
          detail: `Birthday match confirmed for local date in timezone [${timezone}] (effective date: ${match.effectiveBirthdayDateStr})`,
          metadata: match,
        });
      } else {
        overallEligible = false;
        skipReason = 'BIRTHDAY_NOT_DUE';
        steps.push({
          name: 'BIRTHDAY_CHECK',
          status: 'FAILED',
          detail: `Customer birthday is not due today in timezone [${timezone}] (effective: ${match.effectiveBirthdayDateStr}, daysBefore: ${daysBefore})`,
          metadata: match,
        });
      }
    }
  }

  // Step 4: Consent check
  const campaign = await prisma.campaign.findFirst({
    where: { id: config.campaignId, businessId: ctx.businessId },
    select: { id: true, channel: true },
  });

  if (campaign) {
    const consentChannel = mapCampaignChannelToConsent(campaign.channel);
    let hasConsent = customer.marketingConsent;
    if (customer.id !== 'mock_customer_sim') {
      const consentRec = await prisma.customerConsent.findFirst({
        where: { customerId: customer.id, channel: consentChannel, granted: true },
      });
      hasConsent = Boolean(consentRec);
    }

    if (!hasConsent) {
      overallEligible = false;
      skipReason = skipReason || 'CONSENT_NOT_GRANTED';
      steps.push({
        name: 'CONSENT_CHECK',
        status: 'FAILED',
        detail: `Customer lacks granted consent for channel [${campaign.channel}]`,
      });
    } else {
      steps.push({
        name: 'CONSENT_CHECK',
        status: 'PASSED',
        detail: `Consent granted for channel [${campaign.channel}]`,
      });
    }
  }

  // Step 5: Cooldown check
  if (rule.cooldownMinutes > 0 && customer.id !== 'mock_customer_sim') {
    const cooldownCutoff = new Date(now.getTime() - rule.cooldownMinutes * 60 * 1000);
    const recent = await prisma.automationExecution.findFirst({
      where: {
        ruleId: rule.id,
        customerId: customer.id,
        status: ExecutionStatus.COMPLETED,
        executedAt: { gte: cooldownCutoff },
      },
    });

    if (recent) {
      overallEligible = false;
      skipReason = skipReason || 'COOLDOWN_ACTIVE';
      steps.push({
        name: 'COOLDOWN_CHECK',
        status: 'FAILED',
        detail: `Cooldown active until ${new Date(recent.executedAt.getTime() + rule.cooldownMinutes * 60 * 1000).toISOString()}`,
      });
    } else {
      steps.push({
        name: 'COOLDOWN_CHECK',
        status: 'PASSED',
        detail: 'Cooldown period satisfied',
      });
    }
  }

  // Step 6: Idempotency check against database
  if (customer.id !== 'mock_customer_sim') {
    const existingExec = await prisma.automationExecution.findFirst({
      where: { idempotencyKey },
    });
    if (existingExec) {
      overallEligible = false;
      skipReason = skipReason || 'ALREADY_EXECUTED_IN_CYCLE';
      steps.push({
        name: 'IDEMPOTENCY_CHECK',
        status: 'FAILED',
        detail: `Execution already recorded for key [${idempotencyKey}]`,
      });
    } else {
      steps.push({
        name: 'IDEMPOTENCY_CHECK',
        status: 'PASSED',
        detail: `Deterministic idempotency key [${idempotencyKey}] is unique`,
      });
    }
  }

  return {
    ruleId: rule.id,
    workflowType: rule.workflowType,
    evaluatedCustomer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      lastVisitAt: customer.lastVisitAt ? new Date(customer.lastVisitAt).toISOString() : null,
      birthday: customer.birthday ? new Date(customer.birthday).toISOString() : null,
    },
    overallEligible,
    actionTaken: overallEligible ? 'WOULD_QUEUE_DELIVERY' : 'WOULD_SKIP',
    skipReason: overallEligible ? null : skipReason,
    steps,
    idempotencyKeyCalculated: idempotencyKey,
  };
}

/**
 * Time-based Retention Processor
 * Scans active retention workflows, determines eligible customers, and executes workflows safely.
 * Repeatable, idempotent, and concurrency-safe across multiple workers.
 */
export async function processTimeBasedRetention(options: {
  businessId?: string;
  workflowType?: RetentionWorkflowType;
  limitPerWorkflow?: number;
} = {}): Promise<{
  processedRulesCount: number;
  totalExecutionsCreated: number;
  totalExecutionsCompleted: number;
  totalExecutionsSkipped: number;
  executions: Array<{
    ruleId: string;
    customerId: string;
    status: ExecutionStatus;
    skipReason?: string | null;
  }>;
}> {
  const now = new Date();
  const limitPerWorkflow = options.limitPerWorkflow || 50;

  const ruleWhere: any = {
    status: RuleStatus.ACTIVE,
    workflowType: options.workflowType || { in: ['INACTIVITY', 'WIN_BACK', 'BIRTHDAY'] },
  };

  if (options.businessId) {
    ruleWhere.businessId = options.businessId;
  }

  const activeRules = await prisma.automationRule.findMany({
    where: ruleWhere,
    include: {
      business: { select: { id: true, timezone: true } },
      branch: { select: { id: true, timezone: true } },
    },
  });

  let totalExecutionsCreated = 0;
  let totalExecutionsCompleted = 0;
  let totalExecutionsSkipped = 0;
  const executionSummary: Array<{
    ruleId: string;
    customerId: string;
    status: ExecutionStatus;
    skipReason?: string | null;
  }> = [];

  for (const rule of activeRules) {
    if (!rule.workflowType) continue;

    const config = (rule.retentionConfig as Record<string, any>) || {};
    const campaignId = config.campaignId;
    if (!campaignId) continue;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, businessId: rule.businessId },
    });
    if (!campaign) continue;

    const timezone = rule.branch?.timezone || rule.business?.timezone || 'UTC';

    // 1. Identify Candidate Customers
    const customerWhere: any = {
      businessId: rule.businessId,
      status: { in: ['ACTIVE', 'VIP', 'INACTIVE', 'AT_RISK'] },
    };

    if (rule.branchId) {
      customerWhere.branchId = rule.branchId;
    }

    // Dynamic segment condition reuse
    if (rule.conditionConfig && Object.keys(rule.conditionConfig).length > 0) {
      const segWhere = compileRuleDefinition(rule.conditionConfig as any, rule.businessId, rule.branchId);
      customerWhere.AND = [segWhere];
    }

    let candidateCustomers: any[] = [];

    if (rule.workflowType === 'INACTIVITY' || rule.workflowType === 'WIN_BACK') {
      const thresholdDays = rule.workflowType === 'INACTIVITY'
        ? Number(config.inactivityDays ?? 30)
        : Number(config.winBackThresholdDays ?? 60);

      const cutoffDate = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);
      const orConditions: any[] = [{ lastVisitAt: { lte: cutoffDate } }];
      if (config.includeNeverVisited) {
        orConditions.push({ lastVisitAt: null, joinedAt: { lte: cutoffDate } });
      }

      candidateCustomers = await prisma.customer.findMany({
        where: {
          ...customerWhere,
          OR: orConditions,
        },
        take: limitPerWorkflow,
        orderBy: { lastVisitAt: 'asc' },
      });
    } else if (rule.workflowType === 'BIRTHDAY') {
      const daysBefore = Number(config.daysBefore ?? 0);
      const birthdayCandidates = await prisma.customer.findMany({
        where: {
          ...customerWhere,
          birthday: { not: null },
        },
        take: limitPerWorkflow * 3, // Overfetch candidates to filter timezone match in-memory
      });

      candidateCustomers = birthdayCandidates.filter((c) => {
        if (!c.birthday) return false;
        const match = evaluateBirthdayMatch(
          c.birthday,
          now,
          timezone,
          daysBefore,
          config.leapYearFeb29Policy || 'FEB_28'
        );
        return match.isMatch;
      }).slice(0, limitPerWorkflow);
    }

    // 2. Process Candidates
    for (const customer of candidateCustomers) {
      // Deterministic idempotency key calculation
      let idempotencyKey = '';
      if (rule.workflowType === 'INACTIVITY' || rule.workflowType === 'WIN_BACK') {
        const thresholdDays = rule.workflowType === 'INACTIVITY'
          ? Number(config.inactivityDays ?? 30)
          : Number(config.winBackThresholdDays ?? 60);
        const cycleKey = customer.lastVisitAt ? new Date(customer.lastVisitAt).toISOString().split('T')[0] : 'never';
        idempotencyKey = `retention_${rule.workflowType.toLowerCase()}_${rule.id}_${customer.id}_${thresholdDays}_${cycleKey}`;
      } else if (rule.workflowType === 'BIRTHDAY') {
        const daysBefore = Number(config.daysBefore ?? 0);
        const targetYear = getLocalDateParts(now, timezone).year;
        idempotencyKey = `retention_birthday_${rule.id}_${customer.id}_${targetYear}_${daysBefore}`;
      }

      // 1. Pre-check: Detect existing idempotent execution
      if (idempotencyKey) {
        const existingExecution = await prisma.automationExecution.findUnique({
          where: { idempotencyKey },
        });
        if (existingExecution) {
          executionSummary.push({
            ruleId: rule.id,
            customerId: customer.id,
            status: existingExecution.status,
            skipReason: 'IDEMPOTENT_DUPLICATE',
          });
          continue;
        }
      }

      // 2. Concurrency & Idempotency Lock: Atomic DB insertion with unique constraint fallback
      let execution: any = null;
      try {
        execution = await prisma.automationExecution.create({
          data: {
            ruleId: rule.id,
            businessId: rule.businessId,
            branchId: rule.branchId || customer.branchId,
            customerId: customer.id,
            triggerEvent: rule.triggerEvent,
            status: ExecutionStatus.PENDING,
            idempotencyKey,
            attemptCount: 1,
          },
        });
        totalExecutionsCreated++;
      } catch (err: any) {
        // Expected race condition between concurrent workers. Unique constraint violation on idempotencyKey.
        if (err.code === 'P2002' && (err.meta?.target?.includes('idempotencyKey') || String(err.message).includes('idempotencyKey'))) {
          const existingConcurrent = idempotencyKey
            ? await prisma.automationExecution.findUnique({ where: { idempotencyKey } })
            : null;
          executionSummary.push({
            ruleId: rule.id,
            customerId: customer.id,
            status: existingConcurrent?.status ?? ExecutionStatus.SKIPPED,
            skipReason: 'CONCURRENT_IDEMPOTENT_DUPLICATE',
          });
          continue;
        }
        logger.error(`Error creating retention execution for customer [${customer.id}]`, err);
        continue;
      }

      // Transition to PROCESSING
      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: ExecutionStatus.PROCESSING, startedAt: new Date() },
      });

      // A. Cooldown Check
      if (rule.cooldownMinutes > 0) {
        const cooldownCutoff = new Date(now.getTime() - rule.cooldownMinutes * 60 * 1000);
        const priorRecent = await prisma.automationExecution.findFirst({
          where: {
            ruleId: rule.id,
            customerId: customer.id,
            id: { not: execution.id },
            status: { in: [ExecutionStatus.COMPLETED, ExecutionStatus.PROCESSING] },
            executedAt: { gte: cooldownCutoff },
          },
        });

        if (priorRecent) {
          await finalizeRetentionExecution(execution.id, ExecutionStatus.SKIPPED, {
            skipReason: 'COOLDOWN_ACTIVE',
          });
          totalExecutionsSkipped++;
          executionSummary.push({
            ruleId: rule.id,
            customerId: customer.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'COOLDOWN_ACTIVE',
          });
          continue;
        }
      }

      // B. Max Executions per Customer Check
      if (rule.maxExecutionsPerCustomer && rule.maxExecutionsPerCustomer > 0) {
        const completedCount = await prisma.automationExecution.count({
          where: {
            ruleId: rule.id,
            customerId: customer.id,
            id: { not: execution.id },
            status: ExecutionStatus.COMPLETED,
          },
        });

        if (completedCount >= rule.maxExecutionsPerCustomer) {
          await finalizeRetentionExecution(execution.id, ExecutionStatus.SKIPPED, {
            skipReason: 'MAX_EXECUTIONS_REACHED',
          });
          totalExecutionsSkipped++;
          executionSummary.push({
            ruleId: rule.id,
            customerId: customer.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'MAX_EXECUTIONS_REACHED',
          });
          continue;
        }
      }

      // C. Consent Verification
      const consentChannel = mapCampaignChannelToConsent(campaign.channel);
      const consentRec = await prisma.customerConsent.findFirst({
        where: {
          customerId: customer.id,
          channel: consentChannel,
          granted: true,
        },
      });

      if (!consentRec && !customer.marketingConsent) {
        await finalizeRetentionExecution(execution.id, ExecutionStatus.SKIPPED, {
          skipReason: 'CONSENT_NOT_GRANTED',
        });
        totalExecutionsSkipped++;
        executionSummary.push({
          ruleId: rule.id,
          customerId: customer.id,
          status: ExecutionStatus.SKIPPED,
          skipReason: 'CONSENT_NOT_GRANTED',
        });
        continue;
      }

      // D. Queue Phase 22 Campaign Execution
      try {
        // Construct system context for audience resolution
        const sysCtx: TenantContext = {
          user: { id: 'system_retention', email: 'system@reployty.internal', name: 'Retention Engine', isSuperAdmin: true },
          businessId: rule.businessId,
          businessName: 'Business',
          branchId: rule.branchId || customer.branchId,
          roleName: 'OWNER',
          permissions: new Set(['CAMPAIGNS_VIEW', 'CAMPAIGNS_MANAGE', 'CUSTOMERS_VIEW']),
          hasPermission: () => true,
          isOwner: true,
          isSuperAdmin: true,
        };

        const audienceResult = await resolveCampaignAudience(sysCtx, {
          audienceType: 'SPECIFIC_CUSTOMER',
          channel: campaign.channel,
          specificCustomerIds: [customer.id],
        });

        if (audienceResult.eligibleCustomers.length === 0) {
          await finalizeRetentionExecution(execution.id, ExecutionStatus.SKIPPED, {
            skipReason: 'CUSTOMER_NOT_ELIGIBLE',
          });
          totalExecutionsSkipped++;
          executionSummary.push({
            ruleId: rule.id,
            customerId: customer.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'CUSTOMER_NOT_ELIGIBLE',
          });
          continue;
        }

        const campaignExecution = await prisma.campaignExecution.create({
          data: {
            campaignId: campaign.id,
            businessId: rule.businessId,
            branchId: campaign.branchId || rule.branchId,
            triggerType: `RETENTION_${rule.workflowType}`,
            status: 'QUEUED',
            totalAudience: 1,
            eligibleCount: 1,
            startedAt: now,
            metadata: {
              automationRuleId: rule.id,
              automationExecutionId: execution.id,
              workflowType: rule.workflowType,
            },
          },
        });

        // Ensure campaign is ACTIVE
        if (campaign.status === CampaignStatus.COMPLETED) {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: CampaignStatus.ACTIVE },
          });
        }

        // Create delivery queue item
        const queueResult = await createExecutionQueue({
          campaign,
          execution: campaignExecution,
          audience: audienceResult,
          cooldownHours: typeof (rule.actionConfig as any)?.campaignCooldownHours === 'number'
            ? (rule.actionConfig as any).campaignCooldownHours
            : 0,
        });

        if (queueResult.suppressedCooldownCount > 0) {
          await finalizeRetentionExecution(execution.id, ExecutionStatus.SKIPPED, {
            campaignExecutionId: campaignExecution.id,
            skipReason: 'CAMPAIGN_COOLDOWN_ACTIVE',
          });
          totalExecutionsSkipped++;
          executionSummary.push({
            ruleId: rule.id,
            customerId: customer.id,
            status: ExecutionStatus.SKIPPED,
            skipReason: 'CAMPAIGN_COOLDOWN_ACTIVE',
          });
          continue;
        }

        // Process queue delivery batch
        const deliveryResult = await processDeliveryQueue({
          campaignId: campaign.id,
          businessId: rule.businessId,
          limit: 10,
        });

        // Record customer event in retention timeline
        const eventType = rule.workflowType === 'BIRTHDAY'
          ? CustomerEventType.CUSTOMER_BIRTHDAY
          : CustomerEventType.CUSTOMER_BECAME_INACTIVE;

        const custEvent = await prisma.customerEvent.create({
          data: {
            businessId: rule.businessId,
            customerId: customer.id,
            branchId: rule.branchId || customer.branchId,
            type: eventType,
            metadata: {
              ruleId: rule.id,
              workflowType: rule.workflowType,
              campaignId: campaign.id,
            },
            createdAt: now,
          },
        });

        // Finalize execution as COMPLETED
        await finalizeRetentionExecution(execution.id, ExecutionStatus.COMPLETED, {
          campaignExecutionId: campaignExecution.id,
          resultMetadata: {
            workflowType: rule.workflowType,
            campaignId: campaign.id,
            deliveredCount: deliveryResult.deliveredCount,
            eventId: custEvent.id,
          },
        });

        totalExecutionsCompleted++;
        executionSummary.push({
          ruleId: rule.id,
          customerId: customer.id,
          status: ExecutionStatus.COMPLETED,
        });
      } catch (execErr: any) {
        logger.error(`Error processing retention campaign delivery for rule [${rule.id}]`, execErr);
        await finalizeRetentionExecution(execution.id, ExecutionStatus.FAILED, {
          lastError: execErr.message || 'Delivery error',
        });
      }
    }
  }

  return {
    processedRulesCount: activeRules.length,
    totalExecutionsCreated,
    totalExecutionsCompleted,
    totalExecutionsSkipped,
    executions: executionSummary,
  };
}

/**
 * Handles customer return / recovery when a visit, purchase, stamp, or redemption occurs.
 * Reconnects the retention loop by resolving inactive/winback states and logging reactivation.
 */
export async function handleCustomerReturn(
  ctx: TenantContext,
  customerId: string,
  eventType: CustomerEventType | string,
  _metadata: Record<string, any> = {}
) {
  const returnEvents: CustomerEventType[] = [
    CustomerEventType.VISIT_RECORDED,
    CustomerEventType.PURCHASE_RECORDED,
    CustomerEventType.STAMP_ADDED,
    CustomerEventType.POINTS_ADDED,
    CustomerEventType.REWARD_REDEEMED,
    CustomerEventType.OFFER_REDEEMED,
  ];

  if (!returnEvents.includes(eventType as CustomerEventType)) {
    return { reacted: false };
  }

  // Check if customer had a recent completed Inactivity or Win-back execution
  const recentRetentionExec = await prisma.automationExecution.findFirst({
    where: {
      customerId,
      businessId: ctx.businessId,
      status: ExecutionStatus.COMPLETED,
      rule: {
        workflowType: { in: ['INACTIVITY', 'WIN_BACK'] },
      },
    },
    orderBy: { executedAt: 'desc' },
    include: { rule: true },
  });

  if (!recentRetentionExec) {
    return { reacted: false };
  }

  // Log reactivation retention event
  const now = new Date();
  await prisma.customerEvent.create({
    data: {
      businessId: ctx.businessId,
      customerId,
      branchId: ctx.branchId || null,
      type: CustomerEventType.CUSTOMER_REACTIVATED,
      metadata: {
        reactivatedByEvent: eventType,
        priorRetentionRuleId: recentRetentionExec.ruleId,
        priorWorkflowType: recentRetentionExec.rule.workflowType,
        recoveredAt: now.toISOString(),
      },
      createdAt: now,
    },
  });

  await createAuditLog(ctx, {
    businessId: ctx.businessId,
    action: 'CUSTOMER_REACTIVATED',
    entityType: 'Customer',
    entityId: customerId,
    newState: {
      returnEvent: eventType,
      recoveredWorkflow: recentRetentionExec.rule.workflowType,
    },
  });

  return {
    reacted: true,
    priorWorkflowType: recentRetentionExec.rule.workflowType,
    reactivatedAt: now,
  };
}

/**
 * Finalizes retention execution status.
 */
async function finalizeRetentionExecution(
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

  return prisma.automationExecution.update({
    where: { id: executionId },
    data,
  });
}
