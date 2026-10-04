/**
 * Reployty V2 — Phase 22 Campaign Scheduling & Delivery Queue Engine
 * Campaign Scheduler Service
 * 
 * Handles timezone-aware scheduling, server-side schedule validation,
 * immediate (SEND_NOW) and scheduled execution triggers, multi-scheduler race protection,
 * audience resolution, and campaign cancellation.
 */

import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { requireFeature } from './entitlementService';
import { createAuditLog } from './auditService';
import { resolveCampaignAudience } from './campaignAudienceService';
import { createExecutionQueue, processDeliveryQueue } from './campaignQueueService';
import {
  CampaignNotFoundError,
  CampaignValidationError,
} from './campaignService';
import { CampaignStatus, DeliveryStatus } from '@prisma/client';
import { logger } from '../utils/logger';

export interface ScheduleCampaignDTO {
  scheduledAt: Date | string;
  timezone?: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

export interface SendNowOptions {
  cooldownHours?: number;
  limit?: number;
}

/**
 * Validates an IANA timezone identifier.
 */
export function isValidTimezone(tz?: string | null): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats a Date object in a specified IANA timezone with human-readable parts.
 */
export function formatInTimezone(date: Date, tz: string = 'UTC'): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * Resolves the appropriate timezone for a business or branch, defaulting to UTC.
 */
export async function resolveBusinessOrBranchTimezone(
  businessId: string,
  branchId?: string | null
): Promise<string> {
  if (branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { timezone: true },
    });
    if (branch?.timezone && isValidTimezone(branch.timezone)) {
      return branch.timezone;
    }
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });

  if (business?.timezone && isValidTimezone(business.timezone)) {
    return business.timezone;
  }

  return 'UTC';
}

/**
 * Converts a scheduled date string into a verified UTC Date given an IANA timezone.
 * Handles inputs like "2026-09-30T10:00:00" in "Asia/Kolkata".
 */
export function resolveScheduleUTC(scheduledAtInput: string | Date, timezone: string): Date {
  if (!isValidTimezone(timezone)) {
    throw new CampaignValidationError(`Invalid IANA timezone: [${timezone}]`);
  }

  if (scheduledAtInput instanceof Date) {
    if (isNaN(scheduledAtInput.getTime())) {
      throw new CampaignValidationError('Invalid scheduled date');
    }
    return scheduledAtInput;
  }

  const str = String(scheduledAtInput).trim();
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) {
    throw new CampaignValidationError(`Invalid date format for scheduledAt: [${str}]`);
  }

  // If input string has an explicit 'Z' or offset like +05:30, it is already absolute
  if (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str)) {
    return parsed;
  }

  // If it's a local representation like "YYYY-MM-DDTHH:mm[:ss]", calculate the offset in that timezone
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s+)(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return parsed;
  }

  const [, year, month, day, hour, min, sec] = match.map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, min, sec || 0));

  // Determine local parts in target timezone for utcGuess
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = dtf.formatToParts(utcGuess);
  const partMap: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') partMap[p.type] = Number(p.value);
  }

  const renderedInTz = new Date(
    Date.UTC(
      partMap.year,
      partMap.month - 1,
      partMap.day,
      partMap.hour === 24 ? 0 : partMap.hour,
      partMap.minute,
      partMap.second || 0
    )
  );

  const offsetMs = renderedInTz.getTime() - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

/**
 * Validates campaign scheduling inputs server-side.
 */
export async function validateCampaignSchedule(
  ctx: TenantContext,
  campaignId: string,
  dto: ScheduleCampaignDTO
) {
  const businessId = ctx.businessId;

  // 1. Fetch Campaign
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId },
    include: { branch: true },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  // Branch check
  if (ctx.branchId && campaign.branchId && campaign.branchId !== ctx.branchId) {
    throw new CampaignNotFoundError(campaignId);
  }

  // 2. Status verification
  if (campaign.status === CampaignStatus.COMPLETED) {
    throw new CampaignValidationError('Cannot schedule an already COMPLETED campaign');
  }

  if (campaign.status === CampaignStatus.CANCELLED) {
    throw new CampaignValidationError('Cannot schedule a CANCELLED campaign');
  }

  // 3. Timezone resolution
  const resolvedTimezone = dto.timezone
    ? dto.timezone.trim()
    : campaign.timezone || (await resolveBusinessOrBranchTimezone(businessId, campaign.branchId));

  if (!isValidTimezone(resolvedTimezone)) {
    throw new CampaignValidationError(`Invalid or unsupported timezone: [${resolvedTimezone}]`);
  }

  // 4. Resolve Scheduled Date
  const scheduledUTC = resolveScheduleUTC(dto.scheduledAt, resolvedTimezone);
  const now = new Date();

  // Allow 1 minute (60,000 ms) clock skew grace period
  if (scheduledUTC.getTime() < now.getTime() - 60_000) {
    throw new CampaignValidationError(
      `Cannot schedule campaign in the past. Scheduled: ${scheduledUTC.toISOString()}, Current UTC: ${now.toISOString()}`
    );
  }

  // 5. Start and End Date validation
  let startUTC: Date | null = null;
  let endUTC: Date | null = null;

  if (dto.startDate) {
    startUTC = resolveScheduleUTC(dto.startDate, resolvedTimezone);
  }
  if (dto.endDate) {
    endUTC = resolveScheduleUTC(dto.endDate, resolvedTimezone);
  }

  if (startUTC && endUTC && endUTC.getTime() <= startUTC.getTime()) {
    throw new CampaignValidationError('Campaign endDate must be after startDate');
  }

  if (endUTC && endUTC.getTime() <= scheduledUTC.getTime()) {
    throw new CampaignValidationError('Campaign endDate must be after scheduledAt');
  }

  return {
    campaign,
    scheduledUTC,
    resolvedTimezone,
    startUTC,
    endUTC,
  };
}

