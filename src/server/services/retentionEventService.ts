/**
 * Reployty V2 — Phase 20 Retention Architecture
 * Retention Event Service
 * 
 * Manages controlled retention events, event ingestion, validation,
 * and tenant-isolated querying across the retention timeline.
 */

import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { CustomerEventType } from '@prisma/client';

export interface RetentionEventRecordParams {
  customerId: string;
  eventType: CustomerEventType;
  metadata?: Record<string, any>;
  createdAt?: Date;
}

export interface RetentionEventQueryParams {
  customerId?: string;
  eventType?: CustomerEventType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class RetentionEventValidationError extends Error {
  code = 'RETENTION_EVENT_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'RetentionEventValidationError';
  }
}

/**
 * Validates that the event type is a recognized CustomerEventType.
 */
export function validateRetentionEventType(type: string): CustomerEventType {
  const validTypes = Object.values(CustomerEventType);
  if (!validTypes.includes(type as CustomerEventType)) {
    throw new RetentionEventValidationError(
      `Invalid retention event type: [${type}]. Allowed types: ${validTypes.join(', ')}`
    );
  }
  return type as CustomerEventType;
}

/**
 * Records a tenant-isolated retention event for a verified customer.
 */
export async function recordRetentionEvent(
  ctx: TenantContext,
  params: RetentionEventRecordParams
) {
  if (!params.customerId) {
    throw new RetentionEventValidationError('customerId is required to record a retention event');
  }

  const validEventType = validateRetentionEventType(params.eventType);

  // Tenant-safe verification: Customer must belong to this tenant!
  const customer = await prisma.customer.findFirst({
    where: {
      id: params.customerId,
      businessId: ctx.businessId,
    },
    select: { id: true, branchId: true },
  });

  if (!customer) {
    throw new RetentionEventValidationError(
      `Customer [${params.customerId}] not found in business [${ctx.businessId}]`
    );
  }

  const branchId = customer.branchId || ctx.branchId || null;

  const event = await prisma.customerEvent.create({
    data: {
      businessId: ctx.businessId,
      customerId: params.customerId,
      branchId,
      type: validEventType,
      metadata: params.metadata || {},
      createdAt: params.createdAt || new Date(),
    },
  });

  // Trigger automation processing safely
  try {
    const { processAutomationEvent } = await import('./automationExecutionService');
    await processAutomationEvent(ctx, {
      eventId: event.id,
      eventType: validEventType,
      businessId: ctx.businessId,
      branchId,
      customerId: params.customerId,
      occurredAt: event.createdAt,
      metadata: params.metadata || {},
    });
  } catch (autoErr) {
    // Non-blocking log to ensure retention event persistence is not broken
    console.error('Automation processor error from retention event:', autoErr);
  }

  // Trigger conversion attribution processing safely (Phase 26)
  try {
    const { processConversionAttribution } = await import('./campaignAttributionService');
    await processConversionAttribution(ctx, {
      id: event.id,
      customerId: params.customerId,
      type: validEventType,
      createdAt: event.createdAt,
      branchId,
      metadata: params.metadata || {},
    });
  } catch (attrErr) {
    // Non-blocking log to ensure event persistence is never broken
    console.error('Conversion attribution error from retention event:', attrErr);
  }

  return event;
}

/**
 * Queries retention events for a tenant with optional filtering by customer, type, and date range.
 */
export async function getRetentionEvents(
  ctx: TenantContext,
  params: RetentionEventQueryParams = {}
) {
  const limit = Math.min(Math.max(params.limit || 50, 1), 200);
  const offset = Math.max(params.offset || 0, 0);

  const whereClause: any = {
    businessId: ctx.businessId,
  };

  if (params.customerId) {
    whereClause.customerId = params.customerId;
  }

  if (params.eventType) {
    whereClause.type = validateRetentionEventType(params.eventType);
  }

  if (params.startDate || params.endDate) {
    whereClause.createdAt = {};
    if (params.startDate) {
      whereClause.createdAt.gte = params.startDate;
    }
    if (params.endDate) {
      whereClause.createdAt.lte = params.endDate;
    }
  }

  const [total, events] = await Promise.all([
    prisma.customerEvent.count({ where: whereClause }),
    prisma.customerEvent.findMany({
      where: whereClause,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            status: true,
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
    events,
    limit,
    offset,
  };
}
