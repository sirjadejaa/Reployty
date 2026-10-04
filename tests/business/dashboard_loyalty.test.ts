import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/server/db/client';
import { getBusinessDashboard } from '../../src/server/services/businessService';
import { hashPassword } from '../../src/server/auth/sessionService';
import { TenantContext } from '../../src/server/auth/tenantContext';

test('CUSTOMER LOYALTY PASS DASHBOARD INTEGRATION TEST SUITE', async (t) => {
  let businessA: any;
  let ownerA: any;
  let contextA: TenantContext;

  let businessB: any;
  let ownerB: any;
  let contextB: TenantContext;

  t.before(async () => {
    // Clean and set up isolated test fixtures
    const ts = Date.now();
    const pw = await hashPassword('TestPass2026!');

    // Business A: Will test various states
    businessA = await prisma.business.create({
      data: {
        name: `Loyalty Test Cafe ${ts}`,
        slug: `loyalty-test-cafe-${ts}`,
        category: 'CAFE',
        themePreset: 'CAFE',
        status: 'ACTIVE',
        onboardingCompleted: true,
        onboardingStep: 6,
        phone: '+91 98111 22334',
        address: '100 Coffee Lane',
      },
    });

    ownerA = await prisma.user.create({
      data: {
        email: `owner.a.${ts}@example.com`,
        name: 'Owner A',
        passwordHash: pw,
        status: 'ACTIVE',
      },
    });

    const roleOwner = await prisma.role.findFirst({ where: { name: 'OWNER' } });

    await prisma.staffMembership.create({
      data: {
        businessId: businessA.id,
        userId: ownerA.id,
        roleId: roleOwner!.id,
        status: 'ACTIVE',
      },
    });

    contextA = {
      user: { id: ownerA.id, email: ownerA.email, name: ownerA.name, isSuperAdmin: false },
      userId: ownerA.id,
      userEmail: ownerA.email,
      userName: ownerA.name,
      isSuperAdmin: false,
      businessId: businessA.id,
      businessName: businessA.name,
      businessCategory: 'CAFE',
      roleName: 'OWNER',
      permissions: new Set(['*']),
      hasPermission: () => true,
      isOwner: true,
    } as any;

    // Business B: Isolated tenant
    businessB = await prisma.business.create({
      data: {
        name: `Isolated Tenant ${ts}`,
        slug: `isolated-tenant-${ts}`,
        category: 'RESTAURANT',
        status: 'ACTIVE',
        onboardingCompleted: true,
      },
    });

    ownerB = await prisma.user.create({
      data: {
        email: `owner.b.${ts}@example.com`,
        name: 'Owner B',
        passwordHash: pw,
        status: 'ACTIVE',
      },
    });

    await prisma.staffMembership.create({
      data: {
        businessId: businessB.id,
        userId: ownerB.id,
        roleId: roleOwner!.id,
        status: 'ACTIVE',
      },
    });

    contextB = {
      user: { id: ownerB.id, email: ownerB.email, name: ownerB.name, isSuperAdmin: false },
      userId: ownerB.id,
      userEmail: ownerB.email,
      userName: ownerB.name,
      isSuperAdmin: false,
      businessId: businessB.id,
      businessName: businessB.name,
      businessCategory: 'RESTAURANT',
      roleName: 'OWNER',
      permissions: new Set(['*']),
      hasPermission: () => true,
      isOwner: true,
    } as any;
  });

  t.after(async () => {
    // Teardown
    if (businessA) {
      await prisma.business.delete({ where: { id: businessA.id } }).catch(() => {});
    }
    if (businessB) {
      await prisma.business.delete({ where: { id: businessB.id } }).catch(() => {});
    }
    if (ownerA) {
      await prisma.user.delete({ where: { id: ownerA.id } }).catch(() => {});
    }
    if (ownerB) {
      await prisma.user.delete({ where: { id: ownerB.id } }).catch(() => {});
    }
  });

  await t.test('State 1: Prerequisite incomplete when business has no active branches', async () => {
    // Temporarily mark onboarding incomplete with 0 branches
    await prisma.business.update({
      where: { id: businessA.id },
      data: { onboardingCompleted: false },
    });

    const dashboard = await getBusinessDashboard(contextA);
    assert.equal(dashboard.onboarding.checklist.branchSetup, false);
    assert.equal(dashboard.metrics.loyaltyPrograms, 0);
    assert.equal(dashboard.loyaltyProgram, null);
  });

  await t.test('State 2: Not Configured when prerequisite satisfied but 0 loyalty programs exist', async () => {
    // Add primary branch to satisfy prerequisite
    await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: 'Main Flagship',
        code: 'MAIN-01',
        isMainBranch: true,
        status: 'ACTIVE',
        address: '100 Coffee Lane',
      },
    });

    await prisma.business.update({
      where: { id: businessA.id },
      data: { onboardingCompleted: true },
    });

    const dashboard = await getBusinessDashboard(contextA);
    assert.equal(dashboard.onboarding.checklist.branchSetup, true);
    assert.equal(dashboard.metrics.loyaltyPrograms, 0);
    assert.equal(dashboard.loyaltyProgram, null);
  });

  await t.test('State 3: Active Loyalty Program returns real PostgreSQL program and QR data', async () => {
    // Create active STAMP loyalty program
    const program = await prisma.loyaltyProgram.create({
      data: {
        businessId: businessA.id,
        name: 'Artisan Stamp Club',
        type: 'STAMP',
        targetStamps: 8,
        rewardTitle: 'Free Single-Origin Pour Over',
        status: 'ACTIVE',
      },
    });

    // Create a customer with a loyalty card
    const customer = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: 'Aarav Patel',
        phone: '+91 98200 11223',
      },
    });

    await prisma.loyaltyCard.create({
      data: {
        businessId: businessA.id,
        customerId: customer.id,
        programId: program.id,
        stampsCollected: 3,
        totalStampsNeeded: 8,
        status: 'ACTIVE',
      },
    });

    // Create entry QR standee
    await prisma.qRCode.create({
      data: {
        businessId: businessA.id,
        code: `QR-STAND-${Date.now()}`,
        type: 'BUSINESS_STAND',
        destinationUrl: `/join/${businessA.slug}`,
        status: 'ACTIVE',
        scanCount: 42,
      },
    });

    const dashboard = await getBusinessDashboard(contextA);
    assert.equal(dashboard.metrics.loyaltyPrograms, 1);
    assert.ok(dashboard.loyaltyProgram);
    assert.equal(dashboard.loyaltyProgram.name, 'Artisan Stamp Club');
    assert.equal(dashboard.loyaltyProgram.type, 'STAMP');
    assert.equal(dashboard.loyaltyProgram.targetStamps, 8);
    assert.equal(dashboard.loyaltyProgram.rewardTitle, 'Free Single-Origin Pour Over');
    assert.equal(dashboard.loyaltyProgram.status, 'ACTIVE');
    assert.equal(dashboard.loyaltyProgram.activeCardsCount, 1);
    assert.ok(dashboard.loyaltyProgram.qrCode);
    assert.equal(dashboard.loyaltyProgram.qrCode.destinationUrl, `/join/${businessA.slug}`);
    assert.equal(dashboard.loyaltyProgram.qrCode.scanCount, 42);
  });

  await t.test('State 4: Strict tenant isolation prevents cross-tenant loyalty visibility', async () => {
    // Tenant B queries dashboard; should see 0 loyalty programs and null loyaltyProgram
    const dashboardB = await getBusinessDashboard(contextB);
    assert.equal(dashboardB.business.id, businessB.id);
    assert.equal(dashboardB.metrics.loyaltyPrograms, 0);
    assert.equal(dashboardB.loyaltyProgram, null);
  });
});