/**
 * Schedules a campaign for future execution.
 */
export async function scheduleCampaign(
  ctx: TenantContext,
  campaignId: string,
  dto: ScheduleCampaignDTO
) {
  requirePermission(ctx, 'CAMPAIGNS_MANAGE');
  await requireFeature(ctx, 'CAMPAIGNS');

  const { campaign, scheduledUTC, resolvedTimezone, startUTC, endUTC } =
    await validateCampaignSchedule(ctx, campaignId, dto);

  const updatedCampaign = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      scheduledAt: scheduledUTC,
      timezone: resolvedTimezone,
      startDate: startUTC || campaign.startDate,
      endDate: endUTC || campaign.endDate,
      status: CampaignStatus.SCHEDULED,
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      segment: { select: { id: true, name: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'CAMPAIGN_SCHEDULED',
    entityType: 'CAMPAIGN',
    entityId: campaign.id,
    businessId: ctx.businessId,
    previousState: { status: campaign.status, scheduledAt: campaign.scheduledAt },
    newState: {
      status: updatedCampaign.status,
      scheduledAt: updatedCampaign.scheduledAt,
      timezone: updatedCampaign.timezone,
    },
  });

  return {
    campaign: updatedCampaign,
    scheduledAtUTC: scheduledUTC.toISOString(),
    timezone: resolvedTimezone,
    formattedLocalTime: formatInTimezone(scheduledUTC, resolvedTimezone),
  };
}

/**
 * Immediately executes a campaign (SEND_NOW): resolves audience,
 * creates execution & queue records, and triggers delivery processing.
 */
export async function triggerSendNow(
  ctx: TenantContext,
  campaignId: string,
  options: SendNowOptions = {}
) {
  requirePermission(ctx, 'CAMPAIGNS_MANAGE');
  await requireFeature(ctx, 'CAMPAIGNS');

  const businessId = ctx.businessId;

  // 1. Fetch Campaign
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId },
    include: { branch: true },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  if (campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.CANCELLED) {
    throw new CampaignValidationError(`Cannot trigger execution for campaign with status [${campaign.status}]`);
  }

  // Branch check
  if (ctx.branchId && campaign.branchId && campaign.branchId !== ctx.branchId) {
    throw new CampaignNotFoundError(campaignId);
  }

  const now = new Date();

  // 2. Mark Campaign as QUEUED / PROCESSING
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: CampaignStatus.QUEUED,
      lastRunAt: now,
    },
  });

  // 3. Resolve Audience (uses Phase 21 Dynamic Segmentation Compiler)
  const filter = (campaign.audienceFilter as Record<string, any>) || null;
  const audience = await resolveCampaignAudience(ctx, {
    audienceType: campaign.audienceType,
    segmentId: campaign.segmentId,
    specificCustomerIds: filter?.customerIds || null,
    branchId: campaign.branchId,
    channel: campaign.channel,
    audienceFilter: filter,
  });

  // 4. Create CampaignExecution record
  const execution = await prisma.campaignExecution.create({
    data: {
      campaignId: campaign.id,
      businessId,
      branchId: campaign.branchId,
      triggerType: 'SEND_NOW',
      status: 'QUEUED',
      totalAudience: audience.totalAudienceCount,
      eligibleCount: audience.consentedCustomerCount,
      startedAt: now,
    },
  });

  // 5. Create Queue Deliveries
  const queueResult = await createExecutionQueue({
    campaign,
    execution,
    audience,
    cooldownHours: options.cooldownHours ?? 24,
  });

  // 6. Process Queue Immediately
  const processResult = await processDeliveryQueue({
    campaignId: campaign.id,
    businessId,
    limit: options.limit || 100,
  });

  await createAuditLog(ctx, {
    action: 'CAMPAIGN_SEND_NOW',
    entityType: 'CAMPAIGN',
    entityId: campaign.id,
    businessId,
    newState: {
      executionId: execution.id,
      queuedCount: queueResult.queuedCount,
      deliveredCount: processResult.deliveredCount,
      failedCount: processResult.failedCount,
    },
  });

  return {
    campaignId: campaign.id,
    executionId: execution.id,
    totalAudience: audience.totalAudienceCount,
    eligibleCount: audience.consentedCustomerCount,
    queuedCount: queueResult.queuedCount,
    deliveredCount: processResult.deliveredCount,
    retryingCount: processResult.retryingCount,
    failedCount: processResult.failedCount,
    suppressedCooldownCount: queueResult.suppressedCooldownCount,
    suppressedConsentCount: audience.suppressedConsentCount,
  };
}

