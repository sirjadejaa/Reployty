import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import {
  submitCustomerReview,
  getCustomerReviewState,
  getBusinessReviews,
  getBusinessReviewMetrics,
  getReviewDetails,
  generateReviewResponseDrafts,
  updateReviewGeneration,
  ReviewOperationError,
} from '../../src/server/services/reviewService';
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

async function runReviewsTestSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 13: REVIEWS & REPUTATION ENGINE TEST SUITE');
  console.log('==================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. Setup Context: Retrieve seeded businesses and users
    // -------------------------------------------------------------------------
    const cafe = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
      include: { branches: true },
    });
    assert(!!cafe, 'Setup: Found Roasted Bean Cafe (Tenant A)');

    const bakery = await prisma.business.findUnique({
      where: { slug: 'new-wave-bakery' },
      include: { branches: true },
    });
    assert(!!bakery, 'Setup: Found New Wave Bakery (Tenant B)');

    const cafeOwner = await prisma.user.findUnique({
      where: { email: 'marcus@reployty.com' },
    });
    assert(!!cafeOwner, 'Setup: Found Cafe Business Owner');

    const cafeCashier = await prisma.user.findUnique({
      where: { email: 'sarah.cashier@reployty.com' },
    });
    assert(!!cafeCashier, 'Setup: Found Cafe Staff Cashier');

    const bakeryOwner = await prisma.user.findUnique({
      where: { email: 'chloe.baker@reployty.com' },
    });
    assert(!!bakeryOwner, 'Setup: Found Bakery Business Owner (Tenant B)');

    const cafeBranch = cafe!.branches[0];
    assert(!!cafeBranch, 'Setup: Found Cafe primary branch');

    // Ensure Cafe has Google Review URL configured for testing
    await prisma.business.update({
      where: { id: cafe!.id },
      data: { googleReviewUrl: 'https://g.page/r/roasted-bean-cafe/review' },
    });

    const cafeOwnerCtx = await getTenantContext(cafeOwner!.id, cafe!.id);
    const cafeCashierCtx = await getTenantContext(cafeCashier!.id, cafe!.id);
    const bakeryOwnerCtx = await getTenantContext(bakeryOwner!.id, bakery!.id);

    // Initialize dedicated test customer
    const testPhone = '+15554443322';
    let customer = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId: cafe!.id, phone: testPhone } },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          businessId: cafe!.id,
          phone: testPhone,
          name: 'Review Test Customer',
        },
      });
    }

    const customerSession = await createCustomerSession(customer.id, cafe!.id);
    assert(!!customerSession.sessionToken, 'Setup: Created active customer session');

    // Clean up any existing test reviews for clean slate
    await prisma.reviewGeneration.deleteMany({ where: { businessId: cafe!.id } });
    await prisma.reviewFeedback.deleteMany({ where: { businessId: cafe!.id } });

    // -------------------------------------------------------------------------
    // 2. Customer Review Submission & Branching Logic (Phase 13 Flow)
    // -------------------------------------------------------------------------
    console.log('\n--- Customer Review Submission & Branching Tests ---');

    // Validation: Invalid rating rejected
    let validationRejected = false;
    try {
      await submitCustomerReview(customerSession, { rating: 6 });
    } catch (e: any) {
      validationRejected = true;
    }
    assert(validationRejected, 'Rejects invalid rating > 5');

    // 2.1 POSITIVE FLOW: 5-Star Rating -> Google Review Target
    const positiveResult = await submitCustomerReview(customerSession, {
      rating: 5,
      feedbackText: 'Best cold brew and caramel croissant in downtown!',
      branchId: cafeBranch.id,
    });

    assert(positiveResult.sentiment === 'POSITIVE', '5-star rating computes POSITIVE sentiment');
    assert(positiveResult.isPublicGoogleReviewTarget === true, '5-star rating targeted for Google Review CTA');
    assert(
      positiveResult.googleReviewUrl === 'https://g.page/r/roasted-bean-cafe/review',
      'Returns business Google Review URL'
    );
    assert(positiveResult.review.rating === 5, 'Review feedback rating persisted as 5');
    assert(positiveResult.review.branchName === cafeBranch.name, 'Branch name resolved correctly');

    // Verify CustomerEvent recorded in timeline
    const posEvent = await prisma.customerEvent.findFirst({
      where: { customerId: customer.id, businessId: cafe!.id, type: 'REVIEW_GENERATED' },
    });
    assert(!!posEvent, 'CustomerEvent REVIEW_GENERATED recorded for positive review');

    // 2.2 NEUTRAL FLOW: 3-Star Rating -> Private CRM Feedback
    const neutralCustomerPhone = '+15554443323';
    let neutralCustomer = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId: cafe!.id, phone: neutralCustomerPhone } },
    });
    if (!neutralCustomer) {
      neutralCustomer = await prisma.customer.create({
        data: {
          businessId: cafe!.id,
          phone: neutralCustomerPhone,
          name: 'Neutral Regular',
        },
      });
    }
    const neutralSession = await createCustomerSession(neutralCustomer.id, cafe!.id);

    const neutralResult = await submitCustomerReview(neutralSession, {
      rating: 3,
      feedbackText: 'Coffee was good, but had to wait 15 minutes for the sandwich.',
      category: 'Wait Time',
    });

    assert(neutralResult.sentiment === 'NEUTRAL', '3-star rating computes NEUTRAL sentiment');
    assert(neutralResult.isPublicGoogleReviewTarget === false, '3-star rating kept private (not Google target)');

    // 2.3 NEGATIVE FLOW: 2-Star Rating -> Private CRM Feedback
    const criticalCustomerPhone = '+15554443324';
    let criticalCustomer = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId: cafe!.id, phone: criticalCustomerPhone } },
    });
    if (!criticalCustomer) {
      criticalCustomer = await prisma.customer.create({
        data: {
          businessId: cafe!.id,
          phone: criticalCustomerPhone,
          name: 'Critical Reviewer',
        },
      });
    }
    const criticalSession = await createCustomerSession(criticalCustomer.id, cafe!.id);

    const negativeResult = await submitCustomerReview(criticalSession, {
      rating: 2,
      feedbackText: 'Cold pastry and staff was distracted at the counter.',
      category: 'Service Quality',
    });

    assert(negativeResult.sentiment === 'NEGATIVE', '2-star rating computes NEGATIVE sentiment');
    assert(negativeResult.isPublicGoogleReviewTarget === false, '2-star rating directed to private CRM');

    const negEvent = await prisma.customerEvent.findFirst({
      where: { customerId: criticalCustomer.id, businessId: cafe!.id, type: 'REVIEW_REQUESTED' },
    });
    assert(!!negEvent, 'CustomerEvent REVIEW_REQUESTED recorded for private feedback');

    // -------------------------------------------------------------------------
    // 3. Customer Review State Query
    // -------------------------------------------------------------------------
    console.log('\n--- Customer Review State Tests ---');

    const customerReviewState = await getCustomerReviewState(customerSession);
    assert(customerReviewState.hasReviewed === true, 'getCustomerReviewState reports hasReviewed = true');
    assert(customerReviewState.latestReview?.rating === 5, 'Customer review state returns latest 5-star rating');
    assert(customerReviewState.businessName === cafe!.name, 'Customer review state returns business name');
    assert(
      customerReviewState.googleReviewUrl === 'https://g.page/r/roasted-bean-cafe/review',
      'Customer review state provides Google review link'
    );

    // -------------------------------------------------------------------------
    // 4. Tenant Isolation / IDOR Tests
    // -------------------------------------------------------------------------
    console.log('\n--- Multi-Tenant Security & IDOR Tests ---');

    // Tenant B (Bakery) queries reviews — should NOT see Cafe's reviews
    const bakeryReviews = await getBusinessReviews(bakeryOwnerCtx);
    assert(bakeryReviews.reviews.length === 0, 'Tenant B cannot see Tenant A reviews (tenant isolation)');

    // Tenant B attempts to access Tenant A review details directly by ID -> 404
    let idorBlocked = false;
    try {
      await getReviewDetails(bakeryOwnerCtx, positiveResult.review.id);
    } catch (e: any) {
      if (e instanceof ReviewOperationError && e.statusCode === 404) {
        idorBlocked = true;
      }
    }
    assert(idorBlocked, 'Tenant B blocked from viewing Tenant A review details (IDOR 404)');

    // Tenant B attempts to generate AI draft for Tenant A review -> 404
    let draftIdorBlocked = false;
    try {
      await generateReviewResponseDrafts(bakeryOwnerCtx, positiveResult.review.id);
    } catch (e: any) {
      if (e instanceof ReviewOperationError && e.statusCode === 404) {
        draftIdorBlocked = true;
      }
    }
    assert(draftIdorBlocked, 'Tenant B blocked from generating AI response for Tenant A review (IDOR 404)');

    // -------------------------------------------------------------------------
    // 5. RBAC Permissions Tests
    // -------------------------------------------------------------------------
    console.log('\n--- RBAC Authorization Tests ---');

    // Cashier has LOYALTY_MANAGE, REWARDS_REDEEM, OFFERS_REDEEM, but NOT REVIEWS_MANAGE
    let cashierDraftBlocked = false;
    try {
      await generateReviewResponseDrafts(cafeCashierCtx, positiveResult.review.id);
    } catch (e: any) {
      if (e instanceof ReviewOperationError && e.statusCode === 403) {
        cashierDraftBlocked = true;
      }
    }
    assert(cashierDraftBlocked, 'Staff without REVIEWS_MANAGE cannot generate AI response drafts (403)');

    // -------------------------------------------------------------------------
    // 6. AI Review Assistant Draft Generator Tests
    // -------------------------------------------------------------------------
    console.log('\n--- AI Review Assistant Draft Generator Tests ---');

    // 6.1 Owner generates response drafts for the positive review
    const posDraft = await generateReviewResponseDrafts(cafeOwnerCtx, positiveResult.review.id);
    assert(!!posDraft.id, 'generateReviewResponseDrafts creates ReviewGeneration record');
    assert(posDraft.status === 'DRAFT', 'Generation status starts as DRAFT');
    assert(posDraft.generatedEnglish.includes(cafe!.name), 'English draft includes business name');
    assert(posDraft.generatedEnglish.includes('5-star'), 'English draft references 5-star rating');
    assert(posDraft.generatedHinglish.includes('ji'), 'Hinglish draft uses respectful local tone (ji)');
    assert(posDraft.generatedHindi.includes('धन्यवाद'), 'Hindi draft contains formal Devanagari praise');

    // AuditLog recorded for generation
    const genAuditLog = await prisma.auditLog.findFirst({
      where: {
        businessId: cafe!.id,
        action: 'REVIEW_RESPONSE_GENERATED',
        entityId: posDraft.id,
      },
    });
    assert(!!genAuditLog, 'AuditLog REVIEW_RESPONSE_GENERATED recorded with owner actor');

    // 6.2 Owner generates response drafts for the negative review
    const negDraft = await generateReviewResponseDrafts(cafeOwnerCtx, negativeResult.review.id);
    assert(negDraft.generatedEnglish.toLowerCase().includes('apologize'), 'Negative English draft includes sincere apology');
    assert(negDraft.generatedHinglish.includes('sharminda') || negDraft.generatedHinglish.includes('sudhaar'), 'Hinglish draft is humble and restorative');
    assert(negDraft.generatedHindi.includes('खेद'), 'Hindi draft expresses sincere formal regret');

    // 6.3 Staff edits and approves draft
    const updatedDraft = await updateReviewGeneration(cafeOwnerCtx, posDraft.id, {
      selectedVersion: 'HINGLISH',
      editedText: 'Namaste Review Test Customer ji! Dil se shukriya. Agli baar croissant hamari taraf se!',
      status: 'SELECTED',
    });

    assert(updatedDraft.selectedVersion === 'HINGLISH', 'Draft selectedVersion updated to HINGLISH');
    assert(updatedDraft.status === 'SELECTED', 'Draft status transitioned to SELECTED');
    assert(updatedDraft.editedText?.includes('croissant'), 'Staff customized text saved properly');

    // 6.4 Staff copies to clipboard / marks copied to Google
    const copiedDraft = await updateReviewGeneration(cafeOwnerCtx, posDraft.id, {
      status: 'COPIED_TO_GOOGLE',
    });

    assert(copiedDraft.status === 'COPIED_TO_GOOGLE', 'Draft status transitioned to COPIED_TO_GOOGLE');

    const copyAuditLog = await prisma.auditLog.findFirst({
      where: {
        businessId: cafe!.id,
        action: 'REVIEW_RESPONSE_COPIED',
        entityId: posDraft.id,
      },
    });
    assert(!!copyAuditLog, 'AuditLog REVIEW_RESPONSE_COPIED recorded');

    // -------------------------------------------------------------------------
    // 7. Business Reviews Dashboard & Metrics Tests
    // -------------------------------------------------------------------------
    console.log('\n--- Business Reviews Dashboard & Metrics Tests ---');

    // 7.1 Metrics aggregation
    const metrics = await getBusinessReviewMetrics(cafeOwnerCtx);
    assert(metrics.totalReviews === 3, 'Metrics totalReviews === 3');
    assert(metrics.googleTargetCount === 1, 'Metrics googleTargetCount === 1 (positive 5-star)');
    assert(metrics.privateFeedbackCount === 2, 'Metrics privateFeedbackCount === 2 (3-star + 2-star)');
    assert(metrics.sentimentCounts.positive === 1, 'Positive sentiment count === 1');
    assert(metrics.sentimentCounts.neutral === 1, 'Neutral sentiment count === 1');
    assert(metrics.sentimentCounts.negative === 1, 'Negative sentiment count === 1');
    // Average rating: (5 + 3 + 2) / 3 = 3.33 -> 3.3
    assert(metrics.averageRating === 3.3, 'Average rating computed accurately (3.3)');
    assert(metrics.responseCount >= 2, 'Response coverage counted accurately');

    // 7.2 Filter queries
    const positiveOnly = await getBusinessReviews(cafeOwnerCtx, { sentiment: 'POSITIVE' });
    assert(positiveOnly.reviews.length === 1, 'Filter sentiment=POSITIVE returns 1 review');
    assert(positiveOnly.reviews[0].rating === 5, 'Filtered positive review has rating 5');

    const privateOnly = await getBusinessReviews(cafeOwnerCtx, { isPublicGoogleReviewTarget: false });
    assert(privateOnly.reviews.length === 2, 'Filter isPublicGoogleReviewTarget=false returns 2 private reviews');

    // -------------------------------------------------------------------------
    // 8. HTTP REST API Integration Tests
    // -------------------------------------------------------------------------
    console.log('\n--- HTTP REST API Integration Tests ---');

    // Login as Cafe Owner
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'marcus@reployty.com',
        password: 'OwnerPass123!',
      }),
    });
    assert(loginRes.status === 200, 'POST /api/auth/login successful for Business Owner');
    const ownerToken = loginRes.data.sessionToken;
    const ownerCookie = loginRes.cookie || `reployty_session=${ownerToken}`;

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
      Cookie: ownerCookie,
    };

    // GET /api/business/reviews/metrics
    const apiMetrics = await request('/api/business/reviews/metrics', { headers: authHeaders });
    assert(apiMetrics.status === 200, 'GET /api/business/reviews/metrics returns 200 OK');
    assert(apiMetrics.data.totalReviews === 3, 'HTTP API returns totalReviews === 3');

    // GET /api/business/reviews
    const apiReviews = await request('/api/business/reviews', { headers: authHeaders });
    assert(apiReviews.status === 200, 'GET /api/business/reviews returns 200 OK');
    assert(Array.isArray(apiReviews.data.reviews), 'HTTP API returns reviews array');

    // GET /api/business/reviews/:id
    const apiReviewDetail = await request(`/api/business/reviews/${positiveResult.review.id}`, {
      headers: authHeaders,
    });
    assert(apiReviewDetail.status === 200, 'GET /api/business/reviews/:id returns 200 OK');
    assert(apiReviewDetail.data.id === positiveResult.review.id, 'HTTP API returns correct review record');

    // Customer PWA API: GET /api/customer/reviews/status
    const custCookie = `reployty_customer_session=${customerSession.sessionToken}`;
    const apiCustStatus = await request('/api/customer/reviews/status', {
      headers: { Cookie: custCookie },
    });
    assert(apiCustStatus.status === 200, 'GET /api/customer/reviews/status returns 200 OK');
    assert(apiCustStatus.data.hasReviewed === true, 'Customer status reports hasReviewed');

    // Customer PWA API: POST /api/customer/reviews
    const apiCustSubmit = await request('/api/customer/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: custCookie,
      },
      body: JSON.stringify({
        rating: 5,
        feedbackText: 'HTTP API submission test: loved the service!',
      }),
    });
    assert(apiCustSubmit.status === 201, 'POST /api/customer/reviews returns 201 Created');
    assert(apiCustSubmit.data.isPublicGoogleReviewTarget === true, 'HTTP API submission targeted to Google');

    // Clean up created reviews
    await prisma.reviewGeneration.deleteMany({ where: { businessId: cafe!.id } });
    await prisma.reviewFeedback.deleteMany({ where: { businessId: cafe!.id } });
    assert(true, 'Cleanup: Deleted temporary test reviews and generations');
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

runReviewsTestSuite()
  .catch((err) => {
    console.error('Fatal test error', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
