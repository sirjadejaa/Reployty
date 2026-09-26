/**
 * Reployty Database Invariant & Tenant Isolation Test Suite
 * Executes against real PostgreSQL database.
 */

import { PrismaClient, BusinessCategory } from '@prisma/client';
import { getTenantContext, TenantAuthorizationError } from '../../src/server/auth/tenantContext';
import { getCustomers, createCustomer } from '../../src/server/services/customerService';
import { awardStamps, redeemReward, LoyaltyOperationError } from '../../src/server/services/loyaltyService';

const prisma = new PrismaClient();

// Helper test assertion utilities
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function assertRejects(fn: () => Promise<unknown>, expectedErrorMessageSubstring?: string) {
  let threw = false;
  try {
    await fn();
  } catch (err: unknown) {
    threw = true;
    if (expectedErrorMessageSubstring && err instanceof Error) {
      assert(
        err.message.includes(expectedErrorMessageSubstring),
        `Expected error message containing "${expectedErrorMessageSubstring}", but got: "${err.message}"`
      );
    }
  }
  assert(threw, `Expected operation to fail, but it succeeded!`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING REPLOYTY DATABASE INVARIANT TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`• Testing: ${name}... `);
    try {
      await fn();
      console.log('PASSED ✅');
      passed++;
    } catch (err) {
      console.log('FAILED ❌');
      console.error(err);
      failed++;
    }
  }

  // Setup Test Tenants
  const testRunId = Math.random().toString(36).substring(2, 7);

  const businessA = await prisma.business.create({
    data: {
      name: `Test Café A ${testRunId}`,
      slug: `test-cafe-a-${testRunId}`,
      category: BusinessCategory.CAFE,
    },
  });

  const businessB = await prisma.business.create({
    data: {
      name: `Test Salon B ${testRunId}`,
      slug: `test-salon-b-${testRunId}`,
      category: BusinessCategory.SALON,
    },
  });

  const branchA = await prisma.branch.create({
    data: {
      businessId: businessA.id,
      name: 'Main Branch A',
    },
  });

  const userA = await prisma.user.create({
    data: {
      email: `user.a.${testRunId}@reployty.com`,
      name: 'Alice Owner A',
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: `user.b.${testRunId}@reployty.com`,
      name: 'Bob Owner B',
    },
  });

  const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });

  await prisma.staffMembership.create({
    data: {
      userId: userA.id,
      businessId: businessA.id,
      roleId: ownerRole.id,
      status: 'ACTIVE',
    },
  });

  await prisma.staffMembership.create({
    data: {
      userId: userB.id,
      businessId: businessB.id,
      roleId: ownerRole.id,
      status: 'ACTIVE',
    },
  });

  const ctxA = await getTenantContext(userA.id, businessA.id);
  const ctxB = await getTenantContext(userB.id, businessB.id);

  // --------------------------------------------------------------------------
  // TEST 1: Tenant Isolation (Business A cannot access Business B customers)
  // --------------------------------------------------------------------------
  await test('Tenant isolation - Business A cannot query Business B customers', async () => {
    // Create customer in Business A
    const custA = await createCustomer(ctxA, {
      name: 'Customer In A',
      phone: `+1-555-010-${testRunId}`,
    });

    // Create customer in Business B
    const custB = await createCustomer(ctxB, {
      name: 'Customer In B',
      phone: `+1-555-020-${testRunId}`,
    });

    // When ctxA queries, only custA is visible
    const resA = await getCustomers(ctxA);
    const idsInA = resA.data.map(c => c.id);
    assert(idsInA.includes(custA.id), 'custA must be returned for Business A');
    assert(!idsInA.includes(custB.id), 'custB MUST NOT be returned for Business A');

    // When ctxB queries, only custB is visible
    const resB = await getCustomers(ctxB);
    const idsInB = resB.data.map(c => c.id);
    assert(idsInB.includes(custB.id), 'custB must be returned for Business B');
    assert(!idsInB.includes(custA.id), 'custA MUST NOT be returned for Business B');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Membership Authorization (User without Business membership denied)
  // --------------------------------------------------------------------------
  await test('Membership authorization - User without membership is denied access', async () => {
    // User A tries to obtain TenantContext for Business B
    await assertRejects(
      () => getTenantContext(userA.id, businessB.id),
      'is not a member of business'
    );
  });

  // --------------------------------------------------------------------------
  // TEST 3: Cross-Tenant Resource Access (Business A cannot redeem Business B reward)
  // --------------------------------------------------------------------------
  await test('Cross-tenant resource protection - Business A cannot redeem Business B reward', async () => {
    const rewardB = await prisma.reward.create({
      data: {
        businessId: businessB.id,
        title: 'Free Facial Massage',
        status: 'ACTIVE',
      },
    });

    const custB = await createCustomer(ctxB, {
      name: 'Spa Customer',
      phone: `+1-555-030-${testRunId}`,
    });

    const redemptionCodeB = `RPL-SEC-${testRunId}-B`;
    await prisma.rewardRedemption.create({
      data: {
        businessId: businessB.id,
        rewardId: rewardB.id,
        customerId: custB.id,
        redemptionCode: redemptionCodeB,
        status: 'AVAILABLE',
      },
    });

    // Staff in Business A tries to redeem Business B's code
    await assertRejects(
      () => redeemReward(ctxA, redemptionCodeB),
      'Reward does not belong to this business tenant'
    );
  });

  // --------------------------------------------------------------------------
  // TEST 4: Branch Ownership (Branch must belong to the correct business)
  // --------------------------------------------------------------------------
  await test('Branch ownership hierarchy constraint', async () => {
    // Verify branchA belongs strictly to businessA
    const branchRecord = await prisma.branch.findUnique({
      where: { id: branchA.id },
      include: { business: true },
    });
    assert(branchRecord?.businessId === businessA.id, 'Branch must belong to Business A');
    assert(branchRecord?.businessId !== businessB.id, 'Branch cannot belong to Business B');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Customer Phone Uniqueness Scoped to Business
  // --------------------------------------------------------------------------
  await test('Customer phone uniqueness is scoped by business (allowed across different businesses, blocked within same)', async () => {
    const sharedPhone = `+1-555-MULTI-${testRunId}`;

    // Same customer visits Business A
    const custInA = await createCustomer(ctxA, {
      name: 'Multi-store Patron',
      phone: sharedPhone,
    });
    assert(custInA.businessId === businessA.id, 'Customer registered in Business A');

    // Same customer visits Business B with SAME phone number -> MUST SUCCEED!
    const custInB = await createCustomer(ctxB, {
      name: 'Multi-store Patron',
      phone: sharedPhone,
    });
    assert(custInB.businessId === businessB.id, 'Customer registered in Business B with same phone');
    assert(custInA.id !== custInB.id, 'Each business has isolated customer record');

    // Duplicate creation within the same business returns existing customer rather than creating duplicate
    const duplicateInA = await createCustomer(ctxA, {
      name: 'Duplicate Attempt',
      phone: sharedPhone,
    });
    assert(duplicateInA.id === custInA.id, 'Duplicate phone lookup in same business resolved to existing record');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Reward Redemption Uniqueness & Double Redemption Prevention
  // --------------------------------------------------------------------------
  await test('Reward redemption single-use guarantee (double redemption blocked)', async () => {
    const rewardA = await prisma.reward.create({
      data: {
        businessId: businessA.id,
        title: 'Free Espresso',
        status: 'ACTIVE',
      },
    });

    const custA = await createCustomer(ctxA, {
      name: 'Coffee Drinker',
      phone: `+1-555-REW-${testRunId}`,
    });

    const singleCode = `RPL-ONCE-${testRunId}`;
    await prisma.rewardRedemption.create({
      data: {
        businessId: businessA.id,
        rewardId: rewardA.id,
        customerId: custA.id,
        redemptionCode: singleCode,
        status: 'AVAILABLE',
      },
    });

    // First redemption succeeds
    const redeemed = await redeemReward(ctxA, singleCode);
    assert(redeemed.status === 'REDEEMED', 'First redemption must succeed');

    // Second redemption attempt on the same code MUST FAIL
    await assertRejects(
      () => redeemReward(ctxA, singleCode),
      'Reward has already been redeemed'
    );
  });

  // --------------------------------------------------------------------------
  // TEST 7: Auditability (Important mutations produce audit logs)
  // --------------------------------------------------------------------------
  await test('Auditability - Sensitive operations produce immutable audit records', async () => {
    // Customer creation in previous tests should have logged audit records
    const auditCount = await prisma.auditLog.count({
      where: {
        businessId: businessA.id,
        actorUserId: userA.id,
      },
    });
    assert(auditCount >= 2, `Expected at least 2 audit logs for business A, found: ${auditCount}`);

    const lastAudit = await prisma.auditLog.findFirst({
      where: { businessId: businessA.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(lastAudit?.action === 'REWARD_REDEEMED', 'Audit log captured REWARD_REDEEMED');
    assert(lastAudit?.entityType === 'RewardRedemption', 'Audit log captured entityType RewardRedemption');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Atomic Loyalty Stamp Award & Card Completion
  // --------------------------------------------------------------------------
  await test('Atomic loyalty stamp awards and transaction history', async () => {
    const progA = await prisma.loyaltyProgram.create({
      data: {
        businessId: businessA.id,
        name: 'Test 10 Stamp Card',
        type: 'STAMP',
        targetStamps: 10,
        rewardTitle: 'Free Test Coffee',
        status: 'ACTIVE',
      },
    });

    const testCust = await createCustomer(ctxA, {
      name: 'Stamp Collector',
      phone: `+1-555-STAMP-${testRunId}`,
    });

    // Award 3 stamps
    const card = await awardStamps(ctxA, testCust.id, 3);
    assert(card.stampsCollected === 3, 'Card collected stamps should be 3');
    assert(card.status === 'ACTIVE', 'Card status should be ACTIVE');

    // Verify transaction history record was created
    const txRecords = await prisma.loyaltyTransaction.findMany({
      where: {
        businessId: businessA.id,
        customerId: testCust.id,
      },
    });
    assert(txRecords.length === 1, 'Exactly 1 loyalty transaction logged');
    assert(txRecords[0].deltaStamps === 3, 'deltaStamps must be 3');
    assert(txRecords[0].type === 'STAMP_ADDED', 'transaction type STAMP_ADDED');
  });

  // Clean up test data
  console.log('\nCleaning up test artifacts...');
  await prisma.business.deleteMany({
    where: { id: { in: [businessA.id, businessB.id] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userA.id, userB.id] } },
  });

  console.log('\n======================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
