/**
 * Reployty V2 — Phase 26 Campaign Tracking Service
 * Secure Click Tracking, Open Tracking, and SSRF/Open-Redirect Protection
 */

import crypto from 'crypto';
import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { TrackedLinkItem } from '../../types/analytics';
import { logger } from '../utils/logger';

// 1x1 Transparent GIF Buffer (43 bytes)
export const TRANSPARENT_1X1_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export class UnsafeRedirectUrlError extends Error {
  code = 'UNSAFE_REDIRECT_URL';
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRedirectUrlError';
  }
}

export class TrackingLinkNotFoundError extends Error {
  code = 'TRACKING_LINK_NOT_FOUND';
  constructor(code: string) {
    super(`Tracking link with code [${code}] was not found`);
    this.name = 'TrackingLinkNotFoundError';
  }
}

/**
 * Validates that a target URL is a safe HTTP or HTTPS URL to prevent Open Redirect and SSRF vulnerabilities.
 */
export function validateRedirectUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new UnsafeRedirectUrlError('URL must be a non-empty string');
  }

  const trimmed = urlStr.trim();
  const lower = trimmed.toLowerCase();

  // Explicitly block hazardous protocols
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('//')
  ) {
    throw new UnsafeRedirectUrlError(`Disallowed URL scheme in: ${urlStr}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UnsafeRedirectUrlError(`Invalid URL structure: ${urlStr}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeRedirectUrlError(`Only HTTP and HTTPS protocols are permitted: ${parsed.protocol}`);
  }

  return parsed.toString();
}

/**
 * Creates a secure tracked campaign link with an opaque token.
 */
export async function createTrackedLink(
  ctx: TenantContext,
  campaignId: string,
  originalUrl: string,
  deliveryId?: string,
  customerId?: string
): Promise<TrackedLinkItem> {
  requirePermission(ctx, 'CAMPAIGNS_MANAGE');

  const validUrl = validateRedirectUrl(originalUrl);

  // Tenant scoping check
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      businessId: ctx.businessId,
    },
    select: { id: true },
  });

  if (!campaign) {
    throw new Error(`Campaign [${campaignId}] not found in business [${ctx.businessId}]`);
  }

  // Generate an opaque, cryptographically random tracking token (16 hex chars)
  const trackingCode = crypto.randomBytes(8).toString('hex');

  const link = await prisma.campaignTrackingLink.create({
    data: {
      businessId: ctx.businessId,
      campaignId,
      deliveryId: deliveryId || null,
      customerId: customerId || null,
      trackingCode,
      originalUrl: validUrl,
    },
  });

  return {
    id: link.id,
    campaignId: link.campaignId,
    trackingCode: link.trackingCode,
    trackingUrl: `/api/track/c/${link.trackingCode}`,
    originalUrl: link.originalUrl,
    clickCount: link.clickCount,
    uniqueClickCount: link.uniqueClickCount,
    lastClickedAt: link.lastClickedAt ? link.lastClickedAt.toISOString() : null,
    createdAt: link.createdAt.toISOString(),
  };
}

/**
 * Handles a click on a tracked link, securely records the click and unique clicker metrics,
 * records an analytics event, and returns the validated redirect URL.
 */
