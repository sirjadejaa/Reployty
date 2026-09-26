import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import {
  getBusinessLoyaltyProgram,
  upsertLoyaltyProgram,
  setLoyaltyProgramStatus,
  awardStamps,
  awardPoints,
  adjustLoyaltyBalance,
  getBusinessLoyaltyHistory,
  searchLoyaltyCustomers,
  getCustomerLoyaltyState,
  getCustomerLoyaltyHistory,
  LoyaltyOperationError,
} from '../../src/server/services/loyaltyService';
import { LoyaltyType, ProgramStatus, LoyaltyTransactionType } from '@prisma/client';

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

async function runLoyaltySuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 7: PRODUCTION LOYALTY ENGINE AUTOMATED TEST SUITE');
  console.log('==================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // Setup Context: Retrieve seeded businesses and staff
    // -------------------------------------------------------------------------
    const cafe = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
      include: { branches: true },
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

    // Create a dedicated test customer for loyalty tests
    const testPhone = '+15558889900';
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
          phone: testPhone,
          name: 'Loyalty Tester Alpha',
          pointsBalance: 0,
          totalVisits: 1,
          totalSpendMinor: 0,
        },
      });
    } else {
      customerA = await prisma.customer.update({
        where: { id: customerA.id },
        data: {
          pointsBalance: 0,
          stampsBalance: 0,
          totalVisits: 1,
          totalSpendMinor: 0,
        },
      });
    }

    // -------------------------------------------------------------------------
    // [1] Loyalty Program Management & Single Active Program Invariant
    // -------------------------------------------------------------------------
    console.log('[1] Program Management & Single Active Invariant:');

    // Clean up any existing programs for clean slate in cafe
    await prisma.loyaltyTransaction.deleteMany({ where: { businessId: cafe.id } });
    await prisma.loyaltyCard.deleteMany({ where: { businessId: cafe.id } });
    await prisma.loyaltyProgram.deleteMany({ where: { businessId: cafe.id } });

    // 1.1 Create STAMP program
    const stampProg = await upsertLoyaltyProgram(
      cafeOwnerCtx,
      {
        name: 'Bean Daily Stamps',
        type: LoyaltyType.STAMP,
        targetStamps: 8,
        rewardTitle: 'Free Cortado',
        status: ProgramStatus.ACTIVE,
      }
    );
    assert(stampProg.name === 'Bean Daily Stamps', 'Creates STAMP loyalty program');
    assert(stampProg.type === 'STAMP', 'Program type is STAMP');
    assert(stampProg.targetStamps === 8, 'Sets targetStamps to 8');
    assert(stampProg.status === 'ACTIVE', 'Program starts ACTIVE');

    // 1.2 Program query
    const progData = await getBusinessLoyaltyProgram(cafeOwnerCtx);
    assert(progData.activeProgram?.id === stampProg.id, 'getBusinessLoyaltyProgram returns active program');
    assert(progData.programs.length === 1, 'Lists all programs for business');

    // 1.3 Single Active Primary Invariant: Activating a POINTS program automatically pauses previous
    const pointsProg = await upsertLoyaltyProgram(
      cafeOwnerCtx,
      {
        name: 'Bean Points Club',
        type: LoyaltyType.POINTS,
        pointsPerCurrencyMinor: 1000, // 1 pt per ₹10 (1000 minor units)
        rewardTitle: '₹100 Voucher',
        status: ProgramStatus.ACTIVE,
      }
    );
    assert(pointsProg.type === 'POINTS', 'Creates POINTS loyalty program');
    assert(pointsProg.status === 'ACTIVE', 'New POINTS program is ACTIVE');

    const previousProg = await prisma.loyaltyProgram.findUnique({ where: { id: stampProg.id } });
    assert(
      previousProg?.status === 'PAUSED',
      'Single Active Invariant: Previous active STAMP program was automatically PAUSED'
    );

    // Reactivate STAMP program for stamp testing
    await setLoyaltyProgramStatus(cafeOwnerCtx, stampProg.id, ProgramStatus.ACTIVE);
    const reactivatedStamp = await prisma.loyaltyProgram.findUnique({ where: { id: stampProg.id } });
    const reactivatedPoints = await prisma.loyaltyProgram.findUnique({ where: { id: pointsProg.id } });
    assert(reactivatedStamp?.status === 'ACTIVE', 'STAMP program reactivated to ACTIVE');
    assert(
      reactivatedPoints?.status === 'PAUSED',
      'Single Active Invariant: POINTS program was automatically PAUSED when STAMP was reactivated'
    );

    // 1.4 Program Validation
    let invalidProgCaught = false;
    try {
      await upsertLoyaltyProgram(
        cafeOwnerCtx,
        {
          name: '',
          type: LoyaltyType.STAMP,
          targetStamps: 0,
          rewardTitle: 'Free Item',
        }
      );
    } catch (err: any) {
      invalidProgCaught = err.code === 'VALIDATION_ERROR';
    }
    assert(invalidProgCaught, 'Validation: Rejects program with empty name');

    // -------------------------------------------------------------------------
    // [2] Stamp Awarding Workflow, Database Idempotency & Audit
    // -------------------------------------------------------------------------
    console.log('\n[2] Stamp Awarding, Idempotency & Invariants:');

    const stampIdemKey = `idem-stamp-${Date.now()}-001`;

    const initialVisits = (await prisma.customer.findUnique({ where: { id: customerA.id } }))?.totalVisits || 0;

    // 2.1 Award 2 stamps
    const cardAfterAward1 = await awardStamps(
      cafeCashierCtx,
      {
        customerId: customerA.id,
        stampsToAdd: 2,
        branchId: cafeBranch.id,
        idempotencyKey: stampIdemKey,
        notes: 'Espresso + Croissant',
      }
    );

    assert(cardAfterAward1.stampsCollected === 2, 'Customer card balance incremented to 2 stamps');
    assert(cardAfterAward1.pointsBalance === 0, 'Points balance remains 0 on stamp card');

    // Verify transaction row
    const tx1 = await prisma.loyaltyTransaction.findFirst({
      where: {
        businessId: cafe.id,
        idempotencyKey: stampIdemKey,
      },
    });
    assert(!!tx1, 'Persists LoyaltyTransaction with idempotencyKey in PostgreSQL');
    assert(tx1?.deltaStamps === 2, 'Transaction deltaStamps is +2');
    assert(tx1?.type === 'STAMP_ADDED', 'Transaction type is STAMP_ADDED');

    // Customer visit count incremented
    const refreshedCust = await prisma.customer.findUnique({ where: { id: customerA.id } });
    assert(refreshedCust?.totalVisits === initialVisits + 1, 'Customer totalVisits incremented');

    // CustomerEvent emitted
    const timelineEvent = await prisma.customerEvent.findFirst({
      where: {
        customerId: customerA.id,
        type: 'STAMP_ADDED',
      },
    });
    assert(!!timelineEvent, 'Emits CUSTOMER_EVENT of type STAMP_ADDED');

    // AuditLog recorded
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        businessId: cafe.id,
        action: 'LOYALTY_STAMP_AWARDED',
      },
    });
    assert(!!auditLog, 'Emits AUDIT_LOG for LOYALTY_STAMP_AWARDED with staff actor');

    // 2.2 Idempotency: Duplicate call with identical key must return same transaction without double incrementing
    const cardDuplicate = await awardStamps(
      cafeCashierCtx,
      {
        customerId: customerA.id,
        stampsToAdd: 2,
        branchId: cafeBranch.id,
        idempotencyKey: stampIdemKey,
        notes: 'Retry duplicate payload',
      }
    );

    assert(
      cardDuplicate.id === cardAfterAward1.id,
      'Idempotency: Re-submitting identical key returns existing card'
    );
    assert(
      cardDuplicate.stampsCollected === 2,
      'Idempotency: Card balance did NOT increase on duplicate submission (still 2)'
    );

    const checkTxCount = await prisma.loyaltyTransaction.count({
      where: { businessId: cafe.id, idempotencyKey: stampIdemKey },
    });
    assert(checkTxCount === 1, 'Database Invariant: Exactly 1 transaction row exists for idempotencyKey');

    // 2.3 Different idempotency key awards additional stamps
    const cardAward2 = await awardStamps(
      cafeCashierCtx,
      {
        customerId: customerA.id,
        stampsToAdd: 1,
        branchId: cafeBranch.id,
        idempotencyKey: `idem-stamp-${Date.now()}-002`,
      }
    );
    assert(cardAward2.stampsCollected === 3, 'New idempotency key awards 1 additional stamp (balance = 3)');

    // 2.4 Anti-Abuse: Reject zero or negative stamps
    let antiAbuseZeroCaught = false;
    try {
      await awardStamps(
        cafeCashierCtx,
        {
          customerId: customerA.id,
          stampsToAdd: 0,
        }
      );
    } catch (err: any) {
      antiAbuseZeroCaught = err.code === 'INVALID_QUANTITY';
    }
    assert(antiAbuseZeroCaught, 'Anti-Abuse: Rejects stamp award <= 0');

    let antiAbuseMaxCaught = false;
    try {
      await awardStamps(
        cafeCashierCtx,
        {
          customerId: customerA.id,
          stampsToAdd: 101,
        }
      );
    } catch (err: any) {
      antiAbuseMaxCaught = err.code === 'EXCESSIVE_QUANTITY';
    }
    assert(antiAbuseMaxCaught, 'Anti-Abuse: Rejects stamp award > 100 in single transaction');

    // -------------------------------------------------------------------------
    // [3] Points Awarding & Pure Integer Arithmetic
    // -------------------------------------------------------------------------
    console.log('\n[3] Points Awarding & Pure Integer Minor Unit Arithmetic:');

    // Activate POINTS program
    await setLoyaltyProgramStatus(cafeOwnerCtx, pointsProg.id, ProgramStatus.ACTIVE);

    // Rule: 1000 minor units (₹10.00) = 1 point
    // Case 1: Spend ₹250.00 (25,000 minor units) -> exactly 25 points
    const pointsIdemKey1 = `idem-pts-${Date.now()}-001`;
    const ptsCard1 = await awardPoints(
      cafeCashierCtx,
      {
        customerId: customerA.id,
        purchaseAmountMinor: 25000,
        branchId: cafeBranch.id,
        idempotencyKey: pointsIdemKey1,
      }
    );

    assert(ptsCard1.pointsBalance === 25, 'Integer Math: ₹250.00 (25000 minor) awards exactly 25 points');

    // Case 2: Spend ₹259.99 (25,999 minor units) -> pure integer floor: Math.floor(25999 / 1000) = 25 points (NO FLOATING POINT DRIFT)
    const pointsIdemKey2 = `idem-pts-${Date.now()}-002`;
    const ptsCard2 = await awardPoints(
      cafeCashierCtx,
      {
        customerId: customerA.id,
        purchaseAmountMinor: 25999,
        branchId: cafeBranch.id,
        idempotencyKey: pointsIdemKey2,
      }
    );
    assert(ptsCard2.pointsBalance === 50, 'Pure Integer Math: ₹259.99 (25999 minor) yields exactly 25 points (balance accumulates to 50)');

    // Verify Customer spend & points sync
    const custWithPoints = await prisma.customer.findUnique({ where: { id: customerA.id } });
    assert(custWithPoints?.pointsBalance === 50, 'Customer.pointsBalance synced in PostgreSQL');
    assert(
      custWithPoints?.totalSpendMinor === 25000 + 25999,
      'Customer.totalSpendMinor precisely records cumulative spend in integer minor units'
    );

    // -------------------------------------------------------------------------
    // [4] Controlled Staff Balance Adjustments & Zero Floor Invariant
    // -------------------------------------------------------------------------
    console.log('\n[4] Staff Adjustments, Reason Requirement & Zero Floor Invariant:');

    // 4.1 Positive adjustment (+10 points) with valid reason
    const adjust1 = await adjustLoyaltyBalance(
      cafeOwnerCtx,
      {
        customerId: customerA.id,
        deltaPoints: 10,
        reason: 'Service recovery for table delay',
        branchId: cafeBranch.id,
      }
    );
    assert(adjust1.pointsBalance === 60, 'Balance increased by +10 points to 60');

    // 4.2 Negative adjustment (-15 points) with valid reason
    const adjust2 = await adjustLoyaltyBalance(
      cafeOwnerCtx,
      {
        customerId: customerA.id,
        deltaPoints: -15,
        reason: 'Corrected cashier entry mistake',
        branchId: cafeBranch.id,
      }
    );
    assert(adjust2.pointsBalance === 45, 'Balance decreased by -15 points to 45');

    // 4.3 Zero Floor Invariant: Cannot adjust balance below zero
    let zeroFloorCaught = false;
    try {
      await adjustLoyaltyBalance(
        cafeOwnerCtx,
        {
          customerId: customerA.id,
          deltaPoints: -100, // Balance is 45, -100 would result in -55
          reason: 'Excessive deduction attempt',
        }
      );
    } catch (err: any) {
      zeroFloorCaught = err.code === 'INVALID_BALANCE';
    }
    assert(zeroFloorCaught, 'Zero Floor Invariant: Rejects adjustment that drops balance below zero');

    // 4.4 Mandatory Reason Requirement
    let missingReasonCaught = false;
    try {
      await adjustLoyaltyBalance(
        cafeOwnerCtx,
        {
          customerId: customerA.id,
          deltaPoints: 5,
          reason: '   ', // empty string
        }
      );
    } catch (err: any) {
      missingReasonCaught = err.code === 'VALIDATION_ERROR';
    }
    assert(missingReasonCaught, 'Audit Invariant: Rejects adjustment without non-empty reason');

    // -------------------------------------------------------------------------
    // [5] Multi-Tenant & Cross-Tenant Security Isolation
    // -------------------------------------------------------------------------
    console.log('\n[5] Multi-Tenant Security & Tenant Isolation:');

    // 5.1 Business A (Cafe) cannot award stamps for Business B's customer
    let crossTenantCustCaught = false;
    try {
      // Create customer in Salon
      const salonPhone = `+1555777${Math.floor(10000 + Math.random() * 89999)}`;
      const salonCust = await prisma.customer.create({
        data: {
          businessId: salon.id,
          phone: salonPhone,
          name: 'Salon Exclusive Client',
        },
      });

      await awardStamps(
        cafeOwnerCtx,
        {
          customerId: salonCust.id, // Customer belongs to Salon, not Cafe!
          stampsToAdd: 1,
        }
      );
    } catch (err: any) {
      crossTenantCustCaught = err.code === 'CUSTOMER_NOT_FOUND';
    }
    assert(crossTenantCustCaught, 'Multi-Tenant Security: Cafe cannot award stamps to Salon customer (IDOR blocked)');

    // 5.2 Business A staff cannot award with Business B branch
    let crossTenantBranchCaught = false;
    try {
      await awardPoints(
        cafeOwnerCtx,
        {
          customerId: customerA.id,
          purchaseAmountMinor: 10000,
          branchId: salonBranch.id, // Branch belongs to Salon!
        }
      );
    } catch (err: any) {
      crossTenantBranchCaught = err.code === 'BRANCH_NOT_FOUND';
    }
    assert(crossTenantBranchCaught, 'Branch Isolation: Cannot award points using cross-tenant branch ID');

    // -------------------------------------------------------------------------
    // [6] Customer PWA Pass Query & Privacy Isolation
    // -------------------------------------------------------------------------
    console.log('\n[6] Customer PWA Pass & Isolation:');

    const customerSessionCtx = {
      customerId: customerA.id,
      businessId: cafe.id,
      phone: customerA.phone,
    };

    // 6.1 Customer loyalty state query
    const customerPass = await getCustomerLoyaltyState(customerSessionCtx);
    assert(customerPass.hasActiveProgram === true, 'Customer state reports hasActiveProgram = true');
    assert(customerPass.program?.id === pointsProg.id, 'Reports active points program');
    assert(customerPass.card?.pointsBalance === 45, 'Reports correct current card points balance (45)');
    assert(customerPass.recentTransactions.length > 0, 'Returns recent transaction history');

    // 6.2 Customer loyalty history
    const custHistory = await getCustomerLoyaltyHistory(customerSessionCtx);
    assert(Array.isArray(custHistory) && custHistory.length > 0, 'Customer history returns transactions');
    assert(custHistory.length >= 3, 'Customer history total reflects all transactions');

    // -------------------------------------------------------------------------
    // [7] HTTP REST API Integration & Auth Verification
    // -------------------------------------------------------------------------
    console.log('\n[7] HTTP REST API & Session Flow:');

    // 7.1 Login as Business Owner to obtain auth session cookie
    const ownerLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'marcus@reployty.com',
        password: 'OwnerPass123!',
      }),
    });
    assert(ownerLogin.status === 200, 'POST /api/auth/login successful for Cafe Owner');
    const ownerCookie = `reployty_session=${ownerLogin.data.sessionToken}`;
    const ownerSessionToken = ownerLogin.data.sessionToken;

    // Switch tenant to cafe
    await request('/api/auth/switch-tenant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerSessionToken}`,
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ businessId: cafe.id }),
    });

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerSessionToken}`,
      Cookie: ownerCookie,
    };

    // 7.2 GET /api/business/loyalty/program
    const httpProg = await request('/api/business/loyalty/program', {
      headers: authHeaders,
    });
    assert(httpProg.status === 200, 'GET /api/business/loyalty/program returns 200 OK');
    assert(httpProg.data.activeProgram?.id === pointsProg.id, 'API returns active program');
    assert(httpProg.data.metrics?.totalCards >= 1, 'API returns live loyalty aggregates');

    // 7.3 GET /api/business/loyalty/customers?search=testPhone
    const httpCustLookup = await request(`/api/business/loyalty/customers?search=${encodeURIComponent(testPhone)}`, {
      headers: authHeaders,
    });
    assert(httpCustLookup.status === 200, 'GET /api/business/loyalty/customers returns 200 OK');
    assert(httpCustLookup.data.length >= 1, 'Lookup returns matched customer');
    assert(httpCustLookup.data.some((c: any) => c.phone === testPhone), 'Lookup returns test customer phone');

    // 7.4 POST /api/business/loyalty/award-points
    const httpAwardPts = await request('/api/business/loyalty/award-points', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerId: customerA.id,
        purchaseAmountMinor: 15000, // ₹150.00 -> 15 points
        idempotencyKey: `http-pts-${Date.now()}`,
      }),
    });
    assert(httpAwardPts.status === 200, 'POST /api/business/loyalty/award-points returns 200 OK');
    assert(httpAwardPts.data.success === true && httpAwardPts.data.card.pointsBalance > 0, 'Awarded points via HTTP');

    // 7.5 POST /api/business/loyalty/adjust
    const httpAdjust = await request('/api/business/loyalty/adjust', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerId: customerA.id,
        deltaPoints: 5,
        reason: 'HTTP test goodwill gesture',
      }),
    });
    assert(httpAdjust.status === 200, 'POST /api/business/loyalty/adjust returns 200 OK');
    assert(httpAdjust.data.success === true && httpAdjust.data.card.id, 'Adjusted balance via HTTP');

    // 7.6 GET /api/business/loyalty/history
    const httpHistory = await request('/api/business/loyalty/history?page=1&limit=10', {
      headers: authHeaders,
    });
    assert(httpHistory.status === 200, 'GET /api/business/loyalty/history returns 200 OK');
    assert(httpHistory.data.transactions.length > 0, 'Returns paginated ledger items');

    // 7.7 RBAC Check: Cashier with permission LOYALTY_MANAGE (test role gating)
    // First, login cashier
    const cashierLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sarah.cashier@reployty.com',
        password: 'StaffPass123!',
      }),
    });
    assert(cashierLogin.status === 200, 'POST /api/auth/login successful for Cashier');
    const cashierCookie = `reployty_session=${cashierLogin.data.sessionToken}`;
    const cashierHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cashierLogin.data.sessionToken}`,
      Cookie: cashierCookie,
    };

    // Cashier CAN award stamps/points (cashier role has LOYALTY_MANAGE)
    const cashierAward = await request('/api/business/loyalty/award-points', {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        customerId: customerA.id,
        purchaseAmountMinor: 10000,
        idempotencyKey: `cashier-pts-${Date.now()}`,
      }),
    });
    assert(cashierAward.status === 200, 'RBAC: Cashier with LOYALTY_MANAGE can award points');

    // 7.8 Unauthenticated request to loyalty endpoints rejected
    const unauthReq = await request('/api/business/loyalty/program');
    assert(unauthReq.status === 401, 'Unauthenticated GET /api/business/loyalty/program rejected (401)');

    console.log('\n==================================================================');
    console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================================\n');

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal test error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runLoyaltySuite();
