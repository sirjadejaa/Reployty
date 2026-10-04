/**
 * Reployty V2 — Phase 23 Automation Engine & Trigger Processors
 * Automation Rule Service & Lifecycle Management
 * 
 * Provides:
 * - Multi-tenant isolated rule CRUD
 * - Controlled trigger and action registry validation
 * - Phase 21 condition engine reuse (validateRuleDefinition)
 * - Strict lifecycle state machine: DRAFT -> ACTIVE <-> PAUSED -> ARCHIVED
 * - Execution history retrieval and operational audit logging
 */

import { prisma } from '../db/client';
import { Prisma } from '@prisma/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { createAuditLog } from './auditService';
import { validateRuleDefinition } from './segmentationService';
import {
  CreateAutomationRuleDTO,
  UpdateAutomationRuleDTO,
  AutomationExecutionFilter,
  AutomationRuleItem,
  AutomationExecutionItem,
  normalizeTriggerEvent,
  RuleStatus,
  ExecutionStatus,
  AutomationActionType,
  CustomerEventType,
} from '../../types/automation';
import {
  validateWorkflowDefinition,
  compileWorkflowDefinition,
} from './workflowCompilerService';
import { simulateWorkflow } from './workflowSimulationService';
import {
  WorkflowDefinition,
  WorkflowValidationResult,
  WorkflowSimulationResult,
} from '../../types/workflow';

export class AutomationValidationError extends Error {
  code = 'AUTOMATION_VALIDATION_ERROR';
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'AutomationValidationError';
  }
}

export class AutomationNotFoundError extends Error {
  code = 'AUTOMATION_NOT_FOUND';
  status = 404;
  constructor(message = 'Automation rule not found') {
    super(message);
    this.name = 'AutomationNotFoundError';
  }
}

export class AutomationStateError extends Error {
  code = 'AUTOMATION_STATE_ERROR';
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'AutomationStateError';
  }
}

/**
 * Validates permission for managing automations.
 * Allowed for users with AUTOMATIONS_MANAGE or CAMPAIGNS_MANAGE (e.g. Owner/Manager).
 */
export function requireAutomationManagePermission(ctx: TenantContext): void {
  if (!ctx.hasPermission('AUTOMATIONS_MANAGE') && !ctx.hasPermission('CAMPAIGNS_MANAGE')) {
    requirePermission(ctx, 'AUTOMATIONS_MANAGE'); // Will throw PermissionDeniedError
  }
}

/**
 * Validates permission for viewing automations.
 */
export function requireAutomationViewPermission(ctx: TenantContext): void {
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
 * Validates action configuration for supported actions.
 */
async function validateActionConfig(
  businessId: string,
  actionType: AutomationActionType,
  actionConfig: any
): Promise<void> {
  if (actionType === AutomationActionType.SEND_CAMPAIGN) {
    if (!actionConfig || typeof actionConfig !== 'object') {
      throw new AutomationValidationError('SEND_CAMPAIGN action requires actionConfig with campaignId');
    }
    const campaignId = actionConfig.campaignId;
    if (!campaignId || typeof campaignId !== 'string') {
      throw new AutomationValidationError('Action config must provide a valid campaignId');
    }

    // Verify campaign exists and belongs to this business
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        businessId,
      },
      select: { id: true, status: true },
    });

    if (!campaign) {
      throw new AutomationValidationError(
        `Campaign [${campaignId}] not found in business [${businessId}]`
      );
    }
  }
}

/**
 * Creates a new Automation Rule in DRAFT state.
 */
