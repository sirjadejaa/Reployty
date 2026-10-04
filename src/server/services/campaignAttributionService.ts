/**
 * Reployty V2 — Phase 26 Campaign Conversion Attribution Service
 * Centralized Conversion Attribution Engine, Multi-Tenant Attribution Rules,
 * Deterministic Windows, and Atomic Idempotent Attribution Records.
 */

import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { CustomerEventType, DeliveryStatus } from '@prisma/client';
import { logger } from '../utils/logger';

export interface CustomerEventPayload {
  id: string;
  customerId: string;
  type: CustomerEventType;
  createdAt: Date;
  branchId?: string | null;
  metadata?: Record<string, any>;
}

export interface AttributedConversionResult {
  conversionId: string;
  campaignId: string;
  campaignDeliveryId: string;
  customerId: string;
  conversionType: string;
  attributionWindowDays: number;
}

/**
 * Mapping of system CustomerEventType to human-readable CampaignConversion types.
 */
export const EVENT_CONVERSION_TYPE_MAP: Partial<Record<CustomerEventType, string>> = {
  [CustomerEventType.VISIT_RECORDED]: 'RETURN_VISIT',
  [CustomerEventType.STAMP_ADDED]: 'LOYALTY_STAMP',
  [CustomerEventType.POINTS_ADDED]: 'LOYALTY_POINTS',
  [CustomerEventType.REWARD_REDEEMED]: 'REWARD_REDEMPTION',
  [CustomerEventType.OFFER_REDEEMED]: 'OFFER_REDEMPTION',
  [CustomerEventType.CUSTOMER_REACTIVATED]: 'CUSTOMER_REACTIVATED',
  [CustomerEventType.PURCHASE_RECORDED]: 'PURCHASE_RECORDED',
};

/**
 * Evaluates whether an incoming CustomerEvent qualifies as a conversion
 * attributed to a recent campaign delivery for the customer.
 */
export async function processConversionAttribution(
  ctx: TenantContext,
  event: CustomerEventPayload
): Promise<AttributedConversionResult | null> {
  const conversionType = EVENT_CONVERSION_TYPE_MAP[event.type];
  if (!conversionType) {
    // Event type is not an attributed conversion type
    return null;
  }

  const businessId = ctx.businessId;
  const customerId = event.customerId;
  const eventTime = new Date(event.createdAt);

  // 1. Find recent eligible campaign deliveries for this customer in this business.
  // Must be in a successful sent/delivered/opened/clicked/redeemed state.
  const candidateDeliveries = await prisma.campaignDelivery.findMany({
    where: {
      businessId,
      customerId,
      status: {
        in: [
          DeliveryStatus.SENT,
          DeliveryStatus.DELIVERED,
          DeliveryStatus.OPENED,
          DeliveryStatus.CLICKED,
          DeliveryStatus.REDEEMED,
        ],
      },
      sentAt: {
        lte: eventTime,
      },
    },
    include: {
      campaign: {
        select: {
          id: true,
          businessId: true,
          channel: true,
          attributionWindowDays: true,
        },
      },
    },
    orderBy: {
      sentAt: 'desc', // Last-touch attribution: most recent eligible delivery first
    },
    take: 5,
  });

  if (candidateDeliveries.length === 0) {
    return null;
  }

  // 2. Evaluate candidate deliveries against their campaign's attribution window
  for (const delivery of candidateDeliveries) {
    // Verify tenant boundary
    if (delivery.businessId !== businessId || delivery.campaign.businessId !== businessId) {
      continue;
    }

    const windowDays = delivery.campaign.attributionWindowDays || 14;
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const sentTime = delivery.sentAt ? new Date(delivery.sentAt) : new Date(delivery.createdAt);

    const diffMs = eventTime.getTime() - sentTime.getTime();

    // Must be positive (after campaign sent) and within window
    if (diffMs >= 0 && diffMs <= windowMs) {
      // Deterministic idempotency key: 1 conversion per campaign delivery per customer event
      const idempotencyKey = `conv_${delivery.id}_${event.id}`;

      try {
        const conversion = await prisma.campaignConversion.create({
          data: {
            businessId,
            campaignId: delivery.campaignId,
            campaignDeliveryId: delivery.id,
            customerId,
            conversionType,
            sourceEventId: event.id,
            attributionWindowDays: windowDays,
            occurredAt: eventTime,
            idempotencyKey,
            metadata: {
              customerEventType: event.type,
              sentAt: sentTime.toISOString(),
              eventAt: eventTime.toISOString(),
              attributionDeltaHours: Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10,
              eventMetadata: event.metadata || {},
            },
          },
        });

        // Record corresponding CampaignAnalyticsEvent
        try {
          await prisma.campaignAnalyticsEvent.create({
            data: {
              businessId,
              campaignId: delivery.campaignId,
              campaignDeliveryId: delivery.id,
              customerId,
              channel: delivery.campaign.channel,
              eventType: 'CONVERTED',
              provider: 'ATTRIBUTION_ENGINE',
              idempotencyKey: `analytics_${idempotencyKey}`,
              metadata: {
                conversionId: conversion.id,
                conversionType,
                sourceEventId: event.id,
              },
              occurredAt: eventTime,
            },
          });
        } catch (analyticsErr: any) {
          if (analyticsErr.code !== 'P2002') {
            logger.warn('Failed to record CONVERTED analytics event', { error: analyticsErr.message });
          }
        }

        // If the conversion is a reward or offer redemption, update delivery status
        if (conversionType === 'REWARD_REDEMPTION' || conversionType === 'OFFER_REDEMPTION') {
          await prisma.campaignDelivery.update({
            where: { id: delivery.id },
            data: { status: DeliveryStatus.REDEEMED },
          }).catch(() => {});
        }

        logger.info(`Attributed [${conversionType}] to campaign [${delivery.campaignId}] for customer [${customerId}]`);

        return {
          conversionId: conversion.id,
          campaignId: delivery.campaignId,
          campaignDeliveryId: delivery.id,
          customerId,
          conversionType,
          attributionWindowDays: windowDays,
        };
      } catch (err: any) {
        if (err.code === 'P2002') {
          // Idempotent duplicate: already attributed
          logger.info(`Conversion already attributed with key [${idempotencyKey}]`);
          return null;
        }
        logger.error('Failed to create campaign conversion record', { error: err.message });
        throw err;
      }
    }
  }

  return null;
}