/**
 * Cancels a scheduled or queued campaign and marks pending deliveries as CANCELLED.
 */
export async function cancelCampaign(ctx: TenantContext, campaignId: string) {
  requirePermission(ctx, 'CAMPAIGNS_MANAGE');
  await requireFeature(ctx, 'CAMPAIGNS');

  const businessId = ctx.businessId;

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  if (campaign.status === CampaignStatus.COMPLETED) {
    throw new CampaignValidationError('Cannot cancel an already COMPLETED campaign');
  }

  if (campaign.status === CampaignStatus.CANCELLED) {
    return { success: true, message: 'Campaign is already CANCELLED', campaignId };
  }

  const now = new Date();

  // Update campaign status to CANCELLED
  const updatedCampaign = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.CANCELLED },
  });

  // Cancel any queued / retry / pending deliveries
  const cancelledDeliveries = await prisma.campaignDelivery.updateMany({
    where: {
      campaignId: campaign.id,
      status: { in: [DeliveryStatus.QUEUED, DeliveryStatus.RETRY_WAIT, DeliveryStatus.PENDING] },
    },
    data: {
      status: DeliveryStatus.CANCELLED,
      cancelledAt: now,
      lockedAt: null,
      lockedBy: null,
    },
  });

  // Update active executions
  await prisma.campaignExecution.updateMany({
    where: {
      campaignId: campaign.id,
      status: { in: ['QUEUED', 'PROCESSING'] },
    },
    data: {
      status: 'CANCELLED',
      completedAt: now,
    },
  });

  await createAuditLog(ctx, {
    action: 'CAMPAIGN_CANCELLED',
    entityType: 'CAMPAIGN',
    entityId: campaign.id,
    businessId,
    previousState: { status: campaign.status },
    newState: { status: CampaignStatus.CANCELLED, cancelledDeliveriesCount: cancelledDeliveries.count },
  });

  return {
    success: true,
    campaign: updatedCampaign,
    cancelledDeliveriesCount: cancelledDeliveries.count,
  };
}

/**
 * Finds due campaigns (scheduledAt <= NOW) and safely transitions them to execution.
 * Concurrency protected: Uses atomic conditional updates to prevent duplicate execution
 * when multiple schedulers tick simultaneously.
 */
