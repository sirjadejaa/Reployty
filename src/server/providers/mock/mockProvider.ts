/**
 * Reployty V2 — Phase 25 External Provider Connectors
 * Mock / Test Provider Adapter
 * For automated staging and regression tests.
 */

import { DeliveryStatus, CampaignChannel } from '@prisma/client';
import {
  IMessagingProvider,
  NormalizedDeliveryPayload,
  ProviderSendResult,
  ProviderConnectionTestResult,
  NormalizedWebhookEvent,
} from '../../../types/provider';

export class MockMessagingProvider implements IMessagingProvider {
  readonly providerName = 'MOCK';
  readonly channel: CampaignChannel;

  // Track dispatched messages for assertions in tests
  public sentMessages: NormalizedDeliveryPayload[] = [];
  public nextResult: ProviderSendResult | null = null;
  public simulateTimeout: boolean = false;

  constructor(channel: CampaignChannel = CampaignChannel.SMS) {
    this.channel = channel;
  }

  async sendMessage(
    payload: NormalizedDeliveryPayload,
    _config: { credentials: Record<string, any>; settings?: Record<string, any> }
  ): Promise<ProviderSendResult> {
    if (this.simulateTimeout) {
      return {
        success: false,
        status: DeliveryStatus.RETRY_WAIT,
        provider: this.providerName,
        errorCategory: 'TRANSIENT',
        errorCode: 'TIMEOUT',
        errorMessage: 'Mock provider simulated network timeout',
      };
    }

    if (this.nextResult) {
      const res = this.nextResult;
      this.nextResult = null;
      return res;
    }

    this.sentMessages.push(payload);

    // Default: successful simulated dispatch
    return {
      success: true,
      status: DeliveryStatus.SENT,
      provider: this.providerName,
      providerMessageId: `mock_msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      rawResponse: { mock: true, recipient: payload.recipient },
    };
  }

  async testConnection(_config: any): Promise<ProviderConnectionTestResult> {
    return {
      success: true,
      provider: this.providerName,
      channel: this.channel,
      message: 'Mock connection test successful',
      testedAt: new Date().toISOString(),
    };
  }

  verifyWebhookSignature(
    _payload: any,
    headers: Record<string, string | string[] | undefined>,
    webhookSecret?: string
  ): boolean {
    if (webhookSecret && headers['x-test-signature'] === 'invalid') {
      return false;
    }
    return true;
  }

  parseWebhookPayload(
    payload: any,
    _headers?: Record<string, string | string[] | undefined>
  ): NormalizedWebhookEvent[] {
    if (!payload || !payload.providerMessageId) return [];

    return [
      {
        provider: this.providerName,
        channel: this.channel,
        providerMessageId: String(payload.providerMessageId),
        status: payload.status || DeliveryStatus.DELIVERED,
        eventType: payload.eventType || 'MOCK_DELIVERED',
        timestamp: new Date(),
        rawPayload: payload,
        failureReason: payload.failureReason,
        businessId: payload.businessId,
      },
    ];
  }

  reset() {
    this.sentMessages = [];
    this.nextResult = null;
    this.simulateTimeout = false;
  }
}
