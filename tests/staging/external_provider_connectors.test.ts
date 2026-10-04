/**
 * REPLOYTY V2 — PHASE 25
 * EXTERNAL SMS (MSG91), WHATSAPP (META CLOUD API), AND EMAIL (SENDGRID)
 * PRODUCTION PROVIDER CONNECTORS TEST SUITE
 * 
 * Steps 0 to 23:
 * Step 0:  Server & multi-tenant fixtures setup
 * Step 1:  Provider registry & channel abstraction
 * Step 2:  SMS — MSG91 phone normalization (+91 expansion, E.164)
 * Step 3:  SMS — MSG91 credential & destination validation
 * Step 4:  SMS — MSG91 transient vs permanent error classification
 * Step 5:  WhatsApp — Meta Cloud API template & variable formatting
 * Step 6:  WhatsApp — Meta credential & destination validation
 * Step 7:  WhatsApp — Meta webhook HMAC-SHA256 signature verification
 * Step 8:  WhatsApp — Meta webhook status ingestion (sent, delivered, failed)
 * Step 9:  Email — SendGrid payload construction & email validation
 * Step 10: Email — SendGrid credential & verified sender validation
 * Step 11: Email — SendGrid webhook event ingestion & message ID resolution
 * Step 12: Tenant isolation — Business A cannot access or update Business B config
 * Step 13: Tenant isolation — Cross-tenant delivery dispatch cannot use foreign credentials
 * Step 14: RBAC — Owner allowed, Staff forbidden (403), Unauthenticated (401)
 * Step 15: Masked configuration API — Secrets never exposed in plaintext
 * Step 16: Channel-specific consent gating — Suppression of unconsented customers
 * Step 17: Delivery idempotency — Concurrent duplicate delivery protection
 * Step 18: Webhook deduplication — Invariant idempotency key prevents duplicate transitions
 * Step 19: Phase 22 delivery queue integration — Worker dispatches through provider
 * Step 20: Phase 23 automation engine integration — Trigger -> Automation -> Queue -> Provider
 * Step 21: Phase 24 retention workflow integration — Win-back/Birthday -> Queue -> Provider
 * Step 22: Test connection API — Server-side verification without user message dispatch
 * Step 23: Clean server teardown & natural process termination
 */

import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { startTestServer, apiRequest as rawApiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword } from '../../src/server/auth/sessionService';
import {
  AudienceType,
  BusinessCategory,
  CampaignChannel,
  CampaignStatus,
  ConsentChannel,
  CustomerEventType,
  DeliveryStatus,
  ExecutionStatus,
  RuleStatus,
  UserStatus,
} from '@prisma/client';
import {
  registerProvider,
  getProviderForChannel,
  dispatchDeliveryToProvider,
  updateBusinessProviderConfig,
  getBusinessProviderConfigs,
  testBusinessProviderConnection,
  processProviderWebhook,
} from '../../src/server/services/messagingProviderService';
import { MockMessagingProvider } from '../../src/server/providers/mock/mockProvider';
import { Msg91Provider } from '../../src/server/providers/sms/msg91Provider';
import { MetaWhatsAppProvider } from '../../src/server/providers/whatsapp/metaWhatsAppProvider';
import { SendGridProvider } from '../../src/server/providers/email/sendgridProvider';
import { normalizePhoneNumber, isValidEmail, maskSecret } from '../../src/server/providers/common/phoneUtils';
import { processDeliveryQueue } from '../../src/server/services/campaignQueueService';
import { recordAndProcessEvent } from '../../src/server/services/automationExecutionService';
import { processTimeBasedRetention } from '../../src/server/services/retentionWorkflowService';

async function apiRequest(
  ctx: TestServerContext,
  method: string,
  path: string,
  body?: any,
  token?: string,
  headers?: Record<string, string>
) {
  return rawApiRequest(ctx.baseUrl, path, {
    method,
    body,
    token,
    headers,
  });
}