export async function createAutomationRule(
  ctx: TenantContext,
  dto: CreateAutomationRuleDTO
): Promise<AutomationRuleItem> {
  requireAutomationManagePermission(ctx);

  if (!dto.name || typeof dto.name !== 'string' || dto.name.trim().length === 0) {
    throw new AutomationValidationError('Automation name is required');
  }

  // Validate & normalize trigger
  let canonicalTrigger: CustomerEventType;
  try {
    canonicalTrigger = normalizeTriggerEvent(dto.triggerEvent);
  } catch (err: any) {
    throw new AutomationValidationError(err.message);
  }

  // Validate branch if provided
  let branchId: string | null = null;
  if (dto.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: dto.branchId, businessId: ctx.businessId },
      select: { id: true },
    });
    if (!branch) {
      throw new AutomationValidationError(
        `Branch [${dto.branchId}] not found in business [${ctx.businessId}]`
      );
    }
    branchId = branch.id;
  }

  // Validate condition config reusing Phase 21 segmentation rule engine
  let conditionConfig: any = {};
  if (dto.conditionConfig && Object.keys(dto.conditionConfig).length > 0) {
    if (
      dto.conditionConfig.conditions ||
      dto.conditionConfig.groups ||
      dto.conditionConfig.logic
    ) {
      conditionConfig = validateRuleDefinition(dto.conditionConfig);
    } else {
      conditionConfig = dto.conditionConfig;
    }
  }

  // Validate action
  const actionType = dto.actionType || AutomationActionType.SEND_CAMPAIGN;
  await validateActionConfig(ctx.businessId, actionType, dto.actionConfig);

  const cooldownMinutes = typeof dto.cooldownMinutes === 'number' && dto.cooldownMinutes >= 0
    ? dto.cooldownMinutes
    : 0;

  const maxExecutionsPerCustomer =
    typeof dto.maxExecutionsPerCustomer === 'number' && dto.maxExecutionsPerCustomer > 0
      ? dto.maxExecutionsPerCustomer
      : null;

  let workflowDefinition = dto.workflowDefinition || null;
  if (workflowDefinition) {
    const valResult = await validateWorkflowDefinition(ctx.businessId, workflowDefinition as any, {
      requireExecutable: false,
    });
    if (!valResult.valid) {
      throw new AutomationValidationError(
        `Invalid workflow definition: ${valResult.errors[0]?.message}`
      );
    }
  }

  const rule = await prisma.automationRule.create({
    data: {
      businessId: ctx.businessId,
      branchId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      triggerEvent: canonicalTrigger,
      conditionConfig,
      actionType,
      actionConfig: (dto.actionConfig || {}) as any,
      status: RuleStatus.DRAFT,
      version: 1,
      workflowDefinition: workflowDefinition as any,
      draftDefinition: undefined,
      cooldownMinutes,
      maxExecutionsPerCustomer,
    },
    include: {
      branch: { select: { id: true, name: true } },
    },
  });

  await createAuditLog(ctx, {
    action: workflowDefinition ? 'WORKFLOW_CREATED' : 'AUTOMATION_CREATED',
    entityType: 'AUTOMATION_RULE',
    entityId: rule.id,
    businessId: ctx.businessId,
    newState: {
      name: rule.name,
      triggerEvent: rule.triggerEvent,
      actionType: rule.actionType,
      status: rule.status,
      branchId: rule.branchId,
      version: rule.version,
    },
  });

  return rule as unknown as AutomationRuleItem;
}

/**
 * Retrieves automation rules for the tenant with optional branch filtering.
 */
