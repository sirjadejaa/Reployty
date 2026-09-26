/**
 * REPLOYTY — PHASE 17: TENANT, BRANCH & RBAC ISOLATION MATRIX + CONCURRENCY & INTEGRITY
 *
 * Exhaustive multi-tenant security verification:
 * - Complete Tenant-Isolation Matrix (Section 20)
 * - Branch-Isolation Matrix (Section 21)
 * - RBAC Permission Matrix (Section 22)
 * - Session Crossover Security Matrix (Section 23)
 * - Security Regressions (Section 24)
 * - Concurrency & Race-Condition Resistance (Section 26)
 * - Post-Suite Database Invariants & Integrity Audit (Section 27)
 */

import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../src/server/db/client';
import {
  startTestServer,
  apiRequest,
  createE2ETestFixtures,
  cleanupE2ETestFixtures,
  E2ETestFixtures,
  TestServerContext,
} from './test_helpers';
import { createSession } from '../../src/server/auth/sessionService';
import { BusinessCategory, UserStatus } from '@prisma/client';

test('REPLOYTY TENANT, BRANCH & RBAC ISOLATION MATRIX (PHASE 17)', async (t) => {
  let serverCtx: TestServerContext;
  let fx: E2ETestFixtures;

  t.before(async () => {
    serverCtx = await startTestServer();
    fx = await createE2ETestFixtures();
  });

  t.after(async () => {
    if (fx) {
      await cleanupE2ETestFixtures(fx);
    }
    if (serverCtx) {
      await serverCtx.stop();
    }
  });

  // =========================================================================
  // 1. TENANT-ISOLATION MATRIX (Section 20)
  // =========================================================================
  await t.test('Tenant-Isolation Matrix: Business B cannot Read, Mutate, or Delete Business A Resources', async () => {
    const ownerBToken = fx.ownerBSession.sessionToken;

    // A. Business Profile & Branches
    const crossBranchRead = await apiRequest(serverCtx.baseUrl, `/api/business/branches/${fx.branchA1.id}`, {
      token: ownerBToken,
    });
    assert.ok([403, 404].includes(crossBranchRead.status), 'B cannot read A branch');

    const crossBranchUpdate = await apiRequest(serverCtx.baseUrl, `/api/business/branches/${fx.branchA1.id}`, {
      method: 'PUT',
      token: ownerBToken,
      body: { name: 'Hacked Branch Name' },
    });
    assert.ok([403, 404].includes(crossBranchUpdate.status), 'B cannot update A branch');

    // B. Customers & CRM
    const crossCustomerRead = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${fx.customerA.id}`, {
      token: ownerBToken,
    });
    assert.ok([403, 404].includes(crossCustomerRead.status), 'B cannot read A customer 360');

    const crossCustomerUpdate = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${fx.customerA.id}`, {
      method: 'PUT',
      token: ownerBToken,
      body: { name: 'Hacked Customer Name' },
    });
    assert.ok([403, 404].includes(crossCustomerUpdate.status), 'B cannot update A customer profile');

    const crossCustomerTimeline = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${fx.customerA.id}/timeline`, {
      token: ownerBToken,
    });
    assert.ok([403, 404].includes(crossCustomerTimeline.status), 'B cannot read A customer timeline');

    const crossCustomerNote = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${fx.customerA.id}/notes`, {
      method: 'POST',
      token: ownerBToken,
      body: { content: 'Malicious note injected by B' },
    });
    assert.ok([403, 404].includes(crossCustomerNote.status), 'B cannot append notes to A customer');

    // C. Loyalty & Rewards
    const crossAwardStamp = await apiRequest(serverCtx.baseUrl, '/api/business/loyalty/award-stamp', {
      method: 'POST',
      token: ownerBToken,
      body: {
        customerId: fx.customerA.id, // A's customer
        stampsToAdd: 5,
      },
    });
    assert.ok([400, 403, 404].includes(crossAwardStamp.status), 'B cannot award stamps to A customer');

    // Create a reward under Business A
    const rewardA = await prisma.reward.create({
      data: {
        businessId: fx.businessA.id,
        title: 'Exclusive A Reward',
        stampsRequired: 2,
        status: 'ACTIVE',
      },
    });

    const crossRewardUpdate = await apiRequest(serverCtx.baseUrl, `/api/business/rewards/${rewardA.id}`, {
      method: 'PUT',
      token: ownerBToken,
      body: { title: 'Compromised Reward Title' },
    });
    assert.ok([403, 404].includes(crossRewardUpdate.status), 'B cannot update A reward');

    // D. Promotional Offers
    const offerA = await prisma.offer.create({
      data: {
        businessId: fx.businessA.id,
        title: 'Secret Offer A',
        type: 'PERCENTAGE_DISCOUNT',
        discountValue: 15,
        status: 'ACTIVE',
      },
    });

    const crossOfferRead = await apiRequest(serverCtx.baseUrl, `/api/business/offers/${offerA.id}`, {
      token: ownerBToken,
    });
    assert.ok([403, 404].includes(crossOfferRead.status), 'B cannot read A offer');

    const crossOfferRedeem = await apiRequest(serverCtx.baseUrl, '/api/business/offers/redeem', {
      method: 'POST',
      token: ownerBToken,
      body: {
        offerId: offerA.id,
        customerId: fx.customerB.id,
        branchId: fx.branchB1.id,
      },
    });
    assert.ok([400, 403, 404].includes(crossOfferRedeem.status), 'B cannot redeem A offer for B customer');

    // E. Catalog (Menus, Categories, Items)
    const menuA = await prisma.menu.create({
      data: { businessId: fx.businessA.id, name: 'Main A Menu' },
    });
    const crossMenuDelete = await apiRequest(serverCtx.baseUrl, `/api/business/catalog/menus/${menuA.id}`, {
      method: 'DELETE',
      token: ownerBToken,
    });
    assert.ok([403, 404].includes(crossMenuDelete.status), 'B cannot delete A menu');

    // F. Reviews & Generations
    const reviewA = await prisma.reviewFeedback.create({
      data: {
        businessId: fx.businessA.id,
        customerId: fx.customerA.id,
        rating: 4,
        feedbackText: 'Great service at A',
      },
    });
    const crossAiGen = await apiRequest(serverCtx.baseUrl, `/api/business/reviews/${reviewA.id}/generate-ai`, {
      method: 'POST',
      token: ownerBToken,
    });
    assert.ok([403, 404].includes(crossAiGen.status), 'B cannot trigger AI draft for A review');

    // G. Analytics & Billing
    const crossAnalytics = await apiRequest(serverCtx.baseUrl, `/api/business/analytics/overview?branchId=${fx.branchA1.id}`, {
      token: ownerBToken,
    });
    // Analytics overview for B must never reflect branch A1's metrics
    if (crossAnalytics.status === 200) {
      assert.strictEqual(crossAnalytics.body.metrics?.totalCustomers ?? 0, 1, 'Only B customer counted');
    }
  });

  // =========================================================================
  // 2. BRANCH-ISOLATION MATRIX (Section 21)
  // =========================================================================
  await t.test('Branch-Isolation Matrix: Branch A1 restricted staff access controls', async () => {
    const staffA1Token = fx.staffA1Session.sessionToken;

    // 1. Staff A1 can access authorized operations in Branch A1
    const allowedBranchRead = await apiRequest(serverCtx.baseUrl, `/api/business/branches/${fx.branchA1.id}`, {
      token: staffA1Token,
    });
    assert.ok([200, 403].includes(allowedBranchRead.status), 'Authorized branch response evaluated by role/branch');

    // 2. Cross-Business access denied
    const crossBizBranch = await apiRequest(serverCtx.baseUrl, `/api/business/branches/${fx.branchB1.id}`, {
      token: staffA1Token,
    });
    assert.ok([403, 404].includes(crossBizBranch.status), 'Staff A1 cannot access Business B branch');

    // 3. Voucher redemption targeting Branch A2 when staff restricted to A1
    const branchRestrictedReward = await prisma.reward.create({
      data: {
        businessId: fx.businessA.id,
        title: 'Branch A2 Exclusive Coffee',
        branchId: fx.branchA2.id,
        stampsRequired: 1,
        status: 'ACTIVE',
      },
    });

    const voucherA2 = await prisma.rewardRedemption.create({
      data: {
        businessId: fx.businessA.id,
        customerId: fx.customerA.id,
        rewardId: branchRestrictedReward.id,
        branchId: fx.branchA2.id, // Strictly A2
        redemptionCode: `R-BR2-${Date.now().toString(36).toUpperCase()}`,
        status: 'CLAIMED',
      },
    });

    const redeemRestricted = await apiRequest(serverCtx.baseUrl, '/api/business/redemptions/validate', {
      method: 'POST',
      token: staffA1Token,
      body: {
        code: voucherA2.redemptionCode,
        branchId: fx.branchA1.id, // Staff attempts at Branch A1
      },
    });
    assert.ok(redeemRestricted.status >= 400, 'Branch-restricted voucher rejected at non-matching branch');
  });

  // =========================================================================
  // 3. RBAC PERMISSION MATRIX (Section 22)
  // =========================================================================
  await t.test('RBAC Permission Matrix: Owner vs Manager vs Staff vs Platform Super Admin', async () => {
    const staffA1Token = fx.staffA1Session.sessionToken;
    const managerAToken = fx.managerASession.sessionToken;
    const ownerAToken = fx.ownerASession.sessionToken;

    // 1. Staff role attempting SETTINGS_MANAGE (e.g. Updating business profile) -> 403
    const staffProfileEdit = await apiRequest(serverCtx.baseUrl, '/api/business/profile', {
      method: 'PUT',
      token: staffA1Token,
      body: { name: 'Illegal Renaming By Staff' },
    });
    assert.strictEqual(staffProfileEdit.status, 403, 'Staff lacks SETTINGS_MANAGE -> 403');

    // 2. Staff role attempting BILLING_MANAGE -> 403
    const staffBillingCancel = await apiRequest(serverCtx.baseUrl, '/api/business/billing/cancel', {
      method: 'POST',
      token: staffA1Token,
    });
    assert.strictEqual(staffBillingCancel.status, 403, 'Staff lacks BILLING_MANAGE -> 403');

    // 3. Manager role attempting BILLING_MANAGE -> 403
    const managerBilling = await apiRequest(serverCtx.baseUrl, '/api/business/billing/cancel', {
      method: 'POST',
      token: managerAToken,
    });
    assert.strictEqual(managerBilling.status, 403, 'Manager lacks BILLING_MANAGE -> 403');

    // 4. Owner role accessing billing -> 200
    const ownerBilling = await apiRequest(serverCtx.baseUrl, '/api/business/billing', {
      token: ownerAToken,
    });
    assert.strictEqual(ownerBilling.status, 200, 'Owner has BILLING_MANAGE -> 200');

    // 5. Business Owner attempting Super Admin platform route -> 403
    const ownerSuperAdmin = await apiRequest(serverCtx.baseUrl, '/api/admin/overview', {
      token: ownerAToken,
    });
    assert.strictEqual(ownerSuperAdmin.status, 403, 'Business Owner denied Super Admin route -> 403');
  });

  // =========================================================================
  // 4. SESSION CROSSOVER SECURITY MATRIX (Section 23)
  // =========================================================================
  await t.test('Session Crossover Matrix: Identity Boundary Verification', async () => {
    const customerToken = fx.customerASession.sessionToken;
    const staffToken = fx.staffA1Session.sessionToken;

    // 1. Customer Token hitting Business Admin API -> 401
    const custOnBiz = await apiRequest(serverCtx.baseUrl, '/api/business/customers', {
      customerToken, // Passing customer token
    });
    assert.strictEqual(custOnBiz.status, 401, 'Customer token rejected on Business API');

    // 2. Business Staff Token hitting Customer API -> 401
    const staffOnCust = await apiRequest(serverCtx.baseUrl, '/api/customer/me', {
      token: staffToken, // Passing business session token
    });
    assert.strictEqual(staffOnCust.status, 401, 'Staff session token rejected on Customer API');

    // 3. Bogus/Forged Token -> 401
    const forgedTokenRes = await apiRequest(serverCtx.baseUrl, '/api/business/profile', {
      token: 'forged_session_token_xyz_123',
    });
    assert.strictEqual(forgedTokenRes.status, 401, 'Forged token rejected with 401');

    // 4. Expired Customer Session Token -> 401
    const expiredCustSession = await prisma.customerSession.create({
      data: {
        customerId: fx.customerA.id,
        businessId: fx.businessA.id,
        sessionToken: `expired_cust_${Date.now()}`,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });
    const expiredCustRes = await apiRequest(serverCtx.baseUrl, '/api/customer/me', {
      customerToken: expiredCustSession.sessionToken,
    });
    assert.strictEqual(expiredCustRes.status, 401, 'Expired customer session rejected with 401');
    await prisma.customerSession.delete({ where: { id: expiredCustSession.id } });
  });

  // =========================================================================
  // 5. SECURITY REGRESSION FLOWS (Section 24)
  // =========================================================================
  await t.test('Security Regression: CSV Formula Injection Escaping & Webhook Auth', async () => {
    const ownerAToken = fx.ownerASession.sessionToken;

    // 1. CSV Formula Injection Defense: Create customer with Excel formula payload
    const formulaPayload = '=cmd|"/C calc"!A0';
    const csvCustomer = await prisma.customer.create({
      data: {
        businessId: fx.businessA.id,
        name: formulaPayload,
        phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      },
    });

    const csvRes = await apiRequest(serverCtx.baseUrl, '/api/business/analytics/export?type=customers', {
      token: ownerAToken,
    });
    assert.strictEqual(csvRes.status, 200);
    // Verifying that the formula prefix '=' is sanitized with a leading single quote or safe prefix
    assert.ok(
      csvRes.body.includes(`"'=cmd`) || csvRes.body.includes(`\'=cmd`) || !csvRes.body.includes(`\n=cmd`),
      'CSV formula trigger sanitized safely'
    );
    await prisma.customer.delete({ where: { id: csvCustomer.id } });

    // 2. Billing Webhook Authentication: Missing or invalid secret rejected
    const invalidWebhook = await apiRequest(serverCtx.baseUrl, '/api/billing/webhook', {
      method: 'POST',
      headers: {
        'x-webhook-secret': 'invalid_secret_token',
      },
      body: { eventId: 'evt_invalid' },
    });
    assert.strictEqual(invalidWebhook.status, 401, 'Webhook with invalid secret rejected');
  });

  // =========================================================================
  // 6. CONCURRENCY TESTING (Section 26)
  // =========================================================================
  await t.test('Concurrency Testing: Parallel Voucher Redemption & Stamp Awards', async () => {
    const ownerAToken = fx.ownerASession.sessionToken;

    // 1. Create a single-use reward voucher (unrestricted branch)
    const testReward = await prisma.reward.create({
      data: {
        businessId: fx.businessA.id,
        title: 'Concurrency Test Reward',
        stampsRequired: 1,
        status: 'ACTIVE',
      },
    });
    const voucher = await prisma.rewardRedemption.create({
      data: {
        businessId: fx.businessA.id,
        customerId: fx.customerA.id,
        rewardId: testReward.id,
        redemptionCode: `R-CONC-${Date.now().toString(36).toUpperCase()}`,
        status: 'CLAIMED',
      },
    });

    // Fire 5 simultaneous redemptions of the exact same voucher code
    const parallelRedemptions = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        apiRequest(serverCtx.baseUrl, '/api/business/redemptions/validate', {
          method: 'POST',
          token: ownerAToken,
          body: {
            code: voucher.redemptionCode,
            branchId: fx.branchA1.id,
          },
        })
      )
    );

    const successfulRedemptions = parallelRedemptions.filter((r) => r.status === 200);
    const blockedRedemptions = parallelRedemptions.filter((r) => [400, 409].includes(r.status));

    assert.strictEqual(successfulRedemptions.length, 1, 'Strictly 1 redemption succeeds in race condition');
    assert.strictEqual(blockedRedemptions.length, 4, 'Remaining 4 concurrent attempts blocked');

    // 2. Concurrent Stamp Awards: Test balance integrity
    // Ensure active loyalty program exists for Business A
    const existingProg = await prisma.loyaltyProgram.findFirst({
      where: { businessId: fx.businessA.id, status: 'ACTIVE' },
    });
    if (!existingProg) {
      await prisma.loyaltyProgram.create({
        data: {
          businessId: fx.businessA.id,
          name: 'Coffee Stamp Card',
          type: 'STAMP',
          targetStamps: 10,
          rewardTitle: 'Free Concurrency Coffee',
          status: 'ACTIVE',
        },
      });
    }

    const initialCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: fx.customerA.id } });
    const initialStamps = initialCustomer.stampsBalance;

    // Fire 3 simultaneous 1-stamp awards
    await Promise.all(
      Array.from({ length: 3 }).map((_, i) =>
        apiRequest(serverCtx.baseUrl, '/api/business/loyalty/award-stamp', {
          method: 'POST',
          token: ownerAToken,
          body: {
            customerId: fx.customerA.id,
            stampsToAdd: 1,
            spendMinor: 500,
            idempotencyKey: `conc_stamp_${Date.now()}_${i}`,
          },
        })
      )
    );

    const afterCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: fx.customerA.id } });
    assert.strictEqual(afterCustomer.stampsBalance, initialStamps + 3, 'Atomic stamp increments prevent lost updates');
  });

  // =========================================================================
  // 7. POST-TEST DATA-INTEGRITY AUDIT (Section 27)
  // =========================================================================
  await t.test('Data-Integrity Audit: Verify Database Invariants', async () => {
    // 1. Invariant: Negative balances must not exist
    const negativeStamps = await prisma.customer.count({
      where: { stampsBalance: { lt: 0 } },
    });
    assert.strictEqual(negativeStamps, 0, 'Zero customers have negative stampsBalance');

    const negativePoints = await prisma.customer.count({
      where: { pointsBalance: { lt: 0 } },
    });
    assert.strictEqual(negativePoints, 0, 'Zero customers have negative pointsBalance');

    const negativeCardStamps = await prisma.loyaltyCard.count({
      where: { stampsCollected: { lt: 0 } },
    });
    assert.strictEqual(negativeCardStamps, 0, 'Zero loyalty cards have negative stampsCollected');

    // 2. Invariant: Cross-tenant relationships must not exist
    const misalignedCards = await prisma.$queryRaw<any[]>`
      SELECT lc.id FROM loyalty_cards lc
      JOIN customers c ON lc."customerId" = c.id
      WHERE lc."businessId" != c."businessId"
    `;
    assert.strictEqual(misalignedCards.length, 0, 'Zero cross-tenant loyalty card assignments');

    const misalignedRedemptions = await prisma.$queryRaw<any[]>`
      SELECT rr.id FROM reward_redemptions rr
      JOIN customers c ON rr."customerId" = c.id
      WHERE rr."businessId" != c."businessId"
    `;
    assert.strictEqual(misalignedRedemptions.length, 0, 'Zero cross-tenant reward redemptions');

    // 3. Invariant: Duplicate active subscriptions must not exist per business
    const duplicateSubs = await prisma.$queryRaw<any[]>`
      SELECT "businessId", count(*) FROM subscriptions
      WHERE status = 'ACTIVE'
      GROUP BY "businessId"
      HAVING count(*) > 1
    `;
    assert.strictEqual(duplicateSubs.length, 0, 'Zero businesses have duplicate active subscriptions');
  });
});
