import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import {
  createOffer,
  getBusinessOffers,
  getOfferById,
  updateOffer,
  setOfferStatus,
  deleteOffer,
  validateOfferForCustomer,
  redeemOffer,
  getBusinessOfferRedemptions,
  getCustomerEligibleOffers,
  computeEffectiveStatus,
  generateOfferRedemptionCode,
  normalizeOfferRedemptionCode,
  OfferOperationError,
} from '../../src/server/services/offerService';
import { createCustomerSession } from '../../src/server/services/customerAuthService';

const BASE_URL = 'http://localhost:3000';

let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, name: string, detail?: string | null) {
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

async function runOffersTestSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 12: OFFERS & PROMOTIONS ENGINE TEST SUITE');
  console.log('==================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. Setup Context: Retrieve seeded businesses and users
    // -------------------------------------------------------------------------
    const cafe = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
      include: { branches: true },
    });
    assert(!!cafe, 'Setup: Found The Roasted Bean Café');
    if (!cafe) throw new Error('Seeded cafe not found');

    const salon = await prisma.business.findUnique({
      where: { slug: 'new-wave-bakery' },
      include: { branches: true },
    });
    assert(!!salon, 'Setup: Found New Wave Bakery (Tenant B)');
    if (!salon) throw new Error('Seeded bakery not found');

    const cafeOwner = await prisma.user.findUnique({
      where: { email: 'marcus@reployty.com' },
    });
    assert(!!cafeOwner, 'Setup: Found Cafe Business Owner');
    if (!cafeOwner) throw new Error('Cafe owner not found');

    const cafeCashier = await prisma.user.findUnique({
      where: { email: 'sarah.cashier@reployty.com' },
    });
    assert(!!cafeCashier, 'Setup: Found Cafe Staff Cashier');
    if (!cafeCashier) throw new Error('Cafe cashier not found');

    const salonOwner = await prisma.user.findUnique({
      where: { email: 'chloe.baker@reployty.com' },
    });
    assert(!!salonOwner, 'Setup: Found Bakery Business Owner (Tenant B)');
    if (!salonOwner) throw new Error('Bakery owner not found');

    const branch = cafe.branches[0];
    assert(!!branch, 'Setup: Found Cafe primary branch');

    // Dedicated customer for offers tests
    const testPhone = '+15556667788';
    let customer = await prisma.customer.findUnique({
      where: {
        businessId_phone: {
          businessId: cafe.id,
          phone: testPhone,
        },
      },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          businessId: cafe.id,
          branchId: branch.id,
          name: 'Offers Tester Regular',
          phone: testPhone,
          email: 'offers.tester@example.com',
          status: 'ACTIVE',
          totalVisits: 5,
        },
      });
    } else {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          status: 'ACTIVE',
          totalVisits: 5,
        },
      });
    }
    assert(!!customer, 'Setup: Initialized dedicated test customer');

    const cafeOwnerCtx = await getTenantContext(cafeOwner.id, cafe.id);
    const cafeCashierCtx = await getTenantContext(cafeCashier.id, cafe.id);
    const salonOwnerCtx = await getTenantContext(salonOwner.id, salon.id);

    // -------------------------------------------------------------------------
    // 2. Helper & Code Generation Tests
    // -------------------------------------------------------------------------
    console.log('\n--- Helper & Code Generation Tests ---');
    const code = generateOfferRedemptionCode();
    assert(code.startsWith('O-') && code.length === 11, 'generateOfferRedemptionCode() produces O-XXXX-XXXX format', code);
    assert(normalizeOfferRedemptionCode('o-abcd-1234') === 'O-ABCD-1234', 'normalizeOfferRedemptionCode handles lowercase with hyphens');
    assert(normalizeOfferRedemptionCode('OABCD1234') === 'O-ABCD-1234', 'normalizeOfferRedemptionCode normalizes unhyphenated code');

    const effectiveActive = computeEffectiveStatus({
      status: 'ACTIVE',
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
    });
    assert(effectiveActive === 'ACTIVE', 'computeEffectiveStatus computes ACTIVE');

    const effectiveScheduled = computeEffectiveStatus({
      status: 'ACTIVE',
      startDate: new Date(Date.now() + 100000),
      endDate: new Date(Date.now() + 200000),
    });
    assert(effectiveScheduled === 'SCHEDULED', 'computeEffectiveStatus computes SCHEDULED for future start date');

    const effectiveExpired = computeEffectiveStatus({
      status: 'ACTIVE',
      startDate: new Date(Date.now() - 200000),
      endDate: new Date(Date.now() - 100000),
    });
    assert(effectiveExpired === 'EXPIRED', 'computeEffectiveStatus computes EXPIRED for past end date');

    // -------------------------------------------------------------------------
    // 3. Offer Management CRUD & Permissions
    // -------------------------------------------------------------------------
    console.log('\n--- Offer Management CRUD Tests ---');
    const newOffer = await createOffer(cafeOwnerCtx, {
      title: 'Summer Splash 25% OFF',
      description: 'Cool down with 25% off all iced beverages',
      type: 'PERCENTAGE_DISCOUNT',
      discountValue: 25,
      minPurchaseMinor: 20000, // ₹200
      maxDiscountMinor: 10000, // ₹100 max cap
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      usageLimitPerCustomer: 2,
      usageLimitTotal: 500,
      eligibilityConfig: {
        branchId: branch.id,
        targetAudience: 'ALL',
        terms: 'Valid on cold drinks only',
      },
    });

    assert(newOffer.title === 'Summer Splash 25% OFF', 'createOffer creates offer successfully');
    assert(newOffer.discountValue === 25, 'Discount value saved correctly');
    assert(newOffer.branchName === branch.name, 'Target branch name resolved');
    assert(newOffer.effectiveStatus === 'ACTIVE', 'Effective status is ACTIVE');

    // Update Offer
    const updatedOffer = await updateOffer(cafeOwnerCtx, newOffer.id, {
      title: 'Summer Splash 30% OFF',
      discountValue: 30,
    });
    assert(updatedOffer.title === 'Summer Splash 30% OFF', 'updateOffer updates title');
    assert(updatedOffer.discountValue === 30, 'updateOffer updates discountValue');

    // Status Toggle
    const deactivated = await setOfferStatus(cafeOwnerCtx, newOffer.id, 'INACTIVE');
    assert(deactivated.status === 'INACTIVE', 'setOfferStatus deactivates offer');
    const reactivated = await setOfferStatus(cafeOwnerCtx, newOffer.id, 'ACTIVE');
    assert(reactivated.status === 'ACTIVE', 'setOfferStatus reactivates offer');

    // RBAC: Cashier without OFFERS_MANAGE cannot create offer
    let cashierForbidden = false;
    try {
      await createOffer(cafeCashierCtx, { title: 'Unauthorized Offer' });
    } catch (err: any) {
      if (err.name === 'PermissionDeniedError' || err.code === 'PERMISSION_DENIED') {
        cashierForbidden = true;
      }
    }
    assert(cashierForbidden, 'RBAC: Staff without OFFERS_MANAGE cannot create offers');

    // -------------------------------------------------------------------------
    // 4. Branch Targeting Validation
    // -------------------------------------------------------------------------
    console.log('\n--- Branch Targeting & Validation Tests ---');
    const branchRestrictedOffer = await createOffer(cafeOwnerCtx, {
      title: 'Branch Exclusive Flat ₹50',
      type: 'FIXED_DISCOUNT',
      discountValue: 5000,
      startDate: new Date(),
      eligibilityConfig: {
        branchId: branch.id,
      },
    });

    // Validate at correct branch
    const validBranchCheck = await validateOfferForCustomer(cafeOwnerCtx, {
      offerId: branchRestrictedOffer.id,
      customerId: customer.id,
      branchId: branch.id,
    });
    assert(validBranchCheck.isValid === true, 'validateOfferForCustomer passes with matching branch');

    // Validate at wrong branch
    const invalidBranchCheck = await validateOfferForCustomer(cafeOwnerCtx, {
      offerId: branchRestrictedOffer.id,
      customerId: customer.id,
      branchId: 'non-existent-branch-id',
    });
    assert(invalidBranchCheck.isValid === false, 'validateOfferForCustomer blocks non-matching branch');

    // -------------------------------------------------------------------------
    // 5. Target Audience & Eligibility Validation
    // -------------------------------------------------------------------------
    console.log('\n--- Target Audience Tests ---');
    const newCustomerOnlyOffer = await createOffer(cafeOwnerCtx, {
      title: 'First-Timers Only 50% OFF',
      type: 'PERCENTAGE_DISCOUNT',
      discountValue: 50,
      startDate: new Date(),
      eligibilityConfig: {
        targetAudience: 'NEW_CUSTOMERS',
      },
    });

    // Make sure customer has totalVisits > 1
    await prisma.customer.update({
      where: { id: customer.id },
      data: { totalVisits: 5 },
    });

    const audienceCheck = await validateOfferForCustomer(cafeOwnerCtx, {
      offerId: newCustomerOnlyOffer.id,
      customerId: customer.id,
    });
    assert(audienceCheck.isValid === false, 'validateOfferForCustomer rejects non-new customer for NEW_CUSTOMERS offer');

    // -------------------------------------------------------------------------
    // 6. Redemption Engine & Limits
    // -------------------------------------------------------------------------
    console.log('\n--- Redemption Engine & Limits Tests ---');
    const singleUseOffer = await createOffer(cafeOwnerCtx, {
      title: 'Single-Use Special ₹100 OFF',
      type: 'FIXED_DISCOUNT',
      discountValue: 10000,
      startDate: new Date(),
      usageLimitPerCustomer: 1,
      usageLimitTotal: 10,
    });

    // First redemption succeeds
    const idempotencyKey = `test-idem-${Date.now()}`;
    const redemption1 = await redeemOffer(cafeCashierCtx, {
      offerId: singleUseOffer.id,
      customerId: customer.id,
      idempotencyKey,
    });

    assert(!!redemption1.id, 'redeemOffer successfully executes redemption 1');
    assert(redemption1.status === 'REDEEMED', 'Redemption status is REDEEMED');
    assert(!!redemption1.redemptionCode, 'Redemption has single-use code', redemption1.redemptionCode);

    // Verify Idempotency replay returns exact record without re-incrementing
    const redemptionReplay = await redeemOffer(cafeCashierCtx, {
      offerId: singleUseOffer.id,
      customerId: customer.id,
      idempotencyKey,
    });
    assert(redemptionReplay.id === redemption1.id, 'Idempotent replay returns identical redemption record');
    assert(redemptionReplay.redemptionCode === redemption1.redemptionCode, 'Idempotent replay preserves redemption code');

    // Second redemption attempt with different key must fail customer limit
    let customerLimitBlocked = false;
    try {
      await redeemOffer(cafeCashierCtx, {
        offerId: singleUseOffer.id,
        customerId: customer.id,
        idempotencyKey: `test-second-${Date.now()}`,
      });
    } catch (err: any) {
      if (err.code === 'OFFER_CUSTOMER_LIMIT_REACHED') {
        customerLimitBlocked = true;
      }
    }
    assert(customerLimitBlocked, 'Double-redemption blocked: customer usage limit enforced');

    // Verify CustomerEvent was emitted
    const event = await prisma.customerEvent.findFirst({
      where: {
        businessId: cafe.id,
        customerId: customer.id,
        type: 'OFFER_REDEEMED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(!!event, 'CustomerEvent OFFER_REDEEMED recorded in timeline');

    // Verify AuditLog was created
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        businessId: cafe.id,
        action: 'OFFER_REDEEMED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(!!auditLog, 'AuditLog OFFER_REDEEMED recorded for compliance');

    // -------------------------------------------------------------------------
    // 7. Tenant Isolation / IDOR Protection
    // -------------------------------------------------------------------------
    console.log('\n--- Tenant Isolation / IDOR Tests ---');
    let crossTenantBlocked = false;
    try {
      await getOfferById(salonOwnerCtx, singleUseOffer.id);
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        crossTenantBlocked = true;
      }
    }
    assert(crossTenantBlocked, 'Tenant B cannot view Tenant A offer (NOT_FOUND cross-tenant isolation)');

    let crossTenantRedeemBlocked = false;
    try {
      await redeemOffer(salonOwnerCtx, {
        offerId: singleUseOffer.id,
        customerId: customer.id,
      });
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        crossTenantRedeemBlocked = true;
      }
    }
    assert(crossTenantRedeemBlocked, 'Tenant B cannot redeem Tenant A offer for Tenant A customer');

    // -------------------------------------------------------------------------
    // 8. Redemptions Ledger
    // -------------------------------------------------------------------------
    console.log('\n--- Redemptions Ledger Tests ---');
    const ledger = await getBusinessOfferRedemptions(cafeOwnerCtx, {
      offerId: singleUseOffer.id,
    });
    assert(ledger.total >= 1, 'getBusinessOfferRedemptions retrieves total count >= 1');
    assert(ledger.redemptions[0].offerTitle === singleUseOffer.title, 'Ledger item contains offer title');
    assert(ledger.redemptions[0].customerName === customer.name, 'Ledger item contains customer name');

    // -------------------------------------------------------------------------
    // 9. Customer PWA Eligible Offers API
    // -------------------------------------------------------------------------
    console.log('\n--- Customer PWA Experience Tests ---');
    const session = await createCustomerSession(customer.id, cafe.id);
    const customerOffers = await getCustomerEligibleOffers(session);
    assert(Array.isArray(customerOffers), 'getCustomerEligibleOffers returns array of offers');
    assert(customerOffers.length > 0, 'Customer has access to active promotions');

    const customerSingleUse = customerOffers.find((o) => o.id === singleUseOffer.id);
    assert(!!customerSingleUse, 'Customer sees single-use offer in catalog');
    assert(customerSingleUse?.isEligible === false, 'Customer sees usage limit reached for redeemed single-use offer');
    assert(customerSingleUse?.ineligibilityReason === 'Usage limit reached', 'Ineligibility reason correctly stated');

    // -------------------------------------------------------------------------
    // 10. HTTP REST API Tests
    // -------------------------------------------------------------------------
    console.log('\n--- HTTP REST API Integration Tests ---');
    // Login as Cafe Owner
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cafeOwner.email,
        password: 'OwnerPass123!',
      }),
    });
    assert(loginRes.status === 200, 'POST /api/auth/login returns 200 OK');
    const authCookie = loginRes.cookie || '';

    // GET /api/business/offers
    const apiOffersRes = await request('/api/business/offers', {
      headers: { Cookie: authCookie },
    });
    assert(apiOffersRes.status === 200, 'GET /api/business/offers returns 200 OK');
    assert(Array.isArray(apiOffersRes.data), 'GET /api/business/offers returns array');

    // Customer PWA: GET /api/customer/offers with customer session cookie
    const custSessionCookie = `reployty_customer_session=${session.sessionToken}`;
    const apiCustOffersRes = await request('/api/customer/offers', {
      headers: { Cookie: custSessionCookie },
    });
    assert(apiCustOffersRes.status === 200, 'GET /api/customer/offers returns 200 OK');
    assert(Array.isArray(apiCustOffersRes.data), 'Customer receives active promotions list');

    // Clean up created test offer
    await deleteOffer(cafeOwnerCtx, newOffer.id);
    assert(true, 'Cleanup: Deleted temporary test offer');
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

runOffersTestSuite()
  .catch((err) => {
    console.error('Fatal test error', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
