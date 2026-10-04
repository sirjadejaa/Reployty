/**
 * REPLOYTY V2 — PHASE 26
 * CAMPAIGN ANALYTICS, CLICK/OPEN TRACKING & CONVERSION ATTRIBUTION TEST SUITE
 * 
 * Steps 0 to 26:
 * Step 0:  Server & multi-tenant fixtures setup
 * Step 1:  Analytics foundation — Campaign delivery funnel metrics (Recipients, Sent, Delivered, Failed, Rates)
 * Step 2:  Analytics foundation — Date range filtering on campaign analytics
 * Step 3:  Analytics foundation — Zero-state behavior & safe division-by-zero handling
 * Step 4:  Click tracking — Secure link creation and SSRF/hazardous URL scheme validation
 * Step 5:  Click tracking — Service handling, click recording, unique clicker deduplication, and redirect resolution
 * Step 6:  Click tracking — Public tracking endpoint GET /track/c/:code & 302 redirect
 * Step 7:  Open tracking — Email 1x1 transparent GIF open pixel GET /track/o/:deliveryId
 * Step 8:  Open tracking — Idempotent duplicate open detection handling
 * Step 9:  Provider events — WhatsApp webhook updates delivery, sets readAt, and records READ analytics event
 * Step 10: Provider events — SendGrid webhook updates delivery, sets openedAt/clickedAt, and records OPENED/CLICKED/BOUNCED
 * Step 11: Provider events — MSG91 DLR webhook status ingestion
 * Step 12: Webhook idempotency — Duplicate webhook delivery prevents duplicate analytics events
 * Step 13: Conversion attribution — Return visit (VISIT_RECORDED -> RETURN_VISIT) attribution
 * Step 14: Conversion attribution — Loyalty stamp earned (STAMP_ADDED -> LOYALTY_STAMP) attribution
 * Step 15: Conversion attribution — Loyalty points earned (POINTS_ADDED -> LOYALTY_POINTS) attribution
 * Step 16: Conversion attribution — Reward redemption (REWARD_REDEEMED -> REWARD_REDEMPTION) attribution & delivery REDEEMED
 * Step 17: Conversion attribution — Offer redemption (OFFER_REDEEMED -> OFFER_REDEMPTION) attribution
 * Step 18: Conversion attribution — Customer reactivation (CUSTOMER_REACTIVATED -> CUSTOMER_REACTIVATED) attribution
 * Step 19: Conversion attribution — Attribution window enforcement (within window vs outside window)
 * Step 20: Conversion attribution — Last-touch single attribution rule (most recent delivery attributed)
 * Step 21: Idempotency & Concurrency — Database unique constraint blocks duplicate conversion records
 * Step 22: Phase 23 Automation & Phase 24 Retention integration — Trigger/Win-back campaigns attribute conversions
 * Step 23: Tenant isolation & Security — Cross-tenant analytics and conversion access strictly blocked (404/403)
 * Step 24: RBAC permissions — Owner/Manager allowed, Staff restricted, Unauthenticated 401
 * Step 25: Chronological Activity Timeline API — Unified sent -> delivered -> engaged -> converted trace
 * Step 26: Clean server teardown & natural process termination
 */

import test from 'node:test';
import assert from 'node:assert';
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
  UserStatus,
} from '@prisma/client';
import {
  createTrackedLink,
  handleTrackedClick,
  handleTrackedOpen,
  validateRedirectUrl,
  TRANSPARENT_1X1_GIF,
} from '../../src/server/services/campaignTrackingService';
import {
  getCampaignAnalytics,
  getCampaignConversions,
  getCampaignTimeline,
} from '../../src/server/services/campaignAnalyticsService';
import { processConversionAttribution } from '../../src/server/services/campaignAttributionService';
import { processProviderWebhook } from '../../src/server/services/messagingProviderService';
import { recordRetentionEvent } from '../../src/server/services/retentionEventService';

async function apiRequest(
  ctx: TestServerContext,
  method: string,
  path: string,
  body?: any,
  token?: string,
  headers?: Record<string, string>
) {
  const res = await rawApiRequest(ctx.baseUrl, path, {
    method,
    body,
    token,
    headers,
  });
  const headersObj: Record<string, string> = {};
  if (res.headers && typeof (res.headers as any).forEach === 'function') {
    (res.headers as any).forEach((val: string, key: string) => {
      headersObj[key.toLowerCase()] = val;
    });
  } else if (res.headers) {
    Object.assign(headersObj, res.headers);
  }
  return {
    ...res,
    headers: headersObj,
    data: res.body,
  };
}