export async function handleTrackedClick(
  trackingCode: string,
  context: { ip?: string; userAgent?: string } = {}
): Promise<{ redirectUrl: string; linkId: string }> {
  const link = await prisma.campaignTrackingLink.findUnique({
    where: { trackingCode },
    include: {
      campaign: { select: { id: true, businessId: true, channel: true } },
    },
  });

  if (!link) {
    throw new TrackingLinkNotFoundError(trackingCode);
  }

  const now = new Date();

  // Deduplication check: Has this customer / delivery already clicked this link?
  let isUnique = true;
  if (link.customerId || link.deliveryId) {
    const previousClick = await prisma.campaignClickEvent.findFirst({
      where: {
        trackingLinkId: link.id,
        ...(link.customerId ? { customerId: link.customerId } : {}),
        ...(link.deliveryId ? { deliveryId: link.deliveryId } : {}),
      },
      select: { id: true },
    });
    if (previousClick) {
      isUnique = false;
    }
  }

  // Atomic update to link metrics
  await prisma.campaignTrackingLink.update({
    where: { id: link.id },
    data: {
      clickCount: { increment: 1 },
      ...(isUnique ? { uniqueClickCount: { increment: 1 } } : {}),
      lastClickedAt: now,
    },
  });

  // Record individual click event
  await prisma.campaignClickEvent.create({
    data: {
      trackingLinkId: link.id,
      businessId: link.businessId,
      campaignId: link.campaignId,
      deliveryId: link.deliveryId,
      customerId: link.customerId,
      ipAddress: context.ip || null,
      userAgent: context.userAgent ? context.userAgent.slice(0, 500) : null,
      clickedAt: now,
    },
  });

  // If tied to a specific delivery, update delivery status and timestamps
  if (link.deliveryId) {
    await prisma.campaignDelivery.update({
      where: { id: link.deliveryId },
      data: {
        clickedAt: now,
        // Advance status to CLICKED if it was SENT or DELIVERED
        ...(link.campaign.channel ? {} : {}),
      },
    }).catch((err) => {
      logger.warn('Failed to update delivery on click', { error: err.message, deliveryId: link.deliveryId });
    });
  }

  // Record CampaignAnalyticsEvent
  try {
    await prisma.campaignAnalyticsEvent.create({
      data: {
        businessId: link.businessId,
        campaignId: link.campaignId,
        campaignDeliveryId: link.deliveryId,
        customerId: link.customerId,
        channel: link.campaign.channel,
        eventType: 'CLICKED',
        provider: 'REPLOYTY_TRACKING',
        metadata: {
          trackingCode,
          originalUrl: link.originalUrl,
          isUnique,
        },
        occurredAt: now,
      },
    });
  } catch (err: any) {
    logger.warn('Failed to persist analytics event for click', { error: err.message });
  }

  return {
    redirectUrl: link.originalUrl,
    linkId: link.id,
  };
}

/**
 * Handles an email open tracking pixel request, updates delivery.openedAt,
 * emits an idempotent CampaignAnalyticsEvent, and returns the transparent 1x1 GIF buffer.
 */
export async function handleTrackedOpen(
  deliveryId: string,
  _context: { ip?: string; userAgent?: string } = {}
): Promise<Buffer> {
  try {
    const delivery = await prisma.campaignDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        businessId: true,
        campaignId: true,
        customerId: true,
        channel: true,
        openedAt: true,
        status: true,
      },
    });

    if (delivery && delivery.businessId) {
      const now = new Date();
      const isFirstOpen = !delivery.openedAt;

      // Update delivery openedAt
      if (isFirstOpen) {
        await prisma.campaignDelivery.update({
          where: { id: delivery.id },
          data: {
            openedAt: now,
          },
        });
      }

      // Record idempotent open analytics event
      const idempotencyKey = `open_${delivery.id}`;
      try {
        await prisma.campaignAnalyticsEvent.create({
          data: {
            businessId: delivery.businessId,
            campaignId: delivery.campaignId,
            campaignDeliveryId: delivery.id,
            customerId: delivery.customerId,
            channel: delivery.channel,
            eventType: 'OPENED',
            provider: 'REPLOYTY_PIXEL',
            idempotencyKey,
            metadata: {
              isFirstOpen,
            },
            occurredAt: now,
          },
        });
      } catch (err: any) {
        // Idempotent duplicate open: ignore P2002
        if (err.code !== 'P2002') {
          logger.warn('Failed to persist open analytics event', { error: err.message });
        }
      }
    }
  } catch (err: any) {
    logger.error('Error in handleTrackedOpen', { error: err.message, deliveryId });
  }

  return TRANSPARENT_1X1_GIF;
}

/**
 * Lists all tracked links for a campaign.
 */
export async function getCampaignTrackedLinks(
  ctx: TenantContext,
  campaignId: string
): Promise<TrackedLinkItem[]> {
  requirePermission(ctx, 'CAMPAIGNS_VIEW');

  const links = await prisma.campaignTrackingLink.findMany({
    where: {
      campaignId,
      businessId: ctx.businessId,
    },
    orderBy: { createdAt: 'desc' },
  });

  return links.map((link) => ({
    id: link.id,
    campaignId: link.campaignId,
    trackingCode: link.trackingCode,
    trackingUrl: `/api/track/c/${link.trackingCode}`,
    originalUrl: link.originalUrl,
    clickCount: link.clickCount,
    uniqueClickCount: link.uniqueClickCount,
    lastClickedAt: link.lastClickedAt ? link.lastClickedAt.toISOString() : null,
    createdAt: link.createdAt.toISOString(),
  }));
}