export async function processDueScheduledCampaigns(options: { limit?: number } = {}) {
  const limit = options.limit || 10;
  const now = new Date();

  // Find campaigns due for execution
  const dueCampaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.SCHEDULED,
      scheduledAt: { lte: now },
    },
    take: limit,
    orderBy: { scheduledAt: 'asc' },
  });

  if (dueCampaigns.length === 0) {
    return { claimedCount: 0, executedCount: 0 };
  }

  let claimedCount = 0;
  let executedCount = 0;

  for (const campaign of dueCampaigns) {
    // Atomic race-safe claim: only 1 scheduler wins this update
    const claimResult = await prisma.campaign.updateMany({
      where: {
        id: campaign.id,
        status: CampaignStatus.SCHEDULED, // Must still be SCHEDULED
      },
      data: {
        status: CampaignStatus.PROCESSING,
        lastRunAt: now,
      },
    });

    if (claimResult.count === 0) {
      // Another concurrent scheduler already claimed this campaign! Skip safely.
      continue;
    }

    claimedCount++;

    try {
      // Construct a server system tenant context for audience resolution
      const serverCtx: TenantContext = {
        user: { id: 'system_scheduler', email: 'system@reployty.internal', name: 'System Scheduler', isSuperAdmin: true },
        businessId: campaign.businessId,
        businessName: 'Business',
        branchId: campaign.branchId,
        roleName: 'OWNER',
        permissions: new Set(['CAMPAIGNS_VIEW', 'CAMPAIGNS_MANAGE', 'SEGMENTS_VIEW', 'CUSTOMERS_VIEW']),
        hasPermission: () => true,
        isOwner: true,
        isSuperAdmin: true,
      };

      // Resolve audience
      const filter = (campaign.audienceFilter as Record<string, any>) || null;
      const audience = await resolveCampaignAudience(serverCtx, {
        audienceType: campaign.audienceType,
        segmentId: campaign.segmentId,
        specificCustomerIds: filter?.customerIds || null,
        branchId: campaign.branchId,
        channel: campaign.channel,
        audienceFilter: filter,
      });

      // Create execution
      const execution = await prisma.campaignExecution.create({
        data: {
          campaignId: campaign.id,
          businessId: campaign.businessId,
          branchId: campaign.branchId,
          triggerType: 'SCHEDULED',
          status: 'QUEUED',
          totalAudience: audience.totalAudienceCount,
          eligibleCount: audience.consentedCustomerCount,
          startedAt: now,
        },
      });

      // Create queue items
      await createExecutionQueue({
        campaign,
        execution,
        audience,
      });

      // Process batch
      await processDeliveryQueue({
        campaignId: campaign.id,
        businessId: campaign.businessId,
        limit: 100,
      });

      executedCount++;
    } catch (err: any) {
      logger.error(`Error executing scheduled campaign ${campaign.id}: ${err.message}`);
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.FAILED },
      });
    }
  }

  return { claimedCount, executedCount };
}

/**
 * Retrieves the schedule details and local time formatting for a campaign.
 */
export async function getCampaignSchedule(ctx: TenantContext, campaignId: string) {
  requirePermission(ctx, 'CAMPAIGNS_VIEW');
  await requireFeature(ctx, 'CAMPAIGNS');

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId: ctx.businessId },
    include: { branch: true },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  const timezone = campaign.timezone || (await resolveBusinessOrBranchTimezone(ctx.businessId, campaign.branchId));
  const isDue = campaign.scheduledAt ? campaign.scheduledAt.getTime() <= Date.now() : false;

  return {
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status,
    scheduledAt: campaign.scheduledAt,
    timezone,
    formattedLocalTime: campaign.scheduledAt ? formatInTimezone(campaign.scheduledAt, timezone) : null,
    isDue,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
  };
}

/**
 * Retrieves deliveries for a campaign with an operational summary count breakdown.
 */
export async function getCampaignDeliveries(
  ctx: TenantContext,
  campaignId: string,
  params: { status?: DeliveryStatus; limit?: number; offset?: number } = {}
) {
  requirePermission(ctx, 'CAMPAIGNS_VIEW');
  await requireFeature(ctx, 'CAMPAIGNS');

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId: ctx.businessId },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  const limit = Math.min(Math.max(params.limit || 50, 1), 200);
  const offset = Math.max(params.offset || 0, 0);

  // Operational status breakdown
  const statusCounts = await prisma.campaignDelivery.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });

  const breakdown: Record<string, number> = {
    QUEUED: 0,
    PROCESSING: 0,
    SENT: 0,
    DELIVERED: 0,
    RETRY_WAIT: 0,
    FAILED: 0,
    CANCELLED: 0,
    EXPIRED: 0,
    PENDING: 0,
  };

  let totalCount = 0;
  for (const row of statusCounts) {
    breakdown[row.status] = row._count._all;
    totalCount += row._count._all;
  }

  const whereClause: any = { campaignId };
  if (params.status) {
    whereClause.status = params.status;
  }

  const [filteredCount, deliveries] = await Promise.all([
    prisma.campaignDelivery.count({ where: whereClause }),
    prisma.campaignDelivery.findMany({
      where: whereClause,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    campaignId,
    summary: {
      total: totalCount,
      queued: breakdown.QUEUED,
      processing: breakdown.PROCESSING,
      sent: breakdown.SENT,
      delivered: breakdown.DELIVERED,
      retrying: breakdown.RETRY_WAIT,
      failed: breakdown.FAILED,
      cancelled: breakdown.CANCELLED,
    },
    total: filteredCount,
    limit,
    offset,
    deliveries,
  };
}

/**
 * Retrieves campaign execution history and latest metrics.
 */
export async function getCampaignExecutions(ctx: TenantContext, campaignId: string) {
  requirePermission(ctx, 'CAMPAIGNS_VIEW');
  await requireFeature(ctx, 'CAMPAIGNS');

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId: ctx.businessId },
  });

  if (!campaign) {
    throw new CampaignNotFoundError(campaignId);
  }

  const executions = await prisma.campaignExecution.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
  });

  return {
    campaignId,
    executions,
  };
}

