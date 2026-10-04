/**
 * REPLOYTY PHASE 20 — V2 RETENTION ARCHITECTURE & CAMPAIGN FOUNDATION
 * COMPREHENSIVE TEST SUITE
 * 
 * Tests:
 * 1. Campaign CRUD & Lifecycle Transitions
 * 2. Multi-Tenant Isolation (Cross-tenant discovery prevention)
 * 3. Branch Isolation & Branch Scoping
 * 4. RBAC (Owner vs Manager vs Staff vs Unauthenticated)
 * 5. Audience Resolution & Cross-Tenant Boundary Protection
 * 6. Consent-Gating (Channel & Marketing Consent Filtering)
 * 7. Frequency & Contact Cooldown Safety
 * 8. Execution Idempotency & Duplicate Suppression
 * 9. Audit Logging & State Tracking
 * 10. Retention Events Timeline Querying
 * 11. Input Validation & Error Safety
 */

import test from 'node:test';
import assert from 'node:assert';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword } from '../../src/server/auth/sessionService';
import {
  AudienceType,
  BusinessCategory,
  CampaignChannel,
  CampaignStatus,
  CampaignType,
  ConsentChannel,
  CustomerEventType,
  UserStatus,
} from '@prisma/client';

const RUN_ID = `p20_${Date.now().toString(36)}`;

