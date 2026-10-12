import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/server/db/client';
import {
  upsertLoyaltyProgram,
  getCustomerLoyaltyState,
  claimCustomerQrEarning,
} from '../../src/server/services/loyaltyService';
import { getBusinessQrCode, getBusinessDashboard } from '../../src/server/services/businessService';
import {
  resolvePublicQr,
  getCustomerProfile,
  updateCustomerProfile,
} from '../../src/server/services/customerPwaService';
import { requestOtp, verifyOtp } from '../../src/server/services/otpService';
import { findOrCreateCustomer, createCustomerSession, validateCustomerSession } from '../../src/server/services/customerAuthService';
import { getBusinessCustomers } from '../../src/server/services/crmService';
import { TenantContext } from '../../src/server/auth/tenantContext';

test('REGRESSION SUITE: QR Customer Registration, Dashboard Visibility & Loyalty Program Isolation', async (t) => {
  const ts = Date.now();

  // -------------------------------------------------------------
  // SETUP: Business A (Stamp Program)
  // -------------------------------------------------------------
  const businessA = await prisma.business.create({
    data: {
      name: `Artisan Bakery A ${ts}`,
      slug: `artisan-bakery-a-${ts}`,
      category: 'RETAIL',
      status: 'ACTIVE',
      onboardingCompleted: true,
      onboardingStep: 6,
      phone: '+15551110001',
      address: '100 Baker St',
    },
  });

  const branchA = await prisma.branch.create({
    data: {
      businessId: businessA.id,
      name: 'Downtown Branch',
      code: 'BAK-01',
      isMainBranch: true,
      status: 'ACTIVE',
    },
  });

  const ownerA = await prisma.user.create({
    data: {
      email: `owner.a.${ts}@example.com`,
      name: 'Owner A',
      passwordHash: 'dummy',
      status: 'ACTIVE',
    },
  });

  const role = await prisma.role.findFirst({ where: { name: 'OWNER' } });
  await prisma.staffMembership.create({
    data: {
      businessId: businessA.id,
      userId: ownerA.id,
      branchId: branchA.id,
      roleId: role!.id,
      status: 'ACTIVE',
    },
  });

  const tenantCtxA: TenantContext = {
    user: { id: ownerA.id, email: ownerA.email, name: ownerA.name, isSuperAdmin: false },
    userId: ownerA.id,
    userEmail: ownerA.email,
    userName: ownerA.name,
    isSuperAdmin: false,
    businessId: businessA.id,
    businessName: businessA.name,
    businessCategory: 'RETAIL',
    roleName: 'OWNER',
    permissions: new Set(['*']),
    hasPermission: () => true,
    isOwner: true,
  } as any;

  // Configure a Stamp-based loyalty program for Business A with 8 target stamps
  const programA = await upsertLoyaltyProgram(tenantCtxA, {
    name: 'Artisan Pastry Stamp Card',
    type: 'STAMP',
    targetStamps: 8,
    rewardTitle: 'Free Sourdough Loaf',
    status: 'ACTIVE',
  });
  assert.equal(programA.type, 'STAMP');
  assert.equal(programA.targetStamps, 8);

  const qrA = await getBusinessQrCode(tenantCtxA);
  assert.ok(qrA.code, 'Business A QR code must be created');

  // -------------------------------------------------------------
  // SETUP: Business B (Points Program) - for Tenant Isolation Testing
  // -------------------------------------------------------------
  const businessB = await prisma.business.create({
    data: {
      name: `Boutique B ${ts}`,
      slug: `boutique-b-${ts}`,
      category: 'RETAIL',
      status: 'ACTIVE',
      onboardingCompleted: true,
      onboardingStep: 6,
      phone: '+15552220002',
      address: '200 Fashion Ave',
    },
  });

  const branchB = await prisma.branch.create({
    data: {
      businessId: businessB.id,
      name: 'Uptown Branch',
      code: 'BOU-01',
      isMainBranch: true,
      status: 'ACTIVE',
    },
  });

  const ownerB = await prisma.user.create({
    data: {
      email: `owner.b.${ts}@example.com`,
      name: 'Owner B',
      passwordHash: 'dummy',
      status: 'ACTIVE',
    },
  });

  await prisma.staffMembership.create({
    data: {
      businessId: businessB.id,
      userId: ownerB.id,
      branchId: branchB.id,
      roleId: role!.id,
      status: 'ACTIVE',
    },
  });

  const tenantCtxB: TenantContext = {
    user: { id: ownerB.id, email: ownerB.email, name: ownerB.name, isSuperAdmin: false },
    userId: ownerB.id,
    userEmail: ownerB.email,
    userName: ownerB.name,
    isSuperAdmin: false,
    businessId: businessB.id,
    businessName: businessB.name,
    businessCategory: 'RETAIL',
    roleName: 'OWNER',
    permissions: new Set(['*']),
    hasPermission: () => true,
    isOwner: true,
  } as any;

  // Configure a Points-based loyalty program for Business B
  const programB = await upsertLoyaltyProgram(tenantCtxB, {
    name: 'Boutique Rewards Points',
    type: 'POINTS',
    pointsPerCurrencyMinor: 10,
    rewardTitle: '10% Discount Voucher',
    status: 'ACTIVE',
  });
  assert.equal(programB.type, 'POINTS');

  const qrB = await getBusinessQrCode(tenantCtxB);
  assert.ok(qrB.code, 'Business B QR code must be created');

  try {
    // -----------------------------------------------------------
    // TEST 1: QR Customer Registration & Automatic Pass Enrollment
    // -----------------------------------------------------------
    await t.test('Test 1: Customer registers via QR code and gets auto-enrolled', async () => {
      const resolved = await resolvePublicQr(qrA.code);
      assert.equal(resolved.business.id, businessA.id);

      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
      const otpReq = await requestOtp({ businessId: businessA.id, phone });
      const verify = await verifyOtp({
        businessId: businessA.id,
        phone,
        code: otpReq.devOtp || '123456',
        challengeId: otpReq.challengeId,
      });
      assert.equal(verify.verified, true);

      const { customer, isNew } = await findOrCreateCustomer(businessA.id, verify.phone, {
        source: 'PWA_QR_VERIFICATION',
        branchId: branchA.id,
      });

      assert.ok(customer.id);
      assert.equal(isNew, true);
      assert.equal(customer.businessId, businessA.id);

      // Verify that findOrCreateCustomer atomically created the loyalty pass
      const initialCards = await prisma.loyaltyCard.findMany({
        where: { customerId: customer.id, businessId: businessA.id },
      });
      assert.equal(initialCards.length, 1, 'Customer should immediately have 1 active loyalty card upon registration');
      assert.equal(initialCards[0].programId, programA.id);
      assert.equal(initialCards[0].totalStampsNeeded, 8);
    });

    // -----------------------------------------------------------
    // TEST 2: Dashboard and CRM Visibility for Registered Customer
    // -----------------------------------------------------------
    let customerAId: string;
    let customerSessionA: any;
    let customerCtxA: any;

    await t.test('Test 2: Registered customer immediately appears in business dashboard and CRM directory', async () => {
      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
      const { customer } = await findOrCreateCustomer(businessA.id, phone, {
        name: 'Bob Artisan',
        source: 'PWA_QR_VERIFICATION',
        branchId: branchA.id,
      });
      customerAId = customer.id;

      customerSessionA = await createCustomerSession(customer.id, businessA.id);
      customerCtxA = (await validateCustomerSession(customerSessionA.sessionToken))!;

      // Claim earning from QR
      const claim = await claimCustomerQrEarning(customerCtxA, {
        qrCode: qrA.code,
        idempotencyKey: `scan_test_${Date.now()}`,
      });
      assert.equal(claim.success, true);
      assert.equal(claim.earnedType, 'STAMP');
      assert.equal(claim.newStamps, 1);
      assert.equal(claim.targetStamps, 8);

      // Check Business A Dashboard
      const dashA = await getBusinessDashboard(tenantCtxA);
      assert.ok(dashA.metrics.totalCustomers >= 2, 'Dashboard totalCustomers must count all registered customers');
      assert.equal(dashA.loyaltyProgram?.type, 'STAMP');
      assert.equal(dashA.loyaltyProgram?.targetStamps, 8);
      assert.ok(dashA.loyaltyProgram?.activeCardsCount >= 2, 'Active cards count must include new passes');

      // Check Business A CRM Directory
      const crmListA = await getBusinessCustomers(tenantCtxA, { search: 'Bob' });
      assert.ok(crmListA.data.length >= 1, 'Customer must appear in CRM directory');
      const found = crmListA.data.find(c => c.id === customer.id);
      assert.ok(found, 'Customer record must be present');
      assert.equal(found?.stampsBalance, 1);
      assert.equal(found?.loyaltyCards.length, 1);
      assert.equal(found?.loyaltyCards[0].program?.type, 'STAMP');
      assert.equal(found?.loyaltyCards[0].program?.targetStamps, 8);
    });

    // -----------------------------------------------------------
    // TEST 3: Strict Multi-Tenant Isolation
    // -----------------------------------------------------------
    await t.test('Test 3: Multi-tenant isolation prevents cross-tenant access and earning', async () => {
      // Business B should NOT see Customer A in dashboard or CRM
      const dashB = await getBusinessDashboard(tenantCtxB);
      assert.equal(dashB.metrics.totalCustomers, 0, 'Business B must have 0 customers');

      const crmListB = await getBusinessCustomers(tenantCtxB, {});
      assert.equal(crmListB.data.length, 0, 'Business B CRM must return 0 customers');

      // Customer A belongs to Business A. Attempting to claim Business B's QR code must be rejected!
      await assert.rejects(
        async () => {
          await claimCustomerQrEarning(customerCtxA, {
            qrCode: qrB.code,
            idempotencyKey: `cross_tenant_${Date.now()}`,
          });
        },
        (err: any) => {
          assert.equal(err.code, 'CROSS_TENANT_EARNING_FORBIDDEN');
          return true;
        },
        'Cross-tenant earning claim must throw CROSS_TENANT_EARNING_FORBIDDEN'
      );
    });

    // -----------------------------------------------------------
    // TEST 4: Stamp Loyalty Experience Correctly Formatted
    // -----------------------------------------------------------
    await t.test('Test 4: Stamp-based loyalty program returns stamp card and progress (not points)', async () => {
      const loyaltyState = await getCustomerLoyaltyState(customerCtxA);
      assert.equal(loyaltyState.hasActiveProgram, true);
      assert.equal(loyaltyState.program?.type, 'STAMP');
      assert.equal(loyaltyState.program?.targetStamps, 8);
      assert.equal(loyaltyState.card?.stampsCollected, 1);
      assert.equal(loyaltyState.card?.totalStampsNeeded, 8);
      assert.ok(loyaltyState.progress, 'Loyalty state must contain progress');
      assert.equal(loyaltyState.progress!.currentStamps, 1);
      assert.equal(loyaltyState.progress!.targetStamps, 8);
      assert.equal(loyaltyState.progress!.stampsRemaining, 7);
      assert.equal(loyaltyState.progress!.isComplete, false);
      assert.equal(loyaltyState.progress!.currentPoints, 0);

      // Test /api/customer/me (getCustomerProfile) server-authoritative response
      const meProfile = await getCustomerProfile(customerCtxA);
      assert.ok(meProfile.loyaltyState, 'Customer profile must contain loyaltyState');
      assert.equal(meProfile.loyaltyState.program?.type, 'STAMP');
      assert.equal(meProfile.loyaltyState.program?.targetStamps, 8);
      assert.equal(meProfile.loyaltyState.card?.stampsCollected, 1);
    });

    // -----------------------------------------------------------
    // TEST 5: Points Loyalty Experience Correctly Formatted
    // -----------------------------------------------------------
    await t.test('Test 5: Points-based loyalty program returns points card and progress', async () => {
      const phoneB = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
      const { customer: customerB } = await findOrCreateCustomer(businessB.id, phoneB, {
        name: 'Charlie Boutique',
        source: 'PWA_QR_VERIFICATION',
        branchId: branchB.id,
      });

      const customerSessionB = await createCustomerSession(customerB.id, businessB.id);
      const customerCtxB = (await validateCustomerSession(customerSessionB.sessionToken))!;

      const claimB = await claimCustomerQrEarning(customerCtxB, {
        qrCode: qrB.code,
        idempotencyKey: `scan_points_${Date.now()}`,
      });
      assert.equal(claimB.success, true);
      assert.equal(claimB.earnedType, 'POINTS');
      assert.equal(claimB.newPoints, 50);

      const loyaltyStateB = await getCustomerLoyaltyState(customerCtxB);
      assert.equal(loyaltyStateB.program?.type, 'POINTS');
      assert.equal(loyaltyStateB.card?.pointsBalance, 50);
      assert.ok(loyaltyStateB.progress, 'Loyalty state B must contain progress');
      assert.equal(loyaltyStateB.progress!.currentPoints, 50);

      const meProfileB = await getCustomerProfile(customerCtxB);
      assert.equal(meProfileB.loyaltyState.program?.type, 'POINTS');
      assert.equal(meProfileB.loyaltyState.card?.pointsBalance, 50);
    });

    // -----------------------------------------------------------
    // TEST 6: State and Balance Persistence Across Profile Update
    // -----------------------------------------------------------
    await t.test('Test 6: Loyalty pass balance persists across profile updates and reloads', async () => {
      // Update customer profile name
      await updateCustomerProfile(customerCtxA, {
        name: 'Bob Updated Artisan',
      });

      // Reload loyalty state and verify stamp balance didn't reset
      const reloadedState = await getCustomerLoyaltyState(customerCtxA);
      assert.equal(reloadedState.card?.stampsCollected, 1, 'Stamps must persist across profile updates');
      assert.ok(reloadedState.progress, 'Reloaded state must contain progress');
      assert.equal(reloadedState.progress!.targetStamps, 8);
      assert.equal(reloadedState.progress!.stampsRemaining, 7);

      const reloadedProfile = await getCustomerProfile(customerCtxA);
      assert.equal(reloadedProfile.customer.name, 'Bob Updated Artisan');
      assert.equal(reloadedProfile.loyaltyState.card?.stampsCollected, 1);
    });
  } finally {
    // Teardown test data safely
    await prisma.business.delete({ where: { id: businessA.id } }).catch(() => {});
    await prisma.business.delete({ where: { id: businessB.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: ownerA.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: ownerB.id } }).catch(() => {});
  }
});
