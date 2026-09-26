import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import {
  getAllPlans,
  getPlanBySlug,
  createPlan,
  updatePlan,
  getBusinessBillingOverview,
  changePlan,
  cancelSubscription,
  resumeSubscription,
  getInvoices,
  getPayments,
  evaluateGraceAndDowngrades,
  adminGetAllSubscriptions,
  adminGetAllInvoices,
  adminGetAllPayments,
  adminUpdateSubscriptionStatus,
  handlePaymentWebhook,
} from '../../src/server/services/billingService';
import {
  getBusinessSubscription,
  getBusinessPlan,
  hasFeature,
  requireFeature,
  getUsageAndLimits,
  checkUsageLimit,
  requireUsageLimit,
  FeatureNotIncludedError,
  UsageLimitExceededError,
} from '../../src/server/services/entitlementService';
import {
  createBranch,
  inviteOrAddStaff,
} from '../../src/server/services/businessService';
import { getAnalyticsOverview } from '../../src/server/services/analyticsService';
import { BillingInterval, SubscriptionStatus, PaymentStatus, InvoiceStatus } from '@prisma/client';

test('REPLOYTY PHASE 15: BILLING, SUBSCRIPTIONS & ENTITLEMENTS TEST SUITE', async (t) => {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 15: BILLING & ENTITLEMENT ENGINE TEST SUITE');
  console.log('==================================================================\n');

  // Setup: Fetch seeded businesses and users
  const cafe = await prisma.business.findUnique({ where: { slug: 'roasted-bean-cafe' } });
  const bakery = await prisma.business.findUnique({ where: { slug: 'new-wave-bakery' } });
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@reployty.com' } });
  const cafeOwner = await prisma.user.findUnique({ where: { email: 'marcus@reployty.com' } });
  const cafeStaff = await prisma.user.findUnique({ where: { email: 'sarah.cashier@reployty.com' } });
  const bakeryOwner = await prisma.user.findUnique({ where: { email: 'chloe.baker@reployty.com' } });

  assert(cafe, 'Setup: Found Cafe (Tenant A)');
  assert(bakery, 'Setup: Found Bakery (Tenant B)');
  assert(adminUser, 'Setup: Found Super Admin');
  assert(cafeOwner, 'Setup: Found Cafe Owner');
  assert(cafeStaff, 'Setup: Found Cafe Staff');
  assert(bakeryOwner, 'Setup: Found Bakery Owner');

  const adminCtx = await getTenantContext(adminUser!.id, cafe!.id);
  const cafeOwnerCtx = await getTenantContext(cafeOwner!.id, cafe!.id);
  const cafeStaffCtx = await getTenantContext(cafeStaff!.id, cafe!.id);
  const bakeryOwnerCtx = await getTenantContext(bakeryOwner!.id, bakery!.id);

  // -------------------------------------------------------------------------
  // 1. Plan Architecture & Pricing
  // -------------------------------------------------------------------------
  await t.test('1. Plan Architecture & Pricing', async () => {
    const plans = await getAllPlans(false);
    assert(plans.length >= 4, 'At least 4 canonical plans exist');

    const freePlan = await getPlanBySlug('free');
    assert(freePlan, 'Free plan exists');
    assert.strictEqual(freePlan!.priceMinor, 0, 'Free plan is 0 minor units');

    const starterPlan = await getPlanBySlug('starter');
    assert(starterPlan, 'Starter plan exists');
    assert.strictEqual(starterPlan!.priceMinor, 149900, 'Starter monthly price is 149900 minor units (₹1,499)');
    assert.strictEqual(starterPlan!.yearlyPriceMinor, 1499000, 'Starter yearly price is 1499000 minor units (₹14,990)');

    const growthPlan = await getPlanBySlug('growth');
    assert(growthPlan, 'Growth plan exists');
    assert.strictEqual(growthPlan!.priceMinor, 299900, 'Growth monthly price is 299900 minor units (₹2,999)');

    console.log('  ✓ PASS: Canonical plans and integer minor units verified');
  });

  // -------------------------------------------------------------------------
  // 2. Super Admin Plan Management
  // -------------------------------------------------------------------------
  await t.test('2. Super Admin Plan Management & RBAC', async () => {
    // Non-superadmin cannot create or update plans
    await assert.rejects(
      async () => {
        await createPlan(cafeOwnerCtx, {
          name: 'Hacker Plan',
          slug: 'hacker-plan',
          priceMinor: 100,
          features: ['ALL'],
        });
      },
      /SuperAdmin platform permission required/,
      'Non-superadmin blocked from creating plans'
    );

    // Super admin creates custom plan
    const customSlug = `custom-${Date.now()}`;
    const customPlan = await createPlan(adminCtx, {
      name: 'Custom Test Plan',
      slug: customSlug,
      description: 'Temporary plan for automated testing',
      priceMinor: 499900,
      yearlyPriceMinor: 4999000,
      features: ['CUSTOMER_CRM', 'LOYALTY', 'BRANCHES'],
      maxBranches: 3,
      maxStaff: 8,
    });
    assert.strictEqual(customPlan.slug, customSlug, 'Custom plan created by Super Admin');

    // Super admin updates plan
    const updatedPlan = await updatePlan(adminCtx, customPlan.id, {
      name: 'Custom Test Plan Updated',
      priceMinor: 549900,
      isActive: false,
    });
    assert.strictEqual(updatedPlan.priceMinor, 549900, 'Plan price updated');
    assert.strictEqual(updatedPlan.isActive, false, 'Plan deactivated');

    // Clean up
    await prisma.plan.delete({ where: { id: customPlan.id } });
    console.log('  ✓ PASS: Super Admin plan creation, update and RBAC verified');
  });

  // -------------------------------------------------------------------------
  // 3. Central Entitlement Service
  // -------------------------------------------------------------------------
  await t.test('3. Central Entitlement Service & Server-Side Enforcement', async () => {
    // Cafe has Growth plan
    const cafePlan = await getBusinessPlan(cafe!.id);
    assert(cafePlan.slug === 'growth' || cafePlan.slug === 'enterprise', 'Cafe is on premium plan');

    // Entitlement checks
    const hasAnalytics = await hasFeature(cafe!.id, 'ANALYTICS');
    assert.strictEqual(hasAnalytics, true, 'Growth plan has ANALYTICS feature');

    await requireFeature(cafeOwnerCtx, 'ANALYTICS'); // should not throw

    // Create a temporary business with Free plan to test feature denial
    const tempBusiness = await prisma.business.create({
      data: {
        name: 'Free Tier Test Shop',
        slug: `free-shop-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    const tempSub = await getBusinessSubscription(tempBusiness.id);
    assert.strictEqual(tempSub.plan.slug, 'free', 'New business auto-assigned Free plan');

    const tempCtx = {
      ...cafeOwnerCtx,
      businessId: tempBusiness.id,
      businessName: tempBusiness.name,
    };

    // Free tier does NOT have AI_REVIEW_ASSISTANT
    const freeHasAi = await hasFeature(tempBusiness.id, 'AI_REVIEW_ASSISTANT');
    assert.strictEqual(freeHasAi, false, 'Free tier has no AI_REVIEW_ASSISTANT');

    // requireFeature throws FeatureNotIncludedError
    await assert.rejects(
      async () => {
        await requireFeature(tempCtx, 'AI_REVIEW_ASSISTANT');
      },
      (err: any) => {
        assert(err instanceof FeatureNotIncludedError);
        assert.strictEqual(err.code, 'FEATURE_NOT_INCLUDED');
        assert.strictEqual(err.featureKey, 'AI_REVIEW_ASSISTANT');
        return true;
      },
      'requireFeature throws structured FeatureNotIncludedError'
    );

    // Direct API bypass attempt: calling getAnalyticsOverview for free tier
    await assert.rejects(
      async () => {
        await getAnalyticsOverview(tempCtx, { preset: '30d' });
      },
      (err: any) => {
        assert.strictEqual(err.code, 'FEATURE_NOT_INCLUDED');
        return true;
      },
      'Direct API call to analytics denied for Free plan (403 FEATURE_NOT_INCLUDED)'
    );

    // Cleanup temp business
    await prisma.subscription.deleteMany({ where: { businessId: tempBusiness.id } });
    await prisma.business.delete({ where: { id: tempBusiness.id } });

    console.log('  ✓ PASS: Entitlement service and direct API enforcement verified');
  });

  // -------------------------------------------------------------------------
  // 4. Usage Limits & Over-Limit Enforcement
  // -------------------------------------------------------------------------
  await t.test('4. Usage Limits Calculation & Over-Limit Protection', async () => {
    // Create isolated test business with Free plan (maxBranches: 1, maxStaff: 2)
    const limitShop = await prisma.business.create({
      data: {
        name: 'Limit Testing Shop',
        slug: `limit-shop-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    const limitCtx = {
      ...cafeOwnerCtx,
      businessId: limitShop.id,
      businessName: limitShop.name,
    };

    // Verify initial usage
    const initialUsage = await getUsageAndLimits(limitShop.id);
    assert.strictEqual(initialUsage.usage.maxBranches, 0, 'Initial branches count is 0');
    assert.strictEqual(initialUsage.limits.maxBranches, 1, 'Free plan branch limit is 1');

    // Create 1st branch (allowed: 0 < 1)
    const branch1 = await createBranch(limitCtx, {
      name: 'Main Flagship',
    });
    assert(branch1.id, 'First branch created successfully');

    // Attempt to create 2nd branch (denied: 1 >= 1)
    await assert.rejects(
      async () => {
        await createBranch(limitCtx, {
          name: 'Second Branch (Should Fail)',
        });
      },
      (err: any) => {
        assert(err instanceof UsageLimitExceededError || err.code === 'LIMIT_EXCEEDED');
        assert.strictEqual(err.limitKey, 'maxBranches');
        assert.strictEqual(err.limit, 1);
        return true;
      },
      'Branch creation blocked when branch limit is reached'
    );

    // Cleanup limit test shop
    await prisma.branch.deleteMany({ where: { businessId: limitShop.id } });
    await prisma.subscription.deleteMany({ where: { businessId: limitShop.id } });
    await prisma.business.delete({ where: { id: limitShop.id } });

    console.log('  ✓ PASS: Usage limits correctly calculated and enforced server-side');
  });

  // -------------------------------------------------------------------------
  // 5. Subscription Upgrades, Invoices & Payments
  // -------------------------------------------------------------------------
  await t.test('5. Plan Upgrade, Invoices & Payment Audit Trail', async () => {
    const subShop = await prisma.business.create({
      data: {
        name: 'Upgrade Testing Shop',
        slug: `upgrade-shop-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    const subShopCtx = {
      ...cafeOwnerCtx,
      businessId: subShop.id,
      businessName: subShop.name,
    };

    // Start on Free
    await getBusinessSubscription(subShop.id);

    // Upgrade to Starter Plan (Monthly)
    const starterPlan = await getPlanBySlug('starter');
    const upgradeResult = await changePlan(subShopCtx, starterPlan!.id, BillingInterval.MONTHLY);

    assert.strictEqual(upgradeResult.subscription.planId, starterPlan!.id, 'Subscription plan updated to Starter');
    assert.strictEqual(upgradeResult.subscription.status, SubscriptionStatus.ACTIVE, 'Subscription status is ACTIVE');
    assert.strictEqual(upgradeResult.subscription.billingInterval, BillingInterval.MONTHLY, 'Billing interval is MONTHLY');
    assert(upgradeResult.invoice, 'Invoice created for upgrade');
    assert.strictEqual(upgradeResult.invoice!.amountMinor, 149900, 'Invoice amount is 149900 minor units');
    assert.strictEqual(upgradeResult.invoice!.status, InvoiceStatus.PAID, 'Invoice marked PAID');
    assert(upgradeResult.payment, 'Payment record generated');
    assert.strictEqual(upgradeResult.payment!.amountMinor, 149900, 'Payment amount matches');
    assert.strictEqual(upgradeResult.payment!.status, PaymentStatus.SUCCESS, 'Payment marked SUCCESS');

    // Upgrade to Growth Plan (Yearly)
    const growthPlan = await getPlanBySlug('growth');
    const yearlyUpgrade = await changePlan(subShopCtx, growthPlan!.id, BillingInterval.YEARLY);

    assert.strictEqual(yearlyUpgrade.subscription.planId, growthPlan!.id, 'Plan updated to Growth');
    assert.strictEqual(yearlyUpgrade.subscription.billingInterval, BillingInterval.YEARLY, 'Interval updated to YEARLY');
    assert.strictEqual(yearlyUpgrade.invoice!.amountMinor, 2999000, 'Yearly invoice is 2999000 minor units (₹29,990)');

    // Invoices list
    const invoices = await getInvoices(subShopCtx);
    assert.strictEqual(invoices.length, 2, '2 invoices generated for the business');

    // Payments list
    const payments = await getPayments(subShopCtx);
    assert.strictEqual(payments.length, 2, '2 payment records generated');

    // Clean up
    await prisma.invoice.deleteMany({ where: { businessId: subShop.id } });
    await prisma.payment.deleteMany({ where: { businessId: subShop.id } });
    await prisma.subscription.deleteMany({ where: { businessId: subShop.id } });
    await prisma.business.delete({ where: { id: subShop.id } });

    console.log('  ✓ PASS: Subscription upgrade, invoice generation, and payment records verified');
  });

  // -------------------------------------------------------------------------
  // 6. Cancellation & Resume
  // -------------------------------------------------------------------------
  await t.test('6. Subscription Cancellation & Resume Lifecycle', async () => {
    const cancelShop = await prisma.business.create({
      data: {
        name: 'Cancellation Testing Shop',
        slug: `cancel-shop-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    const cancelCtx = {
      ...cafeOwnerCtx,
      businessId: cancelShop.id,
      businessName: cancelShop.name,
    };

    const starterPlan = await getPlanBySlug('starter');
    await changePlan(cancelCtx, starterPlan!.id, BillingInterval.MONTHLY);

    // 1. Cancel at period end
    const cancelledSub = await cancelSubscription(cancelCtx, false);
    assert.strictEqual(cancelledSub.cancelAtPeriodEnd, true, 'cancelAtPeriodEnd set to true');
    assert.strictEqual(cancelledSub.status, SubscriptionStatus.ACTIVE, 'Access maintained until period end');

    // 2. Resume subscription
    const resumedSub = await resumeSubscription(cancelCtx);
    assert.strictEqual(resumedSub.cancelAtPeriodEnd, false, 'cancelAtPeriodEnd reset to false');

    // 3. Immediate cancellation (downgrades to Free immediately)
    const immediateSub = await cancelSubscription(cancelCtx, true);
    const freePlan = await getPlanBySlug('free');
    assert.strictEqual(immediateSub.planId, freePlan!.id, 'Immediate cancellation downgrades to Free plan');
    assert.strictEqual(immediateSub.cancelAtPeriodEnd, false, 'cancelAtPeriodEnd cleared');

    // Clean up
    await prisma.invoice.deleteMany({ where: { businessId: cancelShop.id } });
    await prisma.payment.deleteMany({ where: { businessId: cancelShop.id } });
    await prisma.subscription.deleteMany({ where: { businessId: cancelShop.id } });
    await prisma.business.delete({ where: { id: cancelShop.id } });

    console.log('  ✓ PASS: Safe cancellation and resume lifecycle verified');
  });

  // -------------------------------------------------------------------------
  // 7. Grace Period, Overdue & Data Preservation
  // -------------------------------------------------------------------------
  await t.test('7. Grace Period & Overdue Downgrade with Data Preservation', async () => {
    const graceShop = await prisma.business.create({
      data: {
        name: 'Grace Period Testing Shop',
        slug: `grace-shop-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    const graceCtx = {
      ...cafeOwnerCtx,
      businessId: graceShop.id,
      businessName: graceShop.name,
    };

    const starterPlan = await getPlanBySlug('starter');
    await changePlan(graceCtx, starterPlan!.id, BillingInterval.MONTHLY);

    // Create business data under paid plan (e.g. 2 branches)
    const branch1 = await createBranch(graceCtx, { name: 'Branch Downtown' });
    const branch2 = await createBranch(graceCtx, { name: 'Branch Uptown' });
    assert(branch1.id && branch2.id, 'Created 2 branches under Starter plan');

    // Simulate overdue subscription whose grace period expired 1 day ago
    const sub = await prisma.subscription.findUnique({ where: { businessId: graceShop.id } });
    await prisma.subscription.update({
      where: { id: sub!.id },
      data: {
        status: SubscriptionStatus.OVERDUE,
        gracePeriodEndsAt: new Date(Date.now() - 86400000), // expired yesterday
      },
    });

    // Run the grace and downgrade worker
    const workerResult = await evaluateGraceAndDowngrades();
    assert(workerResult.downgraded >= 1, 'Worker downgraded expired overdue subscription');

    // Verify subscription is now Free
    const afterSub = await getBusinessSubscription(graceShop.id);
    const freePlan = await getPlanBySlug('free');
    assert.strictEqual(afterSub.planId, freePlan!.id, 'Downgraded to Free plan');
    assert.strictEqual(afterSub.status, SubscriptionStatus.ACTIVE, 'Status is ACTIVE on Free plan');

    // CRITICAL REQUIREMENT: DATA MUST REMAIN PRESERVED
    const branches = await prisma.branch.findMany({ where: { businessId: graceShop.id } });
    assert.strictEqual(branches.length, 2, 'Existing branches remain preserved in PostgreSQL');

    // BUT creating an additional branch is now blocked under Free plan limit
    await assert.rejects(
      async () => {
        await createBranch(graceCtx, { name: 'Branch Suburb (Should Fail)' });
      },
      (err: any) => {
        assert(err instanceof UsageLimitExceededError || err.code === 'LIMIT_EXCEEDED');
        return true;
      },
      'New resource creation blocked when exceeding Free plan limits'
    );

    // Clean up
    await prisma.branch.deleteMany({ where: { businessId: graceShop.id } });
    await prisma.invoice.deleteMany({ where: { businessId: graceShop.id } });
    await prisma.payment.deleteMany({ where: { businessId: graceShop.id } });
    await prisma.subscription.deleteMany({ where: { businessId: graceShop.id } });
    await prisma.business.delete({ where: { id: graceShop.id } });

    console.log('  ✓ PASS: Overdue grace expiration downgrades to Free while preserving all data');
  });

  // -------------------------------------------------------------------------
  // 8. Payment Webhook Idempotency & Replay Safety
  // -------------------------------------------------------------------------
  await t.test('8. Payment Webhook Idempotency & Replay Safety', async () => {
    const webhookShop = await prisma.business.create({
      data: {
        name: 'Webhook Testing Shop',
        slug: `webhook-shop-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    await getBusinessSubscription(webhookShop.id);

    const providerPaymentId = `evt_pay_${Date.now()}_abc123`;

    // 1st webhook call: processes and creates payment
    const call1 = await handlePaymentWebhook({
      eventId: 'evt_1',
      providerPaymentId,
      businessId: webhookShop.id,
      amountMinor: 299900,
      currency: 'INR',
      status: 'SUCCESS',
      paymentMethod: 'UPI',
    });
    assert.strictEqual(call1.processed, true, 'First webhook call processed');
    assert.strictEqual(call1.payment.status, PaymentStatus.SUCCESS, 'Payment record created');

    // 2nd webhook call (duplicate replay with same providerPaymentId): idempotent
    const call2 = await handlePaymentWebhook({
      eventId: 'evt_1_retry',
      providerPaymentId,
      businessId: webhookShop.id,
      amountMinor: 299900,
      currency: 'INR',
      status: 'SUCCESS',
      paymentMethod: 'UPI',
    });
    assert.strictEqual(call2.processed, false, 'Duplicate webhook recognized and skipped');
    assert.strictEqual(call2.payment.id, call1.payment.id, 'Returns existing payment without duplicate records');

    const paymentCount = await prisma.payment.count({
      where: { providerPaymentId },
    });
    assert.strictEqual(paymentCount, 1, 'Exactly 1 payment row exists in PostgreSQL');

    // Clean up
    await prisma.invoice.deleteMany({ where: { businessId: webhookShop.id } });
    await prisma.payment.deleteMany({ where: { businessId: webhookShop.id } });
    await prisma.subscription.deleteMany({ where: { businessId: webhookShop.id } });
    await prisma.business.delete({ where: { id: webhookShop.id } });

    console.log('  ✓ PASS: Webhook processing is strictly idempotent and replay-safe');
  });

  // -------------------------------------------------------------------------
  // 9. Multi-Tenant Isolation & Security
  // -------------------------------------------------------------------------
  await t.test('9. Multi-Tenant Billing Isolation & Security', async () => {
    // Cafe (Tenant A) vs Bakery (Tenant B)
    const cafeOverview = await getBusinessBillingOverview(cafeOwnerCtx);
    const bakeryOverview = await getBusinessBillingOverview(bakeryOwnerCtx);

    assert(cafeOverview.subscription.id !== bakeryOverview.subscription.id, 'Different subscriptions');

    // Cafe cannot see Bakery invoices
    const cafeInvoices = await getInvoices(cafeOwnerCtx);
    const bakeryInvoices = await getInvoices(bakeryOwnerCtx);

    for (const inv of cafeInvoices) {
      assert.strictEqual(inv.businessId, cafe!.id, 'Cafe invoice belongs to Cafe only');
      assert.notStrictEqual(inv.businessId, bakery!.id, 'Cafe invoice does not belong to Bakery');
    }

    for (const inv of bakeryInvoices) {
      assert.strictEqual(inv.businessId, bakery!.id, 'Bakery invoice belongs to Bakery only');
    }

    // Staff without BILLING_VIEW cannot view billing
    await assert.rejects(
      async () => {
        await getBusinessBillingOverview(cafeStaffCtx);
      },
      /Permission denied: Missing required permission \[BILLING_VIEW\]/,
      'Staff member without BILLING_VIEW denied access to billing overview'
    );

    // Staff without BILLING_MANAGE cannot change plans
    await assert.rejects(
      async () => {
        const starterPlan = await getPlanBySlug('starter');
        await changePlan(cafeStaffCtx, starterPlan!.id, BillingInterval.MONTHLY);
      },
      /Permission denied: Missing required permission \[BILLING_MANAGE\]/,
      'Staff member without BILLING_MANAGE denied plan change'
    );

    console.log('  ✓ PASS: Tenant isolation and RBAC billing security strictly enforced');
  });

  // -------------------------------------------------------------------------
  // 10. Super Admin Cross-Tenant Billing Oversight
  // -------------------------------------------------------------------------
  await t.test('10. Super Admin Cross-Tenant Billing Oversight & Controls', async () => {
    const allSubs = await adminGetAllSubscriptions(adminCtx);
    assert(allSubs.length >= 2, 'Super Admin can view all business subscriptions');

    const allInvoices = await adminGetAllInvoices(adminCtx);
    assert(Array.isArray(allInvoices), 'Super Admin can view global invoices');

    const allPayments = await adminGetAllPayments(adminCtx);
    assert(Array.isArray(allPayments), 'Super Admin can view global payments');

    // Super Admin can override subscription status
    const targetSub = allSubs[0];
    const updated = await adminUpdateSubscriptionStatus(
      adminCtx,
      targetSub.id,
      SubscriptionStatus.GRACE_PERIOD,
      14
    );
    assert.strictEqual(updated.status, SubscriptionStatus.GRACE_PERIOD, 'Admin override status to GRACE_PERIOD');
    assert(updated.gracePeriodEndsAt, 'Grace period end date set');

    // Reset back to original status
    await adminUpdateSubscriptionStatus(adminCtx, targetSub.id, targetSub.status);

    console.log('  ✓ PASS: Super Admin billing inspection and override verified');
  });

  console.log('\n==================================================================');
  console.log('PHASE 15 BILLING & ENTITLEMENTS SUITE: ALL TESTS PASSED');
  console.log('==================================================================\n');
});