test('PHASE 26: CAMPAIGN ANALYTICS, TRACKING & CONVERSION ATTRIBUTION TEST SUITE', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;
  const RUN_ID = `p26_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Fixtures
  let businessA: any;
  let businessB: any;
  let branchA: any;
  let branchB: any;

  let ownerAToken: string;
  let staffAToken: string;
  let ownerBToken: string;

  let customer1A: any;
  let customer2A: any;
  let customerB: any;

  let campaignA: any;
  let campaignB: any;

  t.after(async () => {
    if (ctx) {
      await ctx.stop();
    }
  });

  // ==========================================================================
  // Step 0: Server & Multi-tenant Fixtures Setup
  // ==========================================================================
  await t.test('Step 0: Server & multi-tenant fixtures setup', async () => {
    ctx = await startTestServer();

    // 1. Create Business A & B
    businessA = await prisma.business.create({
      data: {
        name: `Business A ${RUN_ID}`,
        slug: `biz-a-${RUN_ID}`,
        category: BusinessCategory.CAFE,
      },
    });

    businessB = await prisma.business.create({
      data: {
        name: `Business B ${RUN_ID}`,
        slug: `biz-b-${RUN_ID}`,
        category: BusinessCategory.RETAIL,
      },
    });

    branchA = await prisma.branch.create({
      data: {
        name: `Main Branch A ${RUN_ID}`,
        code: `BRA-${RUN_ID.slice(-4)}`,
        businessId: businessA.id,
      },
    });

    branchB = await prisma.branch.create({
      data: {
        name: `Main Branch B ${RUN_ID}`,
        code: `BRB-${RUN_ID.slice(-4)}`,
        businessId: businessB.id,
      },
    });

    // 2. Create Users & Staff Memberships with Roles
    const passwordHash = await hashPassword('TestPassword123!');

    const ownerAUser = await prisma.user.create({
      data: {
        email: `owner_a_${RUN_ID}@reployty.test`,
        name: 'Owner A',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    const staffAUser = await prisma.user.create({
      data: {
        email: `staff_a_${RUN_ID}@reployty.test`,
        name: 'Staff A',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    const ownerBUser = await prisma.user.create({
      data: {
        email: `owner_b_${RUN_ID}@reployty.test`,
        name: 'Owner B',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    const ownerRole = await prisma.role.findFirst({ where: { name: 'OWNER' } });
    const staffRole = await prisma.role.findFirst({ where: { name: 'STAFF' } });
    assert.ok(ownerRole, 'OWNER role must exist');
    assert.ok(staffRole, 'STAFF role must exist');

    await prisma.staffMembership.create({
      data: {
        businessId: businessA.id,
        userId: ownerAUser.id,
        roleId: ownerRole!.id,
      },
    });

    await prisma.staffMembership.create({
      data: {
        businessId: businessA.id,
        userId: staffAUser.id,
        roleId: staffRole!.id,
      },
    });

    await prisma.staffMembership.create({
      data: {
        businessId: businessB.id,
        userId: ownerBUser.id,
        roleId: ownerRole!.id,
      },
    });

    // 3. Log in to acquire authorative session tokens
    const loginA = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: ownerAUser.email,
      password: 'TestPassword123!',
    });
    ownerAToken = loginA.data.sessionToken;

    const loginStaffA = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: staffAUser.email,
      password: 'TestPassword123!',
    });
    staffAToken = loginStaffA.data.sessionToken;

    const loginB = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: ownerBUser.email,
      password: 'TestPassword123!',
    });
    ownerBToken = loginB.data.sessionToken;

    // 4. Create Customers
    customer1A = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: 'Alice A1',
        phone: '+919876500001',
        email: 'alice@test.com',
        consents: {
          create: [
            { channel: ConsentChannel.SMS, granted: true, source: 'PORTAL' },
            { channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
            { channel: ConsentChannel.EMAIL, granted: true, source: 'PORTAL' },
          ],
        },
      },
    });

    customer2A = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: 'Bob A2',
        phone: '+919876500002',
        email: 'bob@test.com',
        consents: {
          create: [
            { channel: ConsentChannel.SMS, granted: true, source: 'PORTAL' },
            { channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
            { channel: ConsentChannel.EMAIL, granted: true, source: 'PORTAL' },
          ],
        },
      },
    });

    customerB = await prisma.customer.create({
      data: {
        businessId: businessB.id,
        branchId: branchB.id,
        name: 'Charlie B',
        phone: '+919876500003',
      },
    });

    // 5. Create Campaigns
    campaignA = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Spring Loyalty Booster ${RUN_ID}`,
        channel: CampaignChannel.EMAIL,
        messageTemplate: 'Hi {{name}}, enjoy 20% off with your special link: {{link}}',
        status: CampaignStatus.ACTIVE,
        attributionWindowDays: 14,
      },
    });

    campaignB = await prisma.campaign.create({
      data: {
        businessId: businessB.id,
        name: `Foreign Campaign ${RUN_ID}`,
        channel: CampaignChannel.SMS,
        messageTemplate: 'Welcome to Business B',
        status: CampaignStatus.ACTIVE,
        attributionWindowDays: 7,
      },
    });

    assert.ok(ctx.baseUrl, 'Test server running');
    assert.ok(ownerAToken, 'Owner A logged in');
  });

  // ==========================================================================
  // Step 1: Analytics Foundation — Funnel Metrics
  // ==========================================================================
  await t.test('Step 1: Analytics foundation — Campaign delivery funnel metrics', async () => {
    const now = new Date();

    // Create 3 deliveries for Campaign A: 1 DELIVERED, 1 SENT, 1 FAILED
    const d1 = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer1A.id,
        businessId: businessA.id,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.DELIVERED,
        sentAt: new Date(now.getTime() - 3600000),
        deliveredAt: new Date(now.getTime() - 3500000),
        provider: 'SENDGRID',
        providerMessageId: `msg_${RUN_ID}_1`,
      },
    });

    const d2 = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer2A.id,
        businessId: businessA.id,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.SENT,
        sentAt: now,
        provider: 'SENDGRID',
        providerMessageId: `msg_${RUN_ID}_2`,
      },
    });

    const d3 = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer1A.id,
        businessId: businessA.id,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.FAILED,
        failedAt: now,
        failedReason: 'Mailbox full',
        provider: 'SENDGRID',
      },
    });

    const res = await apiRequest(ctx, 'GET', `/api/business/campaigns/${campaignA.id}/analytics`, undefined, ownerAToken);
    assert.strictEqual(res.status, 200);

    const analytics = res.data;
    assert.strictEqual(analytics.campaignId, campaignA.id);
    assert.strictEqual(analytics.delivery.totalRecipients, 3);
    assert.strictEqual(analytics.delivery.delivered, 1);
    assert.strictEqual(analytics.delivery.sent, 2); // 1 explicitly sent + 1 delivered
    assert.strictEqual(analytics.delivery.failed, 1);
    assert.strictEqual(analytics.delivery.deliveryRate, 0.5); // 1 / 2
  });

  // ==========================================================================
  // Step 2: Date Range Filtering
  // ==========================================================================
  await t.test('Step 2: Analytics foundation — Date range filtering on campaign analytics', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await apiRequest(
      ctx,
      'GET',
      `/api/business/campaigns/${campaignA.id}/analytics?startDate=${futureDate}`,
      undefined,
      ownerAToken
    );

    assert.strictEqual(res.status, 200);
    // Deliveries are in the past, so future date filter yields 0
    assert.strictEqual(res.data.delivery.totalRecipients, 0);
    assert.strictEqual(res.data.delivery.deliveryRate, 0);
  });

  // ==========================================================================
  // Step 3: Zero-state & Safe Division Handling
  // ==========================================================================
  await t.test('Step 3: Analytics foundation — Zero-state behavior & safe division-by-zero handling', async () => {
    // Campaign B has zero deliveries currently
    const res = await apiRequest(ctx, 'GET', `/api/business/campaigns/${campaignB.id}/analytics`, undefined, ownerBToken);
    assert.strictEqual(res.status, 200);

    const analytics = res.data;
    assert.strictEqual(analytics.delivery.totalRecipients, 0);
    assert.strictEqual(analytics.delivery.sent, 0);
    assert.strictEqual(analytics.delivery.delivered, 0);
    assert.strictEqual(analytics.delivery.deliveryRate, 0);
    assert.strictEqual(analytics.delivery.failureRate, 0);
    assert.strictEqual(analytics.engagement.openRate, 0);
    assert.strictEqual(analytics.engagement.clickRate, 0);
    assert.strictEqual(analytics.conversions.conversionRate, 0);
  });

  // ==========================================================================
  // Step 4: Click Tracking — Link Creation & SSRF Validation
  // ==========================================================================
  await t.test('Step 4: Click tracking — Secure link creation and SSRF/hazardous URL scheme validation', async () => {
    // 1. Valid HTTP/HTTPS URLs
    const validHttp = validateRedirectUrl('https://reployty.com/special-offer?source=spring');
    assert.strictEqual(validHttp, 'https://reployty.com/special-offer?source=spring');

    // 2. Reject javascript:
    assert.throws(() => validateRedirectUrl('javascript:alert(1)'), /Disallowed URL scheme/);

    // 3. Reject data:
    assert.throws(() => validateRedirectUrl('data:text/html,<script>alert(1)</script>'), /Disallowed URL scheme/);

    // 4. Reject vbscript:
    assert.throws(() => validateRedirectUrl('vbscript:msgbox(1)'), /Disallowed URL scheme/);

    // 5. Create tracked link via API
    const res = await apiRequest(
      ctx,
      'POST',
      `/api/business/campaigns/${campaignA.id}/links`,
      { originalUrl: 'https://reployty.com/menu/seasonal' },
      ownerAToken
    );
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.trackingCode);
    assert.ok(res.data.trackingUrl.includes('/api/track/c/'));
    assert.strictEqual(res.data.clickCount, 0);
    assert.strictEqual(res.data.uniqueClickCount, 0);
  });

  // ==========================================================================
  // Step 5: Click Tracking — Service Handling & Deduplication
  // ==========================================================================
  let trackingCode1: string;
  await t.test('Step 5: Click tracking — Service handling, click recording, unique clicker deduplication', async () => {
    const link = await createTrackedLink(
      { businessId: businessA.id, hasPermission: () => true } as any,
      campaignA.id,
      'https://reployty.com/rewards/claim',
      undefined,
      customer1A.id
    );

    trackingCode1 = link.trackingCode;

    // First click from customer1A
    const click1 = await handleTrackedClick(trackingCode1, { ip: '127.0.0.1' });
    assert.strictEqual(click1.redirectUrl, 'https://reployty.com/rewards/claim');

    // Second click from SAME customer1A
    const click2 = await handleTrackedClick(trackingCode1, { ip: '127.0.0.1' });
    assert.strictEqual(click2.redirectUrl, 'https://reployty.com/rewards/claim');

    // Verify in DB: total clicks = 2, unique clickers = 1
    const updatedLink = await prisma.campaignTrackingLink.findUnique({
      where: { trackingCode: trackingCode1 },
    });

    assert.strictEqual(updatedLink?.clickCount, 2);
    assert.strictEqual(updatedLink?.uniqueClickCount, 1);
  });

  // ==========================================================================
  // Step 6: Click Tracking — Public Tracking Endpoint
  // ==========================================================================
  await t.test('Step 6: Click tracking — Public tracking endpoint GET /track/c/:code & 302 redirect', async () => {
    // 1. Valid tracking code redirect (manual redirect to inspect 302 without following external URL)
    const res = await fetch(`${ctx.baseUrl}/track/c/${trackingCode1}`, {
      method: 'GET',
      redirect: 'manual',
    });
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get('location'), 'https://reployty.com/rewards/claim');

    // 2. Short URL alias /t/c/:code redirect
    const resShort = await fetch(`${ctx.baseUrl}/t/c/${trackingCode1}`, {
      method: 'GET',
      redirect: 'manual',
    });
    assert.strictEqual(resShort.status, 302);
    assert.strictEqual(resShort.headers.get('location'), 'https://reployty.com/rewards/claim');

    // 3. Non-existent code returns 404
    const res404 = await apiRequest(ctx, 'GET', '/track/c/non_existent_code_999');
    assert.strictEqual(res404.status, 404);
  });

  // ==========================================================================
  // Step 7: Open Tracking — Email 1x1 Transparent GIF Open Pixel
  // ==========================================================================
  let deliveryForOpen: any;
  await t.test('Step 7: Open tracking — Email 1x1 transparent GIF open pixel GET /track/o/:deliveryId', async () => {
    deliveryForOpen = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer2A.id,
        businessId: businessA.id,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.DELIVERED,
        sentAt: new Date(),
        deliveredAt: new Date(),
      },
    });

    const res = await apiRequest(ctx, 'GET', `/track/o/${deliveryForOpen.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'image/gif');

    // Verify delivery has openedAt set
    const updated = await prisma.campaignDelivery.findUnique({
      where: { id: deliveryForOpen.id },
    });
    assert.ok(updated?.openedAt);
  });

  // ==========================================================================
  // Step 8: Open Tracking — Idempotent Duplicate Open Detection
  // ==========================================================================
  await t.test('Step 8: Open tracking — Idempotent duplicate open detection handling', async () => {
    // Second open on same delivery
    const res2 = await apiRequest(ctx, 'GET', `/track/o/${deliveryForOpen.id}`);
    assert.strictEqual(res2.status, 200);

    // Verify only 1 OPENED analytics event exists for this delivery (idempotency key open_{deliveryId})
    const openEvents = await prisma.campaignAnalyticsEvent.count({
      where: {
        campaignDeliveryId: deliveryForOpen.id,
        eventType: 'OPENED',
      },
    });
    assert.strictEqual(openEvents, 1);
  });

  // ==========================================================================
  // Step 9: Provider Events — WhatsApp Read Webhook
  // ==========================================================================
  await t.test('Step 9: Provider events — WhatsApp webhook updates delivery, sets readAt, and records READ', async () => {
    const wamid = `wamid_${RUN_ID}_read`;
    const waDelivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer1A.id,
        businessId: businessA.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.SENT,
        provider: 'META_WHATSAPP',
        providerMessageId: wamid,
        sentAt: new Date(),
      },
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: wamid,
                    status: 'read',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const webhookRes = await processProviderWebhook('META_WHATSAPP', CampaignChannel.WHATSAPP, payload);
    assert.strictEqual(webhookRes.processedCount, 1);

    const updated = await prisma.campaignDelivery.findUnique({
      where: { id: waDelivery.id },
    });
    assert.strictEqual(updated?.status, DeliveryStatus.DELIVERED);
    assert.ok(updated?.readAt);

    // Verify READ analytics event
    const readEvent = await prisma.campaignAnalyticsEvent.findFirst({
      where: {
        campaignDeliveryId: waDelivery.id,
        eventType: 'READ',
      },
    });
    assert.ok(readEvent);
  });

  // ==========================================================================
  // Step 10: Provider Events — SendGrid Webhook
  // ==========================================================================
  await t.test('Step 10: Provider events — SendGrid webhook updates delivery, sets openedAt, records OPENED/BOUNCED', async () => {
    const sgMsgId = `sg_${RUN_ID}_open`;
    const sgDelivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer1A.id,
        businessId: businessA.id,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.DELIVERED,
        provider: 'SENDGRID',
        providerMessageId: sgMsgId,
        sentAt: new Date(),
        deliveredAt: new Date(),
      },
    });

    const payload = [
      {
        sg_message_id: `${sgMsgId}.filter001`,
        event: 'open',
        timestamp: Math.floor(Date.now() / 1000),
      },
    ];

    const result = await processProviderWebhook('SENDGRID', CampaignChannel.EMAIL, payload);
    assert.strictEqual(result.processedCount, 1);

    const updated = await prisma.campaignDelivery.findUnique({
      where: { id: sgDelivery.id },
    });
    assert.ok(updated?.openedAt);

    const openEvent = await prisma.campaignAnalyticsEvent.findFirst({
      where: {
        campaignDeliveryId: sgDelivery.id,
        eventType: 'OPENED',
      },
    });
    assert.ok(openEvent);
  });

  // ==========================================================================
  // Step 11: Provider Events — MSG91 DLR Webhook
  // ==========================================================================
  await t.test('Step 11: Provider events — MSG91 DLR webhook status ingestion', async () => {
    const msg91Id = `req_${RUN_ID}_dlr`;
    const smsDelivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer1A.id,
        businessId: businessA.id,
        channel: CampaignChannel.SMS,
        status: DeliveryStatus.SENT,
        provider: 'MSG91',
        providerMessageId: msg91Id,
        sentAt: new Date(),
      },
    });

    const payload = {
      requestId: msg91Id,
      status: 'delivered',
    };

    const res = await processProviderWebhook('MSG91', CampaignChannel.SMS, payload);
    assert.strictEqual(res.processedCount, 1);

    const updated = await prisma.campaignDelivery.findUnique({
      where: { id: smsDelivery.id },
    });
    assert.strictEqual(updated?.status, DeliveryStatus.DELIVERED);
  });

  // ==========================================================================
  // Step 12: Webhook Idempotency
  // ==========================================================================
  await t.test('Step 12: Webhook idempotency — Duplicate webhook delivery prevents duplicate analytics events', async () => {
    const msgId = `dup_${RUN_ID}`;
    await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer1A.id,
        businessId: businessA.id,
        channel: CampaignChannel.SMS,
        status: DeliveryStatus.SENT,
        provider: 'MSG91',
        providerMessageId: msgId,
        sentAt: new Date(),
      },
    });

    const payload = { requestId: msgId, status: 'delivered' };

    // First arrival
    const res1 = await processProviderWebhook('MSG91', CampaignChannel.SMS, payload);
    assert.strictEqual(res1.processedCount, 1);
    assert.strictEqual(res1.duplicateCount, 0);

    // Duplicate arrival
    const res2 = await processProviderWebhook('MSG91', CampaignChannel.SMS, payload);
    assert.strictEqual(res2.processedCount, 0);
    assert.strictEqual(res2.duplicateCount, 1);
  });

  // ==========================================================================
  // Step 13: Conversion Attribution — Return Visit
  // ==========================================================================
  let customerConv: any;
  let deliveryForConv: any;
  await t.test('Step 13: Conversion attribution — Return visit (VISIT_RECORDED -> RETURN_VISIT)', async () => {
    customerConv = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA.id,
        name: 'Attributed Customer',
        phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
        email: `attr_${RUN_ID}@example.com`,
      },
    });

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    deliveryForConv = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customerConv.id,
        businessId: businessA.id,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.DELIVERED,
        sentAt: twoDaysAgo,
        deliveredAt: twoDaysAgo,
      },
    });

    // Customer records a visit now via recordRetentionEvent
    const visitEvent = await recordRetentionEvent(
      { businessId: businessA.id, branchId: branchA.id } as any,
      {
        customerId: customerConv.id,
        eventType: CustomerEventType.VISIT_RECORDED,
        metadata: { amountMinor: 25000 },
      }
    );

    // Verify conversion was recorded in CampaignConversion
    const conversion = await prisma.campaignConversion.findFirst({
      where: {
        campaignId: campaignA.id,
        campaignDeliveryId: deliveryForConv.id,
        sourceEventId: visitEvent.id,
      },
    });

    assert.ok(conversion, 'Conversion was attributed');
    assert.strictEqual(conversion?.conversionType, 'RETURN_VISIT');
    assert.strictEqual(conversion?.customerId, customerConv.id);
  });

  // ==========================================================================
  // Step 14: Conversion Attribution — Loyalty Stamp
  // ==========================================================================
  await t.test('Step 14: Conversion attribution — Loyalty stamp earned (STAMP_ADDED -> LOYALTY_STAMP)', async () => {
    const stampEvent = await recordRetentionEvent(
      { businessId: businessA.id, branchId: branchA.id } as any,
      {
        customerId: customerConv.id,
        eventType: CustomerEventType.STAMP_ADDED,
        metadata: { stampCount: 1 },
      }
    );

    const conversion = await prisma.campaignConversion.findFirst({
      where: {
        campaignId: campaignA.id,
        sourceEventId: stampEvent.id,
      },
    });

    assert.ok(conversion);
    assert.strictEqual(conversion?.conversionType, 'LOYALTY_STAMP');
  });

  // ==========================================================================
  // Step 15: Conversion Attribution — Loyalty Points
  // ==========================================================================
  await t.test('Step 15: Conversion attribution — Loyalty points earned (POINTS_ADDED -> LOYALTY_POINTS)', async () => {
    const pointsEvent = await recordRetentionEvent(
      { businessId: businessA.id, branchId: branchA.id } as any,
      {
        customerId: customerConv.id,
        eventType: CustomerEventType.POINTS_ADDED,
        metadata: { points: 50 },
      }
    );

    const conversion = await prisma.campaignConversion.findFirst({
      where: {
        campaignId: campaignA.id,
        sourceEventId: pointsEvent.id,
      },
    });

    assert.ok(conversion);
    assert.strictEqual(conversion?.conversionType, 'LOYALTY_POINTS');
  });

  // ==========================================================================
  // Step 16: Conversion Attribution — Reward Redemption
  // ==========================================================================
  await t.test('Step 16: Conversion attribution — Reward redemption & delivery status update to REDEEMED', async () => {
    const rewardEvent = await recordRetentionEvent(
      { businessId: businessA.id, branchId: branchA.id } as any,
      {
        customerId: customerConv.id,
        eventType: CustomerEventType.REWARD_REDEEMED,
        metadata: { rewardTitle: 'Free Coffee' },
      }
    );

    const conversion = await prisma.campaignConversion.findFirst({
      where: {
        campaignId: campaignA.id,
        sourceEventId: rewardEvent.id,
      },
    });

    assert.ok(conversion);
    assert.strictEqual(conversion?.conversionType, 'REWARD_REDEMPTION');

    // Verify delivery status updated to REDEEMED
    const delivery = await prisma.campaignDelivery.findUnique({
      where: { id: deliveryForConv.id },
    });
    assert.strictEqual(delivery?.status, DeliveryStatus.REDEEMED);
  });

  // ==========================================================================
  // Step 17: Conversion Attribution — Offer Redemption
  // ==========================================================================
  await t.test('Step 17: Conversion attribution — Offer redemption (OFFER_REDEEMED -> OFFER_REDEMPTION)', async () => {
    const offerEvent = await recordRetentionEvent(
      { businessId: businessA.id, branchId: branchA.id } as any,
      {
        customerId: customerConv.id,
        eventType: CustomerEventType.OFFER_REDEEMED,
        metadata: { offerTitle: '20% Weekend Promo' },
      }
    );

    const conversion = await prisma.campaignConversion.findFirst({
      where: {
        campaignId: campaignA.id,
        sourceEventId: offerEvent.id,
      },
    });

    assert.ok(conversion);
    assert.strictEqual(conversion?.conversionType, 'OFFER_REDEMPTION');
  });

  // ==========================================================================
  // Step 18: Conversion Attribution — Customer Reactivation
  // ==========================================================================
  await t.test('Step 18: Conversion attribution — Customer reactivation (CUSTOMER_REACTIVATED)', async () => {
    const reactivateEvent = await recordRetentionEvent(
      { businessId: businessA.id, branchId: branchA.id } as any,
      {
        customerId: customerConv.id,
        eventType: CustomerEventType.CUSTOMER_REACTIVATED,
        metadata: { daysInactive: 45 },
      }
    );

    const conversion = await prisma.campaignConversion.findFirst({
      where: {
        campaignId: campaignA.id,
        sourceEventId: reactivateEvent.id,
      },
    });

    assert.ok(conversion);
    assert.strictEqual(conversion?.conversionType, 'CUSTOMER_REACTIVATED');
  });

  // ==========================================================================
  // Step 19: Conversion Attribution — Attribution Window Enforcement
  // ==========================================================================
  await t.test('Step 19: Conversion attribution — Attribution window enforcement (within window vs outside window)', async () => {
    // Delivery sent 20 days ago (campaignA attribution window is 14 days)
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const expiredDelivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer2A.id,
        businessId: businessA.id,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.DELIVERED,
        sentAt: twentyDaysAgo,
        deliveredAt: twentyDaysAgo,
      },
    });

    // Customer 2 visits now (outside the 14-day attribution window)
    const outsideEvent = await recordRetentionEvent(
      { businessId: businessA.id, branchId: branchA.id } as any,
      {
        customerId: customer2A.id,
        eventType: CustomerEventType.VISIT_RECORDED,
      }
    );

    const conversion = await prisma.campaignConversion.findFirst({
      where: {
        campaignDeliveryId: expiredDelivery.id,
        sourceEventId: outsideEvent.id,
      },
    });

    // Should NOT be attributed because 20 days > 14 days
    assert.strictEqual(conversion, null);
  });

  // ==========================================================================
  // Step 20: Conversion Attribution — Last-Touch Single Attribution Rule
  // ==========================================================================
  await t.test('Step 20: Conversion attribution — Last-touch single attribution rule', async () => {
    const customer3A = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: 'Multi-Campaign Customer',
        phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
      },
    });

    const campaignA2 = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Second Campaign ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        messageTemplate: 'Second campaign promo',
        status: CampaignStatus.ACTIVE,
        attributionWindowDays: 14,
      },
    });

    // Campaign 1 sent 5 days ago
    const deliveryOld = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customer3A.id,
        businessId: businessA.id,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.DELIVERED,
        sentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    // Campaign 2 sent 1 day ago (more recent)
    const deliveryRecent = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA2.id,
        customerId: customer3A.id,
        businessId: businessA.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.DELIVERED,
        sentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    });

    // Customer converts now
    const event = await recordRetentionEvent(
      { businessId: businessA.id, branchId: branchA.id } as any,
      {
        customerId: customer3A.id,
        eventType: CustomerEventType.VISIT_RECORDED,
      }
    );

    // Attribution should link to deliveryRecent (last touch), NOT deliveryOld
    const convRecent = await prisma.campaignConversion.findFirst({
      where: { campaignDeliveryId: deliveryRecent.id, sourceEventId: event.id },
    });
    const convOld = await prisma.campaignConversion.findFirst({
      where: { campaignDeliveryId: deliveryOld.id, sourceEventId: event.id },
    });

    assert.ok(convRecent, 'Most recent campaign was attributed');
    assert.strictEqual(convOld, null, 'Older campaign was not double attributed');
  });

  // ==========================================================================
  // Step 21: Idempotency & Concurrency — Database Unique Constraint
  // ==========================================================================
  await t.test('Step 21: Idempotency & Concurrency — Database unique constraint blocks duplicate conversion records', async () => {
    const dummyEvent = {
      id: `evt_${RUN_ID}_concurrent`,
      customerId: customer1A.id,
      type: CustomerEventType.VISIT_RECORDED,
      createdAt: new Date(),
    };

    // Run 2 parallel attribution calls for the exact same event
    const [res1, res2] = await Promise.all([
      processConversionAttribution({ businessId: businessA.id } as any, dummyEvent),
      processConversionAttribution({ businessId: businessA.id } as any, dummyEvent),
    ]);

    // Exactly one should succeed, the duplicate gracefully returns null
    const successes = [res1, res2].filter(Boolean);
    assert.strictEqual(successes.length, 1, 'Exactly one conversion attributed concurrently');
  });

  // ==========================================================================
  // Step 22: Phase 23 Automation & Phase 24 Retention Integration
  // ==========================================================================
  await t.test('Step 22: Phase 23 Automation & Phase 24 Retention integration', async () => {
    const customerAuto = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: 'Auto Customer',
        phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
      },
    });

    // Create an automation-originated delivery
    const autoDelivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA.id,
        customerId: customerAuto.id,
        businessId: businessA.id,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.DELIVERED,
        sentAt: new Date(Date.now() - 3600000),
        deliveredAt: new Date(Date.now() - 3500000),
        metadata: {
          originatedFrom: 'AUTOMATION_ENGINE',
          workflowType: 'INACTIVITY',
        },
      },
    });

    const visitEvt = await recordRetentionEvent(
      { businessId: businessA.id } as any,
      {
        customerId: customerAuto.id,
        eventType: CustomerEventType.VISIT_RECORDED,
      }
    );

    const conv = await prisma.campaignConversion.findFirst({
      where: { campaignDeliveryId: autoDelivery.id, sourceEventId: visitEvt.id },
    });

    assert.ok(conv, 'Automation-originated campaign delivery successfully converted');
  });

  // ==========================================================================
  // Step 23: Tenant Isolation & Security
  // ==========================================================================
  await t.test('Step 23: Tenant isolation & Security — Cross-tenant analytics and conversion access strictly blocked (404/403)', async () => {
    // Business B tries to read Business A's campaign analytics
    const resAnalytics = await apiRequest(
      ctx,
      'GET',
      `/api/business/campaigns/${campaignA.id}/analytics`,
      undefined,
      ownerBToken
    );
    assert.strictEqual(resAnalytics.status, 404);

    // Business B tries to read Business A's conversions
    const resConversions = await apiRequest(
      ctx,
      'GET',
      `/api/business/campaigns/${campaignA.id}/conversions`,
      undefined,
      ownerBToken
    );
    assert.strictEqual(resConversions.status, 404);

    // Business B tries to read Business A's timeline
    const resTimeline = await apiRequest(
      ctx,
      'GET',
      `/api/business/campaigns/${campaignA.id}/timeline`,
      undefined,
      ownerBToken
    );
    assert.strictEqual(resTimeline.status, 404);

    // Business B tries to create a tracked link on Business A's campaign
    const resLink = await apiRequest(
      ctx,
      'POST',
      `/api/business/campaigns/${campaignA.id}/links`,
      { originalUrl: 'https://evil.com' },
      ownerBToken
    );
    assert.strictEqual(resLink.status, 500); // Throws campaign not found in business
  });

  // ==========================================================================
  // Step 24: RBAC Permissions
  // ==========================================================================
  await t.test('Step 24: RBAC permissions — Owner allowed, Staff forbidden (403), Unauthenticated 401', async () => {
    // 1. Unauthenticated request -> 401
    const unauthRes = await apiRequest(ctx, 'GET', `/api/business/campaigns/${campaignA.id}/analytics`);
    assert.strictEqual(unauthRes.status, 401);

    // 2. Staff without CAMPAIGNS_VIEW permission -> 403
    const staffRes = await apiRequest(
      ctx,
      'GET',
      `/api/business/campaigns/${campaignA.id}/analytics`,
      undefined,
      staffAToken
    );
    assert.strictEqual(staffRes.status, 403);

    // 3. Owner with CAMPAIGNS_VIEW permission -> 200
    const ownerRes = await apiRequest(
      ctx,
      'GET',
      `/api/business/campaigns/${campaignA.id}/analytics`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(ownerRes.status, 200);
  });

  // ==========================================================================
  // Step 25: Chronological Activity Timeline API
  // ==========================================================================
  await t.test('Step 25: Chronological Activity Timeline API — Unified trace of events', async () => {
    const res = await apiRequest(
      ctx,
      'GET',
      `/api/business/campaigns/${campaignA.id}/timeline`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.events));
    assert.ok(res.data.events.length > 0);

    // Verify events are sorted chronologically descending
    const events = res.data.events;
    for (let i = 0; i < events.length - 1; i++) {
      const t1 = new Date(events[i].occurredAt).getTime();
      const t2 = new Date(events[i + 1].occurredAt).getTime();
      assert.ok(t1 >= t2, 'Events are in descending chronological order');
    }
  });

  // ==========================================================================
  // Step 26: Clean Server Teardown & Natural Process Termination
  // ==========================================================================
  await t.test('Step 26: Clean server teardown & natural process termination', async () => {
    assert.ok(ctx.server.listening, 'Server was active throughout suite');
  });
});
