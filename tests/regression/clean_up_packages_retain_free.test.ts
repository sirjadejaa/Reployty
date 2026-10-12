/**
 * REPLOYTY: REGRESSION TEST SUITE
 * CLEAN UP MANUALLY CREATED PACKAGES AND RETAIN ONLY FREE
 * 
 * Verifies all Section 8 requirements:
 * 1. Canonical Free package is preserved (exact identifier, quotas, features, active status).
 * 2. Unwanted manually created packages disappear from active catalogue.
 * 3. Eligible businesses are safely reassigned according to existing rules.
 * 4. Active paid subscriptions are not silently destroyed.
 * 5. Historical invoices and subscription records remain intact.
 * 6. Package deletion is blocked when required by historical referential integrity (409 PLAN_IN_USE).
 * 7. Archived / deactivated packages cannot be newly assigned.
 * 8. New businesses can still receive Free.
 * 9. Only authorized Super Admins can perform cleanup.
 * 10. Repeating the cleanup does not duplicate Free or corrupt data (idempotency).
 * 11. Existing entitlement enforcement remains correct.
 */

import test from 'node:test';
import assert from 'node:assert';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword, createSession } from '../../src/server/auth/sessionService';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import { getBusinessSubscription, getUsageAndLimits, hasFeature } from '../../src/server/services/entitlementService';
import { adminAssignBusinessPlan, changePlan } from '../../src/server/services/billingService';
import { SubscriptionStatus } from '@prisma/client';

