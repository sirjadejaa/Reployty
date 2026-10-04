/**
 * Reployty V2 — Phase 25 External Provider Connectors
 * Provider Domain Types & Contracts
 */

import { CampaignChannel, DeliveryStatus } from '@prisma/client';

export type MessagingProviderType = 'MSG91' | 'META_WHATSAPP' | 'SENDGRID' | 'MOCK';

export type ProviderErrorCategory = 'TRANSIENT' | 'PERMANENT' | 'UNKNOWN';

/**
 * Normalized Delivery Payload passed to channel provider adapters.
 */
export interface NormalizedDeliveryPayload {
  deliveryId: string;
  businessId: string;
  branchId?: string | null;
  customerId: string;
  channel: CampaignChannel;
  recipient: {
    phone?: string | null;
    email?: string | null;
    name?: string | null;
  };
  message: {
    text?: string;
    subject?: string;
    templateName?: string;
    templateId?: string;
    languageCode?: string;
    variables?: Record<string, string>;
  };
  metadata?: Record<string, any>;
}

/**
 * Result returned by a provider adapter after attempting dispatch.
 */
export interface ProviderSendResult {
  success: boolean;
  status: DeliveryStatus;
  provider: MessagingProviderType | string;
  providerMessageId?: string;
  errorCategory?: ProviderErrorCategory;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: Record<string, any>;
}

/**
 * Safe connection test result for business admins.
 */
export interface ProviderConnectionTestResult {
  success: boolean;
  provider: MessagingProviderType | string;
  channel: CampaignChannel;
  message: string;
  testedAt: string;
  details?: Record<string, any>;
}

/**
 * Normalized Webhook Event parsed from provider callbacks.
 */
export interface NormalizedWebhookEvent {
  provider: MessagingProviderType | string;
  channel: CampaignChannel;
  providerMessageId: string;
  status: DeliveryStatus;
  eventType: string;
  timestamp: Date;
  rawPayload: Record<string, any>;
  failureReason?: string;
  businessId?: string;
}

/**
 * Business Provider Configuration DTO (Input for updates).
 * Raw secrets are received over HTTPS and encrypted/stored securely server-side.
 */
export interface UpdateProviderConfigDTO {
  channel: CampaignChannel;
  provider: MessagingProviderType;
  isEnabled?: boolean;
  credentials: Record<string, any>;
  settings?: Record<string, any>;
}

/**
 * Masked Provider Configuration Response for Admin UI.
 * Never leaks raw API keys or access tokens.
 */
export interface MaskedProviderConfigResponse {
  id?: string;
  channel: CampaignChannel;
  provider: MessagingProviderType;
  isConfigured: boolean;
  isEnabled: boolean;
  isPlatformDefault: boolean;
  maskedCredentials: Record<string, string>;
  settings: Record<string, any>;
  updatedAt?: string;
}

/**
 * Base interface that every channel provider adapter must implement.
 */
export interface IMessagingProvider {
  readonly providerName: MessagingProviderType | string;
  readonly channel: CampaignChannel;

  sendMessage(
    payload: NormalizedDeliveryPayload,
    config: { credentials: Record<string, any>; settings?: Record<string, any> }
  ): Promise<ProviderSendResult>;

  testConnection(
    config: { credentials: Record<string, any>; settings?: Record<string, any> }
  ): Promise<ProviderConnectionTestResult>;

  verifyWebhookSignature(
    payload: any,
    headers: Record<string, string | string[] | undefined>,
    webhookSecret?: string
  ): boolean;

  parseWebhookPayload(
    payload: any,
    headers?: Record<string, string | string[] | undefined>
  ): NormalizedWebhookEvent[];
}