export async function getAutomationRules(
  ctx: TenantContext,
  params: {
    status?: RuleStatus;
    branchId?: string | null;
    triggerEvent?: CustomerEventType;
  } = {}
): Promise<AutomationRuleItem[]> {
  requireAutomationViewPermission(ctx);

  const where: any = {
    businessId: ctx.businessId,
  };

  if (params.status) {
    where.status = params.status;
  }

  if (params.triggerEvent) {
    where.triggerEvent = params.triggerEvent;
  }

  // Branch filtering: If specific branch requested, show branch-specific rules + business-wide rules
  if (params.branchId !== undefined) {
    if (params.branchId === null) {
      where.branchId = null;
    } else {
      where.OR = [{ branchId: params.branchId }, { branchId: null }];
    }
  } else if (ctx.branchId) {
    // Scoped staff context
    where.OR = [{ branchId: ctx.branchId }, { branchId: null }];
  }

  const rules = await prisma.automationRule.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      _count: {
        select: { executions: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rules as unknown as AutomationRuleItem[];
}

/**
 * Retrieves a single automation rule by ID with strict tenant isolation.
 */
export async function getAutomationRuleById(
  ctx: TenantContext,
  ruleId: string
): Promise<AutomationRuleItem> {
  requireAutomationViewPermission(ctx);

  const rule = await prisma.automationRule.findFirst({
    where: {
      id: ruleId,
      businessId: ctx.businessId,
    },
    include: {
      branch: { select: { id: true, name: true } },
      _count: {
        select: { executions: true },
      },
    },
  });

  if (!rule) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  return rule as unknown as AutomationRuleItem;
}

/**
 * Updates an automation rule with strict validation.
 */
export async function updateAutomationRule(
  ctx: TenantContext,
  ruleId: string,
  dto: UpdateAutomationRuleDTO
): Promise<AutomationRuleItem> {
  requireAutomationManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!existing) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  if (existing.status === RuleStatus.ARCHIVED) {
    throw new AutomationStateError('Cannot modify an ARCHIVED automation rule');
  }

  const data: any = {};

  if (dto.name !== undefined) {
    if (typeof dto.name !== 'string' || dto.name.trim().length === 0) {
      throw new AutomationValidationError('Automation name cannot be empty');
    }
    data.name = dto.name.trim();
  }

  if (dto.description !== undefined) {
    data.description = dto.description?.trim() || null;
  }

  if (dto.triggerEvent !== undefined) {
    try {
      data.triggerEvent = normalizeTriggerEvent(dto.triggerEvent);
    } catch (err: any) {
      throw new AutomationValidationError(err.message);
    }
  }

  if (dto.branchId !== undefined) {
    if (dto.branchId === null) {
      data.branchId = null;
    } else {
      const branch = await prisma.branch.findFirst({
        where: { id: dto.branchId, businessId: ctx.businessId },
        select: { id: true },
      });
      if (!branch) {
        throw new AutomationValidationError(
          `Branch [${dto.branchId}] not found in business [${ctx.businessId}]`
        );
      }
      data.branchId = branch.id;
    }
  }

  if (dto.conditionConfig !== undefined) {
    if (
      dto.conditionConfig &&
      (dto.conditionConfig.conditions || dto.conditionConfig.groups || dto.conditionConfig.logic)
    ) {
      data.conditionConfig = validateRuleDefinition(dto.conditionConfig);
    } else {
      data.conditionConfig = dto.conditionConfig || {};
    }
  }

  if (dto.actionType !== undefined) {
    data.actionType = dto.actionType;
  }

  if (dto.actionConfig !== undefined) {
    const actionType = dto.actionType || existing.actionType;
    await validateActionConfig(ctx.businessId, actionType, dto.actionConfig);
    data.actionConfig = dto.actionConfig;
  }

  if (dto.cooldownMinutes !== undefined) {
    if (typeof dto.cooldownMinutes !== 'number' || dto.cooldownMinutes < 0) {
      throw new AutomationValidationError('cooldownMinutes must be a non-negative number');
    }
    data.cooldownMinutes = dto.cooldownMinutes;
  }

  if (dto.maxExecutionsPerCustomer !== undefined) {
    if (dto.maxExecutionsPerCustomer !== null && (typeof dto.maxExecutionsPerCustomer !== 'number' || dto.maxExecutionsPerCustomer < 1)) {
      throw new AutomationValidationError('maxExecutionsPerCustomer must be at least 1 or null');
    }
    data.maxExecutionsPerCustomer = dto.maxExecutionsPerCustomer;
  }

  if (dto.workflowDefinition !== undefined) {
    if (dto.workflowDefinition) {
      const valResult = await validateWorkflowDefinition(
        ctx.businessId,
        dto.workflowDefinition as any,
        { requireExecutable: false }
      );
      if (!valResult.valid) {
        throw new AutomationValidationError(
          `Invalid workflow definition: ${valResult.errors[0]?.message}`
        );
      }
    }
    // Version Safety: If active, editing creates a working draft without mutating live execution!
    if (existing.status === RuleStatus.ACTIVE) {
      data.draftDefinition = dto.workflowDefinition as any;
    } else {
      data.workflowDefinition = dto.workflowDefinition as any;
      data.draftDefinition = null;
    }
  }

  if (dto.draftDefinition !== undefined) {
    data.draftDefinition = dto.draftDefinition as any;
  }

  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data,
    include: {
      branch: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
  });

  await createAuditLog(ctx, {
    action: dto.workflowDefinition || dto.draftDefinition ? 'WORKFLOW_UPDATED' : 'AUTOMATION_UPDATED',
    entityType: 'AUTOMATION_RULE',
    entityId: ruleId,
    businessId: ctx.businessId,
    previousState: {
      name: existing.name,
      triggerEvent: existing.triggerEvent,
      status: existing.status,
      branchId: existing.branchId,
      version: existing.version,
    },
    newState: {
      name: updated.name,
      triggerEvent: updated.triggerEvent,
      status: updated.status,
      branchId: updated.branchId,
      version: updated.version,
    },
  });

  return updated as unknown as AutomationRuleItem;
}

