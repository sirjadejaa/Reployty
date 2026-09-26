import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import {
  createReward,
  updateReward,
  setRewardStatus,
  getBusinessRewards,
  getBusinessRedemptions,
  staffLookupRedemption,
  staffValidateRedemption,
  getCustomerRewards,
  claimCustomerReward,
  getCustomerRedemptions,
  generateRedemptionCode,
  normalizeRedemptionCode,
  RewardOperationError,
} from '../../src/server/services/rewardService';
import { createCustomerSession } from '../../src/server/services/customerAuthService';

const BASE_URL = 'http://localhost:3000';

let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
    testPassed++;
  } else {
    console.error(`  ✗ FAIL: ${name} ${detail ? `(${detail})` : ''}`);
    testFailed++;
  }
}

async function request(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; headers: Headers; data: any; cookie?: string }> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  let data: any = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  const setCookie = res.headers.get('set-cookie') || undefined;
  return { status: res.status, headers: res.headers, data, cookie: setCookie };
}

async function runRewardsSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 8: PRODUCTION REWARDS & REDEMPTION AUTOMATED TEST SUITE');
  console.log('==================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // Setup Context: Retrieve seeded businesses and staff
    // -------------------------------------------------------------------------
    const cafe = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
      include: { branches: true, loyaltyPrograms: true },
    });
    if (!cafe) throw new Error('Seeded cafe not found');

    const salon = await prisma.business.findUnique({
      where: { slug: 'luxe-glow-beauty' },
      include: { branches: true },
    });
    if (!salon) throw new Error('Seeded salon not found');

    const cafeBranch = cafe.branches[0];
    const salonBranch = salon.branches[0];

    const cafeOwner = await prisma.user.findUnique({
      where: { email: 'marcus@reployty.com' },
    });
    if (!cafeOwner) throw new Error('Seeded cafe owner not found');

    const cafeCashier = await prisma.user.findUnique({
      where: { email: 'sarah.cashier@reployty.com' },
    });
    if (!cafeCashier) throw new Error('Seeded cafe cashier not found');

    // Create Tenant Contexts
    const cafeOwnerCtx = await getTenantContext(cafeOwner.id, cafe.id);
    const cafeCashierCtx = await getTenantContext(cafeCashier.id, cafe.id);

    // Create a dedicated test customer for rewards tests
    const testPhone = '+15557778899';
    let customerA = await prisma.customer.findUnique({
      where: {
        businessId_phone: {
          businessId: cafe.id,
          phone: testPhone,
        },
      },
    });

    if (!customerA) {
      customerA = await prisma.customer.create({
        data: {
          businessId: cafe.id,
          branchId: cafeBranch.id,
          name: 'Rewards Tester Alpha',
          phone: testPhone,
          email: 'rewards.tester@example.com',
          status: 'ACTIVE',
          stampsBalance: 10, // starts with 10 stamps
          pointsBalance: 250, // starts with 250 points
        },
      });
    } else {
      customerA = await prisma.customer.update({
        where: { id: customerA.id },
        data: {
          stampsBalance: 10,
          pointsBalance: 250,
        },
      });
    }

    // Active program for cafe
    let activeProgram = await prisma.loyaltyProgram.findFirst({
      where: { businessId: cafe.id, status: 'ACTIVE' },
    });
    if (!activeProgram) {
      activeProgram = await prisma.loyaltyProgram.create({
        data: {
          businessId: cafe.id,
          name: 'Test Coffee Club',
          type: 'STAMP',
          targetStamps: 10,
          rewardTitle: 'Free Pastry',
          status: 'ACTIVE',
        },
      });
    }

    // Ensure customer has exactly one loyalty card for active program
    await prisma.loyaltyCard.deleteMany({
      where: { customerId: customerA.id, programId: { not: activeProgram.id } },
    });
    let customerCard = await prisma.loyaltyCard.findFirst({
      where: { customerId: customerA.id, programId: activeProgram.id },
    });
    if (!customerCard) {
      customerCard = await prisma.loyaltyCard.create({
        data: {
          businessId: cafe.id,
          customerId: customerA.id,
          programId: activeProgram.id,
          stampsCollected: 10,
          pointsBalance: 250,
          status: 'ACTIVE',
        },
      });
    } else {
      customerCard = await prisma.loyaltyCard.update({
        where: { id: customerCard.id },
        data: {
          stampsCollected: 10,
          pointsBalance: 250,
          status: 'ACTIVE',
        },
      });
      await prisma.loyaltyCard.updateMany({
        where: { customerId: customerA.id },
        data: {
          stampsCollected: 10,
          pointsBalance: 250,
          status: 'ACTIVE',
        },
      });
    }

    // Customer session context
    const customerSession = await createCustomerSession(customerA.id, cafe.id);
    const customerCtx = {
      sessionToken: customerSession.sessionToken,
      customerId: customerA.id,
      businessId: cafe.id,
      customer: {
        id: customerA.id,
        businessId: cafe.id,
        branchId: customerA.branchId,
        name: customerA.name,
        phone: customerA.phone,
        email: customerA.email,
        birthday: customerA.birthday,
        status: customerA.status,
        marketingConsent: customerA.marketingConsent,
        totalVisits: customerA.totalVisits,
        stampsBalance: customerA.stampsBalance,
        pointsBalance: customerA.pointsBalance,
        joinedAt: customerA.joinedAt,
        lastVisitAt: customerA.lastVisitAt,
      },
      business: {
        id: cafe.id,
        name: cafe.name,
        slug: cafe.slug,
        category: cafe.category,
        themePreset: cafe.themePreset,
        primaryColor: cafe.primaryColor,
        logo: cafe.logo,
      },
    };

    // =========================================================================
    // SECTION 1: Code Generation & Sanitization Helpers
    // =========================================================================
    console.log('[1] Code Generation & Normalization:');

    const sampleCode = generateRedemptionCode();
    assert(
      /^R-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(sampleCode),
      'Generates R-XXXX-XXXX format code',
      `Got: ${sampleCode}`
    );

    const norm1 = normalizeRedemptionCode('r-a1b2-c3d4');
    assert(norm1 === 'R-A1B2-C3D4', 'Normalizes lowercase hyphenated code');

    const norm2 = normalizeRedemptionCode('ra1b2c3d4');
    assert(norm2 === 'R-A1B2-C3D4', 'Normalizes unhyphenated R-code');

    const norm3 = normalizeRedemptionCode('a1b2c3d4');
    assert(norm3 === 'R-A1B2-C3D4', 'Normalizes 8-char hex code into R-XXXX-XXXX');

    // =========================================================================
    // SECTION 2: Business Reward Catalogue Management & Multi-Tenant Rules
    // =========================================================================
    console.log('\n[2] Reward Catalogue CRUD & Multi-Tenant Rules:');

    // 1. Create Stamp Reward
    const stampReward = await createReward(cafeOwnerCtx, {
      title: 'Artisan Espresso',
      description: 'Single or double espresso shot with choice of milk.',
      stampsRequired: 5,
      expiryDays: 14,
      usageLimitPerCustomer: 2,
      status: 'ACTIVE',
    });
    assert(stampReward.title === 'Artisan Espresso', 'Creates stamp-based reward');
    assert(stampReward.stampsRequired === 5, 'Sets stampsRequired to 5');
    assert(stampReward.pointsRequired === null, 'pointsRequired is null for stamp reward');
    assert(stampReward.expiryDays === 14, 'Sets custom expiry days');

    // 2. Create Points Reward
    const pointsReward = await createReward(cafeOwnerCtx, {
      title: 'Free Coffee Beans 250g',
      description: 'Bag of freshly roasted house blend beans.',
      pointsRequired: 150,
      usageLimitPerCustomer: 1,
      status: 'ACTIVE',
    });
    assert(pointsReward.title === 'Free Coffee Beans 250g', 'Creates points-based reward');
    assert(pointsReward.pointsRequired === 150, 'Sets pointsRequired to 150');

    // 3. Validation: Rejects reward without title
    let rejectedTitle = false;
    try {
      await createReward(cafeOwnerCtx, {
        title: '',
        stampsRequired: 5,
      });
    } catch (err: any) {
      rejectedTitle = err.code === 'INVALID_TITLE';
    }
    assert(rejectedTitle, 'Validation: Rejects reward with empty title');

    // 4. Validation: Rejects reward without stamps or points cost
    let rejectedCost = false;
    try {
      await createReward(cafeOwnerCtx, {
        title: 'Free Air',
        stampsRequired: 0,
        pointsRequired: 0,
      });
    } catch (err: any) {
      rejectedCost = err.code === 'INVALID_COST';
    }
    assert(rejectedCost, 'Validation: Rejects reward with zero or missing cost');

    // 5. Multi-Tenant Security: Rejects creating reward with another tenant's branch
    let rejectedCrossBranch = false;
    try {
      await createReward(cafeOwnerCtx, {
        title: 'Cross Branch Reward',
        stampsRequired: 5,
        branchId: salonBranch.id, // Salon's branch in Cafe context!
      });
    } catch (err: any) {
      rejectedCrossBranch = err.code === 'INVALID_BRANCH';
    }
    assert(rejectedCrossBranch, 'Multi-Tenant Security: Rejects reward with foreign branchId');

    // 6. Update Reward
    const updatedStampReward = await updateReward(cafeOwnerCtx, stampReward.id, {
      title: 'Artisan Espresso or Flat White',
      stampsRequired: 6,
    });
    assert(
      updatedStampReward.title === 'Artisan Espresso or Flat White',
      'Updates reward title'
    );
    assert(updatedStampReward.stampsRequired === 6, 'Updates stampsRequired');

    // 7. Toggle Status
    const pausedReward = await setRewardStatus(cafeOwnerCtx, stampReward.id, 'INACTIVE');
    assert(pausedReward.status === 'INACTIVE', 'Pauses reward to INACTIVE');

    const reactivatedReward = await setRewardStatus(cafeOwnerCtx, stampReward.id, 'ACTIVE');
    assert(reactivatedReward.status === 'ACTIVE', 'Reactivates reward to ACTIVE');

    // 8. Multi-Tenant Protection on Update
    let rejectedCrossTenantUpdate = false;
    try {
      const salonOwnerCtx = await getTenantContext(cafeOwner.id, salon.id); // different business
      await updateReward(salonOwnerCtx, stampReward.id, { title: 'Hacked' });
    } catch (err: any) {
      rejectedCrossTenantUpdate = err.code === 'REWARD_NOT_FOUND' || err.name === 'TenantAuthorizationError';
    }
    assert(rejectedCrossTenantUpdate, 'Multi-Tenant Security: Salon cannot edit Cafe reward');

    // =========================================================================
    // SECTION 3: Server-Authoritative Eligibility Engine
    // =========================================================================
    console.log('\n[3] Server-Authoritative Customer Eligibility Engine:');

    // Check customer rewards
    // Customer has 10 stamps, 250 points
    const eligibilityResult = await getCustomerRewards(customerCtx);
    assert(Array.isArray(eligibilityResult.rewards), 'Returns rewards array for customer');
    assert(eligibilityResult.rewards.length >= 2, 'Lists active rewards');

    const evalStamp = eligibilityResult.rewards.find((r) => r.id === stampReward.id);
    assert(evalStamp !== undefined, 'Contains stamp reward');
    assert(evalStamp?.isEligible === true, 'Customer with 10 stamps is eligible for 6-stamp reward');
    assert(evalStamp?.stampsNeeded === 0, 'stampsNeeded is 0 when balance is sufficient');
    assert(evalStamp?.progressPct === 100, 'progressPct is 100% when eligible');

    const evalPoints = eligibilityResult.rewards.find((r) => r.id === pointsReward.id);
    assert(evalPoints !== undefined, 'Contains points reward');
    assert(evalPoints?.isEligible === true, 'Customer with 250 points is eligible for 150-point reward');

    // Test ineligibility: Create expensive reward that customer cannot afford
    const expensiveReward = await createReward(cafeOwnerCtx, {
      title: 'Luxury Espresso Machine',
      stampsRequired: 50, // Customer only has 10 stamps
      status: 'ACTIVE',
    });

    const refreshedEval = await getCustomerRewards(customerCtx);
    const evalExpensive = refreshedEval.rewards.find((r) => r.id === expensiveReward.id);
    assert(evalExpensive?.isEligible === false, 'Customer is ineligible for expensive reward');
    assert(evalExpensive?.stampsNeeded === 40, 'Correctly computes stampsNeeded = 40 (50 - 10)');
    assert(evalExpensive?.progressPct === 20, 'Computes progressPct = 20% (10/50)');
    assert(
      evalExpensive?.ineligibilityReasons.includes('INSUFFICIENT_STAMPS') === true,
      'Ineligibility reasons contains INSUFFICIENT_STAMPS'
    );

    // =========================================================================
    // SECTION 4: Atomic Customer Reward Claim & Deduction
    // =========================================================================
    console.log('\n[4] Atomic Customer Reward Claim & Ledger Deduction:');

    const stampsBefore = customerA.stampsBalance; // 10
    const costToClaim = updatedStampReward.stampsRequired || 6; // 6

    const claimKey = `test_claim_${Date.now()}`;
    const redemption = await claimCustomerReward(customerCtx, updatedStampReward.id, {
      idempotencyKey: claimKey,
    });

    assert(redemption.id !== undefined, 'Creates RewardRedemption record');
    assert(redemption.status === 'CLAIMED', 'Initial status is CLAIMED');
    assert(redemption.stampsConsumed === costToClaim, `Records stampsConsumed = ${costToClaim}`);
    assert(
      /^R-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(redemption.redemptionCode),
      `Assigned unguessable code: ${redemption.redemptionCode}`
    );

    // Verify atomic deduction on customer and loyalty card
    const updatedCustomer = await prisma.customer.findUnique({ where: { id: customerA.id } });
    assert(
      updatedCustomer?.stampsBalance === stampsBefore - costToClaim,
      `Atomically deducted stamps from customer (${stampsBefore} -> ${updatedCustomer?.stampsBalance})`
    );

    const updatedCard = await prisma.loyaltyCard.findUnique({ where: { id: redemption.loyaltyCardId || customerCard.id } });
    assert(
      updatedCard?.stampsCollected === stampsBefore - costToClaim,
      `Atomically deducted stamps from loyalty card (${stampsBefore} -> ${updatedCard?.stampsCollected})`
    );

    // Verify negative transaction recorded on the ledger
    const negTx = await prisma.loyaltyTransaction.findFirst({
      where: {
        businessId: cafe.id,
        customerId: customerA.id,
        type: 'STAMP_REDEEMED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(negTx !== null, 'Records negative LoyaltyTransaction on ledger');
    assert(negTx?.deltaStamps === -costToClaim, `deltaStamps is -${costToClaim}`);
    assert(negTx?.referenceType === 'REWARD_REDEMPTION', 'referenceType is REWARD_REDEMPTION');

    // Verify CustomerEvent
    const event = await prisma.customerEvent.findFirst({
      where: {
        customerId: customerA.id,
        type: 'REWARD_EARNED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(event !== null, 'Emits CUSTOMER_EVENT of type REWARD_EARNED');

    // Zero-floor balance check: Now customer only has 4 stamps. Trying to claim 6 stamps must fail!
    let rejectedInsufficient = false;
    try {
      await claimCustomerReward(customerCtx, updatedStampReward.id);
    } catch (err: any) {
      rejectedInsufficient = err.code === 'INSUFFICIENT_STAMPS';
    }
    assert(rejectedInsufficient, 'Zero-Floor Invariant: Rejects claim when balance is below cost');

    // Balance remains untouched at 4
    const unchangedCust = await prisma.customer.findUnique({ where: { id: customerA.id } });
    assert(unchangedCust?.stampsBalance === 4, 'Balance untouched on rejected claim');

    // =========================================================================
    // SECTION 5: Anti-Fraud: Idempotency & Concurrency
    // =========================================================================
    console.log('\n[5] Anti-Fraud: Idempotency & Concurrency Protection:');

    // Re-submitting the identical idempotencyKey
    const duplicateClaim = await claimCustomerReward(customerCtx, updatedStampReward.id, {
      idempotencyKey: claimKey,
    });
    assert(duplicateClaim.id === redemption.id, 'Idempotency: Returns same redemption record');
    assert(
      duplicateClaim.redemptionCode === redemption.redemptionCode,
      'Idempotency: Returns identical redemption code'
    );

    // Customer balance must NOT have been deducted again
    const postIdempotentCust = await prisma.customer.findUnique({ where: { id: customerA.id } });
    assert(postIdempotentCust?.stampsBalance === 4, 'Idempotency: Did NOT double-deduct customer balance');

    // Database unique constraint: exactly 1 row for [businessId, idempotencyKey]
    const rowCount = await prisma.rewardRedemption.count({
      where: { businessId: cafe.id, idempotencyKey: claimKey },
    });
    assert(rowCount === 1, 'Database Invariant: Exactly 1 row for (businessId, idempotencyKey)');

    // =========================================================================
    // SECTION 6: Staff Redemption Terminal & Validation
    // =========================================================================
    console.log('\n[6] Staff Redemption Terminal & Validation:');

    // 1. Staff Lookup (Preview)
    const lookup = await staffLookupRedemption(cafeCashierCtx, redemption.redemptionCode);
    assert(lookup.isValid === true, 'Staff preview reports isValid = true');
    assert(lookup.redemption.id === redemption.id, 'Lookup finds correct voucher record');
    assert(lookup.redemption.customer.name === customerA.name, 'Lookup provides customer name');
    assert(lookup.statusText === 'VALID_FOR_REDEMPTION', 'statusText is VALID_FOR_REDEMPTION');

    // Lookup with unformatted code (lowercase, no hyphens)
    const rawClean = redemption.redemptionCode.replace(/[^A-Z0-9]/g, '').toLowerCase();
    const lookupNormalized = await staffLookupRedemption(cafeCashierCtx, rawClean);
    assert(lookupNormalized.redemption.id === redemption.id, 'Lookup succeeds with unformatted/lowercase code');

    // 2. Staff Validate (Atomic Transition to REDEEMED)
    const validated = await staffValidateRedemption(cafeCashierCtx, redemption.redemptionCode, {
      branchId: cafeBranch.id,
    });
    assert(validated.status === 'REDEEMED', 'Atomically transitions status to REDEEMED');
    assert(validated.redeemedAt !== null, 'Sets redeemedAt timestamp');
    assert(validated.redeemedByUserId === cafeCashier.id, 'Records staff actor ID');

    // Verify Audit Log
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        businessId: cafe.id,
        action: 'REWARD_REDEEMED',
        entityId: redemption.id,
      },
    });
    assert(auditLog !== null, 'Writes AUDIT_LOG for REWARD_REDEEMED with staff actor');

    // Verify Customer Event for Redemption
    const redeemEvent = await prisma.customerEvent.findFirst({
      where: {
        businessId: cafe.id,
        customerId: customerA.id,
        type: 'REWARD_REDEEMED',
      },
    });
    assert(redeemEvent !== null, 'Emits CUSTOMER_EVENT of type REWARD_REDEEMED');

    // 3. Double-Redemption Protection: Attempting to redeem the voucher again must be REJECTED!
    let rejectedDoubleRedeem = false;
    try {
      await staffValidateRedemption(cafeCashierCtx, redemption.redemptionCode);
    } catch (err: any) {
      rejectedDoubleRedeem = err.code === 'ALREADY_REDEEMED';
    }
    assert(rejectedDoubleRedeem, 'Anti-Fraud: Rejects second redemption of already used voucher');

    // Staff lookup now reflects already redeemed status
    const postRedeemLookup = await staffLookupRedemption(cafeCashierCtx, redemption.redemptionCode);
    assert(postRedeemLookup.isValid === false, 'Lookup reports isValid = false after redemption');
    assert(postRedeemLookup.statusText === 'ALREADY_REDEEMED', 'statusText is ALREADY_REDEEMED');

    // 4. Cross-Tenant Rejection: Salon cashier cannot redeem Cafe's voucher
    const salonCashier = await prisma.user.findFirst({
      where: { memberships: { some: { businessId: salon.id } } },
    });
    if (salonCashier) {
      const salonCashierCtx = await getTenantContext(salonCashier.id, salon.id);
      let rejectedCrossTenantRedeem = false;
      try {
        await staffLookupRedemption(salonCashierCtx, redemption.redemptionCode);
      } catch (err: any) {
        rejectedCrossTenantRedeem = err.code === 'REDEMPTION_NOT_FOUND';
      }
      assert(
        rejectedCrossTenantRedeem,
        'Multi-Tenant Security: Salon cannot lookup or redeem Cafe voucher'
      );
    }

    // 5. Expired voucher test
    const expiredRedemption = await prisma.rewardRedemption.create({
      data: {
        businessId: cafe.id,
        rewardId: pointsReward.id,
        customerId: customerA.id,
        redemptionCode: `R-EXPR-${Date.now().toString(36).toUpperCase()}`,
        status: 'CLAIMED',
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago!
      },
    });

    let rejectedExpired = false;
    try {
      await staffValidateRedemption(cafeCashierCtx, expiredRedemption.redemptionCode);
    } catch (err: any) {
      rejectedExpired = err.code === 'REDEMPTION_EXPIRED';
    }
    assert(rejectedExpired, 'Anti-Fraud: Rejects expired voucher redemption');

    // =========================================================================
    // SECTION 7: HTTP REST API Endpoints Verification
    // =========================================================================
    console.log('\n[7] HTTP REST API Endpoints:');

    // 1. Staff Login
    const staffLoginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'marcus@reployty.com',
        password: 'OwnerPass123!',
      }),
    });
    assert(staffLoginRes.status === 200, 'POST /api/auth/login successful for Business Owner');
    const staffCookie = staffLoginRes.cookie;

    // 2. GET /api/business/rewards
    const getRewardsRes = await request('/api/business/rewards', {
      headers: { Cookie: staffCookie || '' },
    });
    assert(getRewardsRes.status === 200, 'GET /api/business/rewards returns 200 OK');
    assert(Array.isArray(getRewardsRes.data.rewards), 'API returns rewards catalog');
    assert(getRewardsRes.data.metrics !== undefined, 'API returns rewards metrics');

    // 3. POST /api/business/rewards
    const postRewardRes = await request('/api/business/rewards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: staffCookie || '',
      },
      body: JSON.stringify({
        title: 'HTTP Created Reward',
        stampsRequired: 4,
        expiryDays: 30,
      }),
    });
    assert(postRewardRes.status === 201, 'POST /api/business/rewards returns 201 Created');
    assert(postRewardRes.data.title === 'HTTP Created Reward', 'API returns created reward');

    // 4. GET /api/business/redemptions (Ledger)
    const getRedemptionsRes = await request('/api/business/redemptions', {
      headers: { Cookie: staffCookie || '' },
    });
    assert(getRedemptionsRes.status === 200, 'GET /api/business/redemptions returns 200 OK');
    assert(Array.isArray(getRedemptionsRes.data.redemptions), 'API returns redemptions ledger');

    // 5. GET /api/business/redemptions/lookup/:code
    const lookupHttpRes = await request(
      `/api/business/redemptions/lookup/${encodeURIComponent(redemption.redemptionCode)}`,
      {
        headers: { Cookie: staffCookie || '' },
      }
    );
    assert(lookupHttpRes.status === 200, 'GET /api/business/redemptions/lookup/:code returns 200 OK');

    // 6. Customer endpoints with Customer Session Cookie
    const custCookie = `reployty_customer_session=${customerSession.sessionToken}`;

    const custRewardsRes = await request('/api/customer/rewards', {
      headers: { Cookie: custCookie },
    });
    assert(custRewardsRes.status === 200, 'GET /api/customer/rewards returns 200 OK');
    assert(Array.isArray(custRewardsRes.data.rewards), 'Returns customer reward catalog');

    const custRedemptionsRes = await request('/api/customer/redemptions', {
      headers: { Cookie: custCookie },
    });
    assert(custRedemptionsRes.status === 200, 'GET /api/customer/redemptions returns 200 OK');
    assert(Array.isArray(custRedemptionsRes.data), 'Returns customer vouchers');

    // 7. Security: Unauthenticated request rejected
    const unauthRes = await request('/api/business/rewards');
    assert(unauthRes.status === 401, 'Unauthenticated GET /api/business/rewards rejected (401)');
  } catch (err) {
    console.error('Test Suite Error:', err);
    testFailed++;
  }

  console.log('\n==================================================================');
  console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
  console.log('==================================================================\n');

  if (testFailed > 0) {
    process.exit(1);
  }
}

runRewardsSuite()
  .catch((err) => {
    console.error('Fatal test error', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
