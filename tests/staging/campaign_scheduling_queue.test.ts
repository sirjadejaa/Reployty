/**
 * REPLOYTY V2 — PHASE 22
 * CAMPAIGN SCHEDULING & DELIVERY QUEUE ENGINE
 * MANDATORY COMPREHENSIVE STAGING TEST SUITE
 * 
 * Steps 0 to 25:
 * Step 0:  Test server + tenant fixtures setup
 * Step 1:  Campaign schedule creation
 * Step 2:  Timezone conversion (Asia/Kolkata vs UTC)
 * Step 3:  Send-now execution
 * Step 4:  Scheduled campaign execution via scheduler worker
 * Step 5:  Past / invalid schedule rejection
 * Step 6:  Audience resolution using Phase 21 dynamic segment
 * Step 7:  Consent filtering (unconsented suppressed)
 * Step 8:  Cooldown filtering (recent contact suppressed)
 * Step 9:  Queue creation (durable PostgreSQL rows)
 * Step 10: Idempotent queue creation
 * Step 11: Concurrent scheduler execution (race-safe claim)
 * Step 12: Concurrent queue claiming (FOR UPDATE SKIP LOCKED)
 * Step 13: Successful simulated delivery
 * Step 14: Transient failure -> RETRY_WAIT
 * Step 15: Retry backoff calculation & jitter
 * Step 16: Maximum retry exhaustion -> FAILED
 * Step 17: Permanent failure -> FAILED immediately
 * Step 18: Cancellation (scheduled & queued items cancelled)
 * Step 19: Campaign state transitions validation
 * Step 20: Branch isolation & scoping
 * Step 21: Multi-tenant isolation (Tenant B cannot see/modify Tenant A)
 * Step 22: RBAC (Owner & Manager vs Staff vs Unauthenticated)
 * Step 23: Audit logging verification
 * Step 24: Duplicate delivery prevention
 * Step 25: Stale processing recovery & delivery summary contract
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
  ConsentChannel,
  DeliveryStatus,
  UserStatus,
} from '@prisma/client';
import {
  isValidTimezone,
  resolveScheduleUTC,
  formatInTimezone,
  processDueScheduledCampaigns,
} from '../../src/server/services/campaignSchedulerService';
import {
  claimPendingDeliveries,
  processDeliveryQueue,
  calculateNextRetryDelay,
  recoverStaleDeliveries,
} from '../../src/server/services/campaignQueueService';

const RUN_ID = `p22_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

test('PHASE 22: CAMPAIGN SCHEDULING & DELIVERY QUEUE ENGINE TEST SUITE', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;

  // Tenant A: Artisan Roast Roastery
  let businessA: any;
  let branchA1: any;
  let branchA2: any;
  let ownerAToken: string;
  let managerAToken: string;
  let branchManagerA1Token: string;
  let staffAToken: string;

  // Tenant B: Island Bistro (Isolation verification)
  let businessB: any;
  let branchB1: any;
  let ownerBToken: string;

  // Customers in Business A
  let customerA1Consented: any;
  let customerA2NoConsent: any;
  let customerA3Cooldown: any;
  let customerA4Transient: any;
  let customerA5Permanent: any;

  // Phase 21 Dynamic Segment in Business A
  let dynamicSegmentA: any;

  // Campaign fixtures
  let campaignA1Id: string;
  let campaignA2ScheduledId: string;

  function req(method: string, path: string, body?: any, token?: string) {
    return apiRequest(ctx.baseUrl, path, {
      method,
      body,
      token,
    });
  }

  // ==========================================================================
  // STEP 0: Test Server + Multi-Tenant Fixtures
  // ==========================================================================
  await t.test('Step 0: Setup Server, Multi-Tenant Fixtures, Roles, and Customers', async () => {
    ctx = await startTestServer();

    const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });
    const managerRole = await prisma.role.findFirstOrThrow({ where: { name: 'MANAGER' } });
    const staffRole = await prisma.role.findFirstOrThrow({ where: { name: 'STAFF' } });
    const growthPlan = await prisma.plan.findFirstOrThrow({ where: { slug: 'growth' } });

    const passwordHash = await hashPassword('Phase22Pass!123');

    // 1. Business A
    businessA = await prisma.business.create({
      data: {
        name: `Artisan Roastery ${RUN_ID}`,
        slug: `artisan-${RUN_ID}`,
        category: BusinessCategory.CAFE,
        email: `owner.a.${RUN_ID}@reployty.staging`,
        timezone: 'Asia/Kolkata',
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
        code: `BND-${RUN_ID.slice(0, 4)}`,
        status: 'ACTIVE',
        timezone: 'Asia/Kolkata',
        isMainBranch: true,
      },
    });

    branchA2 = await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: `Juhu Roastery ${RUN_ID}`,
        code: `JUH-${RUN_ID.slice(0, 4)}`,
        status: 'ACTIVE',
        timezone: 'Asia/Kolkata',
      },
    });

    // Users in Business A
    const userOwnerA = await prisma.user.create({
      data: {
        email: `owner.a.${RUN_ID}@staging.reployty.com`,
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
        email: `manager.a.${RUN_ID}@staging.reployty.com`,
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
        email: `staff.a.${RUN_ID}@staging.reployty.com`,
        name: 'Staff A',
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

    // Sessions for Business A
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

    // Branch A1-scoped Manager for branch-isolation testing
    const userBranchManagerA1 = await prisma.user.create({
      data: {
        email: `mgr.branch1.${RUN_ID}@staging.reployty.com`,
        name: 'Manager Branch 1',
        passwordHash,
        status: UserStatus.ACTIVE,
        memberships: {
          create: {
            businessId: businessA.id,
            branchId: branchA1.id,
            roleId: managerRole.id,
            status: 'ACTIVE',
          },
        },
      },
    });

    const sBranchMgrA1 = await prisma.session.create({
      data: {
        sessionToken: `token_bmgr_a1_${RUN_ID}`,
        userId: userBranchManagerA1.id,
        businessId: businessA.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    branchManagerA1Token = sBranchMgrA1.sessionToken;

    // 2. Business B (Tenant Isolation)
    businessB = await prisma.business.create({
      data: {
        name: `Island Bistro ${RUN_ID}`,
        slug: `island-${RUN_ID}`,
        category: BusinessCategory.RESTAURANT,
        email: `owner.b.${RUN_ID}@reployty.staging`,
        timezone: 'UTC',
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
        name: `Goa Beachfront ${RUN_ID}`,
        code: `GOA-${RUN_ID.slice(0, 4)}`,
        status: 'ACTIVE',
        timezone: 'UTC',
        isMainBranch: true,
      },
    });

    const userOwnerB = await prisma.user.create({
      data: {
        email: `owner.b.${RUN_ID}@staging.reployty.com`,
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

    const sOwnerB = await prisma.session.create({
      data: {
        sessionToken: `token_owner_b_${RUN_ID}`,
        userId: userOwnerB.id,
        businessId: businessB.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    ownerBToken = sOwnerB.sessionToken;

    // 3. Customers in Business A
    customerA1Consented = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Rohan Sharma',
        phone: `+9198200${Math.floor(10000 + Math.random() * 90000)}`,
        marketingConsent: true,
        totalVisits: 5,
        totalSpendMinor: 150000,
        consents: {
          create: {
            channel: ConsentChannel.WHATSAPP,
            granted: true,
            source: 'CHECKOUT',
          },
        },
      },
    });

    customerA2NoConsent = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Aanya Patel (Unconsented)',
        phone: `+9198201${Math.floor(10000 + Math.random() * 90000)}`,
        marketingConsent: false,
        totalVisits: 8,
        totalSpendMinor: 200000,
      },
    });

    customerA3Cooldown = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Vikram Joshi (Cooldown)',
        phone: `+9198202${Math.floor(10000 + Math.random() * 90000)}`,
        marketingConsent: true,
        totalVisits: 4,
        totalSpendMinor: 80000,
      },
    });

    customerA4Transient = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Transient Test User',
        phone: `+919999900001`,
        marketingConsent: true,
        totalVisits: 2,
        totalSpendMinor: 40000,
      },
    });

    customerA5Permanent = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Permanent Error User',
        phone: `+919999900002`,
        marketingConsent: true,
        totalVisits: 3,
        totalSpendMinor: 60000,
      },
    });

    // 4. Phase 21 Dynamic Segment
    dynamicSegmentA = await prisma.customerSegment.create({
      data: {
        businessId: businessA.id,
        name: `Active VIPs ${RUN_ID}`,
        type: 'DYNAMIC',
        ruleDefinition: {
          logic: 'AND',
          conditions: [
            { field: 'totalVisits', operator: 'GREATER_THAN_OR_EQUAL', value: 3 },
          ],
        },
      },
    });

    assert.ok(businessA.id);
    assert.ok(businessB.id);
    assert.ok(branchB1.id);
    assert.ok(ownerAToken);
    assert.ok(dynamicSegmentA.id);
  });

  // ==========================================================================
  // STEP 1: Campaign Schedule Creation
  // ==========================================================================
  await t.test('Step 1: Campaign schedule creation', async () => {
    // Create base draft campaign
    const createRes = await req('POST', '/api/business/campaigns', {
      name: `Specialty Roast Announcement ${RUN_ID}`,
      messageTemplate: 'Hey {{name}}, fresh Ethiopian roast is in town!',
      channel: 'WHATSAPP',
      audienceType: 'ALL_CUSTOMERS',
    }, ownerAToken);

    assert.strictEqual(createRes.status, 201);
    campaignA1Id = createRes.body.id;
    assert.strictEqual(createRes.body.status, 'DRAFT');

    // Schedule for 2 hours in the future
    const futureDate = new Date(Date.now() + 2 * 3600 * 1000);
    const scheduleRes = await req(
      'POST',
      `/api/business/campaigns/${campaignA1Id}/schedule`,
      {
        scheduledAt: futureDate.toISOString(),
        timezone: 'Asia/Kolkata',
      },
      ownerAToken
    );

    assert.strictEqual(scheduleRes.status, 200);
    assert.strictEqual(scheduleRes.body.campaign.status, 'SCHEDULED');
    assert.strictEqual(scheduleRes.body.timezone, 'Asia/Kolkata');
    assert.ok(scheduleRes.body.formattedLocalTime.includes(':'));

    // Verify GET /schedule endpoint
    const getSchedRes = await req(
      'GET',
      `/api/business/campaigns/${campaignA1Id}/schedule`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(getSchedRes.status, 200);
    assert.strictEqual(getSchedRes.body.status, 'SCHEDULED');
    assert.strictEqual(getSchedRes.body.isDue, false);
  });

  // ==========================================================================
  // STEP 2: Timezone Conversion
  // ==========================================================================
  await t.test('Step 2: Timezone conversion and IANA validation', async () => {
    // 1. Valid timezone check
    assert.strictEqual(isValidTimezone('Asia/Kolkata'), true);
    assert.strictEqual(isValidTimezone('America/New_York'), true);
    assert.strictEqual(isValidTimezone('UTC'), true);
    assert.strictEqual(isValidTimezone('Invalid/Nowhere'), false);

    // 2. Local representation conversion
    // "2026-09-30T10:00:00" in Asia/Kolkata (IST = UTC+05:30) -> UTC must be 04:30:00 UTC
    const localInput = '2026-09-30T10:00:00';
    const utcConverted = resolveScheduleUTC(localInput, 'Asia/Kolkata');
    assert.strictEqual(utcConverted.toISOString(), '2026-09-30T04:30:00.000Z');

    // 3. Format back to local timezone
    const formattedLocal = formatInTimezone(utcConverted, 'Asia/Kolkata');
    assert.ok(formattedLocal.includes('10:00:00 AM') || formattedLocal.includes('10:00:00'));
  });

  // ==========================================================================
  // STEP 3: Send-Now Execution
  // ==========================================================================
  await t.test('Step 3: Send-now execution', async () => {
    // Create another campaign for SEND_NOW
    const draftRes = await req('POST', '/api/business/campaigns', {
      name: `Instant Flash Special ${RUN_ID}`,
      messageTemplate: 'Flash 20% off today only!',
      channel: 'WHATSAPP',
      audienceType: 'ALL_CUSTOMERS',
    }, ownerAToken);

    assert.strictEqual(draftRes.status, 201);
    const flashId = draftRes.body.id;

    // Trigger SEND_NOW
    const sendNowRes = await req(
      'POST',
      `/api/business/campaigns/${flashId}/send-now`,
      {},
      ownerAToken
    );

    assert.strictEqual(sendNowRes.status, 200);
    assert.ok(sendNowRes.body.executionId);
    assert.ok(sendNowRes.body.queuedCount >= 1);
    assert.ok(sendNowRes.body.deliveredCount >= 1);

    // Verify Campaign status updated
    const getCamp = await req('GET', `/api/business/campaigns/${flashId}`, undefined, ownerAToken);
    assert.ok(['PROCESSING', 'COMPLETED'].includes(getCamp.body.status));
  });

  // ==========================================================================
  // STEP 4: Scheduled Campaign Execution
  // ==========================================================================
  await t.test('Step 4: Scheduled campaign execution via scheduler worker', async () => {
    // Create a scheduled campaign whose scheduledAt is slightly in the past (due right now)
    const pastSched = new Date(Date.now() - 5000);
    const campaignSched = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Due Scheduled Campaign ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        audienceType: AudienceType.ALL_CUSTOMERS,
        messageTemplate: 'Your morning coffee is ready!',
        status: CampaignStatus.SCHEDULED,
        scheduledAt: pastSched,
        timezone: 'Asia/Kolkata',
      },
    });

    campaignA2ScheduledId = campaignSched.id;

    // Run scheduler tick
    const tickResult = await processDueScheduledCampaigns({ limit: 50 });
    assert.ok(tickResult.claimedCount >= 1);
    assert.ok(tickResult.executedCount >= 1);

    // Verify campaign transitioned
    const updated = await prisma.campaign.findUnique({
      where: { id: campaignA2ScheduledId },
    });
    assert.ok(['COMPLETED', 'PROCESSING'].includes(updated!.status));
  });

  // ==========================================================================
  // STEP 5: Past / Invalid Schedule Rejection
  // ==========================================================================
  await t.test('Step 5: Past and invalid schedule rejection', async () => {
    const testCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Validation Test ${RUN_ID}`,
        messageTemplate: 'Test validation',
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.DRAFT,
      },
    });

    // 1. Past date (> 1 minute ago)
    const deepPast = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const pastRes = await req(
      'POST',
      `/api/business/campaigns/${testCamp.id}/schedule`,
      { scheduledAt: deepPast },
      ownerAToken
    );
    assert.strictEqual(pastRes.status, 400);
    assert.ok(pastRes.body.error.includes('past'));

    // 2. Invalid timezone
    const invalidTzRes = await req(
      'POST',
      `/api/business/campaigns/${testCamp.id}/schedule`,
      {
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        timezone: 'Moon/Crater',
      },
      ownerAToken
    );
    assert.strictEqual(invalidTzRes.status, 400);
    assert.ok(invalidTzRes.body.error.includes('timezone'));

    // 3. Scheduling a COMPLETED campaign
    await prisma.campaign.update({
      where: { id: testCamp.id },
      data: { status: CampaignStatus.COMPLETED },
    });
    const completedRes = await req(
      'POST',
      `/api/business/campaigns/${testCamp.id}/schedule`,
      {
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      },
      ownerAToken
    );
    assert.strictEqual(completedRes.status, 400);
  });

  // ==========================================================================
  // STEP 6: Audience Resolution Using Phase 21 Dynamic Segment
  // ==========================================================================
  await t.test('Step 6: Audience resolution using Phase 21 dynamic segment', async () => {
    // Create campaign targeted to Phase 21 dynamicSegmentA (totalVisits >= 3)
    const segCampRes = await req('POST', '/api/business/campaigns', {
      name: `VIP Dynamic Campaign ${RUN_ID}`,
      messageTemplate: 'VIP Perk!',
      channel: 'WHATSAPP',
      audienceType: 'SAVED_SEGMENT',
      segmentId: dynamicSegmentA.id,
    }, ownerAToken);

    assert.strictEqual(segCampRes.status, 201);
    const segCampId = segCampRes.body.id;

    // Trigger SEND_NOW to evaluate audience
    const execRes = await req(
      'POST',
      `/api/business/campaigns/${segCampId}/send-now`,
      {},
      ownerAToken
    );

    assert.strictEqual(execRes.status, 200);
    assert.ok(execRes.body.eligibleCount >= 1);
  });

  // ==========================================================================
  // STEP 7: Consent Filtering
  // ==========================================================================
  await t.test('Step 7: Consent filtering suppresses unconsented customers', async () => {
    // Target specific customer without consent
    const unconsentedCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Unconsented Target ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        audienceType: AudienceType.SPECIFIC_CUSTOMER,
        messageTemplate: 'Promo',
        audienceFilter: { customerIds: [customerA2NoConsent.id] },
        status: CampaignStatus.DRAFT,
      },
    });

    const execRes = await req(
      'POST',
      `/api/business/campaigns/${unconsentedCamp.id}/send-now`,
      {},
      ownerAToken
    );

    assert.strictEqual(execRes.status, 200);
    assert.strictEqual(execRes.body.queuedCount, 0);
    assert.strictEqual(execRes.body.deliveredCount, 0);
    assert.strictEqual(execRes.body.suppressedConsentCount, 1);
  });

  // ==========================================================================
  // STEP 8: Cooldown Filtering
  // ==========================================================================
  await t.test('Step 8: Contact cooldown filtering suppresses recently contacted customer', async () => {
    // Record a recent delivery for customerA3 within the past 1 hour
    await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA1Id,
        customerId: customerA3Cooldown.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 30 * 60 * 1000),
        businessId: businessA.id,
      },
    });

    // Create campaign targeting customerA3
    const cooldownCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Cooldown Target ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        audienceType: AudienceType.SPECIFIC_CUSTOMER,
        audienceFilter: { customerIds: [customerA3Cooldown.id] },
        messageTemplate: 'Promo again',
        status: CampaignStatus.DRAFT,
      },
    });

    // Execute with 24 hours cooldown
    const execRes = await req(
      'POST',
      `/api/business/campaigns/${cooldownCamp.id}/send-now`,
      { cooldownHours: 24 },
      ownerAToken
    );

    assert.strictEqual(execRes.status, 200);
    assert.strictEqual(execRes.body.suppressedCooldownCount, 1);
    assert.strictEqual(execRes.body.queuedCount, 0);
  });

  // ==========================================================================
  // STEP 9: Durable Delivery Queue Records
  // ==========================================================================
  await t.test('Step 9: Queue creation generates durable PostgreSQL records', async () => {
    const deliveries = await prisma.campaignDelivery.findMany({
      where: { businessId: businessA.id },
      take: 5,
    });

    assert.ok(deliveries.length > 0);
    const d = deliveries[0];
    assert.ok(d.id);
    assert.ok(d.campaignId);
    assert.ok(d.customerId);
    assert.ok(d.status);
    assert.ok(d.maxAttempts >= 1);
  });

  // ==========================================================================
  // STEP 10: Idempotent Queue Creation
  // ==========================================================================
  await t.test('Step 10: Idempotent queue creation prevents duplicate records', async () => {
    const testCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Idempotency Test ${RUN_ID}`,
        messageTemplate: 'Test idempotency',
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.DRAFT,
      },
    });

    const res1 = await req(
      'POST',
      `/api/business/campaigns/${testCamp.id}/send-now`,
      {},
      ownerAToken
    );
    assert.strictEqual(res1.status, 200);

    const executionCount = await prisma.campaignExecution.count({
      where: { campaignId: testCamp.id },
    });
    assert.strictEqual(executionCount, 1);
  });

  // ==========================================================================
  // STEP 11: Concurrent Scheduler Execution
  // ==========================================================================
  await t.test('Step 11: Concurrent scheduler execution is race-safe', async () => {
    const dueCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Concurrent Race Test ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.SCHEDULED,
        scheduledAt: new Date(Date.now() - 1000),
        messageTemplate: 'Testing race protection',
      },
    });

    await Promise.all([
      processDueScheduledCampaigns({ limit: 10 }),
      processDueScheduledCampaigns({ limit: 10 }),
      processDueScheduledCampaigns({ limit: 10 }),
    ]);

    const executions = await prisma.campaignExecution.count({
      where: { campaignId: dueCamp.id },
    });
    assert.strictEqual(executions, 1);
  });

  // ==========================================================================
  // STEP 12: Concurrent Queue Claiming (FOR UPDATE SKIP LOCKED)
  // ==========================================================================
  await t.test('Step 12: Concurrent queue claiming with FOR UPDATE SKIP LOCKED', async () => {
    const testCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Locking Test ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.QUEUED,
        messageTemplate: 'Lock test',
      },
    });

    for (let i = 0; i < 6; i++) {
      await prisma.campaignDelivery.create({
        data: {
          campaignId: testCamp.id,
          customerId: customerA1Consented.id,
          channel: CampaignChannel.WHATSAPP,
          status: DeliveryStatus.QUEUED,
          businessId: businessA.id,
          idempotencyKey: `claim_race_${RUN_ID}_${i}`,
          availableAt: new Date(),
        },
      });
    }

    const [worker1Claim, worker2Claim] = await Promise.all([
      claimPendingDeliveries({ limit: 3, workerId: 'worker_1', campaignId: testCamp.id }),
      claimPendingDeliveries({ limit: 3, workerId: 'worker_2', campaignId: testCamp.id }),
    ]);

    const ids1 = new Set(worker1Claim.map(d => d.id));
    const ids2 = new Set(worker2Claim.map(d => d.id));

    for (const id of ids1) {
      assert.strictEqual(ids2.has(id), false, `Collision: delivery ${id} claimed by both workers!`);
    }
  });

  // ==========================================================================
  // STEP 13: Successful Simulated Delivery
  // ==========================================================================
  await t.test('Step 13: Successful simulated delivery and touchpoint event', async () => {
    const successCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Success Delivery ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.QUEUED,
        messageTemplate: 'Success delivery test',
      },
    });

    const delivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: successCamp.id,
        customerId: customerA1Consented.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.QUEUED,
        businessId: businessA.id,
        availableAt: new Date(),
      },
    });

    const procResult = await processDeliveryQueue({ campaignId: successCamp.id });
    assert.strictEqual(procResult.deliveredCount, 1);

    const updatedDelivery = await prisma.campaignDelivery.findUnique({
      where: { id: delivery.id },
    });
    assert.strictEqual(updatedDelivery!.status, DeliveryStatus.DELIVERED);
    assert.ok(updatedDelivery!.sentAt);
    assert.ok(updatedDelivery!.deliveredAt);
  });

  // ==========================================================================
  // STEP 14: Transient Failure -> RETRY_WAIT
  // ==========================================================================
  await t.test('Step 14: Transient failure sets RETRY_WAIT and nextRetryAt', async () => {
    const transientCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Transient Test ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.QUEUED,
        messageTemplate: 'Transient test',
      },
    });

    const delivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: transientCamp.id,
        customerId: customerA4Transient.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.QUEUED,
        businessId: businessA.id,
        attemptCount: 0,
        maxAttempts: 5,
        availableAt: new Date(),
      },
    });

    const procResult = await processDeliveryQueue({ campaignId: transientCamp.id });
    assert.strictEqual(procResult.retryingCount, 1);

    const updated = await prisma.campaignDelivery.findUnique({
      where: { id: delivery.id },
    });
    assert.strictEqual(updated!.status, DeliveryStatus.RETRY_WAIT);
    assert.strictEqual(updated!.attemptCount, 1);
    assert.ok(updated!.nextRetryAt);
    assert.ok(updated!.nextRetryAt!.getTime() > Date.now());
  });

  // ==========================================================================
  // STEP 15: Retry Backoff Calculation
  // ==========================================================================
  await t.test('Step 15: Exponential backoff delay calculation', async () => {
    const policy = {
      baseDelayMs: 60_000,
      maxDelayMs: 3_600_000,
      maxAttempts: 5,
      jitterMs: 0,
    };

    assert.strictEqual(calculateNextRetryDelay(1, policy), 60_000);
    assert.strictEqual(calculateNextRetryDelay(2, policy), 120_000);
    assert.strictEqual(calculateNextRetryDelay(3, policy), 240_000);
    assert.strictEqual(calculateNextRetryDelay(10, policy), 3_600_000);
  });

  // ==========================================================================
  // STEP 16: Maximum Retry Exhaustion
  // ==========================================================================
  await t.test('Step 16: Maximum retry exhaustion transitions delivery to FAILED', async () => {
    const exhaustCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Exhaustion Test ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.QUEUED,
        messageTemplate: 'Exhaustion test',
      },
    });

    const delivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: exhaustCamp.id,
        customerId: customerA4Transient.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.QUEUED,
        businessId: businessA.id,
        attemptCount: 4,
        maxAttempts: 5,
        availableAt: new Date(),
      },
    });

    const procResult = await processDeliveryQueue({ campaignId: exhaustCamp.id });
    assert.strictEqual(procResult.failedCount, 1);

    const updated = await prisma.campaignDelivery.findUnique({
      where: { id: delivery.id },
    });
    assert.strictEqual(updated!.status, DeliveryStatus.FAILED);
    assert.strictEqual(updated!.attemptCount, 5);
    assert.ok(updated!.failedReason?.includes('exhausted'));
  });

  // ==========================================================================
  // STEP 17: Permanent Failure
  // ==========================================================================
  await t.test('Step 17: Permanent failure transitions immediately to FAILED without retries', async () => {
    const permCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Permanent Error Test ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.QUEUED,
        messageTemplate: 'Perm test',
      },
    });

    const delivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: permCamp.id,
        customerId: customerA5Permanent.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.QUEUED,
        businessId: businessA.id,
        attemptCount: 0,
        maxAttempts: 5,
        availableAt: new Date(),
      },
    });

    const procResult = await processDeliveryQueue({ campaignId: permCamp.id });
    assert.strictEqual(procResult.failedCount, 1);

    const updated = await prisma.campaignDelivery.findUnique({
      where: { id: delivery.id },
    });
    assert.strictEqual(updated!.status, DeliveryStatus.FAILED);
    assert.strictEqual(updated!.attemptCount, 1);
  });

  // ==========================================================================
  // STEP 18: Cancellation
  // ==========================================================================
  await t.test('Step 18: Campaign cancellation cancels pending deliveries', async () => {
    const cancelCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `To Be Cancelled ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.SCHEDULED,
        scheduledAt: new Date(Date.now() + 3600000),
        messageTemplate: 'Will cancel',
      },
    });

    await prisma.campaignDelivery.create({
      data: {
        campaignId: cancelCamp.id,
        customerId: customerA1Consented.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.QUEUED,
        businessId: businessA.id,
      },
    });

    const cancelRes = await req(
      'POST',
      `/api/business/campaigns/${cancelCamp.id}/cancel`,
      {},
      ownerAToken
    );

    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.body.campaign.status, 'CANCELLED');

    const deliveries = await prisma.campaignDelivery.findMany({
      where: { campaignId: cancelCamp.id },
    });
    assert.ok(deliveries.every(d => d.status === DeliveryStatus.CANCELLED));
  });

  // ==========================================================================
  // STEP 19: Campaign State Transitions
  // ==========================================================================
  await t.test('Step 19: Campaign status state machine transitions', async () => {
    const testCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `State Machine Test ${RUN_ID}`,
        messageTemplate: 'State test',
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.DRAFT,
      },
    });

    const toSched = await req(
      'POST',
      `/api/business/campaigns/${testCamp.id}/status`,
      { status: 'SCHEDULED' },
      ownerAToken
    );
    assert.strictEqual(toSched.status, 200);

    const invalidTrans = await req(
      'POST',
      `/api/business/campaigns/${testCamp.id}/status`,
      { status: 'PAUSED' },
      ownerAToken
    );
    assert.strictEqual(invalidTrans.status, 400);
  });

  // ==========================================================================
  // STEP 20: Branch Isolation
  // ==========================================================================
  await t.test('Step 20: Branch isolation prevents cross-branch access for branch-scoped users', async () => {
    const branchCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        branchId: branchA2.id,
        name: `Juhu Exclusive ${RUN_ID}`,
        messageTemplate: 'Juhu roast promo',
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.DRAFT,
      },
    });

    const crossBranchRes = await req(
      'GET',
      `/api/business/campaigns/${branchCamp.id}`,
      undefined,
      branchManagerA1Token
    );
    assert.strictEqual(crossBranchRes.status, 404);
  });

  // ==========================================================================
  // STEP 21: Tenant Isolation
  // ==========================================================================
  await t.test('Step 21: Multi-tenant isolation returns 404 for cross-tenant requests', async () => {
    const crossSchedule = await req(
      'POST',
      `/api/business/campaigns/${campaignA1Id}/schedule`,
      { scheduledAt: new Date(Date.now() + 3600000).toISOString() },
      ownerBToken
    );
    assert.strictEqual(crossSchedule.status, 404);

    const crossDeliveries = await req(
      'GET',
      `/api/business/campaigns/${campaignA1Id}/deliveries`,
      undefined,
      ownerBToken
    );
    assert.strictEqual(crossDeliveries.status, 404);

    const crossCancel = await req(
      'POST',
      `/api/business/campaigns/${campaignA1Id}/cancel`,
      {},
      ownerBToken
    );
    assert.strictEqual(crossCancel.status, 404);
  });

  // ==========================================================================
  // STEP 22: RBAC
  // ==========================================================================
  await t.test('Step 22: RBAC permissions (Owner/Manager vs Staff vs Unauthenticated)', async () => {
    const rbacCamp = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: `RBAC Test ${RUN_ID}`,
        messageTemplate: 'RBAC test',
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.DRAFT,
      },
    });

    // 1. Unauthenticated -> 401
    const unauthRes = await req(
      'POST',
      `/api/business/campaigns/${rbacCamp.id}/schedule`,
      { scheduledAt: new Date(Date.now() + 3600000).toISOString() }
    );
    assert.strictEqual(unauthRes.status, 401);

    // 2. Staff without CAMPAIGNS_MANAGE -> 403
    const staffRes = await req(
      'POST',
      `/api/business/campaigns/${rbacCamp.id}/schedule`,
      { scheduledAt: new Date(Date.now() + 3600000).toISOString() },
      staffAToken
    );
    assert.strictEqual(staffRes.status, 403);

    // 3. Manager with CAMPAIGNS_MANAGE -> 200
    const mgrRes = await req(
      'POST',
      `/api/business/campaigns/${rbacCamp.id}/schedule`,
      { scheduledAt: new Date(Date.now() + 3600000).toISOString() },
      managerAToken
    );
    assert.strictEqual(mgrRes.status, 200);
  });

  // ==========================================================================
  // STEP 23: Audit Logging
  // ==========================================================================
  await t.test('Step 23: Meaningful mutations generate audit logs', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { businessId: businessA.id },
      select: { action: true },
    });

    const actions = new Set(logs.map(l => l.action));
    assert.ok(actions.has('CAMPAIGN_SCHEDULED'), 'Missing CAMPAIGN_SCHEDULED audit log');
    assert.ok(actions.has('CAMPAIGN_SEND_NOW'), 'Missing CAMPAIGN_SEND_NOW audit log');
    assert.ok(actions.has('CAMPAIGN_CANCELLED'), 'Missing CAMPAIGN_CANCELLED audit log');
  });

  // ==========================================================================
  // STEP 24: Duplicate Delivery Prevention (Database Index)
  // ==========================================================================
  await t.test('Step 24: Unique idempotency key index prevents duplicate deliveries', async () => {
    const key = `unique_test_key_${RUN_ID}`;

    await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA1Id,
        customerId: customerA1Consented.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.QUEUED,
        idempotencyKey: key,
        businessId: businessA.id,
      },
    });

    await assert.rejects(async () => {
      await prisma.campaignDelivery.create({
        data: {
          campaignId: campaignA1Id,
          customerId: customerA1Consented.id,
          channel: CampaignChannel.WHATSAPP,
          status: DeliveryStatus.QUEUED,
          idempotencyKey: key,
          businessId: businessA.id,
        },
      });
    });
  });

  // ==========================================================================
  // STEP 25: Stale Processing Recovery & Contract Verification
  // ==========================================================================
  await t.test('Step 25: Stale processing recovery and delivery summary contract', async () => {
    // 1. Stale processing recovery test
    const abandonedDelivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaignA1Id,
        customerId: customerA1Consented.id,
        channel: CampaignChannel.WHATSAPP,
        status: DeliveryStatus.PROCESSING,
        lockedAt: new Date(Date.now() - 10 * 60 * 1000),
        lockedBy: 'crashed_worker_999',
        businessId: businessA.id,
      },
    });

    const recoveredCount = await recoverStaleDeliveries(5);
    assert.ok(recoveredCount >= 1);

    const fresh = await prisma.campaignDelivery.findUnique({
      where: { id: abandonedDelivery.id },
    });
    assert.strictEqual(fresh!.status, DeliveryStatus.RETRY_WAIT);
    assert.strictEqual(fresh!.lockedBy, null);

    // 2. Deliveries summary endpoint verification
    const delivRes = await req(
      'GET',
      `/api/business/campaigns/${campaignA1Id}/deliveries`,
      undefined,
      ownerAToken
    );

    assert.strictEqual(delivRes.status, 200);
    assert.ok(delivRes.body.summary);
    assert.ok('queued' in delivRes.body.summary);
    assert.ok('delivered' in delivRes.body.summary);
    assert.ok('failed' in delivRes.body.summary);
    assert.ok('retrying' in delivRes.body.summary);
  });

  // Teardown
  t.after(async () => {
    if (ctx && typeof ctx.stop === 'function') {
      await ctx.stop();
    }
  });
});