/**
 * Activates an automation rule (DRAFT -> ACTIVE or PAUSED -> ACTIVE).
 */
export async function activateAutomationRule(
  ctx: TenantContext,
  ruleId: string
): Promise<AutomationRuleItem> {
  requireAutomationManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!existing) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  if (existing.status === RuleStatus.ARCHIVED) {
    throw new AutomationStateError('Cannot activate an ARCHIVED automation rule');
  }

  if (existing.status === RuleStatus.ACTIVE && !existing.draftDefinition) {
    return existing as unknown as AutomationRuleItem;
  }

  const activeDef = (existing.draftDefinition || existing.workflowDefinition) as any;
  if (activeDef && Array.isArray(activeDef.nodes) && activeDef.nodes.length > 0) {
    let compiledConfig: any;
    try {
      compiledConfig = await compileWorkflowDefinition(ctx.businessId, activeDef);
    } catch (err: any) {
      throw new AutomationValidationError(err.message || 'Workflow validation failed before activation');
    }

    // Create immutable version snapshot
    await prisma.automationRuleVersion.create({
      data: {
        ruleId: existing.id,
        businessId: ctx.businessId,
        version: existing.version,
        name: existing.name,
        triggerEvent: compiledConfig.triggerEvent,
        workflowDefinition: activeDef,
        conditionConfig: compiledConfig.conditionConfig,
        actionType: compiledConfig.actionType,
        actionConfig: compiledConfig.actionConfig,
      },
    });

    const updated = await prisma.automationRule.update({
      where: { id: ruleId },
      data: {
        status: RuleStatus.ACTIVE,
        workflowDefinition: activeDef,
        draftDefinition: Prisma.DbNull,
        triggerEvent: compiledConfig.triggerEvent,
        conditionConfig: compiledConfig.conditionConfig,
        actionType: compiledConfig.actionType,
        actionConfig: compiledConfig.actionConfig,
        cooldownMinutes: compiledConfig.cooldownMinutes,
        version: existing.version + 1,
      },
      include: {
        branch: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
    });

    await createAuditLog(ctx, {
      action: 'WORKFLOW_ACTIVATED',
      entityType: 'AUTOMATION_RULE',
      entityId: ruleId,
      businessId: ctx.businessId,
      previousState: { status: existing.status, version: existing.version },
      newState: { status: RuleStatus.ACTIVE, version: updated.version },
    });

    await createAuditLog(ctx, {
      action: 'WORKFLOW_VERSION_CREATED',
      entityType: 'AUTOMATION_RULE',
      entityId: ruleId,
      businessId: ctx.businessId,
      newState: { version: existing.version },
    });

    return updated as unknown as AutomationRuleItem;
  }

  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data: { status: RuleStatus.ACTIVE },
    include: {
      branch: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'AUTOMATION_ACTIVATED',
    entityType: 'AUTOMATION_RULE',
    entityId: ruleId,
    businessId: ctx.businessId,
    previousState: { status: existing.status },
    newState: { status: RuleStatus.ACTIVE, branchId: updated.branchId },
  });

  return updated as unknown as AutomationRuleItem;
}