test('PHASE 20: RETENTION ARCHITECTURE & CAMPAIGN FOUNDATION TEST SUITE', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;

  // Primary Tenant: Artisan Roast Roastery
  let businessA: any;
  let branchA1: any;
  let branchA2: any;
  let ownerAToken: string;
  let managerAToken: string;
  let staffAToken: string;

  // Secondary Tenant: Island Bistro (Isolation Test)
  let businessB: any;
  let branchB1: any;
  let ownerBToken: string;

  // Customers in Business A
  let customerA1Consented: any;
  let customerA2NoConsent: any;

  // Customer in Business B
  let customerB1Consented: any;

  // Created Campaign IDs
  let campaignA1Id: string;
  let campaignB1Id: string;

  await t.test('Setup: Provision Multi-Tenant Test Fixtures and Sessions', async () => {
    ctx = await startTestServer();

    // 1. Roles lookup
    const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });
    const managerRole = await prisma.role.findFirstOrThrow({ where: { name: 'MANAGER' } });
    const staffRole = await prisma.role.findFirstOrThrow({ where: { name: 'STAFF' } });
    const growthPlan = await prisma.plan.findFirstOrThrow({ where: { slug: 'growth' } });

    const passwordHash = await hashPassword('TestP20!Pass123');

    // 2. Business A
    businessA = await prisma.business.create({
      data: {
        name: `Artisan Roastery ${RUN_ID}`,
        slug: `artisan-roast-${RUN_ID}`,
        category: BusinessCategory.CAFE,
        email: `owner.a.${RUN_ID}@reployty.staging`,
        status: 'ACTIVE',
        subscription: {
          create: {
            planId: growthPlan.id,
            status: 'ACTIVE',
            billingInterval: 'MONTHLY',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
          },
        },
      },
    });

    branchA1 = await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: `Bandra Flagship ${RUN_ID}`,
        code: `BANDRA-${RUN_ID.slice(0, 4)}`,
        status: 'ACTIVE',
        isMainBranch: true,
      },
    });

    branchA2 = await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: `Juhu Roastery ${RUN_ID}`,
        code: `JUHU-${RUN_ID.slice(0, 4)}`,
        status: 'ACTIVE',
      },
    });

    // Users in Business A
    const userOwnerA = await prisma.user.create({
      data: {
        email: `owner_a_${RUN_ID}@staging.reployty.com`,
        name: 'Owner A',
        passwordHash,
        status: UserStatus.ACTIVE,
        memberships: {
          create: {
            businessId: businessA.id,
            roleId: ownerRole.id,
            status: 'ACTIVE',
          },
        },
      },
    });

    const userManagerA = await prisma.user.create({
      data: {
        email: `manager_a_${RUN_ID}@staging.reployty.com`,
        name: 'Manager A',
        passwordHash,
        status: UserStatus.ACTIVE,
        memberships: {
          create: {
            businessId: businessA.id,
            roleId: managerRole.id,
            status: 'ACTIVE',
          },
        },
      },
    });

    const userStaffA = await prisma.user.create({
      data: {
        email: `staff_a_${RUN_ID}@staging.reployty.com`,
        name: 'Staff A (Barista)',
        passwordHash,
        status: UserStatus.ACTIVE,
        memberships: {
          create: {
            businessId: businessA.id,
            branchId: branchA1.id,
            roleId: staffRole.id,
            status: 'ACTIVE',
          },
        },
      },
    });

    // 3. Business B
    businessB = await prisma.business.create({
      data: {
        name: `Island Bistro ${RUN_ID}`,
        slug: `island-bistro-${RUN_ID}`,
        category: BusinessCategory.RESTAURANT,
        email: `owner.b.${RUN_ID}@reployty.staging`,
        status: 'ACTIVE',
        subscription: {
          create: {
            planId: growthPlan.id,
            status: 'ACTIVE',
            billingInterval: 'MONTHLY',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
          },
        },
      },
    });

    branchB1 = await prisma.branch.create({
      data: {
        businessId: businessB.id,
        name: `Colaba Waterfront ${RUN_ID}`,
        code: `COLABA-${RUN_ID.slice(0, 4)}`,
        status: 'ACTIVE',
      },
    });

    const userOwnerB = await prisma.user.create({
      data: {
        email: `owner_b_${RUN_ID}@staging.reployty.com`,
        name: 'Owner B',
        passwordHash,
        status: UserStatus.ACTIVE,
        memberships: {
          create: {
            businessId: businessB.id,
            roleId: ownerRole.id,
            status: 'ACTIVE',
          },
        },
      },
    });

    // Create session tokens
    const sOwnerA = await prisma.session.create({
      data: {
        sessionToken: `token_owner_a_${RUN_ID}`,
        userId: userOwnerA.id,
        businessId: businessA.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    ownerAToken = sOwnerA.sessionToken;

    const sManagerA = await prisma.session.create({
      data: {
        sessionToken: `token_mgr_a_${RUN_ID}`,
        userId: userManagerA.id,
        businessId: businessA.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    managerAToken = sManagerA.sessionToken;

    const sStaffA = await prisma.session.create({
      data: {
        sessionToken: `token_staff_a_${RUN_ID}`,
        userId: userStaffA.id,
        businessId: businessA.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    staffAToken = sStaffA.sessionToken;

    const sOwnerB = await prisma.session.create({
      data: {
        sessionToken: `token_owner_b_${RUN_ID}`,
        userId: userOwnerB.id,
        businessId: businessB.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    ownerBToken = sOwnerB.sessionToken;

    // 4. Customers in Business A
    customerA1Consented = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Aarav Consented',
        phone: `+9198000${Math.floor(10000 + Math.random() * 90000)}`,
        marketingConsent: true,
        consents: {
          create: {
            channel: ConsentChannel.WHATSAPP,
            granted: true,
            source: 'PWA_ONBOARDING',
          },
        },
      },
    });

    customerA2NoConsent = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Meera NoConsent',
        phone: `+9198001${Math.floor(10000 + Math.random() * 90000)}`,
        marketingConsent: false,
      },
    });

    // Customer in Business B
    customerB1Consented = await prisma.customer.create({
      data: {
        businessId: businessB.id,
        branchId: branchB1.id,
        name: 'Kabir B',
        phone: `+9198002${Math.floor(10000 + Math.random() * 90000)}`,
        marketingConsent: true,
      },
    });
  });

  // 1. CAMPAIGN CRUD & LIFECYCLE
  await t.test('1. Campaign CRUD: Create, Read, Update, List, and Status Lifecycle', async () => {
    // 1a. Create Campaign in Business A
    const createRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Weekend Roast Tasting',
        description: 'Exclusive tasting session for specialty brew lovers',
        type: 'ONE_TIME',
        channel: 'WHATSAPP',
        audienceType: 'ALL_CUSTOMERS',
        branchId: branchA1.id,
        messageTemplate: 'Hi {{name}}, join us for an exclusive coffee tasting this Saturday!',
      },
    });

    assert.strictEqual(createRes.status, 201, 'Campaign creation should return HTTP 201');
    assert.strictEqual(createRes.body.name, 'Weekend Roast Tasting');
    assert.strictEqual(createRes.body.status, 'DRAFT');
    assert.strictEqual(createRes.body.channel, 'WHATSAPP');
    assert.strictEqual(createRes.body.businessId, businessA.id);
    campaignA1Id = createRes.body.id;

    // 1b. Read Campaign by ID
    const getRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignA1Id}`, {
      method: 'GET',
      token: ownerAToken,
    });
    assert.strictEqual(getRes.status, 200, 'Campaign fetch should return HTTP 200');
    assert.strictEqual(getRes.body.id, campaignA1Id);
    assert.strictEqual(getRes.body.branch.name, branchA1.name);

    // 1c. Update Campaign
    const updateRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignA1Id}`, {
      method: 'PATCH',
      token: ownerAToken,
      body: {
        name: 'Weekend Single-Origin Roast Tasting',
        description: 'Updated tasting session description',
      },
    });
    assert.strictEqual(updateRes.status, 200, 'Campaign update should return HTTP 200');
    assert.strictEqual(updateRes.body.name, 'Weekend Single-Origin Roast Tasting');

    // 1d. List Campaigns with filters
    const listRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns?status=DRAFT', {
      method: 'GET',
      token: ownerAToken,
    });
    assert.strictEqual(listRes.status, 200);
    assert.ok(listRes.body.campaigns.some((c: any) => c.id === campaignA1Id));

    // 1e. Controlled Status Transition: DRAFT -> ACTIVE
    const activateRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignA1Id}/status`, {
      method: 'POST',
      token: ownerAToken,
      body: { status: 'ACTIVE' },
    });
    assert.strictEqual(activateRes.status, 200);
    assert.strictEqual(activateRes.body.status, 'ACTIVE');

    // 1f. Controlled Status Transition: ACTIVE -> PAUSED -> ACTIVE
    const pauseRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignA1Id}/status`, {
      method: 'POST',
      token: ownerAToken,
      body: { status: 'PAUSED' },
    });
    assert.strictEqual(pauseRes.status, 200);
    assert.strictEqual(pauseRes.body.status, 'PAUSED');

    const resumeRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignA1Id}/status`, {
      method: 'POST',
      token: ownerAToken,
      body: { status: 'ACTIVE' },
    });
    assert.strictEqual(resumeRes.status, 200);
    assert.strictEqual(resumeRes.body.status, 'ACTIVE');

    // 1g. Invalid status transition: ACTIVE -> DRAFT (should fail)
    const invalidTransRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignA1Id}/status`, {
      method: 'POST',
      token: ownerAToken,
      body: { status: 'DRAFT' },
    });
    assert.strictEqual(invalidTransRes.status, 400, 'Invalid status transition must be rejected with 400');
  });

  // 2. TENANT ISOLATION
  await t.test('2. Multi-Tenant Isolation: Cross-tenant campaign access strictly denied', async () => {
    // 2a. Create Campaign in Business B
    const createBRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'POST',
      token: ownerBToken,
      body: {
        name: 'Island Bistro Seafood Night',
        channel: 'EMAIL',
        messageTemplate: 'Fresh catch from the bay this Friday!',
      },
    });
    assert.strictEqual(createBRes.status, 201);
    campaignB1Id = createBRes.body.id;

    // 2b. User A attempts to view Campaign B (Expect 404 for discovery prevention)
    const crossGetRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignB1Id}`, {
      method: 'GET',
      token: ownerAToken,
    });
    assert.strictEqual(crossGetRes.status, 404, 'Cross-tenant GET must return 404 Not Found');

    // 2c. User A attempts to update Campaign B (Expect 404)
    const crossPatchRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignB1Id}`, {
      method: 'PATCH',
      token: ownerAToken,
      body: { name: 'Hacked Name' },
    });
    assert.strictEqual(crossPatchRes.status, 404, 'Cross-tenant PATCH must return 404 Not Found');

    // 2d. User A attempts to change status on Campaign B (Expect 404)
    const crossStatusRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignB1Id}/status`, {
      method: 'POST',
      token: ownerAToken,
      body: { status: 'CANCELLED' },
    });
    assert.strictEqual(crossStatusRes.status, 404, 'Cross-tenant status change must return 404 Not Found');

    // 2e. User A attempts to simulate run on Campaign B (Expect 404)
    const crossRunRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignB1Id}/simulate-run`, {
      method: 'POST',
      token: ownerAToken,
      body: {},
    });
    assert.strictEqual(crossRunRes.status, 404, 'Cross-tenant execution must return 404 Not Found');

    // 2f. User B cannot see Campaign A in their list
    const listBRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'GET',
      token: ownerBToken,
    });
    assert.strictEqual(listBRes.status, 200);
    const hasA = listBRes.body.campaigns.some((c: any) => c.id === campaignA1Id);
    assert.strictEqual(hasA, false, 'Business B list must NEVER contain Business A campaigns');
  });

  // 3. BRANCH ISOLATION
  await t.test('3. Branch Isolation: Cannot associate campaign with another business branch', async () => {
    // Attempt to create a campaign in Business A with a branchId from Business B
    const branchSpoofRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Spoofed Branch Campaign',
        channel: 'SMS',
        branchId: branchB1.id, // Belongs to Business B!
        messageTemplate: 'Test message',
      },
    });

    assert.strictEqual(branchSpoofRes.status, 400, 'Cross-tenant branch association must be rejected');
  });

  // 4. RBAC ENFORCEMENT
  await t.test('4. RBAC: Role-based permissions enforced across all endpoints', async () => {
    // 4a. Manager A (has CAMPAIGNS_VIEW and CAMPAIGNS_MANAGE) -> Allowed
    const managerGetRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignA1Id}`, {
      method: 'GET',
      token: managerAToken,
    });
    assert.strictEqual(managerGetRes.status, 200, 'Manager with permissions must be allowed');

    // 4b. Staff A (Barista without CAMPAIGNS_VIEW / CAMPAIGNS_MANAGE) -> 403 Forbidden
    const staffGetRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignA1Id}`, {
      method: 'GET',
      token: staffAToken,
    });
    assert.strictEqual(staffGetRes.status, 403, 'Staff without CAMPAIGNS_VIEW must receive 403 Forbidden');

    const staffCreateRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'POST',
      token: staffAToken,
      body: {
        name: 'Staff Unauthorized Campaign',
        channel: 'SMS',
        messageTemplate: 'Staff template',
      },
    });
    assert.strictEqual(staffCreateRes.status, 403, 'Staff without CAMPAIGNS_MANAGE must receive 403 Forbidden');

    // 4c. Unauthenticated request -> 401 Unauthorized
    const unauthRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'GET',
    });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must receive 401 Unauthorized');
  });

  // 5. AUDIENCE RESOLUTION & CONSENT GATING
  await t.test('5. Audience & Consent Gating: Strict filtering of non-consenting customers', async () => {
    // Campaign A1 has channel WHATSAPP.
    // Customer A1 has marketingConsent=true and WHATSAPP consent record.
    // Customer A2 has marketingConsent=false and 0 consent records.
    // Customer B1 belongs to Business B.

    // Run simulation on Campaign A1
    const runRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignA1Id}/simulate-run`, {
      method: 'POST',
      token: ownerAToken,
      body: { simulateDelivery: true },
    });

    assert.strictEqual(runRes.status, 200, 'Simulation run must succeed');
    const result = runRes.body;

    // Verify Audience Breakdown:
    // Total candidates in Branch A1 = 2 (Aarav and Meera)
    // Eligible (with consent) = 1 (Aarav)
    // Suppressed (lacking consent) = 1 (Meera)
    // Business B customer = 0 (never even considered)
    assert.strictEqual(result.totalAudience, 2, 'Total audience in branch should be 2');
    assert.strictEqual(result.eligibleCount, 1, 'Only 1 customer has valid consent');
    assert.strictEqual(result.suppressedConsentCount, 1, '1 customer must be suppressed due to lack of consent');
    assert.strictEqual(result.deliveredCount, 1, '1 delivery should be recorded');

    // Verify in database: CampaignDelivery created ONLY for Customer A1!
    const deliveries = await prisma.campaignDelivery.findMany({
      where: { campaignId: campaignA1Id },
    });
    assert.strictEqual(deliveries.length, 1);
    assert.strictEqual(deliveries[0].customerId, customerA1Consented.id);
    assert.notStrictEqual(deliveries[0].customerId, customerA2NoConsent.id);
  });

  // 6. CONTACT COOLDOWN & IDEMPOTENCY
  await t.test('6. Contact Frequency Cooldown & Execution Idempotency', async () => {
    // Create an automated campaign in Business A targeting ALL_CUSTOMERS
    const camp2Res = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Weekly Roast Re-engagement Automation',
        type: 'AUTOMATED',
        channel: 'WHATSAPP',
        branchId: branchA1.id,
        messageTemplate: 'Weekly specialty roast update for you!',
        status: 'ACTIVE',
      },
    });
    assert.strictEqual(camp2Res.status, 201);
    const campaign2Id = camp2Res.body.id;

    // Immediately execute Campaign 2 with standard 24h cooldown
    // Customer A1 received a message from Campaign 1 minutes ago, so Customer A1 should be suppressed by cooldown!
    const runCamp2 = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaign2Id}/simulate-run`, {
      method: 'POST',
      token: ownerAToken,
      body: { cooldownHours: 24 },
    });
    assert.strictEqual(runCamp2.status, 200);
    assert.strictEqual(
      runCamp2.body.suppressedCooldownCount,
      1,
      'Customer A1 must be suppressed due to contact cooldown window'
    );
    assert.strictEqual(runCamp2.body.deliveredCount, 0, 'No deliveries should occur during cooldown');

    // Now test Idempotency on repeated run of Campaign 2 with cooldown bypassed (0 hours):
    // Run 1 of Campaign 2 without cooldown: customer receives delivery
    const run1WithoutCooldown = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaign2Id}/simulate-run`, {
      method: 'POST',
      token: ownerAToken,
      body: { cooldownHours: 0 },
    });
    assert.strictEqual(run1WithoutCooldown.status, 200);
    assert.strictEqual(run1WithoutCooldown.body.deliveredCount, 1, 'Delivery created on first run');

    // Run 2 of Campaign 2 on same day without cooldown: duplicate delivery must be skipped by idempotency
    const run2Repeat = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaign2Id}/simulate-run`, {
      method: 'POST',
      token: ownerAToken,
      body: { cooldownHours: 0 },
    });
    assert.strictEqual(run2Repeat.status, 200);
    assert.strictEqual(run2Repeat.body.skippedCount, 1, 'Delivery must be skipped by idempotency key');
    assert.strictEqual(run2Repeat.body.deliveredCount, 0, 'No duplicate deliveries created on repeat run');
  });

  // 7. RETENTION EVENTS & TIMELINE
  await t.test('7. Retention Event Ingestion and Timeline Querying', async () => {
    // 7a. Query retention events for Business A
    const eventsRes = await apiRequest(ctx.baseUrl, '/api/business/retention/events', {
      method: 'GET',
      token: ownerAToken,
    });
    assert.strictEqual(eventsRes.status, 200);
    assert.ok(eventsRes.body.total > 0, 'Should have recorded retention touchpoint events');

    const touchpoint = eventsRes.body.events.find(
      (e: any) => e.type === CustomerEventType.CAMPAIGN_TOUCHPOINT
    );
    assert.ok(touchpoint, 'CAMPAIGN_TOUCHPOINT event must exist in retention timeline');
    assert.strictEqual(touchpoint.customerId, customerA1Consented.id);

    // 7b. Query retention events filtered by customer
    const custEventsRes = await apiRequest(
      ctx.baseUrl,
      `/api/business/retention/events?customerId=${customerA1Consented.id}`,
      {
        method: 'GET',
        token: ownerAToken,
      }
    );
    assert.strictEqual(custEventsRes.status, 200);
    assert.ok(custEventsRes.body.events.length > 0);

    // 7c. Record a manual retention event via API
    const recordRes = await apiRequest(ctx.baseUrl, '/api/business/retention/events', {
      method: 'POST',
      token: ownerAToken,
      body: {
        customerId: customerA1Consented.id,
        eventType: CustomerEventType.CUSTOMER_REACTIVATED,
        metadata: { source: 'winback_campaign' },
      },
    });
    assert.strictEqual(recordRes.status, 201);
    assert.strictEqual(recordRes.body.type, CustomerEventType.CUSTOMER_REACTIVATED);
  });

  // 8. AUDIT LOGGING
  await t.test('8. Audit Logging: All campaign changes create verified audit records', async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        businessId: businessA.id,
        entityType: 'CAMPAIGN',
      },
      orderBy: { createdAt: 'desc' },
    });

    const actions = auditLogs.map(l => l.action);
    assert.ok(actions.includes('CAMPAIGN_CREATED'), 'Audit log for CAMPAIGN_CREATED must exist');
    assert.ok(actions.includes('CAMPAIGN_UPDATED'), 'Audit log for CAMPAIGN_UPDATED must exist');
    assert.ok(actions.includes('CAMPAIGN_STATUS_CHANGED'), 'Audit log for CAMPAIGN_STATUS_CHANGED must exist');

    // Zero secret leakage check
    for (const log of auditLogs) {
      const stateStr = JSON.stringify(log.newState || {}) + JSON.stringify(log.previousState || {});
      assert.strictEqual(/password|token|secret|otp/i.test(stateStr), false, 'Audit logs must not contain secrets');
    }
  });

  // 9. VALIDATION & ERROR HANDLING
  await t.test('9. Input Validation: Invalid inputs fail safely without leaks', async () => {
    // Missing name
    const missingNameRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'POST',
      token: ownerAToken,
      body: {
        messageTemplate: 'Hello without a name',
      },
    });
    assert.strictEqual(missingNameRes.status, 400);
    assert.ok(missingNameRes.body.error.includes('name'));

    // Missing template
    const missingTemplateRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Valid Name',
        messageTemplate: '',
      },
    });
    assert.strictEqual(missingTemplateRes.status, 400);
    assert.ok(missingTemplateRes.body.error.includes('template'));

    // Non-existent segment
    const invalidSegmentRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Invalid Segment Campaign',
        audienceType: AudienceType.SAVED_SEGMENT,
        segmentId: 'non-existent-segment-id',
        messageTemplate: 'Hello',
      },
    });
    assert.strictEqual(invalidSegmentRes.status, 400);

    // Delete campaign with existing deliveries (should be rejected)
    const deleteWithDeliveriesRes = await apiRequest(
      ctx.baseUrl,
      `/api/business/campaigns/${campaignA1Id}`,
      {
        method: 'DELETE',
        token: ownerAToken,
      }
    );
    assert.strictEqual(
      deleteWithDeliveriesRes.status,
      400,
      'Cannot delete campaign that already has deliveries'
    );
  });

  // Cleanup
  await t.test('Teardown: Stop test server', async () => {
    await ctx.stop();
  });
});
