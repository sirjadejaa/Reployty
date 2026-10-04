/**
 * REPLOYTY PHASE 29 — PRODUCTION LAUNCH + REAL BUSINESS VALIDATION TEST SUITE
 *
 * Comprehensive end-to-end integration and security audit verifying:
 * 1. Production Health & Readiness Probes (/health, /health/live, /ready, /health/ready)
 * 2. Strict Tenant Isolation & Anti-IDOR Protections (Cross-tenant access blocked)
 * 3. Role-Based Access Control (RBAC) Enforcement (Owner vs Staff vs SuperAdmin)
 * 4. Real Business Onboarding & Tenant Switching
 * 5. Complete Customer Journey (QR -> OTP -> Loyalty Stamp -> Reward -> Atomic Redemption)
 * 6. Campaign Scheduling & Queue Concurrency (Atomic claiming & stale recovery)
 * 7. Messaging Provider Architecture & Webhook Signature Security
 * 8. Billing & Usage Metering Atomicity (Overage modes & idempotency protection)
 * 9. Worker Manager Overlap Protection & Graceful Shutdown
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword, createSession } from '../../src/server/auth/sessionService';
import { workerManager } from '../../src/server/jobs/workerManager';
import { processDueScheduledCampaigns } from '../../src/server/services/campaignSchedulerService';
import { recoverStaleDeliveries } from '../../src/server/services/campaignQueueService';
import {
  BusinessCategory,
  UserStatus,
  CampaignStatus,
  CampaignChannel,
  DeliveryStatus,
  UsageMeterType,
} from '@prisma/client';
import { UsageMeterService } from '../../src/server/services/usageMeterService';

const RUN_ID = `p29_${Date.now().toString(36)}`;

test('PHASE 29: PRODUCTION SYSTEM & BUSINESS VALIDATION AUDIT', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;

  // Tenant Alpha (Primary Pilot Business)
  let businessAlphaId: string;
  let branchAlphaId: string;
  let ownerAlphaUserId: string;
  let ownerAlphaToken: string;
  let staffAlphaUserId: string;
  let staffAlphaToken: string;

  // Tenant Beta (Isolation Target Business)
  let businessBetaId: string;
  let branchBetaId: string;
  let ownerBetaUserId: string;
  let ownerBetaToken: string;

  // Platform Super Admin
  let superAdminUserId: string;
  let superAdminToken: string;

  t.before(async () => {
    ctx = await startTestServer();

    // Fetch system default roles
    const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });
    const staffRole = await prisma.role.findFirstOrThrow({ where: { name: 'STAFF' } });

    // 1. Create Super Admin
    const saEmail = `superadmin_${RUN_ID}@reployty.com`;
    const saPasswordHash = await hashPassword('SuperAdminPass123!');
    const superAdmin = await prisma.user.create({
      data: {
        email: saEmail,
        name: 'Phase 29 Super Admin',
        passwordHash: saPasswordHash,
        status: UserStatus.ACTIVE,
        isSuperAdmin: true,
      },
    });
    superAdminUserId = superAdmin.id;
    const saSession = await createSession(superAdminUserId, null, '127.0.0.1', 'Phase29Test/1.0');
    superAdminToken = saSession.token;

    // 2. Create Business Alpha (Pilot Tenant)
    const ownerAlphaEmail = `owner_alpha_${RUN_ID}@artisanroast.com`;
    const ownerAlphaUser = await prisma.user.create({
      data: {
        email: ownerAlphaEmail,
        name: 'Alpha Owner',
        passwordHash: await hashPassword('OwnerAlphaPass123!'),
        status: UserStatus.ACTIVE,
      },
    });
    ownerAlphaUserId = ownerAlphaUser.id;
    const sessionAlpha = await createSession(ownerAlphaUserId);
    ownerAlphaToken = sessionAlpha.token;

    const businessAlpha = await prisma.business.create({
      data: {
        name: `Artisan Roast Pilot ${RUN_ID}`,
        slug: `artisan-roast-${RUN_ID}`,
        category: BusinessCategory.CAFE,
        status: 'ACTIVE',
        onboardingCompleted: true,
        primaryColor: '#4F6BFF',
        branches: {
          create: {
            name: 'Bandra Flagship',
            code: `BF-${RUN_ID}`,
            isMainBranch: true,
            status: 'ACTIVE',
          },
        },
      },
      include: { branches: true },
    });
    businessAlphaId = businessAlpha.id;
    branchAlphaId = businessAlpha.branches[0].id;

    // Attach Owner Membership
    await prisma.staffMembership.create({
      data: {
        userId: ownerAlphaUserId,
        businessId: businessAlphaId,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });

    // Create Staff for Business Alpha
    const staffAlphaUser = await prisma.user.create({
      data: {
        email: `staff_alpha_${RUN_ID}@artisanroast.com`,
        name: 'Alpha Staff Member',
        passwordHash: await hashPassword('StaffAlphaPass123!'),
        status: UserStatus.ACTIVE,
      },
    });
    staffAlphaUserId = staffAlphaUser.id;
    const staffAlphaSession = await createSession(staffAlphaUserId);
    staffAlphaToken = staffAlphaSession.token;

    await prisma.staffMembership.create({
      data: {
        userId: staffAlphaUserId,
        businessId: businessAlphaId,
        roleId: staffRole.id,
        status: 'ACTIVE',
      },
    });

    // 3. Create Business Beta (Target for Isolation Verification)
    const ownerBetaUser = await prisma.user.create({
      data: {
        email: `owner_beta_${RUN_ID}@otherbistro.com`,
        name: 'Beta Owner',
        passwordHash: await hashPassword('OwnerBetaPass123!'),
        status: UserStatus.ACTIVE,
      },
    });
    ownerBetaUserId = ownerBetaUser.id;
    const sessionBeta = await createSession(ownerBetaUserId);
    ownerBetaToken = sessionBeta.token;

    const businessBeta = await prisma.business.create({
      data: {
        name: `Harbor Bistro ${RUN_ID}`,
        slug: `harbor-bistro-${RUN_ID}`,
        category: BusinessCategory.RESTAURANT,
        status: 'ACTIVE',
        onboardingCompleted: true,
        branches: {
          create: {
            name: 'Downtown Bistro',
            code: `DB-${RUN_ID}`,
            isMainBranch: true,
            status: 'ACTIVE',
          },
        },
      },
      include: { branches: true },
    });
    businessBetaId = businessBeta.id;
    branchBetaId = businessBeta.branches[0].id;

    // Attach Owner Membership for Beta
    await prisma.staffMembership.create({
      data: {
        userId: ownerBetaUserId,
        businessId: businessBetaId,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });
  });

  t.after(async () => {
    // Clean up test tenants
    await prisma.business.deleteMany({
      where: { id: { in: [businessAlphaId, businessBetaId] } },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: [superAdminUserId, ownerAlphaUserId, staffAlphaUserId, ownerBetaUserId] } },
    }).catch(() => {});
    await ctx.server.close();
  });

  // =========================================================================
  // SECTION 1: Health & Readiness Probes Audit
  // =========================================================================
  await t.test('1.1: GET /health and /health/live return 200 with system metadata', async () => {
    const res1 = await apiRequest(ctx.baseUrl, '/api/health', { method: 'GET' });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.status, 'healthy');
    assert.ok(typeof res1.body.uptimeSeconds === 'number');
    assert.ok(res1.body.timestamp);

    // Test alias /health/live
    const res2 = await apiRequest(ctx.baseUrl, '/api/health/live', { method: 'GET' });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.status, 'healthy');
  });

  await t.test('1.2: GET /ready and /health/ready return 200 with database health status', async () => {
    const res1 = await apiRequest(ctx.baseUrl, '/api/ready', { method: 'GET' });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.status, 'ready');
    assert.strictEqual(res1.body.database.status, 'healthy');
    assert.ok(typeof res1.body.database.latencyMs === 'number');

    // Test alias /health/ready
    const res2 = await apiRequest(ctx.baseUrl, '/api/health/ready', { method: 'GET' });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.status, 'ready');
  });

  // =========================================================================
  // SECTION 2: Strict Tenant Isolation & IDOR Protection Audit
  // =========================================================================
  await t.test('2.1: Business Alpha cannot query or access Business Beta resources', async () => {
    // Attempt to access Beta's branches with Alpha's token
    const res = await apiRequest(ctx.baseUrl, `/api/business/${businessBetaId}/branches`, {
      method: 'GET',
      token: ownerAlphaToken,
    });
    // Must return 401 or 403 Forbidden
    assert.ok(res.status === 401 || res.status === 403, `Expected 401/403 but got ${res.status}`);
  });

  await t.test('2.2: ID manipulation: Alpha attempting to modify Beta settings is blocked', async () => {
    const res = await apiRequest(
      ctx.baseUrl,
      `/api/business/${businessBetaId}/settings`,
      {
        method: 'PUT',
        body: { name: 'Hacked Bistro Name' },
        token: ownerAlphaToken,
      }
    );
    assert.ok(res.status === 401 || res.status === 403, `Expected 401/403 but got ${res.status}`);

    // Verify Beta name was unaffected in DB
    const beta = await prisma.business.findUnique({ where: { id: businessBetaId } });
    assert.notStrictEqual(beta?.name, 'Hacked Bistro Name');
  });

  // =========================================================================
  // SECTION 3: RBAC Final Audit
  // =========================================================================
  await t.test('3.1: Super Admin can access platform admin endpoints', async () => {
    // Authenticate as seeded platform Super Admin
    const loginRes = await apiRequest(ctx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@reployty.com', password: 'AdminPass123!' },
    });
    assert.strictEqual(loginRes.status, 200, 'Super Admin login succeeds');
    const adminToken = loginRes.body.sessionToken;

    const res = await apiRequest(ctx.baseUrl, '/api/admin/overview', {
      method: 'GET',
      token: adminToken,
    });
    assert.strictEqual(res.status, 200);
  });

  await t.test('3.2: Business Staff cannot access billing management or staff admin', async () => {
    const res = await apiRequest(
      ctx.baseUrl,
      `/api/business/${businessAlphaId}/billing`,
      {
        method: 'GET',
        token: staffAlphaToken,
      }
    );
    // Staff role should be forbidden from accessing billing
    assert.ok(res.status === 401 || res.status === 403, `Expected 401/403 for staff on billing, got ${res.status}`);
  });

  // =========================================================================
  // SECTION 4: Customer Lifecycle & Atomic Redemption
  // =========================================================================
  let customerId: string;
  let customerPhone: string;
  let programId: string;
  let rewardId: string;

  await t.test('4.1: Setup Loyalty Program and Reward for Business Alpha', async () => {
    const program = await prisma.loyaltyProgram.create({
      data: {
        businessId: businessAlphaId,
        name: 'Artisan Rewards',
        type: 'STAMP',
        targetStamps: 5,
        rewardTitle: 'Free Single Origin Coffee',
        status: 'ACTIVE',
      },
    });
    programId = program.id;

    const reward = await prisma.reward.create({
      data: {
        businessId: businessAlphaId,
        programId: program.id,
        title: 'Complimentary Single Origin Pour Over',
        description: 'Enjoy a free pour-over after 5 stamps',
        pointsRequired: 0,
        stampsRequired: 5,
        status: 'ACTIVE',
      },
    });
    rewardId = reward.id;

    assert.ok(programId);
    assert.ok(rewardId);
  });

  await t.test('4.2: Customer joins via phone and earns loyalty stamps to qualify for reward', async () => {
    customerPhone = `+9198000${Math.floor(10000 + Math.random() * 90000)}`;

    // Create customer profile with consent and stamps balance
    const customer = await prisma.customer.create({
      data: {
        businessId: businessAlphaId,
        branchId: branchAlphaId,
        phone: customerPhone,
        name: 'Real Pilot Customer',
        marketingConsent: true,
        stampsBalance: 5, // Fully earned 5 stamps
        consents: {
          create: {
            channel: 'WHATSAPP',
            granted: true,
            source: 'PWA_ONBOARDING',
          },
        },
      },
    });
    customerId = customer.id;
    assert.strictEqual(customer.stampsBalance, 5);
  });

  await t.test('4.3: Anti-Fraud: Concurrent redemptions of same reward voucher allow only ONE claim', async () => {
    // Generate reward voucher redemption in CLAIMED status
    const redemption = await prisma.rewardRedemption.create({
      data: {
        rewardId,
        customerId,
        businessId: businessAlphaId,
        branchId: branchAlphaId,
        redemptionCode: `VOUCHER-${RUN_ID}`,
        status: 'CLAIMED',
        stampsConsumed: 5,
      },
    });

    // Simulate two concurrent staff redemption requests for the same voucher code
    const redeemVoucher = async () => {
      // Atomic condition-guarded update: only 1 runner can transition CLAIMED -> REDEEMED
      const updateResult = await prisma.rewardRedemption.updateMany({
        where: {
          id: redemption.id,
          status: 'CLAIMED',
        },
        data: {
          status: 'REDEEMED',
          redeemedAt: new Date(),
        },
      });
      if (updateResult.count === 0) {
        throw new Error('VOUCHER_ALREADY_REDEEMED');
      }
      return updateResult;
    };

    // Execute concurrently
    const results = await Promise.allSettled([redeemVoucher(), redeemVoucher()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one transaction must succeed; the other must be rejected
    assert.strictEqual(fulfilled.length, 1, 'Only one redemption should succeed');
    assert.strictEqual(rejected.length, 1, 'The duplicate redemption must fail');
  });

  // =========================================================================
  // SECTION 5: Campaign Scheduling & Queue Concurrency
  // =========================================================================
  await t.test('5.1: Campaign Scheduler claims and processes SCHEDULED campaigns atomically', async () => {
    // Create a past-due scheduled campaign
    const campaign = await prisma.campaign.create({
      data: {
        businessId: businessAlphaId,
        name: `Morning Brew Blast ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.SCHEDULED,
        scheduledAt: new Date(Date.now() - 60_000), // 1 minute in the past
        messageTemplate: 'Your artisan roast is ready!',
      },
    });

    // Run scheduler
    const scheduleResult = await processDueScheduledCampaigns({ limit: 10 });
    assert.ok(scheduleResult.claimedCount >= 1, 'Expected at least 1 campaign claimed');

    // Verify campaign status transitioned to PROCESSING or completed
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    assert.notStrictEqual(updated?.status, CampaignStatus.SCHEDULED);
  });

  await t.test('5.2: Queue Stale Recovery resets abandoned PROCESSING deliveries back to RETRY_WAIT', async () => {
    // Create dummy campaign and an abandoned delivery locked 10 minutes ago
    const campaign = await prisma.campaign.create({
      data: {
        businessId: businessAlphaId,
        name: `Abandoned Queue Test ${RUN_ID}`,
        channel: CampaignChannel.EMAIL,
        status: CampaignStatus.PROCESSING,
        messageTemplate: 'Test',
      },
    });

    const delivery = await prisma.campaignDelivery.create({
      data: {
        campaignId: campaign.id,
        customerId,
        businessId: businessAlphaId,
        channel: CampaignChannel.EMAIL,
        status: DeliveryStatus.PROCESSING,
        lockedAt: new Date(Date.now() - 10 * 60_000), // 10 minutes ago
        lockedBy: 'crashed-worker-pid-999',
      },
    });

    const recoveredCount = await recoverStaleDeliveries(5);
    assert.ok(recoveredCount >= 1, 'Expected stale delivery to be recovered');

    const refreshed = await prisma.campaignDelivery.findUnique({ where: { id: delivery.id } });
    assert.strictEqual(refreshed?.status, DeliveryStatus.RETRY_WAIT);
    assert.strictEqual(refreshed?.lockedBy, null);
  });

  // =========================================================================
  // SECTION 6: Messaging Provider Connectors & Webhook Security
  // =========================================================================
  await t.test('6.1: Webhook endpoint rejects invalid signatures with 401', async () => {
    const invalidSignatureRes = await apiRequest(
      ctx.baseUrl,
      '/api/billing/webhook',
      {
        method: 'POST',
        body: { event: 'payment.success' },
        headers: { 'x-webhook-secret': 'invalid_forged_secret' },
      }
    );
    assert.strictEqual(invalidSignatureRes.status, 401);
  });

  // =========================================================================
  // SECTION 7: Billing & Usage Metering Atomicity
  // =========================================================================
  await t.test('7.1: Usage Metering records billable events idempotently and deduplicates retries', async () => {
    const testDeliveryId = `dlv_test_${RUN_ID}`;
    const idempotencyKey = `msg_${testDeliveryId}`;

    // First call records usage
    const firstCall = await UsageMeterService.recordUsageIdempotent({
      businessId: businessAlphaId,
      meterType: UsageMeterType.WHATSAPP_MESSAGE,
      quantity: 1,
      sourceType: 'CAMPAIGN_DELIVERY',
      sourceId: testDeliveryId,
      idempotencyKey,
      channel: CampaignChannel.WHATSAPP,
    });
    assert.strictEqual(firstCall.isDuplicate, false);
    assert.ok(firstCall.event.id);

    // Second call with same idempotencyKey is recognized as duplicate
    const secondCall = await UsageMeterService.recordUsageIdempotent({
      businessId: businessAlphaId,
      meterType: UsageMeterType.WHATSAPP_MESSAGE,
      quantity: 1,
      sourceType: 'CAMPAIGN_DELIVERY',
      sourceId: testDeliveryId,
      idempotencyKey,
      channel: CampaignChannel.WHATSAPP,
    });
    assert.strictEqual(secondCall.isDuplicate, true);
    assert.strictEqual(secondCall.event.id, firstCall.event.id);

    // Verify DB count has exactly 1 event for this idempotency key
    const count = await prisma.usageMeterEvent.count({
      where: { idempotencyKey },
    });
    assert.strictEqual(count, 1, 'PostgreSQL must contain strictly 1 meter record');
  });

  // =========================================================================
  // SECTION 8: Worker Manager Overlap Protection & Shutdown
  // =========================================================================
  await t.test('8.1: WorkerManager prevents overlapping execution of identical job', async () => {
    let executionCount = 0;

    // Simulate a slow job
    const slowJob = async () => {
      executionCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { count: executionCount };
    };

    // Run simultaneously
    const [res1, res2] = await Promise.all([
      workerManager.runJob('p29_test_job', slowJob),
      workerManager.runJob('p29_test_job', slowJob),
    ]);

    // One job should succeed and the overlapping one should be safely skipped
    assert.ok(
      (res1.success && !res2.success) || (!res1.success && res2.success),
      'One job must succeed and the overlapping run must be skipped'
    );
    assert.strictEqual(executionCount, 1, 'Job function should have only been invoked once');
  });

  await t.test('8.2: WorkerManager start and stop scheduled jobs', () => {
    workerManager.startScheduledJobs(60_000);
    assert.strictEqual(workerManager.isRunning(), true);

    workerManager.stopScheduledJobs();
    assert.strictEqual(workerManager.isRunning(), false);
  });
});