/**
 * Pauses an active automation rule (ACTIVE -> PAUSED).
 */
export async function pauseAutomationRule(
  ctx: TenantContext,
  ruleId: string
): Promise<AutomationRuleItem> {
  requireAutomationManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!existing) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  if (existing.status === RuleStatus.ARCHIVED) {
    throw new AutomationStateError('Cannot pause an ARCHIVED automation rule');
  }

  if (existing.status === RuleStatus.PAUSED) {
    return existing as unknown as AutomationRuleItem;
  }

  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data: { status: RuleStatus.PAUSED },
    include: {
      branch: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'AUTOMATION_PAUSED',
    entityType: 'AUTOMATION_RULE',
    entityId: ruleId,
    businessId: ctx.businessId,
    previousState: { status: existing.status },
    newState: { status: RuleStatus.PAUSED, branchId: updated.branchId },
  });

  return updated as unknown as AutomationRuleItem;
}

/**
 * Archives an automation rule (terminal state).
 */
export async function archiveAutomationRule(
  ctx: TenantContext,
  ruleId: string
): Promise<AutomationRuleItem> {
  requireAutomationManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!existing) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  if (existing.status === RuleStatus.ARCHIVED) {
    return existing as unknown as AutomationRuleItem;
  }

  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data: { status: RuleStatus.ARCHIVED },
    include: {
      branch: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'AUTOMATION_ARCHIVED',
    entityType: 'AUTOMATION_RULE',
    entityId: ruleId,
    businessId: ctx.businessId,
    previousState: { status: existing.status },
    newState: { status: RuleStatus.ARCHIVED, branchId: updated.branchId },
  });

  return updated as unknown as AutomationRuleItem;
}

/**
 * Deletes an automation rule if it has no execution history.
 * If executions exist, archives the rule instead.
 */
export async function deleteAutomationRule(
  ctx: TenantContext,
  ruleId: string
): Promise<{ success: boolean; archived: boolean }> {
  requireAutomationManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
    include: {
      _count: { select: { executions: true } },
    },
  });

  if (!existing) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  if (existing._count.executions > 0) {
    // Archive to preserve execution audit history
    await archiveAutomationRule(ctx, ruleId);
    return { success: true, archived: true };
  }

  await prisma.automationRule.delete({
    where: { id: ruleId },
  });

  await createAuditLog(ctx, {
    action: 'AUTOMATION_DELETED',
    entityType: 'AUTOMATION_RULE',
    entityId: ruleId,
    businessId: ctx.businessId,
    previousState: {
      name: existing.name,
      triggerEvent: existing.triggerEvent,
      branchId: existing.branchId,
    },
  });

  return { success: true, archived: false };
}

/**
 * Retrieves execution history for a rule or across the business with filters.
 */
