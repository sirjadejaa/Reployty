/**
 * Reployty V2 — Phase 25 External Messaging Provider Service
 * Provider Registry, Multi-Tenant Resolution, Delivery Dispatch & Webhooks
 */

import { prisma } from '../db/client';
import {
  CampaignChannel,
  ConsentChannel,
  CustomerEventType,
  DeliveryStatus,
} from '@prisma/client';
import {
  IMessagingProvider,
  MessagingProviderType,
  NormalizedDeliveryPayload,
  ProviderSendResult,
  ProviderConnectionTestResult,
  UpdateProviderConfigDTO,
  MaskedProviderConfigResponse,
  NormalizedWebhookEvent,
} from '../../types/provider';
import { Msg91Provider } from '../providers/sms/msg91Provider';
import { MetaWhatsAppProvider } from '../providers/whatsapp/metaWhatsAppProvider';
import { SendGridProvider } from '../providers/email/sendgridProvider';
import { MockMessagingProvider } from '../providers/mock/mockProvider';
import { maskSecret } from '../providers/common/phoneUtils';
import { mapCampaignChannelToConsent } from './campaignAudienceService';
import { calculateNextRetryDelay, classifyDeliveryError, DEFAULT_RETRY_POLICY } from './campaignQueueService';
import { recordRetentionEvent } from './retentionEventService';
import { createAuditLog } from './auditService';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { logger } from '../utils/logger';

// Singletons for default production provider adapters
const msg91Adapter = new Msg91Provider();
const metaWhatsAppAdapter = new MetaWhatsAppProvider();
const sendGridAdapter = new SendGridProvider();

const defaultProviders = new Map<CampaignChannel, IMessagingProvider>();
defaultProviders.set(CampaignChannel.SMS, msg91Adapter);
defaultProviders.set(CampaignChannel.WHATSAPP, metaWhatsAppAdapter);
defaultProviders.set(CampaignChannel.EMAIL, sendGridAdapter);

export function registerProvider(channel: CampaignChannel, provider: IMessagingProvider): void {
  defaultProviders.set(channel, provider);
}

// Mock provider instance for testing
let activeMockProvider: MockMessagingProvider | null = null;

export function setTestMockProvider(mock: MockMessagingProvider | null) {
  activeMockProvider = mock;
}

export function getTestMockProvider(): MockMessagingProvider | null {
  return activeMockProvider;
}

/**
 * Resolves the channel provider adapter.
 */
export function getProviderForChannel(channel: CampaignChannel, preferredProvider?: string): IMessagingProvider {
  if (activeMockProvider && (activeMockProvider.channel === channel || !preferredProvider)) {
    return activeMockProvider;
  }

  const prov = defaultProviders.get(channel);
  if (prov) {
    return prov;
  }
  throw new Error(`Unsupported messaging channel [${channel}]`);
}

/**
 * Resolves active provider configuration for a business and channel.
 * Priority:
 * 1. Business-specific BusinessMessagingConfig (if enabled)
 * 2. Platform environment variables fallback
 * 3. Mock provider if test environment
 * 4. Unconfigured
 */