test('REGRESSION: CLEAN UP MANUALLY CREATED PACKAGES AND RETAIN ONLY FREE', async (t) => {
  let serverCtx: TestServerContext;
  let adminUser: any;
  let adminSession: any;
  let regularUser: any;
  let regularSession: any;

  const runId = Math.random().toString(36).substring(2, 8);
  const getToken = (s: any) => s?.sessionToken || s?.token || '';

  t.before(async () => {
    serverCtx = await startTestServer();

    // 1. Super Admin
    adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@reployty.com' } });
    adminSession = await createSession(adminUser.id, null);

    // 2. Regular non-admin user
    const passHash = await hashPassword('TestUser123!');
    regularUser = await prisma.user.create({
      data: {
        email: `regular-user-${runId}@example.com`,
        passwordHash: passHash,
        name: `Regular User ${runId}`,
        phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
        isSuperAdmin: false,
      },
    });
    regularSession = await createSession(regularUser.id, null);
  });

  t.after(async () => {
    if (serverCtx?.stop) {
      await serverCtx.stop();
    }
  });

  // =========================================================================
  // TEST 1: Authorization Checks for Cleanup Endpoints
  // =========================================================================
  await t.test('1. RBAC: Only authorized Super Admins can preview or execute package cleanup', async () => {
    // Non-admin preview
    const previewRes = await apiRequest(serverCtx.baseUrl, '/api/admin/plans/cleanup/preview', {
      method: 'GET',
      token: getToken(regularSession),
    });
    assert.strictEqual(previewRes.status, 403, 'Non-Super Admin receives 403 on cleanup preview');

    // Non-admin execute
    const execRes = await apiRequest(serverCtx.baseUrl, '/api/admin/plans/cleanup', {
      method: 'POST',
      token: getToken(regularSession),
      body: { dryRun: false },
    });
    assert.strictEqual(execRes.status, 403, 'Non-Super Admin receives 403 on cleanup execute');

    // Super Admin preview succeeds
    const adminPreviewRes = await apiRequest(serverCtx.baseUrl, '/api/admin/plans/cleanup/preview', {
      method: 'GET',
      token: getToken(adminSession),
    });
    assert.strictEqual(adminPreviewRes.status, 200, 'Super Admin preview succeeds with 200');
    assert.ok(adminPreviewRes.body.canonicalFreePlan, 'Returns canonical Free plan in preview');
    assert.strictEqual(adminPreviewRes.body.canonicalFreePlan.slug, 'free');
  });

  // =========================================================================
  // TEST 2: Creation of Test Package & Business with Invoice to Verify Handling
  // =========================================================================
  let testPackage: any;
  let testBusiness: any;
  let testInvoice: any;
  let testPayment: any;

  await t.test('2. Setup test manual package with business subscription, invoice, and payment', async () => {
    // Create manual package
    testPackage = await prisma.plan.create({
      data: {
        name: `Manual Test Plan ${runId}`,
        slug: `manual-plan-${runId}`,
        priceMinor: 199900,
        currency: 'INR',
        features: ['CUSTOMER_CRM', 'LOYALTY', 'REWARDS', 'AI_REVIEW_ASSISTANT'],
        limits: { maxRewards: 10, maxOffers: 5 },
        maxCustomers: 500,
        maxBranches: 2,
        maxStaff: 5,
        isActive: true,
      },
    });

    // Create test business
    testBusiness = await prisma.business.create({
      data: {
        name: `Test Business Manual ${runId}`,
        slug: `test-biz-manual-${runId}`,
        planId: testPackage.id,
        category: 'CAFE',
        status: 'ACTIVE',
      },
    });

    // Create subscription pointing to testPackage
    const now = new Date();
    const testSub = await prisma.subscription.create({
      data: {
        businessId: testBusiness.id,
        planId: testPackage.id,
        status: SubscriptionStatus.ACTIVE,
        billingInterval: 'MONTHLY',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
      },
    });

    // Create invoice and payment
    testInvoice = await prisma.invoice.create({
      data: {
        businessId: testBusiness.id,
        subscriptionId: testSub.id,
        invoiceNumber: `INV-TEST-${runId}`,
        amountMinor: 199900,
        currency: 'INR',
        status: 'PAID',
        billingPeriod: `Monthly (${testPackage.name})`,
        paidAt: now,
      },
    });

    testPayment = await prisma.payment.create({
      data: {
        businessId: testBusiness.id,
        subscriptionId: testSub.id,
        amountMinor: 199900,
        currency: 'INR',
        status: 'SUCCESS',
        provider: 'REPLOYTY_INTERNAL_GATEWAY',
        providerPaymentId: `pay_test_${runId}`,
        paymentMethod: 'Test Card',
      },
    });

    assert.ok(testPackage.id, 'Test package created');
    assert.ok(testBusiness.id, 'Test business created');
    assert.ok(testInvoice.id, 'Test invoice created');
    assert.ok(testPayment.id, 'Test payment created');
  });

  // =========================================================================
  // TEST 3: Referential Integrity - Direct Deletion Blocked (409 PLAN_IN_USE)
  // =========================================================================
  await t.test('3. Package deletion blocked when in use by subscriptions (referential integrity check)', async () => {
    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/plans/${testPackage.id}`, {
      method: 'DELETE',
      token: getToken(adminSession),
    });

    assert.strictEqual(res.status, 409, 'Returns 409 Conflict when package has active subscriptions');
    assert.strictEqual(res.body.code, 'PLAN_IN_USE');
    assert.ok(res.body.error.includes('subscribed'), 'Explains businesses are currently subscribed');

    // Verify package is still present in database
    const dbPlan = await prisma.plan.findUnique({ where: { id: testPackage.id } });
    assert.ok(dbPlan, 'Package not deleted when protected by subscription constraint');
  });

  // =========================================================================
  // TEST 4: Cleanup Preview Accurately Identifies Unwanted Plans & Businesses
  // =========================================================================
  await t.test('4. Cleanup preview accurately reflects unwanted packages and affected businesses', async () => {
    const res = await apiRequest(serverCtx.baseUrl, '/api/admin/plans/cleanup/preview', {
      method: 'GET',
      token: getToken(adminSession),
    });

    assert.strictEqual(res.status, 200);
    const { canonicalFreePlan, unwantedPlans, affectedBusinesses, summary } = res.body;

    assert.strictEqual(canonicalFreePlan.slug, 'free');
    assert.strictEqual(canonicalFreePlan.priceMinor, 0);

    const foundUnwanted = unwantedPlans.find((p: any) => p.id === testPackage.id);
    assert.ok(foundUnwanted, 'Identified test package as unwanted package to remove');

    const foundBiz = affectedBusinesses.find((b: any) => b.id === testBusiness.id);
    assert.ok(foundBiz, 'Identified test business as affected business to reassign');
    assert.strictEqual(foundBiz.invoicesCount, 1, 'Records historical invoice count');
    assert.strictEqual(foundBiz.paymentsCount, 1, 'Records historical payment count');

    assert.ok(summary.unwantedPlansCount >= 1);
    assert.ok(summary.affectedBusinessesCount >= 1);
  });

  // =========================================================================
  // TEST 5: Execute Package Cleanup & Verify End State
  // =========================================================================
  let cleanupExecutionResult: any;

  await t.test('5. Execute package cleanup: reassigns businesses to Free and deletes unwanted packages', async () => {
    const canonicalFreeBefore = await prisma.plan.findUniqueOrThrow({ where: { slug: 'free' } });

    const res = await apiRequest(serverCtx.baseUrl, '/api/admin/plans/cleanup', {
      method: 'POST',
      token: getToken(adminSession),
      body: { dryRun: false },
    });

    assert.strictEqual(res.status, 200, 'Cleanup executes with 200 OK');
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.deletedPlansCount > 0, 'Cleaned up unwanted packages');
    assert.ok(res.body.reassignedBusinessesCount > 0, 'Reassigned affected businesses');

    cleanupExecutionResult = res.body;

    // Verify canonical Free package identifier was preserved
    const canonicalFreeAfter = await prisma.plan.findUniqueOrThrow({ where: { slug: 'free' } });
    assert.strictEqual(canonicalFreeAfter.id, canonicalFreeBefore.id, 'Preserved canonical Free package ID');
    assert.strictEqual(canonicalFreeAfter.priceMinor, 0, 'Free package price remains 0');
    assert.strictEqual(canonicalFreeAfter.isActive, true, 'Free package remains active');
  });

  // =========================================================================
  // TEST 6: Active Package Catalogue Contains ONLY Canonical Free
  // =========================================================================
  await t.test('6. Active package catalogue contains ONLY canonical Free package', async () => {
    const res = await apiRequest(serverCtx.baseUrl, '/api/admin/plans', {
      method: 'GET',
      token: getToken(adminSession),
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(Array.isArray(res.body), true);
    assert.strictEqual(res.body.length, 1, 'Only ONE package is active in the normal active catalogue');
    assert.strictEqual(res.body[0].slug, 'free', 'The sole active package is Free Starter');
    assert.strictEqual(res.body[0].priceMinor, 0);

    // Unwanted package no longer exists in DB
    const deletedPlan = await prisma.plan.findUnique({ where: { id: testPackage.id } });
    assert.strictEqual(deletedPlan, null, 'Unwanted package was deleted from database');
  });

  // =========================================================================
  // TEST 7: Businesses Safely Reassigned & Invoices/Payments Preserved
  // =========================================================================
  await t.test('7. Business safely reassigned to Free with billing and invoice history preserved', async () => {
    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'free' } });

    // Business is now on Free
    const updatedBiz = await prisma.business.findUniqueOrThrow({ where: { id: testBusiness.id } });
    assert.strictEqual(updatedBiz.planId, freePlan.id, 'Business.planId updated to Free');

    const updatedSub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: testBusiness.id } });
    assert.strictEqual(updatedSub.planId, freePlan.id, 'Subscription.planId updated to Free');
    assert.strictEqual(updatedSub.status, 'ACTIVE', 'Subscription status is ACTIVE');

    // Historical invoice is completely preserved
    const dbInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: testInvoice.id } });
    assert.strictEqual(dbInvoice.amountMinor, 199900, 'Invoice amount untouched');
    assert.strictEqual(dbInvoice.businessId, testBusiness.id, 'Invoice business link untouched');

    // Historical payment is completely preserved
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: testPayment.id } });
    assert.strictEqual(dbPayment.amountMinor, 199900, 'Payment amount untouched');
    assert.strictEqual(dbPayment.businessId, testBusiness.id, 'Payment business link untouched');

    // AuditLog recorded reassignment
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'BUSINESS',
        entityId: testBusiness.id,
        action: 'BUSINESS_PLAN_REASSIGNED_TO_FREE',
      },
    });
    assert.ok(auditLogs.length >= 1, 'Audit log recorded for business package reassignment to Free');
  });

  // =========================================================================
  // TEST 8: Archived/Deactivated Seed Packages Cannot Be Newly Assigned
  // =========================================================================
  await t.test('8. Archived/deactivated packages cannot be newly assigned', async () => {
    const inactivePlan = await prisma.plan.create({
      data: {
        name: `Inactive Test Plan ${runId}`,
        slug: `inactive-test-plan-${runId}`,
        priceMinor: 250000,
        currency: 'INR',
        billingInterval: 'MONTHLY',
        isActive: false,
        features: ['CUSTOM_BRANDING'],
        limits: {},
        maxCustomers: 100,
        maxBranches: 1,
        maxStaff: 2,
      },
    });

    try {
      const bizCtx = await getTenantContext(adminUser.id, testBusiness.id);
      await assert.rejects(
        async () => {
          await changePlan(bizCtx, inactivePlan.id);
        },
        /This plan is no longer available for new subscriptions/,
        'Rejects assignment of inactive / archived package'
      );
    } finally {
      await prisma.plan.delete({ where: { id: inactivePlan.id } });
    }
  });

  // =========================================================================
  // TEST 9: New Businesses Can Still Receive Free Package
  // =========================================================================
  await t.test('9. New businesses can still receive canonical Free package', async () => {
    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'free' } });

    const newBiz = await prisma.business.create({
      data: {
        name: `Brand New Business ${runId}`,
        slug: `brand-new-${runId}`,
        category: 'RETAIL',
        status: 'ACTIVE',
      },
    });

    // Auto-provision via entitlement service
    const sub = await getBusinessSubscription(newBiz.id);
    assert.ok(sub, 'Subscription auto-provisioned');
    assert.strictEqual(sub.planId, freePlan.id, 'New business received Free package');
    assert.strictEqual(sub.plan.slug, 'free');
    assert.strictEqual(sub.status, 'ACTIVE');

    // Cleanup test business
    await prisma.subscription.deleteMany({ where: { businessId: newBiz.id } });
    await prisma.business.delete({ where: { id: newBiz.id } });
  });

  // =========================================================================
  // TEST 10: Idempotency - Repeating Cleanup Does Not Duplicate Free or Corrupt Data
  // =========================================================================
  await t.test('10. Repeating cleanup is idempotent and does not duplicate Free or corrupt data', async () => {
    const freeCountBefore = await prisma.plan.count({ where: { slug: 'free' } });
    assert.strictEqual(freeCountBefore, 1, 'Exactly one Free plan exists');

    const res = await apiRequest(serverCtx.baseUrl, '/api/admin/plans/cleanup', {
      method: 'POST',
      token: getToken(adminSession),
      body: { dryRun: false },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.deletedPlansCount, 0, 'No remaining unwanted plans to delete');
    assert.strictEqual(res.body.reassignedBusinessesCount, 0, 'No remaining businesses to reassign');

    const freeCountAfter = await prisma.plan.count({ where: { slug: 'free' } });
    assert.strictEqual(freeCountAfter, 1, 'Exactly one Free plan remains (no duplicates created)');
  });

  // =========================================================================
  // TEST 11: Entitlement Enforcement Remains Correct on Free
  // =========================================================================
  await t.test('11. Existing entitlement enforcement remains correct on Free package', async () => {
    // Check features for test business reassigned to Free
    const hasCrm = await hasFeature(testBusiness.id, 'CUSTOMER_CRM');
    const hasAi = await hasFeature(testBusiness.id, 'AI_REVIEW_ASSISTANT');
    const usageAndLimits = await getUsageAndLimits(testBusiness.id);

    assert.strictEqual(hasCrm, true, 'Free plan includes CUSTOMER_CRM');
    assert.strictEqual(hasAi, false, 'Free plan does not include AI_REVIEW_ASSISTANT');
    assert.strictEqual(usageAndLimits.limits.maxCustomers, 100, 'Free maxCustomers is 100');
    assert.strictEqual(usageAndLimits.limits.maxBranches, 1, 'Free maxBranches is 1');
  });

  // =========================================================================
  // TEST 12: Protection - Canonical Free Plan Cannot Be Deleted
  // =========================================================================
  await t.test('12. Canonical Free package cannot be deleted under any circumstances', async () => {
    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'free' } });

    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/plans/${freePlan.id}`, {
      method: 'DELETE',
      token: getToken(adminSession),
    });

    assert.strictEqual(res.status, 400, 'Returns 400 when attempting to delete canonical Free plan');
    assert.ok(res.body.error.includes('canonical Free'), 'Explains canonical Free package cannot be deleted');

    // Verify Free still exists
    const dbFree = await prisma.plan.findUnique({ where: { slug: 'free' } });
    assert.ok(dbFree, 'Canonical Free package remains safe and untouched');
  });

  // =========================================================================
  // TEST 13: Single Package Safe Deletion with Explicit Reassignment
  // =========================================================================
  await t.test('13. Super Admin single package deletion with reassignToFree=true succeeds safely', async () => {
    // Create temporary package with a business
    const tempPlan = await prisma.plan.create({
      data: {
        name: `Temp Single Plan ${runId}`,
        slug: `temp-single-${runId}`,
        priceMinor: 50000,
        features: ['CUSTOMER_CRM'],
      },
    });

    const tempBiz = await prisma.business.create({
      data: {
        name: `Temp Single Biz ${runId}`,
        slug: `temp-single-biz-${runId}`,
        planId: tempPlan.id,
        category: 'SALON',
        status: 'ACTIVE',
      },
    });

    await prisma.subscription.create({
      data: {
        businessId: tempBiz.id,
        planId: tempPlan.id,
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
    });

    // Delete with reassignToFree=true
    const delRes = await apiRequest(serverCtx.baseUrl, `/api/admin/plans/${tempPlan.id}?reassignToFree=true`, {
      method: 'DELETE',
      token: getToken(adminSession),
    });

    assert.strictEqual(delRes.status, 200, 'Single package deletion succeeds when reassignToFree is passed');
    assert.strictEqual(delRes.body.success, true);
    assert.strictEqual(delRes.body.reassignedCount, 1, '1 business reassigned to Free');

    // Verify tempPlan is deleted
    const dbTempPlan = await prisma.plan.findUnique({ where: { id: tempPlan.id } });
    assert.strictEqual(dbTempPlan, null, 'Plan permanently deleted');

    // Verify tempBiz is on Free
    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'free' } });
    const dbTempBiz = await prisma.business.findUniqueOrThrow({ where: { id: tempBiz.id } });
    assert.strictEqual(dbTempBiz.planId, freePlan.id, 'Business moved to Free');

    // Cleanup temp biz
    await prisma.subscription.deleteMany({ where: { businessId: tempBiz.id } });
    await prisma.business.delete({ where: { id: tempBiz.id } });
  });
});