export async function getAutomationExecutions(
  ctx: TenantContext,
  params: AutomationExecutionFilter = {}
): Promise<{
  total: number;
  executions: AutomationExecutionItem[];
  limit: number;
  offset: number;
  summary: {
    completed: number;
    skipped: number;
    failed: number;
    processing: number;
  };
}> {
  requireAutomationViewPermission(ctx);

  const limit = Math.min(Math.max(params.limit || 50, 1), 200);
  const offset = Math.max(params.offset || 0, 0);

  const where: any = {
    businessId: ctx.businessId,
  };

  if (params.ruleId) {
    // Verify rule belongs to this business
    const rule = await prisma.automationRule.findFirst({
      where: { id: params.ruleId, businessId: ctx.businessId },
      select: { id: true },
    });
    if (!rule) {
      throw new AutomationNotFoundError(`Automation rule [${params.ruleId}] not found`);
    }
    where.ruleId = params.ruleId;
  }

  if (params.customerId) {
    where.customerId = params.customerId;
  }

  if (params.status) {
    where.status = params.status;
  }

  const [total, executions, completedCount, skippedCount, failedCount, processingCount] =
    await Promise.all([
      prisma.automationExecution.count({ where }),
      prisma.automationExecution.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true } },
          rule: { select: { id: true, name: true, triggerEvent: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.automationExecution.count({
        where: { ...where, status: ExecutionStatus.COMPLETED },
      }),
      prisma.automationExecution.count({
        where: { ...where, status: ExecutionStatus.SKIPPED },
      }),
      prisma.automationExecution.count({
        where: { ...where, status: ExecutionStatus.FAILED },
      }),
      prisma.automationExecution.count({
        where: {
          ...where,
          status: { in: [ExecutionStatus.PENDING, ExecutionStatus.PROCESSING] },
        },
      }),
    ]);

  return {
    total,
    executions: executions as unknown as AutomationExecutionItem[],
    limit,
    offset,
    summary: {
      completed: completedCount,
      skipped: skippedCount,
      failed: failedCount,
      processing: processingCount,
    },
  };
}

/**
 * Duplicates an automation rule/workflow as a new DRAFT.
 */
export async function duplicateAutomationRule(
  ctx: TenantContext,
  ruleId: string
): Promise<AutomationRuleItem> {
  requireAutomationManagePermission(ctx);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!existing) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  const duplicated = await prisma.automationRule.create({
    data: {
      businessId: ctx.businessId,
      branchId: existing.branchId,
      name: `${existing.name} (Copy)`,
      description: existing.description,
      triggerEvent: existing.triggerEvent,
      conditionConfig: existing.conditionConfig || {},
      actionType: existing.actionType,
      actionConfig: existing.actionConfig || {},
      workflowType: existing.workflowType,
      retentionConfig: existing.retentionConfig || undefined,
      cooldownMinutes: existing.cooldownMinutes,
      maxExecutionsPerCustomer: existing.maxExecutionsPerCustomer,
      status: RuleStatus.DRAFT,
      version: 1,
      workflowDefinition: existing.workflowDefinition || undefined,
      draftDefinition: undefined,
    },
    include: {
      branch: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'WORKFLOW_CREATED',
    entityType: 'AUTOMATION_RULE',
    entityId: duplicated.id,
    businessId: ctx.businessId,
    newState: { name: duplicated.name, status: duplicated.status },
  });

  return duplicated as unknown as AutomationRuleItem;
}

/**
 * Retrieves version history for an automation rule.
 */
export async function getAutomationRuleVersions(
  ctx: TenantContext,
  ruleId: string
) {
  requireAutomationViewPermission(ctx);

  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!rule) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  const versions = await prisma.automationRuleVersion.findMany({
    where: { ruleId, businessId: ctx.businessId },
    orderBy: { version: 'desc' },
  });

  return { versions };
}

/**
 * Validates a visual workflow definition without mutating database.
 */
export async function validateAutomationWorkflow(
  ctx: TenantContext,
  definition: WorkflowDefinition
): Promise<WorkflowValidationResult> {
  requireAutomationViewPermission(ctx);
  return validateWorkflowDefinition(ctx.businessId, definition, { requireExecutable: true });
}

/**
 * Simulates a visual workflow dry run for testing.
 */