export async function resolveActiveProviderConfig(
  businessId: string,
  channel: CampaignChannel
): Promise<{
  isConfigured: boolean;
  provider: MessagingProviderType;
  credentials: Record<string, any>;
  settings: Record<string, any>;
  isPlatformDefault: boolean;
}> {
  // 1. Check custom business configuration
  const customConfig = await prisma.businessMessagingConfig.findUnique({
    where: {
      businessId_channel: {
        businessId,
        channel,
      },
    },
  });

  if (customConfig && customConfig.isEnabled) {
    return {
      isConfigured: true,
      provider: customConfig.provider as MessagingProviderType,
      credentials: (customConfig.credentials as Record<string, any>) || {},
      settings: (customConfig.settings as Record<string, any>) || {},
      isPlatformDefault: false,
    };
  }

  // 2. Check platform environment fallback
  if (channel === CampaignChannel.SMS && process.env.MSG91_AUTH_KEY) {
    return {
      isConfigured: true,
      provider: 'MSG91',
      credentials: { authKey: process.env.MSG91_AUTH_KEY },
      settings: {
        senderId: process.env.MSG91_SENDER_ID || 'RPLTY',
        templateId: process.env.MSG91_TEMPLATE_ID,
      },
      isPlatformDefault: true,
    };
  }

  if (channel === CampaignChannel.WHATSAPP && process.env.META_WHATSAPP_TOKEN && process.env.META_PHONE_NUMBER_ID) {
    return {
      isConfigured: true,
      provider: 'META_WHATSAPP',
      credentials: {
        accessToken: process.env.META_WHATSAPP_TOKEN,
        phoneNumberId: process.env.META_PHONE_NUMBER_ID,
        wabaId: process.env.META_WABA_ID,
        appSecret: process.env.META_APP_SECRET,
      },
      settings: {
        defaultTemplateName: process.env.META_DEFAULT_TEMPLATE || 'hello_world',
        languageCode: process.env.META_TEMPLATE_LANG || 'en_US',
      },
      isPlatformDefault: true,
    };
  }

  if (channel === CampaignChannel.EMAIL && process.env.SENDGRID_API_KEY) {
    return {
      isConfigured: true,
      provider: 'SENDGRID',
      credentials: { apiKey: process.env.SENDGRID_API_KEY },
      settings: {
        fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@reployty.com',
        fromName: process.env.SENDGRID_FROM_NAME || 'Reployty',
      },
      isPlatformDefault: true,
    };
  }

  // 3. Check active mock in test
  if (activeMockProvider) {
    return {
      isConfigured: true,
      provider: 'MOCK',
      credentials: { mockKey: 'test_mock_secret' },
      settings: {},
      isPlatformDefault: false,
    };
  }

  // 4. Not configured
  return {
    isConfigured: false,
    provider: channel === CampaignChannel.SMS ? 'MSG91' : channel === CampaignChannel.WHATSAPP ? 'META_WHATSAPP' : 'SENDGRID',
    credentials: {},
    settings: {},
    isPlatformDefault: false,
  };
}

/**
 * Dispatches a delivery through the appropriate external provider connector.
 * Handles consent verification, error classification, retry calculation, and audit touchpoints.
 */