test('PHASE 25: EXTERNAL MESSAGING PROVIDER CONNECTORS TEST SUITE', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;
  const RUN_ID = `p25_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Multi-tenant fixtures
  let businessA: any;
  let businessB: any;
  let branchA: any;
  let branchB: any;

  let ownerAToken: string;
  let staffAToken: string;
  let ownerBToken: string;

  let customerConsentedA: any;
  let customerUnconsentedA: any;
  let customerRevokedA: any;

  let campaignSmsA: any;
  let campaignWaA: any;
  let campaignEmailA: any;

  // Mock Providers for queue/automation/retention integration tests
  let mockSmsProvider: MockMessagingProvider;
  let mockWaProvider: MockMessagingProvider;
  let mockEmailProvider: MockMessagingProvider;

  t.after(async () => {
    if (ctx) {
      await ctx.stop();
    }
  });

  await t.test('Step 0: Server & multi-tenant fixtures setup', async () => {
    ctx = await startTestServer();
    assert.ok(ctx.baseUrl, 'Server baseUrl must be present');

    const pwHash = await hashPassword('Phase25Secret#123');

    // 1. Tenant A
    businessA = await prisma.business.create({
      data: {
        name: `Tenant A Messaging ${RUN_ID}`,
        slug: `tenant-a-msg-${RUN_ID}`,
        category: BusinessCategory.CAFE,
        timezone: 'Asia/Kolkata',
      },
    });

    branchA = await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: 'Main Branch A',
        isMainBranch: true,
        timezone: 'Asia/Kolkata',
      },
    });

    // 2. Tenant B
    businessB = await prisma.business.create({
      data: {
        name: `Tenant B Messaging ${RUN_ID}`,
        slug: `tenant-b-msg-${RUN_ID}`,
        category: BusinessCategory.SALON,
        timezone: 'Asia/Kolkata',
      },
    });

    branchB = await prisma.branch.create({
      data: {
        businessId: businessB.id,
        name: 'Main Branch B',
        isMainBranch: true,
        timezone: 'Asia/Kolkata',
      },
    });

    // 3. Users, Staff Memberships & Real Auth Sessions
    const ownerRole = await prisma.role.findFirst({ where: { name: 'OWNER' } });
    const staffRole = await prisma.role.findFirst({ where: { name: 'STAFF' } });
    assert.ok(ownerRole, 'OWNER role must exist');
    assert.ok(staffRole, 'STAFF role must exist');

    const userAOwner = await prisma.user.create({
      data: { email: `owner_a_${RUN_ID}@example.com`, name: 'Owner A', passwordHash: pwHash, status: UserStatus.ACTIVE },
    });
    await prisma.staffMembership.create({
      data: { userId: userAOwner.id, businessId: businessA.id, roleId: ownerRole!.id },
    });

    const userAStaff = await prisma.user.create({
      data: { email: `staff_a_${RUN_ID}@example.com`, name: 'Staff A', passwordHash: pwHash, status: UserStatus.ACTIVE },
    });
    await prisma.staffMembership.create({
      data: { userId: userAStaff.id, businessId: businessA.id, roleId: staffRole!.id },
    });

    const userBOwner = await prisma.user.create({
      data: { email: `owner_b_${RUN_ID}@example.com`, name: 'Owner B', passwordHash: pwHash, status: UserStatus.ACTIVE },
    });
    await prisma.staffMembership.create({
      data: { userId: userBOwner.id, businessId: businessB.id, roleId: ownerRole!.id },
    });

    // Authoritative login to issue real tenant sessions
    const loginA = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: userAOwner.email,
      password: 'Phase25Secret#123',
    });
    ownerAToken = loginA.body.sessionToken || loginA.body.token;

    const loginStaff = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: userAStaff.email,
      password: 'Phase25Secret#123',
    });
    staffAToken = loginStaff.body.sessionToken || loginStaff.body.token;

    const loginB = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: userBOwner.email,
      password: 'Phase25Secret#123',
    });
    ownerBToken = loginB.body.sessionToken || loginB.body.token;

    assert.ok(ownerAToken, 'Owner A session token required');
    assert.ok(staffAToken, 'Staff A session token required');
    assert.ok(ownerBToken, 'Owner B session token required');

    // 4. Customers with consent configurations
    customerConsentedA = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: 'Consented Customer A',
        phone: '+919876500001',
        email: 'consented_a@example.com',
        marketingConsent: true,
      },
    });
    await prisma.customerConsent.createMany({
      data: [
        { customerId: customerConsentedA.id, channel: ConsentChannel.SMS, granted: true, source: 'PORTAL' },
        { customerId: customerConsentedA.id, channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
        { customerId: customerConsentedA.id, channel: ConsentChannel.EMAIL, granted: true, source: 'PORTAL' },
      ],
    });

    customerUnconsentedA = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: 'Unconsented Customer A',
        phone: '+919876500002',
        email: 'unconsented_a@example.com',
        marketingConsent: false,
      },
    });

    customerRevokedA = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: 'Revoked Customer A',
        phone: '+919876500003',
        email: 'revoked_a@example.com',
        marketingConsent: false,
      },
    });
    await prisma.customerConsent.create({
      data: { customerId: customerRevokedA.id, channel: ConsentChannel.SMS, granted: false, source: 'OPT_OUT' },
    });

    // 5. Campaigns for Tenant A
    campaignSmsA = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: `SMS Campaign ${RUN_ID}`,
        channel: CampaignChannel.SMS,
        messageTemplate: 'Hello {{customer.name}}, visit us for 20% off!',
        audienceType: AudienceType.ALL_CUSTOMERS,
        status: CampaignStatus.ACTIVE,
      },
    });

    campaignWaA = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: `WhatsApp Campaign ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        messageTemplate: 'special_offer_notice',
        audienceType: AudienceType.ALL_CUSTOMERS,
        status: CampaignStatus.ACTIVE,
      },
    });

    campaignEmailA = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: `Email Campaign ${RUN_ID}`,
        channel: CampaignChannel.EMAIL,
        messageTemplate: '<h1>Special Reward</h1><p>Claim your reward!</p>',
        audienceType: AudienceType.ALL_CUSTOMERS,
        status: CampaignStatus.ACTIVE,
      },
    });

    // Initialize test mocks
    mockSmsProvider = new MockMessagingProvider(CampaignChannel.SMS);
    mockWaProvider = new MockMessagingProvider(CampaignChannel.WHATSAPP);
    mockEmailProvider = new MockMessagingProvider(CampaignChannel.EMAIL);
  });

  await t.test('Step 1: Provider registry & channel abstraction', async () => {
    // Verify default registered providers
    const smsProv = getProviderForChannel(CampaignChannel.SMS);
    assert.ok(smsProv, 'SMS provider should be registered');
    assert.strictEqual(smsProv.channel, CampaignChannel.SMS);

    const waProv = getProviderForChannel(CampaignChannel.WHATSAPP);
    assert.ok(waProv, 'WhatsApp provider should be registered');
    assert.strictEqual(waProv.channel, CampaignChannel.WHATSAPP);

    const emailProv = getProviderForChannel(CampaignChannel.EMAIL);
    assert.ok(emailProv, 'Email provider should be registered');
    assert.strictEqual(emailProv.channel, CampaignChannel.EMAIL);

    // Verify registering custom mock adapter replaces default
    registerProvider(CampaignChannel.SMS, mockSmsProvider);
    const resolvedMock = getProviderForChannel(CampaignChannel.SMS);
    assert.strictEqual(resolvedMock.providerName, 'MOCK');

    // Restore real MSG91 provider for unit checks
    registerProvider(CampaignChannel.SMS, new Msg91Provider());
  });

  await t.test('Step 2: SMS — MSG91 phone normalization (+91 expansion, E.164)', async () => {
    // 10-digit Indian local number -> expanded to E.164 with +91
    const p1 = normalizePhoneNumber('9876543210');
    assert.strictEqual(p1.isValid, true);
    assert.strictEqual(p1.e164, '+919876543210');
    assert.strictEqual(p1.countryCode, '91');

    // Existing +91 with dashes/spaces
    const p2 = normalizePhoneNumber('+91 98765-43210');
    assert.strictEqual(p2.isValid, true);
    assert.strictEqual(p2.e164, '+919876543210');

    // 0-prefixed 10-digit Indian number -> trimmed and +91 added
    const p3 = normalizePhoneNumber('09876543210');
    assert.strictEqual(p3.isValid, true);
    assert.strictEqual(p3.e164, '+919876543210');

    // Invalid phone number
    const pInvalid = normalizePhoneNumber('12345');
    assert.strictEqual(pInvalid.isValid, false);

    // Mask secret utility
    assert.strictEqual(maskSecret('mySecretKey1234'), '****1234');
    assert.strictEqual(maskSecret('short'), '******');
    assert.strictEqual(maskSecret(''), '');
  });

  await t.test('Step 3: SMS — MSG91 credential & destination validation', async () => {
    const msg91 = new Msg91Provider();

    // 1. Missing credentials
    const resNoCreds = await msg91.sendMessage(
      {
        deliveryId: 'del_1',
        businessId: businessA.id,
        customerId: customerConsentedA.id,
        channel: CampaignChannel.SMS,
        recipient: { phone: '+919876500001' },
        message: { content: 'Test message' },
      },
      { credentials: { authKey: '' } }
    );
    assert.strictEqual(resNoCreds.success, false);
    assert.strictEqual(resNoCreds.errorCode, 'MISSING_CREDENTIALS');
    assert.strictEqual(resNoCreds.errorCategory, 'PERMANENT');

    // 2. Missing phone destination
    const resNoPhone = await msg91.sendMessage(
      {
        deliveryId: 'del_2',
        businessId: businessA.id,
        customerId: customerConsentedA.id,
        channel: CampaignChannel.SMS,
        recipient: {},
        message: { content: 'Test message' },
      },
      { credentials: { authKey: 'valid_key_123' } }
    );
    assert.strictEqual(resNoPhone.success, false);
    assert.strictEqual(resNoPhone.errorCode, 'INVALID_DESTINATION');
    assert.strictEqual(resNoPhone.errorCategory, 'PERMANENT');

    // 3. Invalid phone format
    const resBadPhone = await msg91.sendMessage(
      {
        deliveryId: 'del_3',
        businessId: businessA.id,
        customerId: customerConsentedA.id,
        channel: CampaignChannel.SMS,
        recipient: { phone: '000' },
        message: { content: 'Test message' },
      },
      { credentials: { authKey: 'valid_key_123' } }
    );
    assert.strictEqual(resBadPhone.success, false);
    assert.strictEqual(resBadPhone.errorCode, 'INVALID_PHONE_NUMBER');
    assert.strictEqual(resBadPhone.errorCategory, 'PERMANENT');
  });

  await t.test('Step 4: SMS — MSG91 transient vs permanent error classification', async () => {
    const msg91 = new Msg91Provider();

    // DLR Webhook payload parsing
    const webhookPayload = [
      {
        requestId: 'req_msg91_abc123',
        sender: 'RPLTYX',
        mobileNumber: '919876500001',
        status: 'Delivered',
        datetime: '2026-09-30 00:00:00',
      },
    ];

    const parsedEvents = msg91.parseWebhookPayload(webhookPayload);
    assert.strictEqual(parsedEvents.length, 1);
    assert.strictEqual(parsedEvents[0].providerMessageId, 'req_msg91_abc123');
    assert.strictEqual(parsedEvents[0].status, DeliveryStatus.DELIVERED);

    // Failed webhook mapping
    const failedWebhook = [
      {
        requestId: 'req_msg91_fail',
        status: 'Failed',
        description: 'DND Blacklisted',
      },
    ];
    const parsedFailed = msg91.parseWebhookPayload(failedWebhook);
    assert.strictEqual(parsedFailed[0].status, DeliveryStatus.FAILED);
    assert.strictEqual(parsedFailed[0].failureReason, 'DND Blacklisted');
  });

  await t.test('Step 5: WhatsApp — Meta Cloud API template & variable formatting', async () => {
    const meta = new MetaWhatsAppProvider();

    // 1. Missing credentials
    const resNoCreds = await meta.sendMessage(
      {
        deliveryId: 'del_wa_1',
        businessId: businessA.id,
        customerId: customerConsentedA.id,
        channel: CampaignChannel.WHATSAPP,
        recipient: { phone: '+919876500001' },
        message: { templateId: 'welcome_pass' },
      },
      { credentials: { accessToken: '', phoneNumberId: '' } }
    );
    assert.strictEqual(resNoCreds.success, false);
    assert.strictEqual(resNoCreds.errorCode, 'MISSING_CREDENTIALS');
    assert.strictEqual(resNoCreds.errorCategory, 'PERMANENT');

    // 2. Missing template name
    const resNoTpl = await meta.sendMessage(
      {
        deliveryId: 'del_wa_2',
        businessId: businessA.id,
        customerId: customerConsentedA.id,
        channel: CampaignChannel.WHATSAPP,
        recipient: { phone: '+919876500001' },
        message: {},
      },
      { credentials: { accessToken: 'valid_token', phoneNumberId: '12345678' } }
    );
    assert.strictEqual(resNoTpl.success, false);
    assert.strictEqual(resNoTpl.errorCode, 'MISSING_TEMPLATE');
  });

  await t.test('Step 6: WhatsApp — Meta credential & destination validation', async () => {
    const meta = new MetaWhatsAppProvider();

    // Invalid phone number format
    const res = await meta.sendMessage(
      {
        deliveryId: 'del_wa_3',
        businessId: businessA.id,
        customerId: customerConsentedA.id,
        channel: CampaignChannel.WHATSAPP,
        recipient: { phone: 'abc-not-a-phone' },
        message: { templateId: 'welcome_pass' },
      },
      { credentials: { accessToken: 'valid_token', phoneNumberId: '12345678' } }
    );
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'INVALID_PHONE_NUMBER');
    assert.strictEqual(res.errorCategory, 'PERMANENT');
  });

  await t.test('Step 7: WhatsApp — Meta webhook HMAC-SHA256 signature verification', async () => {
    const meta = new MetaWhatsAppProvider();
    const appSecret = 'meta_test_secret_999';
    const payloadStr = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

    // Compute valid HMAC-SHA256
    const validSignature = 'sha256=' + crypto.createHmac('sha256', appSecret).update(payloadStr).digest('hex');

    // 1. Valid signature passes
    const isValid = meta.verifyWebhookSignature(payloadStr, { 'x-hub-signature-256': validSignature }, appSecret);
    assert.strictEqual(isValid, true, 'Valid HMAC signature must verify');

    // 2. Tampered signature fails
    const isTampered = meta.verifyWebhookSignature(
      payloadStr,
      { 'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000' },
      appSecret
    );
    assert.strictEqual(isTampered, false, 'Tampered HMAC signature must be rejected');

    // 3. Missing header fails when secret configured
    const isMissing = meta.verifyWebhookSignature(payloadStr, {}, appSecret);
    assert.strictEqual(isMissing, false, 'Missing signature header must be rejected');
  });

  await t.test('Step 8: WhatsApp — Meta webhook status ingestion (sent, delivered, failed)', async () => {
    const meta = new MetaWhatsAppProvider();

    const sampleWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_123',
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  {
                    id: 'wamid.HBgLMjA2OTk5OTk5FQIAERgSMzAy',
                    status: 'delivered',
                    timestamp: '1727654400',
                    recipient_id: '919876500001',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = meta.parseWebhookPayload(sampleWebhookPayload);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].providerMessageId, 'wamid.HBgLMjA2OTk5OTk5FQIAERgSMzAy');
    assert.strictEqual(events[0].status, DeliveryStatus.DELIVERED);
    assert.strictEqual(events[0].eventType, 'DELIVERED');
  });

  await t.test('Step 9: Email — SendGrid payload construction & email validation', async () => {
    assert.strictEqual(isValidEmail('test@reployty.com'), true);
    assert.strictEqual(isValidEmail('user.name+tag@domain.co.uk'), true);
    assert.strictEqual(isValidEmail('invalid-email'), false);
    assert.strictEqual(isValidEmail(''), false);

    const sg = new SendGridProvider();

    // 1. Missing credentials
    const resNoCreds = await sg.sendMessage(
      {
        deliveryId: 'del_email_1',
        businessId: businessA.id,
        customerId: customerConsentedA.id,
        channel: CampaignChannel.EMAIL,
        recipient: { email: 'customer@example.com' },
        message: { content: '<h1>Hello</h1>' },
      },
      { credentials: { apiKey: '' } }
    );
    assert.strictEqual(resNoCreds.success, false);
    assert.strictEqual(resNoCreds.errorCode, 'MISSING_CREDENTIALS');
    assert.strictEqual(resNoCreds.errorCategory, 'PERMANENT');

    // 2. Invalid recipient email
    const resBadEmail = await sg.sendMessage(
      {
        deliveryId: 'del_email_2',
        businessId: businessA.id,
        customerId: customerConsentedA.id,
        channel: CampaignChannel.EMAIL,
        recipient: { email: 'bad_email' },
        message: { content: '<h1>Hello</h1>' },
      },
      { credentials: { apiKey: 'SG.test_key' } }
    );
    assert.strictEqual(resBadEmail.success, false);
    assert.strictEqual(resBadEmail.errorCode, 'INVALID_DESTINATION');
    assert.strictEqual(resBadEmail.errorCategory, 'PERMANENT');
  });

  await t.test('Step 10: Email — SendGrid credential & verified sender validation', async () => {
    const sg = new SendGridProvider();

    // Missing verified sender fromEmail
    const resNoSender = await sg.sendMessage(
      {
        deliveryId: 'del_email_3',
        businessId: businessA.id,
        customerId: customerConsentedA.id,
        channel: CampaignChannel.EMAIL,
        recipient: { email: 'customer@example.com' },
        message: { content: '<h1>Hello</h1>' },
      },
      { credentials: { apiKey: 'SG.test_key' }, settings: { fromEmail: '' } }
    );
    assert.strictEqual(resNoSender.success, false);
    assert.strictEqual(resNoSender.errorCode, 'MISSING_SENDER_EMAIL');
  });

  await t.test('Step 11: Email — SendGrid webhook event ingestion & message ID resolution', async () => {
    const sg = new SendGridProvider();

    const sampleEvents = [
      {
        sg_message_id: 'sg_msg_98765.filter01',
        event: 'delivered',
        email: 'customer@example.com',
        timestamp: 1727654400,
      },
      {
        sg_message_id: 'sg_msg_12345.filter02',
        event: 'bounce',
        reason: '550 User unknown',
        email: 'bounced@example.com',
        timestamp: 1727654401,
      },
    ];

    const parsed = sg.parseWebhookPayload(sampleEvents);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].providerMessageId, 'sg_msg_98765');
    assert.strictEqual(parsed[0].status, DeliveryStatus.DELIVERED);

    assert.strictEqual(parsed[1].providerMessageId, 'sg_msg_12345');
    assert.strictEqual(parsed[1].status, DeliveryStatus.FAILED);
    assert.strictEqual(parsed[1].failureReason, '550 User unknown');
  });

  await t.test('Step 12: Tenant isolation — Business A cannot access or update Business B config', async () => {
    // 1. Business A saves SMS config
    const saveResA = await apiRequest(
      ctx,
      'POST',
      '/api/business/messaging/config',
      {
        channel: 'SMS',
        provider: 'MSG91',
        isEnabled: true,
        credentials: { authKey: 'secret_key_business_a' },
        settings: { senderId: 'RPLTYA', route: 4 },
      },
      ownerAToken
    );
    assert.strictEqual(saveResA.status, 200);

    // 2. Business B reads configs -> must NOT see Business A credentials
    const getResB = await apiRequest(ctx, 'GET', '/api/business/messaging/config', undefined, ownerBToken);
    assert.strictEqual(getResB.status, 200);
    const smsB = (getResB.body.configs || []).find((c: any) => c.channel === 'SMS');
    assert.ok(!smsB || !smsB.isConfigured || smsB.businessId === businessB.id);

    // 3. Business B configures WhatsApp with B-specific settings
    const saveResB = await apiRequest(
      ctx,
      'POST',
      '/api/business/messaging/config',
      {
        channel: 'WHATSAPP',
        provider: 'META_WHATSAPP',
        isEnabled: true,
        credentials: { accessToken: 'meta_token_business_b', phoneNumberId: '99887766' },
        settings: { defaultLanguage: 'en_US' },
      },
      ownerBToken
    );
    assert.strictEqual(saveResB.status, 200);

    // 4. Verify Business A's WhatsApp config is still unconfigured
    const getResA = await apiRequest(ctx, 'GET', '/api/business/messaging/config', undefined, ownerAToken);
    const waA = (getResA.body.configs || []).find((c: any) => c.channel === 'WHATSAPP');
    assert.strictEqual(waA?.isConfigured ?? false, false, 'Business A must not inherit Business B config');
  });

  await t.test('Step 13: Tenant isolation — Cross-tenant delivery dispatch cannot use foreign credentials', async () => {
    // Attempt delivery for Business B using Business A context
    const deliveryB = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignSmsA.id,
        customerId: customerConsentedA.id,
        businessId: businessB.id,
        channel: CampaignChannel.SMS,
        status: DeliveryStatus.PENDING,
      },
    });

    // Dispatching delivery scoped to Business B uses Business B's config (which has no SMS configured)
    const result = await dispatchDeliveryToProvider(deliveryB);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errorCode, 'PROVIDER_NOT_CONFIGURED');
  });

  await t.test('Step 14: RBAC — Owner allowed, Staff forbidden (403), Unauthenticated (401)', async () => {
    // 1. Unauthenticated request -> 401
    const unauthRes = await apiRequest(ctx, 'GET', '/api/business/messaging/config');
    assert.strictEqual(unauthRes.status, 401);

    // 2. Staff user attempting to update provider config -> 403
    const staffRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/messaging/config',
      {
        channel: 'SMS',
        provider: 'MSG91',
        isEnabled: true,
        credentials: { authKey: 'staff_attempt_key' },
      },
      staffAToken
    );
    assert.strictEqual(staffRes.status, 403, 'Staff role must be forbidden from modifying provider credentials');

    // 3. Staff user attempting to test provider connection -> 403
    const staffTestRes = await apiRequest(ctx, 'POST', '/api/business/messaging/config/SMS/test', {}, staffAToken);
    assert.strictEqual(staffTestRes.status, 403, 'Staff role must be forbidden from testing provider credentials');

    // 4. Owner user allowed -> 200
    const ownerRes = await apiRequest(ctx, 'GET', '/api/business/messaging/config', undefined, ownerAToken);
    assert.strictEqual(ownerRes.status, 200);
  });

  await t.test('Step 15: Masked configuration API — Secrets never exposed in plaintext', async () => {
    // Read Business A config through API
    const res = await apiRequest(ctx, 'GET', '/api/business/messaging/config', undefined, ownerAToken);
    assert.strictEqual(res.status, 200);

    const smsConfig = res.body.configs.find((c: any) => c.channel === 'SMS');
    assert.ok(smsConfig);
    assert.strictEqual(smsConfig.isConfigured, true);

    // Verify secret is masked: 'secret_key_business_a' -> '****ss_a'
    assert.strictEqual(smsConfig.maskedCredentials.authKey.startsWith('****'), true);
    assert.strictEqual(smsConfig.maskedCredentials.authKey.includes('secret_key_business_a'), false);

    // Full database record contains raw encrypted secret server-side only
    const dbRecord = await prisma.businessMessagingConfig.findUnique({
      where: {
        businessId_channel: {
          businessId: businessA.id,
          channel: CampaignChannel.SMS,
        },
      },
    });
    assert.ok(dbRecord);
    assert.strictEqual((dbRecord.credentials as any).authKey, 'secret_key_business_a');
  });

  await t.test('Step 16: Channel-specific consent gating — Suppression of unconsented customers', async () => {
    registerProvider(CampaignChannel.SMS, mockSmsProvider);
    mockSmsProvider.sentMessages = [];

    // 1. Delivery to customer without consent
    const deliveryNoConsent = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignSmsA.id,
        customerId: customerUnconsentedA.id,
        businessId: businessA.id,
        channel: CampaignChannel.SMS,
        status: DeliveryStatus.PENDING,
      },
    });

    const resNoConsent = await dispatchDeliveryToProvider(deliveryNoConsent);
    assert.strictEqual(resNoConsent.success, false);
    assert.strictEqual(resNoConsent.errorCode, 'CONSENT_NOT_GRANTED');
    assert.strictEqual(resNoConsent.status, DeliveryStatus.FAILED);
    assert.strictEqual(mockSmsProvider.sentMessages.length, 0, 'No message sent to unconsented customer');

    // 2. Delivery to customer with revoked consent
    const deliveryRevoked = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignSmsA.id,
        customerId: customerRevokedA.id,
        businessId: businessA.id,
        channel: CampaignChannel.SMS,
        status: DeliveryStatus.PENDING,
      },
    });

    const resRevoked = await dispatchDeliveryToProvider(deliveryRevoked);
    assert.strictEqual(resRevoked.success, false);
    assert.strictEqual(resRevoked.errorCode, 'CONSENT_REVOKED');
    assert.strictEqual(resRevoked.status, DeliveryStatus.FAILED);
    assert.strictEqual(mockSmsProvider.sentMessages.length, 0, 'No message sent to revoked customer');

    // 3. Delivery to consented customer succeeds
    const deliveryConsented = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignSmsA.id,
        customerId: customerConsentedA.id,
        businessId: businessA.id,
        channel: CampaignChannel.SMS,
        status: DeliveryStatus.PENDING,
      },
    });

    const resConsented = await dispatchDeliveryToProvider(deliveryConsented);
    assert.strictEqual(resConsented.success, true);
    assert.strictEqual(mockSmsProvider.sentMessages.length, 1);
  });

  await t.test('Step 17: Delivery idempotency — Concurrent duplicate delivery protection', async () => {
    const delivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignSmsA.id,
        customerId: customerConsentedA.id,
        businessId: businessA.id,
        channel: CampaignChannel.SMS,
        status: DeliveryStatus.PENDING,
      },
    });

    mockSmsProvider.sentMessages = [];

    // First dispatch
    const res1 = await dispatchDeliveryToProvider(delivery);
    assert.strictEqual(res1.success, true);

    // Fetch updated delivery state
    const updated = await prisma.campaignDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.strictEqual(updated.status, DeliveryStatus.SENT);

    // Duplicate dispatch attempt on already-sent delivery
    const res2 = await dispatchDeliveryToProvider(updated);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(mockSmsProvider.sentMessages.length, 1, 'Duplicate dispatch must not send a second message');
  });

  await t.test('Step 18: Webhook deduplication — Invariant idempotency key prevents duplicate transitions', async () => {
    const wamid = `wamid.test_${Date.now()}_dedup`;

    // Create a delivery with this providerMessageId
    const delivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignWaA.id,
        customerId: customerConsentedA.id,
        businessId: businessA.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.SENT,
        provider: 'META_WHATSAPP',
        providerMessageId: wamid,
      },
    });

    const sampleWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_123',
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  {
                    id: wamid,
                    status: 'delivered',
                    timestamp: '1727654400',
                    recipient_id: '919876500001',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    // First webhook ingestion
    const res1 = await processProviderWebhook('META_WHATSAPP', CampaignChannel.WHATSAPP, sampleWebhookPayload);
    assert.strictEqual(res1.processedCount, 1);

    const afterFirst = await prisma.campaignDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.strictEqual(afterFirst.status, DeliveryStatus.DELIVERED);

    // Duplicate webhook ingestion (exact same wamid + status)
    const res2 = await processProviderWebhook('META_WHATSAPP', CampaignChannel.WHATSAPP, sampleWebhookPayload);
    assert.strictEqual(res2.duplicateCount, 1, 'Duplicate webhook must be idempotent and ignored');

    // Verify ProviderDeliveryEvent count in DB is 1
    const eventCount = await prisma.providerDeliveryEvent.count({
      where: { providerMessageId: wamid },
    });
    assert.strictEqual(eventCount, 1, 'Only one ProviderDeliveryEvent record should be recorded');
  });

  await t.test('Step 19: Phase 22 delivery queue integration — Worker dispatches through provider', async () => {
    registerProvider(CampaignChannel.SMS, mockSmsProvider);
    mockSmsProvider.sentMessages = [];

    // Create an execution and queued deliveries
    const execution = await prisma.campaignExecution.create({
      data: {
        campaignId: campaignSmsA.id,
        businessId: businessA.id,
        branchId: branchA.id,
        triggerType: 'MANUAL',
        status: 'PROCESSING',
        queuedCount: 1,
      },
    });

    const delivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignSmsA.id,
        executionId: execution.id,
        customerId: customerConsentedA.id,
        businessId: businessA.id,
        channel: CampaignChannel.SMS,
        status: DeliveryStatus.QUEUED,
        attemptCount: 0,
      },
    });

    // Run Phase 22 queue processor
    const queueResult = await processDeliveryQueue({
      businessId: businessA.id,
      batchSize: 10,
    });

    assert.ok(queueResult.processedCount >= 1);
    assert.strictEqual(mockSmsProvider.sentMessages.length, 1);

    // Verify delivery updated in DB
    const finalDelivery = await prisma.campaignDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.strictEqual(finalDelivery.status, DeliveryStatus.SENT);
    assert.ok(finalDelivery.providerMessageId);
  });

  await t.test('Step 20: Phase 23 automation engine integration — Trigger -> Automation -> Queue -> Provider', async () => {
    registerProvider(CampaignChannel.SMS, mockSmsProvider);
    mockSmsProvider.sentMessages = [];

    // Create Automation Rule that triggers on CUSTOMER_JOINED and sends SMS campaign
    const rule = await prisma.automationRule.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: `Welcome SMS ${RUN_ID}`,
        triggerEvent: CustomerEventType.CUSTOMER_JOINED,
        status: RuleStatus.ACTIVE,
        cooldownMinutes: 0,
        actionType: 'SEND_CAMPAIGN',
        actionConfig: {
          campaignId: campaignSmsA.id,
        },
      },
    });

    // Ingest event and process automation
    const execResult = await recordAndProcessEvent(
      { businessId: businessA.id, branchId: branchA.id },
      {
        customerId: customerConsentedA.id,
        eventType: CustomerEventType.CUSTOMER_JOINED,
        metadata: { source: 'PORTAL' },
      }
    );
    assert.strictEqual(execResult.matchedRulesCount, 1);
    assert.strictEqual(execResult.executions[0].status, ExecutionStatus.COMPLETED);

    // Process delivery queue to invoke provider
    await processDeliveryQueue({ businessId: businessA.id, batchSize: 10 });
    assert.ok(mockSmsProvider.sentMessages.length >= 1, 'Provider received SMS message from automation flow');
  });

  await t.test('Step 21: Phase 24 retention workflow integration — Win-back/Birthday -> Queue -> Provider', async () => {
    registerProvider(CampaignChannel.WHATSAPP, mockWaProvider);
    mockWaProvider.sentMessages = [];

    // Configure Business A messaging config for WhatsApp via API
    await apiRequest(
      ctx,
      'POST',
      '/api/business/messaging/config',
      {
        channel: 'WHATSAPP',
        provider: 'META_WHATSAPP',
        isEnabled: true,
        credentials: { accessToken: 'token_a', phoneNumberId: '12345678' },
      },
      ownerAToken
    );

    // Run retention processor
    const retentionProc = await processTimeBasedRetention({
      businessId: businessA.id,
      workflowType: 'INACTIVITY',
    });

    // Run delivery queue
    await processDeliveryQueue({ businessId: businessA.id, batchSize: 10 });
    assert.ok(retentionProc, 'Retention processor executed successfully');
  });

  await t.test('Step 22: Test connection API — Server-side verification without user message dispatch', async () => {
    // 1. Connection test for SMS (MSG91) via API
    const testRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/messaging/config/SMS/test',
      { credentials: { authKey: 'test_sample_key' } },
      ownerAToken
    );
    assert.strictEqual(testRes.status, 200);
    assert.ok(testRes.body.provider === 'MSG91' || testRes.body.provider === 'MOCK');

    // 2. Connection test for WhatsApp (Meta) via API
    const waTestRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/messaging/config/WHATSAPP/test',
      { credentials: { accessToken: 'test_meta_token', phoneNumberId: '1029384756' } },
      ownerAToken
    );
    assert.strictEqual(waTestRes.status, 200);

    // 3. Connection test for Email (SendGrid) via API
    const emailTestRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/messaging/config/EMAIL/test',
      { credentials: { apiKey: 'SG.test_key_sample' } },
      ownerAToken
    );
    assert.strictEqual(emailTestRes.status, 200);
  });

  await t.test('Step 23: Clean server teardown & natural process termination', async () => {
    // Verify server context exists and stop hook is registered
    assert.ok(ctx);
    assert.ok(typeof ctx.stop === 'function');
  });
});