export async function simulateAutomationWorkflow(
  ctx: TenantContext,
  ruleId: string,
  params: {
    customerId?: string;
    eventType?: CustomerEventType | string;
    definition?: WorkflowDefinition;
    metadata?: Record<string, any>;
  } = {}
): Promise<WorkflowSimulationResult> {
  requireAutomationViewPermission(ctx);

  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });

  if (!rule) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  const targetDef = params.definition || (rule.draftDefinition as any) || (rule.workflowDefinition as any);
  if (!targetDef) {
    throw new AutomationValidationError('No workflow definition found to simulate');
  }

  const result = await simulateWorkflow(ctx, targetDef, params);
  if (!result.success && result.summary && result.summary.includes('validation failed')) {
    throw new AutomationValidationError(result.summary);
  }

  await createAuditLog(ctx, {
    action: 'WORKFLOW_TESTED',
    entityType: 'AUTOMATION_RULE',
    entityId: ruleId,
    businessId: ctx.businessId,
    newState: { success: result.success, wouldDispatch: result.wouldDispatch },
  });

  return result;
}

/**
 * Computes analytics for an automation rule based on PostgreSQL executions, deliveries, and conversions.
 */
export async function getAutomationAnalytics(
  ctx: TenantContext,
  ruleId: string
) {
  requireAutomationViewPermission(ctx);
  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, businessId: ctx.businessId },
  });
  if (!rule) {
    throw new AutomationNotFoundError(`Automation rule [${ruleId}] not found`);
  }

  const executions = await prisma.automationExecution.findMany({
    where: { ruleId, businessId: ctx.businessId },
    select: {
      id: true,
      status: true,
      campaignExecutionId: true,
      createdAt: true,
    },
  });

  const totalExecutions = executions.length;
  const completedExecutions = executions.filter(e => e.status === 'COMPLETED').length;
  const failedExecutions = executions.filter(e => e.status === 'FAILED').length;
  const skippedExecutions = executions.filter(e => e.status === 'SKIPPED').length;

  const campaignExecutionIds = executions
    .map(e => e.campaignExecutionId)
    .filter((id): id is string => Boolean(id));

  let totalMessages = 0;
  let deliveredMessages = 0;
  let engagementCount = 0;
  let totalConversions = 0;
  let totalConversionRevenue = 0;

  if (campaignExecutionIds.length > 0) {
    const deliveries = await prisma.campaignDelivery.findMany({
      where: {
        executionId: { in: campaignExecutionIds },
        businessId: ctx.businessId,
      },
      select: {
        id: true,
        status: true,
        openedAt: true,
        clickedAt: true,
      },
    });

    totalMessages = deliveries.length;
    deliveredMessages = deliveries.filter((d) => d.status === 'DELIVERED').length;
    engagementCount = deliveries.filter((d) => Boolean(d.openedAt || d.clickedAt)).length;

    const deliveryIds = deliveries.map((d) => d.id);
    if (deliveryIds.length > 0) {
      const conversions = await prisma.campaignConversion.findMany({
        where: {
          campaignDeliveryId: { in: deliveryIds },
          businessId: ctx.businessId,
        },
        select: {
          id: true,
          metadata: true,
        },
      });

      totalConversions = conversions.length;
      totalConversionRevenue = conversions.reduce((sum, c) => {
        const meta = c.metadata as any;
        const val = meta?.amount || meta?.value || 0;
        return sum + Number(val);
      }, 0);
    }
  }


  return {
    ruleId,
    ruleName: rule.name,
    status: rule.status,
    executions: {
      total: totalExecutions,
      completed: completedExecutions,
      failed: failedExecutions,
      skipped: skippedExecutions,
    },
    messages: {
      total: totalMessages,
      delivered: deliveredMessages,
      engagement: engagementCount,
    },
    conversions: {
      total: totalConversions,
      revenue: Math.round(totalConversionRevenue * 100) / 100,
    },
  };
}