export async function dispatchDeliveryToProvider(delivery: any): Promise<ProviderSendResult> {
  const businessId = delivery.campaign?.businessId || delivery.businessId;
  const channel: CampaignChannel = delivery.channel;
  const now = new Date();

  // 0. Idempotency guard: If delivery is already SENT or DELIVERED in memory or in DB, return without re-dispatching
  if (delivery.status === DeliveryStatus.SENT || delivery.status === DeliveryStatus.DELIVERED) {
    return {
      success: true,
      status: delivery.status,
      provider: delivery.provider || 'EXISTING',
      providerMessageId: delivery.providerMessageId || undefined,
    };
  }

  const currentDbDelivery = await prisma.campaignDelivery.findUnique({
    where: { id: delivery.id },
    select: { status: true, provider: true, providerMessageId: true },
  });
  if (
    currentDbDelivery &&
    (currentDbDelivery.status === DeliveryStatus.SENT || currentDbDelivery.status === DeliveryStatus.DELIVERED)
  ) {
    return {
      success: true,
      status: currentDbDelivery.status,
      provider: currentDbDelivery.provider || 'EXISTING',
      providerMessageId: currentDbDelivery.providerMessageId || undefined,
    };
  }

  // 1. Re-verify channel consent prior to external network dispatch
  const consentChannel: ConsentChannel = mapCampaignChannelToConsent(channel);
  const consentRecord = await prisma.customerConsent.findFirst({
    where: {
      customerId: delivery.customerId,
      channel: consentChannel,
    },
  });

  const customer = await prisma.customer.findUnique({
    where: { id: delivery.customerId },
    select: { marketingConsent: true },
  });

  const isExplicitlyRevoked = consentRecord?.granted === false;
  const isConsentGranted = consentRecord?.granted === true && (customer?.marketingConsent ?? true);

  if (!isConsentGranted) {
    const reasonCode = isExplicitlyRevoked ? 'CONSENT_REVOKED' : 'CONSENT_NOT_GRANTED';
    logger.warn(`Delivery [${delivery.id}] blocked: Customer [${delivery.customerId}] lacks active consent for [${channel}] (${reasonCode})`);
    await prisma.campaignDelivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.FAILED,
        failedAt: now,
        failedReason: reasonCode,
        lastError: `Recipient does not have active ${channel} consent (${reasonCode})`,
        lockedAt: null,
        lockedBy: null,
      },
    });

    return {
      success: false,
      status: DeliveryStatus.FAILED,
      provider: 'SYSTEM',
      errorCategory: 'PERMANENT',
      errorCode: reasonCode,
      errorMessage: `Active consent required for messaging channel (${reasonCode})`,
    };
  }

  // 2. Resolve provider and credentials
  const providerConfig = await resolveActiveProviderConfig(businessId, channel);
  if (!providerConfig.isConfigured) {
    logger.warn(`Delivery [${delivery.id}] blocked: No active provider configured for business [${businessId}] on channel [${channel}]`);
    await prisma.campaignDelivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.FAILED,
        failedAt: now,
        failedReason: 'PROVIDER_NOT_CONFIGURED',
        lastError: `No provider credentials configured for ${channel}`,
        lockedAt: null,
        lockedBy: null,
      },
    });

    return {
      success: false,
      status: DeliveryStatus.FAILED,
      provider: providerConfig.provider,
      errorCategory: 'PERMANENT',
      errorCode: 'PROVIDER_NOT_CONFIGURED',
      errorMessage: `No active provider configured for channel ${channel}`,
    };
  }

  // 3. Build normalized payload
  const provider = getProviderForChannel(channel, providerConfig.provider);

  // Extract template variables from campaign message or customer
  const templateVars: Record<string, string> = {
    customer_name: delivery.customer?.name || 'Customer',
    customer_phone: delivery.customer?.phone || '',
    customer_email: delivery.customer?.email || '',
    business_name: delivery.campaign?.name || 'Business',
  };

  const payload: NormalizedDeliveryPayload = {
    deliveryId: delivery.id,
    businessId,
    branchId: delivery.branchId,
    customerId: delivery.customerId,
    channel,
    recipient: {
      phone: delivery.customer?.phone,
      email: delivery.customer?.email,
      name: delivery.customer?.name,
    },
    message: {
      text: delivery.campaign?.messageTemplate || 'Hello from Reployty!',
      subject: delivery.campaign?.name,
      templateName: (delivery.metadata as any)?.templateName || providerConfig.settings?.defaultTemplateName,
      templateId: (delivery.metadata as any)?.templateId || providerConfig.settings?.templateId,
      variables: templateVars,
    },
    metadata: typeof delivery.metadata === 'object' && delivery.metadata ? delivery.metadata : {},
  };

  // 4. Send message via provider adapter
  const result = await provider.sendMessage(payload, {
    credentials: providerConfig.credentials,
    settings: providerConfig.settings,
  });

  const currentAttempt = (delivery.attemptCount || 0) + 1;

  if (result.success) {
    // SUCCESS: Mark as SENT
    await prisma.campaignDelivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.SENT,
        provider: result.provider,
        providerMessageId: result.providerMessageId || null,
        sentAt: now,
        attemptCount: currentAttempt,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        failedReason: null,
        metadata: {
          ...(typeof delivery.metadata === 'object' && delivery.metadata ? delivery.metadata : {}),
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          rawResponse: result.rawResponse,
        },
      },
    });

    // Record retention touchpoint
    try {
      await recordRetentionEvent(
        { businessId } as any,
        {
          customerId: delivery.customerId,
          eventType: CustomerEventType.CAMPAIGN_TOUCHPOINT,
          metadata: {
            campaignId: delivery.campaignId,
            channel,
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            deliveryId: delivery.id,
          },
          createdAt: now,
        }
      );
    } catch (err: any) {
      logger.warn(`Failed to record retention event for customer [${delivery.customerId}]: ${err.message}`);
    }

    if (delivery.executionId && result.status === DeliveryStatus.DELIVERED) {
      await prisma.campaignExecution.update({
        where: { id: delivery.executionId },
        data: { deliveredCount: { increment: 1 } },
      });
    }

    // Record analytics event for dispatch (Phase 26)
    try {
      await prisma.campaignAnalyticsEvent.create({
        data: {
          businessId,
          campaignId: delivery.campaignId,
          campaignDeliveryId: delivery.id,
          customerId: delivery.customerId,
          channel,
          eventType: result.status === DeliveryStatus.DELIVERED ? 'DELIVERED' : 'SENT',
          provider: result.provider,
          providerEventId: result.providerMessageId || null,
          idempotencyKey: `dispatch_${delivery.id}_${result.status}`,
          occurredAt: now,
        },
      });
    } catch (anErr: any) {
      if (anErr.code !== 'P2002') {
        logger.warn('Failed to record dispatch analytics event', { error: anErr.message });
      }
    }

    return result;
  }

  // FAILURE HANDLING
  const errorCategory = result.errorCategory || classifyDeliveryError(result.errorMessage);
  const maxAttempts = delivery.maxAttempts || DEFAULT_RETRY_POLICY.maxAttempts;
  const isRetriable = errorCategory === 'TRANSIENT' && currentAttempt < maxAttempts;

  if (isRetriable) {
    const retryDelay = calculateNextRetryDelay(currentAttempt);
    const nextRetryAt = new Date(now.getTime() + retryDelay);

    await prisma.campaignDelivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.RETRY_WAIT,
        provider: result.provider,
        attemptCount: currentAttempt,
        nextRetryAt,
        lockedAt: null,
        lockedBy: null,
        lastError: result.errorMessage,
        failedReason: result.errorCode,
      },
    });
  } else {
    // PERMANENT FAILURE or EXHAUSTED RETRIES
    await prisma.campaignDelivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.FAILED,
        provider: result.provider,
        attemptCount: currentAttempt,
        failedAt: now,
        lockedAt: null,
        lockedBy: null,
        lastError: result.errorMessage,
        failedReason: result.errorCode || 'DELIVERY_FAILED',
      },
    });

    if (delivery.executionId) {
      await prisma.campaignExecution.update({
        where: { id: delivery.executionId },
        data: { failedCount: { increment: 1 } },
      });
    }
  }

  return result;
}

