import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import {
  resolveDateRange,
  computeMetricComparison,
  getAnalyticsOverview,
  getCustomerAnalytics,
  getRetentionAnalytics,
  getLoyaltyAnalytics,
  getRewardsAnalytics,
  getOffersAnalytics,
  getReviewAnalytics,
  getBranchAnalytics,
  exportAnalyticsCsv,
  AnalyticsOperationError,
} from '../../src/server/services/analyticsService';

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

async function runAnalyticsTestSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 14: ANALYTICS & BUSINESS INTELLIGENCE TEST SUITE');
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

    const cafeBranch = cafe!.branches[0];
    assert(!!cafeBranch, 'Setup: Found Cafe primary branch');

    const cafeOwnerCtx = await getTenantContext(cafeOwner!.id, cafe!.id);
    const cafeCashierCtx = await getTenantContext(cafeCashier!.id, cafe!.id);

    // -------------------------------------------------------------------------
    // 2. Date Range Resolution & Metric Comparisons
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Date Range Resolution & Metric Comparisons ---');

    // 2.1 Presets resolution
    const range30d = resolveDateRange('30d');
    assert(range30d.compareEnabled === true, '30d preset enables comparison');
    const curDuration = new Date(range30d.current.end).getTime() - new Date(range30d.current.start).getTime();
    const prevDuration = new Date(range30d.previous.end).getTime() - new Date(range30d.previous.start).getTime();
    assert(
      Math.abs(curDuration - prevDuration) < 1000,
      '30d previous period has equivalent duration to current period'
    );

    const rangeToday = resolveDateRange('today');
    assert(rangeToday.current.label === 'Today', 'today preset returns correct label');

    const rangeCustom = resolveDateRange(
      'custom',
      '2026-01-01T00:00:00.000Z',
      '2026-01-10T23:59:59.999Z'
    );
    assert(rangeCustom.current.label !== undefined, 'custom preset resolves custom label');
    const customCurDuration = new Date(rangeCustom.current.end).getTime() - new Date(rangeCustom.current.start).getTime();
    const customPrevDuration = new Date(rangeCustom.previous.end).getTime() - new Date(rangeCustom.previous.start).getTime();
    assert(
      Math.abs(customCurDuration - customPrevDuration) < 1000,
      'custom preset previous period has equivalent duration'
    );

    // 2.2 Metric comparison calculations (safe edge cases)
    const normalPositive = computeMetricComparison(120, 100);
    assert(normalPositive.delta === 20, 'Normal positive delta computed correctly');
    assert(normalPositive.percentChange === 20, 'Normal positive percentChange computed (+20%)');

    const normalNegative = computeMetricComparison(80, 100);
    assert(normalNegative.delta === -20, 'Normal negative delta computed correctly');
    assert(normalNegative.percentChange === -20, 'Normal negative percentChange computed (-20%)');

    const zeroBaseline = computeMetricComparison(50, 0);
    assert(zeroBaseline.delta === 50, 'Zero baseline delta computed correctly');
    assert(zeroBaseline.percentChange === 100, 'Zero baseline percentChange handles division by zero safely (+100%)');

    const zeroBoth = computeMetricComparison(0, 0);
    assert(zeroBoth.delta === 0, 'Zero both delta === 0');
    assert(zeroBoth.percentChange === 0, 'Zero both percentChange === 0%');

    // -------------------------------------------------------------------------
    // 3. Customer & Retention Analytics
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Customer & Retention Analytics ---');

    const customerStats = await getCustomerAnalytics(cafeOwnerCtx, { preset: '30d' });
    assert(typeof customerStats.totalCustomers === 'number', 'getCustomerAnalytics returns totalCustomers');
    assert(customerStats.statusDistribution !== undefined, 'Customer analytics includes statusDistribution');
    assert(typeof customerStats.statusDistribution.active === 'number', 'Status distribution has active count');
    assert(Array.isArray(customerStats.growthTrend), 'Customer analytics includes growthTrend array');
    assert(customerStats.acquisitionMix !== undefined, 'Customer analytics includes acquisitionMix');

    const retentionStats = await getRetentionAnalytics(cafeOwnerCtx, { preset: '30d' });
    assert(typeof retentionStats.returningCustomerRate === 'number', 'Returning customer rate is numeric');
    assert(typeof retentionStats.repeatVisitRate === 'number', 'Repeat visit rate is numeric');
    assert(
      retentionStats.returningCustomerRate >= 0 && retentionStats.returningCustomerRate <= 100,
      'Returning customer rate is bounded 0–100%'
    );
    assert(
      retentionStats.repeatVisitRate >= 0 && retentionStats.repeatVisitRate <= 100,
      'Repeat visit rate is bounded 0–100%'
    );
    assert(typeof retentionStats.reactivatedCustomers === 'number', 'Reactivated customers count is numeric');
    assert(!!retentionStats.definitions.returningCustomerRate, 'Retention returns explicit formula definitions');

    // -------------------------------------------------------------------------
    // 4. Loyalty & Rewards Analytics
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Loyalty & Rewards Analytics ---');

    const loyaltyStats = await getLoyaltyAnalytics(cafeOwnerCtx, { preset: '30d' });
    assert(typeof loyaltyStats.activeMembers === 'number', 'Loyalty analytics returns activeMembers');
    assert(typeof loyaltyStats.stampsIssued === 'number', 'Loyalty analytics returns stampsIssued');
    assert(typeof loyaltyStats.pointsIssued === 'number', 'Loyalty analytics returns pointsIssued');
    assert(Array.isArray(loyaltyStats.trends.stampsOverTime), 'Loyalty analytics includes stampsOverTime trend');

    const rewardsStats = await getRewardsAnalytics(cafeOwnerCtx, { preset: '30d' });
    assert(typeof rewardsStats.totalClaimed === 'number', 'Rewards analytics returns totalClaimed');
    assert(typeof rewardsStats.totalRedeemed === 'number', 'Rewards analytics returns totalRedeemed');
    assert(typeof rewardsStats.overallRedemptionRate === 'number', 'Rewards analytics returns overallRedemptionRate');
    assert(Array.isArray(rewardsStats.topRewards), 'Rewards analytics returns topRewards array');

    // -------------------------------------------------------------------------
    // 5. Offers & Reviews Analytics
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Offers & Reviews Analytics ---');

    const offersStats = await getOffersAnalytics(cafeOwnerCtx, { preset: '30d' });
    assert(typeof offersStats.activeOffersCount === 'number', 'Offers analytics returns activeOffersCount');
    assert(typeof offersStats.totalRedemptions === 'number', 'Offers analytics returns totalRedemptions');
    assert(Array.isArray(offersStats.topOffers), 'Offers analytics returns topOffers array');
    assert(Array.isArray(offersStats.redemptionsOverTime), 'Offers analytics returns redemptionsOverTime');

    const reviewStats = await getReviewAnalytics(cafeOwnerCtx, { preset: '30d' });
    assert(typeof reviewStats.averageRating === 'number', 'Review analytics returns averageRating');
    assert(typeof reviewStats.totalReviews === 'number', 'Review analytics returns totalReviews');
    assert(reviewStats.ratingDistribution[5] !== undefined, 'Review analytics returns 5-star distribution');
    assert(reviewStats.sentimentCounts.positive !== undefined, 'Review analytics returns sentimentCounts');
    assert(typeof reviewStats.googleTargetCount === 'number', 'Review analytics returns googleTargetCount');
    assert(typeof reviewStats.aiResponseCoverage === 'number', 'Review analytics returns aiResponseCoverage');

    // -------------------------------------------------------------------------
    // 6. Multi-Branch Performance & Tenant Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Multi-Branch Performance & Tenant Isolation ---');

    const branchStats = await getBranchAnalytics(cafeOwnerCtx, { preset: '30d' });
    assert(Array.isArray(branchStats.branches), 'getBranchAnalytics returns branches array');
    assert(branchStats.branches.length > 0, 'Found branch performance data for Cafe');
    const firstBranch = branchStats.branches[0];
    assert(firstBranch.branchId === cafeBranch.id, 'First branch matches Cafe primary branch');
    assert(typeof firstBranch.customerCount === 'number', 'Branch includes customerCount');
    assert(typeof firstBranch.visitCount === 'number', 'Branch includes visitCount');

    // Branch filtered query: only this branch
    const branchFilteredOverview = await getAnalyticsOverview(cafeOwnerCtx, {
      preset: '30d',
      branchId: cafeBranch.id,
    });
    assert(branchFilteredOverview.metrics.totalCustomers !== undefined, 'Filtered overview returned for branch');

    // Tenant Isolation check: Tenant B context
    const bakeryOwner = await prisma.user.findUnique({
      where: { email: 'chloe.baker@reployty.com' },
    });
    const bakeryOwnerCtx = await getTenantContext(bakeryOwner!.id, bakery!.id);
    const bakeryOverview = await getAnalyticsOverview(bakeryOwnerCtx, { preset: '30d' });
    assert(
      bakeryOverview.metrics.totalCustomers.current !== undefined,
      'Tenant B overview query executes isolated'
    );
    const bakeryBranches = await getBranchAnalytics(bakeryOwnerCtx, { preset: '30d' });
    const bakeryBranchIds = bakeryBranches.branches.map((b) => b.branchId);
    assert(
      !bakeryBranchIds.includes(cafeBranch.id),
      'Tenant Isolation: Tenant B branch analytics does not include Tenant A branches'
    );

    // -------------------------------------------------------------------------
    // 7. Role-Based Access Control (RBAC)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Role-Based Access Control (RBAC) ---');

    // Cashier user does NOT have ANALYTICS_VIEW
    let cashierBlocked = false;
    try {
      await getAnalyticsOverview(cafeCashierCtx, { preset: '30d' });
    } catch (err: any) {
      if (err instanceof AnalyticsOperationError && err.statusCode === 403) {
        cashierBlocked = true;
      }
    }
    assert(cashierBlocked, 'RBAC: Staff member without ANALYTICS_VIEW is rejected with 403 Forbidden');

    // -------------------------------------------------------------------------
    // 8. CSV Export Engine
    // -------------------------------------------------------------------------
    console.log('\n--- 8. CSV Export Engine ---');

    const overviewCsv = await exportAnalyticsCsv(cafeOwnerCtx, { preset: '30d' }, 'overview');
    assert(typeof overviewCsv === 'string', 'exportAnalyticsCsv returns string');
    assert(overviewCsv.includes('Metric,Current Period,Previous Period,Delta,Percentage Change'), 'Overview CSV has headers');
    assert(overviewCsv.includes('Total Customers'), 'Overview CSV has Total Customers row');

    const customersCsv = await exportAnalyticsCsv(cafeOwnerCtx, { preset: '30d' }, 'customers');
    assert(customersCsv.includes('Customer Name,Phone,Status,Total Visits,Stamps Balance'), 'Customers CSV has correct headers');

    const loyaltyCsv = await exportAnalyticsCsv(cafeOwnerCtx, { preset: '30d' }, 'loyalty');
    assert(loyaltyCsv.includes('Transaction ID,Customer,Type,Stamps,Points,Timestamp'), 'Loyalty CSV has headers');

    const reviewsCsv = await exportAnalyticsCsv(cafeOwnerCtx, { preset: '30d' }, 'reviews');
    assert(reviewsCsv.includes('Review ID,Customer,Rating,Sentiment,Target'), 'Reviews CSV has headers');

    // -------------------------------------------------------------------------
    // 9. HTTP REST API Integration Endpoints
    // -------------------------------------------------------------------------
    console.log('\n--- 9. HTTP REST API Integration Endpoints ---');

    // Login as Cafe Owner
    const ownerLoginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'marcus@reployty.com',
        password: 'OwnerPass123!',
      }),
    });
    assert(ownerLoginRes.status === 200, 'POST /api/auth/login successful for Owner');
    const ownerToken = ownerLoginRes.data.sessionToken;
    const ownerCookie = ownerLoginRes.cookie || `reployty_session=${ownerToken}`;

    const ownerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
      Cookie: ownerCookie,
    };

    // GET /api/business/analytics/overview
    const apiOverview = await request('/api/business/analytics/overview?preset=30d', { headers: ownerHeaders });
    assert(apiOverview.status === 200, 'GET /api/business/analytics/overview returns 200 OK');
    assert(apiOverview.data.metrics.totalCustomers !== undefined, 'HTTP API returns totalCustomers comparison');

    // GET /api/business/analytics/customers
    const apiCustomers = await request('/api/business/analytics/customers?preset=30d', { headers: ownerHeaders });
    assert(apiCustomers.status === 200, 'GET /api/business/analytics/customers returns 200 OK');
    assert(apiCustomers.data.statusDistribution !== undefined, 'HTTP API returns statusDistribution');

    // GET /api/business/analytics/retention
    const apiRetention = await request('/api/business/analytics/retention?preset=30d', { headers: ownerHeaders });
    assert(apiRetention.status === 200, 'GET /api/business/analytics/retention returns 200 OK');
    assert(typeof apiRetention.data.returningCustomerRate === 'number', 'HTTP API returns returningCustomerRate');

    // GET /api/business/analytics/loyalty
    const apiLoyalty = await request('/api/business/analytics/loyalty?preset=30d', { headers: ownerHeaders });
    assert(apiLoyalty.status === 200, 'GET /api/business/analytics/loyalty returns 200 OK');
    assert(typeof apiLoyalty.data.activeMembers === 'number', 'HTTP API returns activeMembers');

    // GET /api/business/analytics/rewards
    const apiRewards = await request('/api/business/analytics/rewards?preset=30d', { headers: ownerHeaders });
    assert(apiRewards.status === 200, 'GET /api/business/analytics/rewards returns 200 OK');
    assert(Array.isArray(apiRewards.data.topRewards), 'HTTP API returns topRewards');

    // GET /api/business/analytics/offers
    const apiOffers = await request('/api/business/analytics/offers?preset=30d', { headers: ownerHeaders });
    assert(apiOffers.status === 200, 'GET /api/business/analytics/offers returns 200 OK');
    assert(typeof apiOffers.data.activeOffersCount === 'number', 'HTTP API returns activeOffersCount');

    // GET /api/business/analytics/reviews
    const apiReviews = await request('/api/business/analytics/reviews?preset=30d', { headers: ownerHeaders });
    assert(apiReviews.status === 200, 'GET /api/business/analytics/reviews returns 200 OK');
    assert(typeof apiReviews.data.averageRating === 'number', 'HTTP API returns averageRating');

    // GET /api/business/analytics/branches
    const apiBranches = await request('/api/business/analytics/branches?preset=30d', { headers: ownerHeaders });
    assert(apiBranches.status === 200, 'GET /api/business/analytics/branches returns 200 OK');
    assert(Array.isArray(apiBranches.data.branches), 'HTTP API returns branches array');

    // GET /api/business/analytics/export
    const apiExport = await request('/api/business/analytics/export?preset=30d&type=overview', { headers: ownerHeaders });
    assert(apiExport.status === 200, 'GET /api/business/analytics/export returns 200 OK');
    assert(apiExport.headers.get('content-type')?.includes('text/csv') === true, 'Export headers include text/csv');
    assert(typeof apiExport.data === 'string' && apiExport.data.includes('Metric,'), 'Export payload is CSV text');

    // RBAC over HTTP: Login as Cashier and attempt access
    const cashierLoginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sarah.cashier@reployty.com',
        password: 'StaffPass123!',
      }),
    });
    assert(cashierLoginRes.status === 200, 'POST /api/auth/login successful for Cashier');
    const cashierToken = cashierLoginRes.data.sessionToken;
    const cashierCookie = cashierLoginRes.cookie || `reployty_session=${cashierToken}`;

    const cashierHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cashierToken}`,
      Cookie: cashierCookie,
    };

    const apiCashierOverview = await request('/api/business/analytics/overview', { headers: cashierHeaders });
    assert(
      apiCashierOverview.status === 403,
      'HTTP API RBAC: Cashier without ANALYTICS_VIEW receives 403 Forbidden'
    );
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

runAnalyticsTestSuite()
  .catch((err) => {
    console.error('Fatal test error', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
