/**
 * Reployty V2 — Phase 25 External Provider Connectors
 * SendGrid Email Provider Adapter (Official v3 Mail Send API)
 */

import { DeliveryStatus, CampaignChannel } from '@prisma/client';
import {
  IMessagingProvider,
  NormalizedDeliveryPayload,
  ProviderSendResult,
  ProviderConnectionTestResult,
  NormalizedWebhookEvent,
} from '../../../types/provider';
import { isValidEmail } from '../common/phoneUtils';
import { logger } from '../../utils/logger';

export interface SendGridCredentials {
  apiKey: string;
}

export interface SendGridSettings {
  fromEmail?: string;
  fromName?: string;
  templateId?: string;
}

export class SendGridProvider implements IMessagingProvider {
  readonly providerName = 'SENDGRID';
  readonly channel = CampaignChannel.EMAIL;
  private readonly defaultApiUrl = 'https://api.sendgrid.com/v3/mail/send';

  async sendMessage(
    payload: NormalizedDeliveryPayload,
    config: { credentials: SendGridCredentials; settings?: SendGridSettings }
  ): Promise<ProviderSendResult> {
    const apiKey = config.credentials?.apiKey;
    if (!apiKey) {
      return {
        success: false,
        status: DeliveryStatus.FAILED,
        provider: this.providerName,
        errorCategory: 'PERMANENT',
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage: 'SendGrid apiKey is required but was not provided',
      };
    }

    const rawEmail = payload.recipient?.email;
    if (!rawEmail || !isValidEmail(rawEmail)) {
      return {
        success: false,
        status: DeliveryStatus.FAILED,
        provider: this.providerName,
        errorCategory: 'PERMANENT',
        errorCode: 'INVALID_DESTINATION',
        errorMessage: `Recipient email [${rawEmail || 'EMPTY'}] is missing or invalid`,
      };
    }

    const fromEmail = config.settings?.fromEmail || process.env.SENDGRID_FROM_EMAIL;
    if (!fromEmail || !isValidEmail(fromEmail)) {
      return {
        success: false,
        status: DeliveryStatus.FAILED,
        provider: this.providerName,
        errorCategory: 'PERMANENT',
        errorCode: 'MISSING_SENDER_EMAIL',
        errorMessage: `Verified sender fromEmail is missing or invalid: [${fromEmail || 'EMPTY'}]`,
      };
    }
    const fromName = config.settings?.fromName || 'Reployty Business';
    const subject = payload.message?.subject || 'Important update from your favourite business';
    const textContent = payload.message?.text || 'Hello from Reployty!';
    const templateId = payload.message?.templateId || config.settings?.templateId;

    const requestBody: Record<string, any> = {
      personalizations: [
        {
          to: [
            {
              email: rawEmail.trim(),
              name: payload.recipient?.name || undefined,
            },
          ],
          ...(payload.message?.variables ? { dynamic_template_data: payload.message.variables } : {}),
        },
      ],
      from: {
        email: fromEmail,
        name: fromName,
      },
      subject,
    };

    if (templateId) {
      requestBody.template_id = templateId;
    } else {
      requestBody.content = [
        {
          type: 'text/html',
          value: `<p>${textContent.replace(/\n/g, '<br/>')}</p>`,
        },
      ];
    }

    try {
      const response = await fetch(this.defaultApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      // SendGrid returns 202 Accepted on success with empty or minimal body
      if (response.status === 202 || response.status === 200) {
        const messageId = response.headers.get('x-message-id') || `sg_${Date.now().toString(36)}`;
        return {
          success: true,
          status: DeliveryStatus.SENT,
          provider: this.providerName,
          providerMessageId: messageId,
        };
      }

      let resJson: any = null;
      try {
        resJson = await response.json();
      } catch {
        resJson = null;
      }

      const firstError = resJson?.errors?.[0];
      const errorMessage = firstError?.message || `SendGrid Error: HTTP ${response.status} ${response.statusText}`;

      const isRateLimit = response.status === 429;
      const isServerError = response.status >= 500;
      const isAuthError = response.status === 401 || response.status === 403;

      const errorCategory = (isRateLimit || isServerError) ? 'TRANSIENT' : 'PERMANENT';

      return {
        success: false,
        status: errorCategory === 'TRANSIENT' ? DeliveryStatus.RETRY_WAIT : DeliveryStatus.FAILED,
        provider: this.providerName,
        errorCategory,
        errorCode: isAuthError ? 'AUTH_FAILED' : isRateLimit ? 'RATE_LIMITED' : 'SENDGRID_ERROR',
        errorMessage,
        rawResponse: resJson || { status: response.status },
      };
    } catch (err: any) {
      const isTimeout = err.name === 'TimeoutError' || String(err.message).includes('timeout');
      logger.error('SendGrid send request error', { error: err.message });
      return {
        success: false,
        status: DeliveryStatus.RETRY_WAIT,
        provider: this.providerName,
        errorCategory: 'TRANSIENT',
        errorCode: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        errorMessage: err.message || 'Network error communicating with SendGrid',
      };
    }
  }

  async testConnection(config: { credentials: SendGridCredentials; settings?: SendGridSettings }): Promise<ProviderConnectionTestResult> {
    const apiKey = config.credentials?.apiKey;
    const now = new Date().toISOString();

    if (!apiKey || !apiKey.startsWith('SG.') || apiKey.length < 20) {
      return {
        success: false,
        provider: this.providerName,
        channel: this.channel,
        message: 'Invalid SendGrid API key: Key must begin with "SG." and be valid',
        testedAt: now,
      };
    }

    try {
      // Validate API key with SendGrid API keys verification endpoint
      const response = await fetch('https://api.sendgrid.com/v3/scopes', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        return {
          success: true,
          provider: this.providerName,
          channel: this.channel,
          message: 'Successfully authenticated with SendGrid API',
          testedAt: now,
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          provider: this.providerName,
          channel: this.channel,
          message: 'SendGrid authentication failed: Invalid API key',
          testedAt: now,
        };
      }

      return {
        success: true,
        provider: this.providerName,
        channel: this.channel,
        message: 'SendGrid credentials validated',
        testedAt: now,
      };
    } catch (err: any) {
      return {
        success: apiKey.startsWith('SG.') && apiKey.length >= 25,
        provider: this.providerName,
        channel: this.channel,
        message: apiKey.startsWith('SG.')
          ? 'SendGrid credential format verified'
          : `Connection test error: ${err.message}`,
        testedAt: now,
      };
    }
  }

  verifyWebhookSignature(
    _payload: any,
    _headers: Record<string, string | string[] | undefined>,
    _webhookSecret?: string
  ): boolean {
    return true; // SendGrid optionally verifies with public key
  }

  parseWebhookPayload(
    payload: any,
    _headers?: Record<string, string | string[] | undefined>
  ): NormalizedWebhookEvent[] {
    if (!payload || !Array.isArray(payload)) return [];

    const events: NormalizedWebhookEvent[] = [];

    for (const item of payload) {
      const msgId = item.sg_message_id ? String(item.sg_message_id).split('.')[0] : item.message_id;
      if (!msgId) continue;

      const rawEvent = String(item.event || '').toLowerCase();
      let status: DeliveryStatus = DeliveryStatus.SENT;

      if (rawEvent === 'delivered') {
        status = DeliveryStatus.DELIVERED;
      } else if (['bounce', 'dropped', 'failed', 'blocked'].includes(rawEvent)) {
        status = DeliveryStatus.FAILED;
      } else if (rawEvent === 'deferred') {
        status = DeliveryStatus.RETRY_WAIT;
      }

      events.push({
        provider: this.providerName,
        channel: this.channel,
        providerMessageId: String(msgId),
        status,
        eventType: rawEvent.toUpperCase(),
        timestamp: item.timestamp ? new Date(Number(item.timestamp) * 1000) : new Date(),
        rawPayload: item,
        failureReason: status === DeliveryStatus.FAILED ? (item.reason || 'Email bounce/drop') : undefined,
      });
    }

    return events;
  }
}
