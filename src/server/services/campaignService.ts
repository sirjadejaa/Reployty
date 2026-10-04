/**
 * Reployty V2 — Phase 20 Retention Architecture
 * Campaign Management Service
 * 
 * Central domain service for campaign lifecycle, CRUD operations,
 * controlled status transitions, RBAC enforcement, and audit trail generation.
 */

import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { createAuditLog } from './auditService';
import { requireFeature } from './entitlementService';
import {
  AudienceType,
  CampaignActionType,
  CampaignChannel,
  CampaignStatus,
  CampaignType,
  CustomerEventType,
  Prisma,
} from '@prisma/client';

export interface CreateCampaignDTO {
  name: string;
  description?: string;
  type?: CampaignType;
  audienceType?: AudienceType;
  segmentId?: string | null;
  branchId?: string | null;
  offerId?: string | null;
  actionType?: CampaignActionType;
  triggerEvent?: CustomerEventType | null;
  triggerConfig?: Record<string, any> | null;
  audienceFilter?: Record<string, any> | null;
  channel?: CampaignChannel;
  messageTemplate: string;
  scheduledAt?: Date | string | null;
  timezone?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  status?: CampaignStatus;
}

export interface UpdateCampaignDTO {
  name?: string;
  description?: string;
  type?: CampaignType;
  audienceType?: AudienceType;
  segmentId?: string | null;
  branchId?: string | null;
  offerId?: string | null;
  actionType?: CampaignActionType;
  triggerEvent?: CustomerEventType | null;
  triggerConfig?: Record<string, any> | null;
  audienceFilter?: Record<string, any> | null;
  channel?: CampaignChannel;
  messageTemplate?: string;
  scheduledAt?: Date | string | null;
  timezone?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

export interface CampaignQueryParams {
  status?: CampaignStatus;
  type?: CampaignType;
  channel?: CampaignChannel;
  branchId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class CampaignValidationError extends Error {
  code = 'CAMPAIGN_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'CampaignValidationError';
  }
}

export class CampaignNotFoundError extends Error {
  code = 'CAMPAIGN_NOT_FOUND';
  constructor(id: string) {
    super(`Campaign [${id}] was not found`);
    this.name = 'CampaignNotFoundError';
  }
}

/**
 * Validates status transitions to maintain a strict, predictable campaign lifecycle:
 * DRAFT -> SCHEDULED | QUEUED | PROCESSING | ACTIVE | CANCELLED
 * SCHEDULED -> QUEUED | PROCESSING | ACTIVE | DRAFT | CANCELLED
 * QUEUED -> PROCESSING | COMPLETED | CANCELLED | FAILED
 * PROCESSING -> COMPLETED | CANCELLED | FAILED | SENDING | SENT
 * ACTIVE -> PAUSED | COMPLETED | CANCELLED | SENDING | SENT
 * PAUSED -> ACTIVE | CANCELLED
 * SENDING -> SENT | COMPLETED | CANCELLED | FAILED
 * SENT -> COMPLETED
 * FAILED -> DRAFT | SCHEDULED | QUEUED
 * COMPLETED -> (Terminal state)
 * CANCELLED -> (Terminal state)
 */
export function validateStatusTransition(current: CampaignStatus, next: CampaignStatus): void {
  if (current === next) return;

  const validTransitions: Record<CampaignStatus, CampaignStatus[]> = {
    [CampaignStatus.DRAFT]: [CampaignStatus.SCHEDULED, CampaignStatus.QUEUED, CampaignStatus.PROCESSING, CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
    [CampaignStatus.SCHEDULED]: [CampaignStatus.QUEUED, CampaignStatus.PROCESSING, CampaignStatus.ACTIVE, CampaignStatus.DRAFT, CampaignStatus.CANCELLED],
    [CampaignStatus.QUEUED]: [CampaignStatus.PROCESSING, CampaignStatus.COMPLETED, CampaignStatus.CANCELLED, CampaignStatus.FAILED],
    [CampaignStatus.PROCESSING]: [CampaignStatus.COMPLETED, CampaignStatus.CANCELLED, CampaignStatus.FAILED, CampaignStatus.SENDING, CampaignStatus.SENT],
    [CampaignStatus.ACTIVE]: [CampaignStatus.PAUSED, CampaignStatus.COMPLETED, CampaignStatus.CANCELLED, CampaignStatus.SENDING, CampaignStatus.SENT],
    [CampaignStatus.PAUSED]: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
    [CampaignStatus.SENDING]: [CampaignStatus.SENT, CampaignStatus.COMPLETED, CampaignStatus.CANCELLED, CampaignStatus.FAILED],
    [CampaignStatus.SENT]: [CampaignStatus.COMPLETED],
    [CampaignStatus.FAILED]: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.QUEUED],
    [CampaignStatus.COMPLETED]: [], // Terminal
    [CampaignStatus.CANCELLED]: [], // Terminal
  };

  const allowed = validTransitions[current] || [];
  if (!allowed.includes(next)) {
    throw new CampaignValidationError(
      `Invalid campaign status transition from [${current}] to [${next}]. Allowed: ${allowed.join(', ') || 'none (terminal state)'}`
    );
  }
}

/**
 * Lists campaigns for a business tenant with optional search, filtering, and pagination.
 */
export async function getBusinessCampaigns(ctx: TenantContext, params: CampaignQueryParams = {}) {
  requirePermission(ctx, 'CAMPAIGNS_VIEW');
  await requireFeature(ctx, 'CAMPAIGNS');

  const businessId = ctx.businessId;
  const limit = Math.min(Math.max(params.limit || 20, 1), 100);
  const offset = Math.max(params.offset || 0, 0);

  const whereClause: Prisma.CampaignWhereInput = {
    businessId,
  };

  // Branch isolation: If user is scoped to a branch, restrict to branch or business-wide
  if (ctx.branchId) {
    whereClause.OR = [{ branchId: ctx.branchId }, { branchId: null }];
  } else if (params.branchId) {
    whereClause.branchId = params.branchId;
  }

  if (params.status) {
    whereClause.status = params.status;
  }

  if (params.type) {
    whereClause.type = params.type;
  }

  if (params.channel) {
    whereClause.channel = params.channel;
  }

  if (params.search) {
    whereClause.name = { contains: params.search, mode: 'insensitive' };
  }

  const [total, campaigns] = await Promise.all([
    prisma.campaign.count({ where: whereClause }),
    prisma.campaign.findMany({
      where: whereClause,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        segment: { select: { id: true, name: true } },
        offer: { select: { id: true, title: true, type: true } },
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    total,
    campaigns,
    limit,
    offset,
  };
}

/**
 * Retrieves a single campaign by ID with detailed delivery metrics.
 */
export async function getCampaignById(ctx: TenantContext, campaignId: string) {
  requirePermission(ctx, 'CAMPAIGNS_VIEW');
  await requireFeature(ctx, 'CAMPAIGNS');

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      businessId: ctx.businessId,
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      segment: { select: { id: true, name: true } },
      offer: { select: { id: true, title: true, type: true, discountValue: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      deliveries: {
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      },
      _count: {
        select: {
          deliveries: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  // Branch check: If user is scoped to a specific branch and campaign is scoped to a different branch
  if (ctx.branchId && campaign.branchId && campaign.branchId !== ctx.branchId) {
    throw new CampaignNotFoundError(campaignId);
  }

  // Aggregate delivery status counts
  const deliveryCounts = await prisma.campaignDelivery.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });

  const statusSummary: Record<string, number> = {};
  for (const item of deliveryCounts) {
    statusSummary[item.status] = item._count._all;
  }

  return {
    ...campaign,
    statusSummary,
  };
}

/**
 * Creates a new campaign under the authenticated business tenant.
 */
export async function createCampaign(ctx: TenantContext, dto: CreateCampaignDTO) {
  requirePermission(ctx, 'CAMPAIGNS_MANAGE');
  await requireFeature(ctx, 'CAMPAIGNS');

  if (!dto.name || dto.name.trim().length === 0) {
    throw new CampaignValidationError('Campaign name is required');
  }

  if (!dto.messageTemplate || dto.messageTemplate.trim().length === 0) {
    throw new CampaignValidationError('Message template is required');
  }

  const businessId = ctx.businessId;

  // 1. Branch scoping validation
  let targetBranchId: string | null = null;
  if (dto.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: dto.branchId, businessId },
    });
    if (!branch) {
      throw new CampaignValidationError(`Branch [${dto.branchId}] not found in business`);
    }
    targetBranchId = branch.id;
  } else if (ctx.branchId) {
    targetBranchId = ctx.branchId;
  }

  // 2. Segment validation if SAVED_SEGMENT
  if (dto.audienceType === AudienceType.SAVED_SEGMENT && dto.segmentId) {
    const segment = await prisma.customerSegment.findFirst({
      where: { id: dto.segmentId, businessId },
    });
    if (!segment) {
      throw new CampaignValidationError(`Segment [${dto.segmentId}] not found in business`);
    }
  }

  // 3. Offer validation if offerId attached
  if (dto.offerId) {
    const offer = await prisma.offer.findFirst({
      where: { id: dto.offerId, businessId },
    });
    if (!offer) {
      throw new CampaignValidationError(`Offer [${dto.offerId}] not found in business`);
    }
  }

  // 4. Initial status
  const initialStatus = dto.status || CampaignStatus.DRAFT;

  // 5. Create Campaign
  const campaign = await prisma.campaign.create({
    data: {
      businessId,
      branchId: targetBranchId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      type: dto.type || CampaignType.ONE_TIME,
      audienceType: dto.audienceType || AudienceType.ALL_CUSTOMERS,
      segmentId: dto.segmentId || null,
      offerId: dto.offerId || null,
      actionType: dto.actionType || CampaignActionType.SEND_MESSAGE,
      triggerEvent: dto.triggerEvent || null,
      triggerConfig: dto.triggerConfig ? (dto.triggerConfig as Prisma.InputJsonValue) : Prisma.JsonNull,
      audienceFilter: dto.audienceFilter ? (dto.audienceFilter as Prisma.InputJsonValue) : Prisma.JsonNull,
      channel: dto.channel || CampaignChannel.WHATSAPP,
      messageTemplate: dto.messageTemplate.trim(),
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      timezone: dto.timezone || null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      status: initialStatus,
      createdById: ctx.user.id,
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      segment: { select: { id: true, name: true } },
    },
  });

  // 6. Audit Trail
  await createAuditLog(ctx, {
    action: 'CAMPAIGN_CREATED',
    entityType: 'CAMPAIGN',
    entityId: campaign.id,
    businessId,
    newState: {
      name: campaign.name,
      type: campaign.type,
      channel: campaign.channel,
      status: campaign.status,
    },
  });

  return campaign;
}

/**
 * Updates an existing campaign. Completed and Cancelled campaigns cannot be edited.
 */
export async function updateCampaign(ctx: TenantContext, campaignId: string, dto: UpdateCampaignDTO) {
  requirePermission(ctx, 'CAMPAIGNS_MANAGE');
  await requireFeature(ctx, 'CAMPAIGNS');

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      businessId: ctx.businessId,
    },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  if (campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.CANCELLED) {
    throw new CampaignValidationError(`Cannot edit campaign in terminal status [${campaign.status}]`);
  }

  // Branch verification if user is branch-scoped
  if (ctx.branchId && campaign.branchId && campaign.branchId !== ctx.branchId) {
    throw new CampaignNotFoundError(campaignId);
  }

  const updateData: Prisma.CampaignUpdateInput = {};

  if (dto.name !== undefined) {
    if (!dto.name.trim()) throw new CampaignValidationError('Campaign name cannot be empty');
    updateData.name = dto.name.trim();
  }

  if (dto.description !== undefined) {
    updateData.description = dto.description?.trim() || null;
  }

  if (dto.messageTemplate !== undefined) {
    if (!dto.messageTemplate.trim()) throw new CampaignValidationError('Message template cannot be empty');
    updateData.messageTemplate = dto.messageTemplate.trim();
  }

  if (dto.channel !== undefined) updateData.channel = dto.channel;
  if (dto.type !== undefined) updateData.type = dto.type;
  if (dto.audienceType !== undefined) updateData.audienceType = dto.audienceType;
  if (dto.actionType !== undefined) updateData.actionType = dto.actionType;
  if (dto.triggerEvent !== undefined) updateData.triggerEvent = dto.triggerEvent;
  if (dto.triggerConfig !== undefined) updateData.triggerConfig = dto.triggerConfig as Prisma.InputJsonValue;
  if (dto.audienceFilter !== undefined) updateData.audienceFilter = dto.audienceFilter as Prisma.InputJsonValue;

  if (dto.segmentId !== undefined) {
    if (dto.segmentId) {
      const seg = await prisma.customerSegment.findFirst({
        where: { id: dto.segmentId, businessId: ctx.businessId },
      });
      if (!seg) throw new CampaignValidationError(`Segment [${dto.segmentId}] not found in business`);
      updateData.segment = { connect: { id: seg.id } };
    } else {
      updateData.segment = { disconnect: true };
    }
  }

  if (dto.offerId !== undefined) {
    if (dto.offerId) {
      const off = await prisma.offer.findFirst({
        where: { id: dto.offerId, businessId: ctx.businessId },
      });
      if (!off) throw new CampaignValidationError(`Offer [${dto.offerId}] not found in business`);
      updateData.offer = { connect: { id: off.id } };
    } else {
      updateData.offer = { disconnect: true };
    }
  }

  if (dto.branchId !== undefined) {
    if (dto.branchId) {
      const br = await prisma.branch.findFirst({
        where: { id: dto.branchId, businessId: ctx.businessId },
      });
      if (!br) throw new CampaignValidationError(`Branch [${dto.branchId}] not found in business`);
      updateData.branch = { connect: { id: br.id } };
    } else {
      updateData.branch = { disconnect: true };
    }
  }

  if (dto.scheduledAt !== undefined) {
    updateData.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
  }
  if (dto.timezone !== undefined) {
    updateData.timezone = dto.timezone ? dto.timezone.trim() : null;
  }
  if (dto.startDate !== undefined) {
    updateData.startDate = dto.startDate ? new Date(dto.startDate) : null;
  }
  if (dto.endDate !== undefined) {
    updateData.endDate = dto.endDate ? new Date(dto.endDate) : null;
  }

  const updatedCampaign = await prisma.campaign.update({
    where: { id: campaign.id },
    data: updateData,
    include: {
      branch: { select: { id: true, name: true, code: true } },
      segment: { select: { id: true, name: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'CAMPAIGN_UPDATED',
    entityType: 'CAMPAIGN',
    entityId: campaign.id,
    businessId: ctx.businessId,
    previousState: { name: campaign.name, channel: campaign.channel, status: campaign.status },
    newState: { name: updatedCampaign.name, channel: updatedCampaign.channel, status: updatedCampaign.status },
  });

  return updatedCampaign;
}

/**
 * Changes campaign status following controlled lifecycle rules.
 */
export async function setCampaignStatus(ctx: TenantContext, campaignId: string, nextStatus: CampaignStatus) {
  requirePermission(ctx, 'CAMPAIGNS_MANAGE');
  await requireFeature(ctx, 'CAMPAIGNS');

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      businessId: ctx.businessId,
    },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  validateStatusTransition(campaign.status, nextStatus);

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: nextStatus },
  });

  await createAuditLog(ctx, {
    action: 'CAMPAIGN_STATUS_CHANGED',
    entityType: 'CAMPAIGN',
    entityId: campaign.id,
    businessId: ctx.businessId,
    previousState: { status: campaign.status },
    newState: { status: updated.status },
  });

  return updated;
}

/**
 * Deletes a campaign. Only DRAFT or CANCELLED campaigns with 0 deliveries can be deleted.
 */
export async function deleteCampaign(ctx: TenantContext, campaignId: string) {
  requirePermission(ctx, 'CAMPAIGNS_MANAGE');
  await requireFeature(ctx, 'CAMPAIGNS');

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      businessId: ctx.businessId,
    },
    include: {
      _count: { select: { deliveries: true } },
    },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  if (campaign._count.deliveries > 0) {
    throw new CampaignValidationError(
      `Cannot delete campaign with existing delivery records (${campaign._count.deliveries}). Set status to CANCELLED instead.`
    );
  }

  await prisma.campaign.delete({
    where: { id: campaign.id },
  });

  await createAuditLog(ctx, {
    action: 'CAMPAIGN_DELETED',
    entityType: 'CAMPAIGN',
    entityId: campaignId,
    businessId: ctx.businessId,
    previousState: { name: campaign.name, status: campaign.status },
  });

  return { success: true, deletedId: campaignId };
}