/**
 * Handles incoming provider webhooks with signature verification, deduplication,
 * and delivery status state machine progression.
 */
export async function processProviderWebhook(
  providerType: MessagingProviderType,
  channel: CampaignChannel,
  payload: any,
  headers: Record<string, string | string[] | undefined> = {}
): Promise<{ processedCount: number; duplicateCount: number; events: NormalizedWebhookEvent[] }> {
  const provider = getProviderForChannel(channel, providerType);

  // 1. Signature verification
  const isValidSig = provider.verifyWebhookSignature(payload, headers, process.env.WEBHOOK_SECRET);
  if (!isValidSig) {
    throw new Error('Invalid provider webhook signature');
  }

  // 2. Parse events
  const parsedEvents = provider.parseWebhookPayload(payload, headers);
  let processedCount = 0;
  let duplicateCount = 0;

  for (const event of parsedEvents) {
    if (!event.providerMessageId) continue;

    // Deterministic deduplication key
    const idempotencyKey = `webhook_${event.provider}_${event.providerMessageId}_${event.eventType}_${event.status}`;

    // Atomic DB record for incoming event
    let eventRecord: any = null;
    try {
      eventRecord = await prisma.providerDeliveryEvent.create({
        data: {
          provider: event.provider,
          channel: event.channel,
          providerMessageId: event.providerMessageId,
          eventType: event.eventType,
          rawPayload: event.rawPayload,
          idempotencyKey,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        duplicateCount++;
        continue; // Idempotent skip
      }
      logger.error('Failed to persist provider delivery event', { error: err.message });
      continue;
    }

    // Correlate with CampaignDelivery by providerMessageId
    const delivery = await prisma.campaignDelivery.findFirst({
      where: {
        providerMessageId: event.providerMessageId,
      },
      select: {
        id: true,
        businessId: true,
        executionId: true,
        campaignId: true,
        customerId: true,
        status: true,
      },
    });

    if (delivery) {
      // Link deliveryId & businessId to event record
      await prisma.providerDeliveryEvent.update({
        where: { id: eventRecord.id },
        data: {
          deliveryId: delivery.id,
          businessId: delivery.businessId,
        },
      });

      // Update delivery status if transitioning forward
      const updateData: any = {};
      const normalizedEventType = (event.eventType || '').toUpperCase();

      if (event.status === DeliveryStatus.DELIVERED && delivery.status !== DeliveryStatus.DELIVERED) {
        updateData.status = DeliveryStatus.DELIVERED;
        updateData.deliveredAt = event.timestamp || new Date();
        updateData.completedAt = new Date();

        if (delivery.executionId) {
          await prisma.campaignExecution.update({
            where: { id: delivery.executionId },
            data: { deliveredCount: { increment: 1 } },
          });
        }
      } else if (event.status === DeliveryStatus.FAILED && delivery.status !== DeliveryStatus.FAILED) {
        updateData.status = DeliveryStatus.FAILED;
        updateData.failedAt = event.timestamp || new Date();
        updateData.failedReason = event.failureReason || 'Webhook reported failure';
      }

      // Check specific engagement event types
      if (normalizedEventType === 'READ') {
        updateData.readAt = event.timestamp || new Date();
      } else if (normalizedEventType === 'OPEN' || normalizedEventType === 'OPENED') {
        updateData.openedAt = event.timestamp || new Date();
      } else if (normalizedEventType === 'CLICK' || normalizedEventType === 'CLICKED') {
        updateData.clickedAt = event.timestamp || new Date();
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.campaignDelivery.update({
          where: { id: delivery.id },
          data: updateData,
        });
      }

      // Phase 26: Record normalized CampaignAnalyticsEvent
      if (delivery.businessId && delivery.campaignId) {
        const analyticsIdempotencyKey = `analytics_${event.provider}_${event.providerMessageId}_${normalizedEventType}`;
        try {
          await prisma.campaignAnalyticsEvent.create({
            data: {
              businessId: delivery.businessId,
              campaignId: delivery.campaignId,
              campaignDeliveryId: delivery.id,
              customerId: delivery.customerId,
              channel: event.channel,
              eventType: normalizedEventType === 'OPEN' ? 'OPENED' : normalizedEventType === 'CLICK' ? 'CLICKED' : normalizedEventType,
              provider: event.provider,
              providerEventId: event.providerMessageId,
              idempotencyKey: analyticsIdempotencyKey,
              metadata: {
                rawPayload: event.rawPayload || {},
              },
              occurredAt: event.timestamp || new Date(),
            },
          });
        } catch (analyticsErr: any) {
          if (analyticsErr.code !== 'P2002') {
            logger.warn('Failed to record provider analytics event', { error: analyticsErr.message });
          }
        }
      }
    }

    processedCount++;
  }

  return {
    processedCount,
    duplicateCount,
    events: parsedEvents,
  };
}

/**
 * Returns masked provider configurations for all channels for the current tenant.
 */
export async function getBusinessProviderConfigs(ctx: TenantContext): Promise<MaskedProviderConfigResponse[]> {
  requirePermission(ctx, 'CAMPAIGNS_VIEW' as any);
  const businessId = ctx.businessId;

  const channels: CampaignChannel[] = [CampaignChannel.SMS, CampaignChannel.WHATSAPP, CampaignChannel.EMAIL];
  const results: MaskedProviderConfigResponse[] = [];

  for (const channel of channels) {
    const config = await resolveActiveProviderConfig(businessId, channel);
    const maskedCreds: Record<string, string> = {};

    for (const [key, val] of Object.entries(config.credentials)) {
      maskedCreds[key] = maskSecret(String(val));
    }

    results.push({
      channel,
      provider: config.provider,
      isConfigured: config.isConfigured,
      isEnabled: config.isConfigured,
      isPlatformDefault: config.isPlatformDefault,
      maskedCredentials: maskedCreds,
      settings: config.settings,
    });
  }

  return results;
}

/**
 * Updates or creates a provider configuration for a business.
 */
export async function updateBusinessProviderConfig(
  ctx: TenantContext,
  dto: UpdateProviderConfigDTO
): Promise<MaskedProviderConfigResponse> {
  requirePermission(ctx, 'SETTINGS_MANAGE' as any);
  const businessId = ctx.businessId;

  if (!dto.channel || !dto.provider) {
    throw new Error('channel and provider are required');
  }

  // Merge or create
  const updated = await prisma.businessMessagingConfig.upsert({
    where: {
      businessId_channel: {
        businessId,
        channel: dto.channel,
      },
    },
    create: {
      businessId,
      channel: dto.channel,
      provider: dto.provider,
      isEnabled: dto.isEnabled ?? true,
      credentials: dto.credentials || {},
      settings: dto.settings || {},
    },
    update: {
      provider: dto.provider,
      isEnabled: dto.isEnabled ?? true,
      credentials: dto.credentials || {},
      settings: dto.settings || {},
    },
  });

  await createAuditLog(ctx, {
    businessId,
    action: 'PROVIDER_CONFIGURED',
    entityType: 'BusinessMessagingConfig',
    entityId: updated.id,
    newState: {
      channel: updated.channel,
      provider: updated.provider,
      isEnabled: updated.isEnabled,
    },
  });

  const maskedCreds: Record<string, string> = {};
  for (const [key, val] of Object.entries((updated.credentials as any) || {})) {
    maskedCreds[key] = maskSecret(String(val));
  }

  return {
    id: updated.id,
    channel: updated.channel,
    provider: updated.provider as MessagingProviderType,
    isConfigured: true,
    isEnabled: updated.isEnabled,
    isPlatformDefault: false,
    maskedCredentials: maskedCreds,
    settings: (updated.settings as any) || {},
    updatedAt: updated.updatedAt.toISOString(),
  };
}

/**
 * Safely tests a provider connection using stored or provided credentials.
 */
export async function testBusinessProviderConnection(
  ctx: TenantContext,
  channel: CampaignChannel,
  overrideCredentials?: Record<string, any>
): Promise<ProviderConnectionTestResult> {
  requirePermission(ctx, 'SETTINGS_MANAGE' as any);
  const businessId = ctx.businessId;

  const config = await resolveActiveProviderConfig(businessId, channel);
  const credsToTest = overrideCredentials || config.credentials;

  const provider = getProviderForChannel(channel, config.provider);
  const testResult = await provider.testConnection({
    credentials: credsToTest,
    settings: config.settings,
  });

  await createAuditLog(ctx, {
    businessId,
    action: 'PROVIDER_CONNECTION_TESTED',
    entityType: 'BusinessMessagingConfig',
    entityId: channel,
    newState: {
      channel,
      provider: provider.providerName,
      success: testResult.success,
      message: testResult.message,
    },
  });

  return testResult;
}

/**
 * Toggles provider configuration enabled state.
 */
export async function toggleBusinessProviderConfig(
  ctx: TenantContext,
  channel: CampaignChannel,
  isEnabled: boolean
): Promise<{ success: boolean; isEnabled: boolean }> {
  requirePermission(ctx, 'SETTINGS_MANAGE' as any);
  const businessId = ctx.businessId;

  await prisma.businessMessagingConfig.updateMany({
    where: {
      businessId,
      channel,
    },
    data: { isEnabled },
  });

  await createAuditLog(ctx, {
    businessId,
    action: isEnabled ? 'PROVIDER_ENABLED' : 'PROVIDER_DISABLED',
    entityType: 'BusinessMessagingConfig',
    entityId: channel,
    newState: { channel, isEnabled },
  });

  return { success: true, isEnabled };
}
