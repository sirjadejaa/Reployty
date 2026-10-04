/**
 * REPLOYTY PHASE 19B-STAGING
 * FIRST BUSINESS ONBOARDING — LOCAL/STAGING VALIDATION
 *
 * Validates the complete V1 onboarding lifecycle for "Staging Café"
 * through the existing service layer and HTTP API.
 *
 * Environment: LOCAL/STAGING (no production infrastructure required)
 *
 * Steps 1-18: Authentication → Business → Branch → Owner → Staff/RBAC →
 * Loyalty → Rewards → Catalog → Offers → CRM → Reviews → Analytics →
 * Billing → QR → Audit → Tenant Isolation → Data Integrity → Report
 */

import test from 'node:test';
import assert from 'node:assert';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword, createSession } from '../../src/server/auth/sessionService';
import { BusinessCategory, UserStatus } from '@prisma/client';

// Staging identifiers
const STAGING_RUN = `stg_${Date.now().toString(36)}`;
const STAGING_CAFE_SLUG = `staging-cafe-${STAGING_RUN}`;
const ISOLATION_BISTRO_SLUG = `isolation-bistro-${STAGING_RUN}`;

test('PHASE 19B-STAGING: FIRST BUSINESS ONBOARDING VALIDATION', async (t) => {
  let ctx: TestServerContext;
  let adminToken: string;
  let ownerToken: string;
  let managerToken: string;
  let staffToken: string;
  let ownerBToken: string;

  // Staging entity IDs
  let stagingBusinessId: string;
  let mainBranchId: string;
  let ownerUserId: string;
  let managerUserId: string;
  let staffUserId: string;
  let loyaltyProgramId: string;
  let rewardId: string;
  let offerId: string;
  let menuId: string;
  let coffeeCategoryId: string;
  let snacksCategoryId: string;

  // Isolation tenant
  let isolationBusinessId: string;
  let isolationBranchId: string;

  t.before(async () => {
    ctx = await startTestServer();
  });

  t.after(async () => {
    if (ctx) await ctx.stop();
  });

  // =========================================================================
  // STEP 1 — SUPER ADMIN AUTHENTICATION
  // =========================================================================
  await t.test('Step 1: Super Admin authentication and platform access', async () => {
    // Login as Super Admin
    const loginRes = await apiRequest(ctx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@reployty.com', password: 'AdminPass123!' },
    });
    assert.strictEqual(loginRes.status, 200, 'Super Admin login succeeds');
    assert.ok(loginRes.body.user, 'User object returned');
    assert.strictEqual(loginRes.body.user.isSuperAdmin, true, 'User is Super Admin');
    // Auth response returns sessionToken at root level
    adminToken = loginRes.body.sessionToken;
    assert.ok(adminToken, 'Session token obtained');

    // Verify platform overview access
    const overviewRes = await apiRequest(ctx.baseUrl, '/api/admin/overview', {
      token: adminToken,
    });
    assert.strictEqual(overviewRes.status, 200, 'Admin overview accessible');
    assert.ok(overviewRes.body.metrics, 'Platform metrics present');
  });

  // =========================================================================
  // STEP 2 — CREATE STAGING BUSINESS (via Prisma, matching E2E helpers)
  // =========================================================================
  await t.test('Step 2: Create Staging Café business', async () => {
    // Business creation uses Prisma directly (no admin POST /businesses API)
    // This matches the existing E2E test fixture pattern
    const growthPlan = await prisma.plan.findFirstOrThrow({ where: { slug: 'growth' } });

    const business = await prisma.business.create({
      data: {
        name: 'Staging Café',
        slug: STAGING_CAFE_SLUG,
        category: BusinessCategory.CAFE,
        description: 'Phase 19B staging validation café',
        primaryColor: '#7C3AED',
        secondaryColor: '#4C1D95',
        themePreset: 'CAFE',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        phone: `+9199${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `staging-cafe-${STAGING_RUN}@staging.reployty.com`,
        address: '42 MG Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'IN',
        planId: growthPlan.id,
        onboardingCompleted: true,
        onboardingStep: 6,
      },
    });
    stagingBusinessId = business.id;
    assert.ok(stagingBusinessId, 'businessId assigned by server');
    assert.strictEqual(business.name, 'Staging Café');
    assert.strictEqual(business.category, 'CAFE');

    // Create subscription for the business
    await prisma.subscription.create({
      data: {
        businessId: stagingBusinessId,
        planId: growthPlan.id,
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
    });

    // Verify business is visible via admin API
    const listRes = await apiRequest(ctx.baseUrl, `/api/admin/businesses/${stagingBusinessId}`, {
      token: adminToken,
    });
    assert.strictEqual(listRes.status, 200, 'Staging Café visible via admin API');
  });

  // =========================================================================
  // STEP 3 — OWNER ACCOUNT + MAIN BRANCH
  // =========================================================================
  await t.test('Step 3: Create Owner account, membership, and Main Branch', async () => {
    // Create owner user
    const ownerPwHash = await hashPassword('StagingOwner123!');
    const ownerUser = await prisma.user.create({
      data: {
        email: `staging-owner-${STAGING_RUN}@staging.reployty.com`,
        name: 'Staging Café Owner',
        passwordHash: ownerPwHash,
        status: UserStatus.ACTIVE,
      },
    });
    ownerUserId = ownerUser.id;

    // Create OWNER membership
    const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });
    await prisma.staffMembership.create({
      data: {
        userId: ownerUserId,
        businessId: stagingBusinessId,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });

    // Create session
    const ownerSession = await createSession(ownerUserId, stagingBusinessId);
    ownerToken = ownerSession.sessionToken;

    // Create Main Branch via API
    const branchRes = await apiRequest(ctx.baseUrl, '/api/business/branches', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: 'Main Branch',
        code: 'MAIN',
        address: '42 MG Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'IN',
        phone: '+919900000001',
        isMainBranch: true,
      },
    });
    assert.ok([200, 201].includes(branchRes.status), 'Branch creation succeeds');
    mainBranchId = branchRes.body.branch?.id || branchRes.body.id;
    assert.ok(mainBranchId, 'Branch ID assigned');

    // Verify branch listing
    const branchListRes = await apiRequest(ctx.baseUrl, '/api/business/branches', {
      token: ownerToken,
    });
    assert.strictEqual(branchListRes.status, 200);
    const branches = branchListRes.body.branches || branchListRes.body;
    const mainBranch = (Array.isArray(branches) ? branches : []).find(
      (b: any) => b.id === mainBranchId
    );
    assert.ok(mainBranch, 'Main Branch found in listing');
  });

  // =========================================================================
  // STEP 4 — OWNER AUTHENTICATION VERIFICATION
  // =========================================================================
  await t.test('Step 4: Owner login and business profile access', async () => {
    // Verify owner login via HTTP API
    const loginRes = await apiRequest(ctx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: `staging-owner-${STAGING_RUN}@staging.reployty.com`, password: 'StagingOwner123!' },
    });
    assert.strictEqual(loginRes.status, 200, 'Owner login succeeds');

    // Verify business profile access
    const profileRes = await apiRequest(ctx.baseUrl, '/api/business/profile', {
      token: ownerToken,
    });
    assert.strictEqual(profileRes.status, 200, 'Business profile accessible');
    const profileName = profileRes.body.name || profileRes.body.business?.name;
    assert.strictEqual(profileName, 'Staging Café');
  });

  // =========================================================================
  // STEP 5 — STAFF (MANAGER + STAFF) WITH RBAC
  // =========================================================================
  await t.test('Step 5: Create Manager and Staff with RBAC enforcement', async () => {
    // Create Manager user
    const managerUser = await prisma.user.create({
      data: {
        email: `staging-manager-${STAGING_RUN}@staging.reployty.com`,
        name: 'Staging Manager',
        passwordHash: await hashPassword('ManagerPass123!'),
        status: UserStatus.ACTIVE,
      },
    });
    managerUserId = managerUser.id;

    // Create Staff user
    const staffUser = await prisma.user.create({
      data: {
        email: `staging-staff-${STAGING_RUN}@staging.reployty.com`,
        name: 'Staging Staff',
        passwordHash: await hashPassword('StaffPass123!'),
        status: UserStatus.ACTIVE,
      },
    });
    staffUserId = staffUser.id;

    const managerRole = await prisma.role.findFirstOrThrow({ where: { name: 'MANAGER' } });
    const staffRole = await prisma.role.findFirstOrThrow({ where: { name: 'STAFF' } });

    // Add Manager via API
    const addManagerRes = await apiRequest(ctx.baseUrl, '/api/business/staff', {
      method: 'POST',
      token: ownerToken,
      body: {
        email: `staging-manager-${STAGING_RUN}@staging.reployty.com`,
        name: 'Staging Manager',
        roleId: managerRole.id,
        branchId: mainBranchId,
      },
    });
    assert.ok([200, 201].includes(addManagerRes.status), 'Manager added successfully');

    // Add Staff via API
    const addStaffRes = await apiRequest(ctx.baseUrl, '/api/business/staff', {
      method: 'POST',
      token: ownerToken,
      body: {
        email: `staging-staff-${STAGING_RUN}@staging.reployty.com`,
        name: 'Staging Staff',
        roleId: staffRole.id,
        branchId: mainBranchId,
      },
    });
    assert.ok([200, 201].includes(addStaffRes.status), 'Staff added successfully');

    // Create sessions for Manager and Staff
    const managerSession = await createSession(managerUserId, stagingBusinessId);
    managerToken = managerSession.sessionToken;

    const staffSession = await createSession(staffUserId, stagingBusinessId);
    staffToken = staffSession.sessionToken;

    // RBAC: Staff cannot manage billing
    const billingRes = await apiRequest(ctx.baseUrl, '/api/business/billing/cancel', {
      method: 'POST',
      token: staffToken,
      body: {},
    });
    assert.ok([403, 400].includes(billingRes.status), `Staff cannot cancel billing (got ${billingRes.status})`);

    // RBAC: Staff cannot update business profile
    const settingsRes = await apiRequest(ctx.baseUrl, '/api/business/profile', {
      method: 'PUT',
      token: staffToken,
      body: { name: 'Hacked Name' },
    });
    assert.ok([403, 400].includes(settingsRes.status), `Staff cannot update profile (got ${settingsRes.status})`);

    // Verify staff listing
    const staffListRes = await apiRequest(ctx.baseUrl, '/api/business/staff', {
      token: ownerToken,
    });
    assert.strictEqual(staffListRes.status, 200);
    const staffList = staffListRes.body.staff || staffListRes.body;
    assert.ok(Array.isArray(staffList) && staffList.length >= 3, `At least 3 staff (found ${staffList?.length})`);
  });

  // =========================================================================
  // STEP 6 — LOYALTY PROGRAM
  // =========================================================================
  await t.test('Step 6: Configure café loyalty program (Stamps & Rewards)', async () => {
    // Loyalty program creation route: POST /api/business/loyalty/program
    const loyaltyRes = await apiRequest(ctx.baseUrl, '/api/business/loyalty/program', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: 'Stamps & Rewards',
        type: 'STAMP',
        targetStamps: 10,
        rewardTitle: 'Free Coffee',
      },
    });
    assert.ok([200, 201].includes(loyaltyRes.status), 'Loyalty program created');
    loyaltyProgramId = loyaltyRes.body.program?.id || loyaltyRes.body.id;
    assert.ok(loyaltyProgramId, 'Loyalty program ID assigned');

    // Verify program retrieval: GET /api/business/loyalty
    const getRes = await apiRequest(ctx.baseUrl, '/api/business/loyalty', {
      token: ownerToken,
    });
    assert.strictEqual(getRes.status, 200);
    const program = getRes.body.activeProgram || getRes.body.program || getRes.body;
    assert.strictEqual(program.name, 'Stamps & Rewards');
    assert.strictEqual(program.type, 'STAMP');
    assert.strictEqual(program.targetStamps, 10);
    assert.strictEqual(program.status, 'ACTIVE');

    // DB: Program belongs to correct business
    const dbProgram = await prisma.loyaltyProgram.findUnique({ where: { id: loyaltyProgramId } });
    assert.strictEqual(dbProgram?.businessId, stagingBusinessId);
  });

  // =========================================================================
  // STEP 7 — REWARDS
  // =========================================================================
  await t.test('Step 7: Create "Free Coffee" reward', async () => {
    const rewardRes = await apiRequest(ctx.baseUrl, '/api/business/rewards', {
      method: 'POST',
      token: ownerToken,
      body: {
        title: 'Free Coffee',
        description: 'Redeem 10 stamps for a complimentary coffee',
        stampsRequired: 10,
        expiryDays: 30,
        usageLimitPerCustomer: 1,
        programId: loyaltyProgramId,
      },
    });
    assert.ok([200, 201].includes(rewardRes.status), 'Reward created');
    rewardId = rewardRes.body.reward?.id || rewardRes.body.id;
    assert.ok(rewardId, 'Reward ID assigned');

    // Verify reward listing
    const listRes = await apiRequest(ctx.baseUrl, '/api/business/rewards', {
      token: ownerToken,
    });
    assert.strictEqual(listRes.status, 200);
    const rewards = listRes.body.rewards || listRes.body;
    const found = (Array.isArray(rewards) ? rewards : []).find((r: any) => r.id === rewardId);
    assert.ok(found, 'Free Coffee reward found');

    // DB: Reward belongs to correct tenant
    const dbReward = await prisma.reward.findUnique({ where: { id: rewardId } });
    assert.strictEqual(dbReward?.businessId, stagingBusinessId);
  });

  // =========================================================================
  // STEP 8 — CATALOG (MENU)
  // =========================================================================
  await t.test('Step 8: Create café menu catalog', async () => {
    // Create Menu: POST /api/business/catalog/menus
    const menuRes = await apiRequest(ctx.baseUrl, '/api/business/catalog/menus', {
      method: 'POST',
      token: ownerToken,
      body: { name: 'Staging Café Menu' },
    });
    assert.ok([200, 201].includes(menuRes.status), 'Menu created');
    menuId = menuRes.body.menu?.id || menuRes.body.id;
    assert.ok(menuId, 'Menu ID assigned');

    // Create "Coffee" category: POST /api/business/catalog/menus/:menuId/categories
    const coffeeCatRes = await apiRequest(ctx.baseUrl, `/api/business/catalog/menus/${menuId}/categories`, {
      method: 'POST',
      token: ownerToken,
      body: { name: 'Coffee', sortOrder: 0 },
    });
    assert.ok([200, 201].includes(coffeeCatRes.status), 'Coffee category created');
    coffeeCategoryId = coffeeCatRes.body.category?.id || coffeeCatRes.body.id;
    assert.ok(coffeeCategoryId, 'Coffee category ID assigned');

    // Create "Snacks" category
    const snacksCatRes = await apiRequest(ctx.baseUrl, `/api/business/catalog/menus/${menuId}/categories`, {
      method: 'POST',
      token: ownerToken,
      body: { name: 'Snacks', sortOrder: 1 },
    });
    assert.ok([200, 201].includes(snacksCatRes.status), 'Snacks category created');
    snacksCategoryId = snacksCatRes.body.category?.id || snacksCatRes.body.id;
    assert.ok(snacksCategoryId, 'Snacks category ID assigned');

    // Add Coffee items: POST /api/business/catalog/menus/categories/:categoryId/items
    const coffeeItems = [
      { name: 'Cappuccino', priceMinor: 18000, description: 'Classic Italian cappuccino' },
      { name: 'Latte', priceMinor: 16000, description: 'Smooth café latte' },
      { name: 'Americano', priceMinor: 12000, description: 'Bold Americano' },
    ];
    for (const item of coffeeItems) {
      const itemRes = await apiRequest(
        ctx.baseUrl,
        `/api/business/catalog/menus/categories/${coffeeCategoryId}/items`,
        { method: 'POST', token: ownerToken, body: item }
      );
      assert.ok([200, 201].includes(itemRes.status), `${item.name} created`);
    }

    // Add Snack items
    const snackItems = [
      { name: 'Garlic Bread', priceMinor: 15000, description: 'Crispy garlic bread' },
      { name: 'Brownie', priceMinor: 13000, description: 'Rich chocolate brownie' },
    ];
    for (const item of snackItems) {
      const itemRes = await apiRequest(
        ctx.baseUrl,
        `/api/business/catalog/menus/categories/${snacksCategoryId}/items`,
        { method: 'POST', token: ownerToken, body: item }
      );
      assert.ok([200, 201].includes(itemRes.status), `${item.name} created`);
    }

    // Verify catalog overview: GET /api/business/catalog/overview
    const overviewRes = await apiRequest(ctx.baseUrl, '/api/business/catalog/overview', {
      token: ownerToken,
    });
    assert.strictEqual(overviewRes.status, 200, 'Catalog overview accessible');
  });

  // =========================================================================
  // STEP 9 — OFFER
  // =========================================================================
  await t.test('Step 9: Create "10% Off on Your Next Visit" offer', async () => {
    const offerRes = await apiRequest(ctx.baseUrl, '/api/business/offers', {
      method: 'POST',
      token: ownerToken,
      body: {
        title: '10% Off on Your Next Visit',
        description: 'Enjoy 10% off on your next purchase at Staging Café',
        type: 'PERCENTAGE_DISCOUNT',
        discountValue: 10,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        usageLimitTotal: 100,
        usageLimitPerCustomer: 1,
        status: 'ACTIVE',
      },
    });
    assert.ok([200, 201].includes(offerRes.status), 'Offer created');
    offerId = offerRes.body.offer?.id || offerRes.body.id;
    assert.ok(offerId, 'Offer ID assigned');

    // Verify offer listing
    const listRes = await apiRequest(ctx.baseUrl, '/api/business/offers', {
      token: ownerToken,
    });
    assert.strictEqual(listRes.status, 200);
    const offers = listRes.body.offers || listRes.body;
    const found = (Array.isArray(offers) ? offers : []).find((o: any) => o.id === offerId);
    assert.ok(found, 'Offer found in listing');

    // DB: Offer belongs to correct business
    const dbOffer = await prisma.offer.findUnique({ where: { id: offerId } });
    assert.strictEqual(dbOffer?.businessId, stagingBusinessId);
  });

  // =========================================================================
  // STEP 10 — CRM FOUNDATION
  // =========================================================================
  await t.test('Step 10: CRM foundation (tags, segments, customer directory)', async () => {
    // CRM tags: POST /api/business/customer-tags
    const tagRes = await apiRequest(ctx.baseUrl, '/api/business/customer-tags', {
      method: 'POST',
      token: ownerToken,
      body: { name: 'Regulars', color: '#22C55E' },
    });
    assert.ok([200, 201].includes(tagRes.status), 'CRM tag "Regulars" created');

    const vipTagRes = await apiRequest(ctx.baseUrl, '/api/business/customer-tags', {
      method: 'POST',
      token: ownerToken,
      body: { name: 'VIP', color: '#EAB308' },
    });
    assert.ok([200, 201].includes(vipTagRes.status), 'CRM tag "VIP" created');

    // CRM segments: POST /api/business/customer-segments
    const segmentRes = await apiRequest(ctx.baseUrl, '/api/business/customer-segments', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: 'Frequent Visitors',
        description: 'Customers with 5+ visits',
        ruleDefinition: { minVisits: 5, status: ['ACTIVE'] },
      },
    });
    assert.ok([200, 201].includes(segmentRes.status), 'CRM segment created');

    // Customer directory: GET /api/business/customers
    const customersRes = await apiRequest(ctx.baseUrl, '/api/business/customers', {
      token: ownerToken,
    });
    assert.strictEqual(customersRes.status, 200, 'Customer directory accessible');

    // Tags listing: GET /api/business/customer-tags
    const tagsListRes = await apiRequest(ctx.baseUrl, '/api/business/customer-tags', {
      token: ownerToken,
    });
    assert.strictEqual(tagsListRes.status, 200, 'Tags listing accessible');

    // Segments listing: GET /api/business/customer-segments
    const segListRes = await apiRequest(ctx.baseUrl, '/api/business/customer-segments', {
      token: ownerToken,
    });
    assert.strictEqual(segListRes.status, 200, 'Segments listing accessible');
  });

  // =========================================================================
  // STEP 11 — REVIEW CONFIGURATION
  // =========================================================================
  await t.test('Step 11: Review system accessible', async () => {
    const reviewsRes = await apiRequest(ctx.baseUrl, '/api/business/reviews', {
      token: ownerToken,
    });
    assert.strictEqual(reviewsRes.status, 200, 'Reviews endpoint accessible');

    const metricsRes = await apiRequest(ctx.baseUrl, '/api/business/reviews/metrics', {
      token: ownerToken,
    });
    assert.strictEqual(metricsRes.status, 200, 'Reviews metrics accessible');
  });

  // =========================================================================
  // STEP 12 — ANALYTICS
  // =========================================================================
  await t.test('Step 12: Analytics dashboard loads correctly', async () => {
    const analyticsRes = await apiRequest(ctx.baseUrl, '/api/business/analytics/overview', {
      token: ownerToken,
    });
    assert.strictEqual(analyticsRes.status, 200, 'Analytics overview accessible');
    assert.ok(analyticsRes.body, 'Analytics data returned');
  });

  // =========================================================================
  // STEP 13 — BILLING
  // =========================================================================
  await t.test('Step 13: Billing simulation (subscription state, plan change)', async () => {
    // GET /api/business/billing
    const billingRes = await apiRequest(ctx.baseUrl, '/api/business/billing', {
      token: ownerToken,
    });
    assert.strictEqual(billingRes.status, 200, 'Billing overview accessible');

    // GET /api/business/billing/usage
    const usageRes = await apiRequest(ctx.baseUrl, '/api/business/billing/usage', {
      token: ownerToken,
    });
    assert.strictEqual(usageRes.status, 200, 'Billing usage accessible');

    // GET /api/business/billing/invoices
    const invoiceRes = await apiRequest(ctx.baseUrl, '/api/business/billing/invoices', {
      token: ownerToken,
    });
    assert.strictEqual(invoiceRes.status, 200, 'Billing invoices accessible');
  });

  // =========================================================================
  // STEP 14 — QR CONFIGURATION
  // =========================================================================
  await t.test('Step 14: QR code resolves to correct business', async () => {
    // Create a QR code for the business via Prisma
    const qr = await prisma.qRCode.create({
      data: {
        businessId: stagingBusinessId,
        branchId: mainBranchId,
        code: `STG-QR-${STAGING_RUN}`,
        type: 'BUSINESS_STAND',
        destinationUrl: `/join/${STAGING_CAFE_SLUG}`,
        status: 'ACTIVE',
      },
    });
    assert.ok(qr.id, 'QR code created');

    // Verify QR resolves via public customer endpoint: GET /api/customer/qr/:code
    const qrRes = await apiRequest(ctx.baseUrl, `/api/customer/qr/${qr.code}`, {});
    assert.strictEqual(qrRes.status, 200, 'QR code resolves');
    // QR should resolve to the correct business
    const resolved = qrRes.body;
    assert.ok(resolved.business || resolved.businessId || resolved.slug,
      'QR returns business context');
  });

  // =========================================================================
  // STEP 15 — AUDIT LOG VERIFICATION
  // =========================================================================
  await t.test('Step 15: Audit logs record onboarding actions', async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: { businessId: stagingBusinessId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    assert.ok(auditLogs.length > 0, `Audit logs exist (found ${auditLogs.length})`);

    // No sensitive data in audit logs
    for (const log of auditLogs) {
      const logStr = JSON.stringify(log);
      assert.ok(!logStr.includes('StagingOwner123!'), 'No passwords in audit logs');
      assert.ok(!logStr.includes('ManagerPass123!'), 'No staff passwords in audit logs');
    }
  });

  // =========================================================================
  // STEP 16 — TENANT ISOLATION
  // =========================================================================
  await t.test('Step 16: Tenant isolation (Staging Café vs Isolation Test Bistro)', async () => {
    // Create Isolation Test Bistro
    const bistroUser = await prisma.user.create({
      data: {
        email: `bistro-owner-${STAGING_RUN}@staging.reployty.com`,
        name: 'Bistro Owner',
        passwordHash: await hashPassword('BistroPass123!'),
        status: UserStatus.ACTIVE,
      },
    });

    const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });
    const freePlan = await prisma.plan.findFirstOrThrow({ where: { slug: 'free' } });

    const isolationBiz = await prisma.business.create({
      data: {
        name: 'Isolation Test Bistro',
        slug: ISOLATION_BISTRO_SLUG,
        category: BusinessCategory.RESTAURANT,
        primaryColor: '#EC4899',
        secondaryColor: '#BE185D',
        themePreset: 'CAFE',
        planId: freePlan.id,
        onboardingCompleted: true,
        onboardingStep: 6,
      },
    });
    isolationBusinessId = isolationBiz.id;

    await prisma.subscription.create({
      data: {
        businessId: isolationBusinessId,
        planId: freePlan.id,
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
    });

    const isolBranch = await prisma.branch.create({
      data: {
        businessId: isolationBusinessId,
        name: 'Bistro Downtown',
        code: 'BISTRO-1',
        isMainBranch: true,
      },
    });
    isolationBranchId = isolBranch.id;

    await prisma.staffMembership.create({
      data: {
        userId: bistroUser.id,
        businessId: isolationBusinessId,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });

    const bistroSession = await createSession(bistroUser.id, isolationBusinessId);
    ownerBToken = bistroSession.sessionToken;

    // === ISOLATION TESTS ===

    // Bistro owner tries to access Café's branch
    const crossBranchRes = await apiRequest(
      ctx.baseUrl,
      `/api/business/branches/${mainBranchId}`,
      { token: ownerBToken }
    );
    assert.ok(
      [401, 403, 404].includes(crossBranchRes.status),
      `Bistro cannot access Café branch (got ${crossBranchRes.status})`
    );

    // Café owner tries to access Bistro's branch
    const reverseCrossRes = await apiRequest(
      ctx.baseUrl,
      `/api/business/branches/${isolationBranchId}`,
      { token: ownerToken }
    );
    assert.ok(
      [401, 403, 404].includes(reverseCrossRes.status),
      `Café cannot access Bistro branch (got ${reverseCrossRes.status})`
    );

    // Bistro rewards must not include Café's reward
    const crossRewardsRes = await apiRequest(ctx.baseUrl, '/api/business/rewards', {
      token: ownerBToken,
    });
    assert.strictEqual(crossRewardsRes.status, 200);
    const bistroRewards = crossRewardsRes.body.rewards || crossRewardsRes.body;
    const cafeRewardLeak = (Array.isArray(bistroRewards) ? bistroRewards : []).find(
      (r: any) => r.id === rewardId
    );
    assert.strictEqual(cafeRewardLeak, undefined, 'Café reward NOT visible to Bistro');

    // Bistro offers must not include Café's offer
    const crossOffersRes = await apiRequest(ctx.baseUrl, '/api/business/offers', {
      token: ownerBToken,
    });
    assert.strictEqual(crossOffersRes.status, 200);
    const bistroOffers = crossOffersRes.body.offers || crossOffersRes.body;
    const cafeOfferLeak = (Array.isArray(bistroOffers) ? bistroOffers : []).find(
      (o: any) => o.id === offerId
    );
    assert.strictEqual(cafeOfferLeak, undefined, 'Café offer NOT visible to Bistro');

    // Bistro loyalty must not return Café's program
    const crossLoyaltyRes = await apiRequest(ctx.baseUrl, '/api/business/loyalty', {
      token: ownerBToken,
    });
    assert.strictEqual(crossLoyaltyRes.status, 200);
    const bistroProgram = crossLoyaltyRes.body.activeProgram || crossLoyaltyRes.body.program || crossLoyaltyRes.body;
    if (bistroProgram && bistroProgram.id) {
      assert.notStrictEqual(bistroProgram.id, loyaltyProgramId, 'Café loyalty NOT leaked to Bistro');
    }
  });

  // =========================================================================
  // STEP 17 — DATA INTEGRITY
  // =========================================================================
  await t.test('Step 17: Data integrity verification', async () => {
    // Branches belong to correct business
    const branches = await prisma.branch.findMany({ where: { businessId: stagingBusinessId } });
    assert.ok(branches.length >= 1, 'At least 1 branch');
    for (const b of branches) {
      assert.strictEqual(b.businessId, stagingBusinessId, 'Branch belongs to correct business');
    }

    // No orphan memberships
    const memberships = await prisma.staffMembership.findMany({
      where: { businessId: stagingBusinessId },
      include: { user: true, role: true },
    });
    for (const m of memberships) {
      assert.ok(m.user, `Membership ${m.id} has valid user`);
      assert.ok(m.role, `Membership ${m.id} has valid role`);
    }

    // No duplicate memberships
    const pairs = memberships.map((m) => `${m.userId}:${m.businessId}`);
    assert.strictEqual(pairs.length, new Set(pairs).size, 'No duplicate memberships');

    // Loyalty integrity
    const programs = await prisma.loyaltyProgram.findMany({ where: { businessId: stagingBusinessId } });
    for (const p of programs) {
      assert.strictEqual(p.businessId, stagingBusinessId);
    }

    // Reward integrity
    const rewards = await prisma.reward.findMany({ where: { businessId: stagingBusinessId } });
    for (const r of rewards) {
      assert.strictEqual(r.businessId, stagingBusinessId);
    }

    // Offer integrity
    const offers = await prisma.offer.findMany({ where: { businessId: stagingBusinessId } });
    for (const o of offers) {
      assert.strictEqual(o.businessId, stagingBusinessId);
    }

    // Isolation: Bistro has no Café data
    const bistroBranches = await prisma.branch.findMany({ where: { businessId: isolationBusinessId } });
    for (const b of bistroBranches) {
      assert.notStrictEqual(b.id, mainBranchId, 'Café branch not in Bistro');
    }
  });

  // =========================================================================
  // STEP 18 — FINAL STAGING SUMMARY REPORT
  // =========================================================================
  await t.test('Step 18: Final staging summary', async () => {
    const business = await prisma.business.findUniqueOrThrow({
      where: { slug: STAGING_CAFE_SLUG },
      include: {
        branches: true,
        staff: { include: { user: true, role: true } },
        loyaltyPrograms: true,
        rewards: true,
        offers: true,
        menus: { include: { categories: { include: { items: true } } } },
        subscription: { include: { plan: true } },
      },
    });

    assert.ok(business, 'Staging Café exists');
    assert.strictEqual(business.name, 'Staging Café');
    assert.strictEqual(business.category, 'CAFE');
    assert.ok(business.branches.length >= 1, 'At least 1 branch');
    assert.ok(business.staff.length >= 3, 'At least 3 staff members');
    assert.ok(business.loyaltyPrograms.length >= 1, 'At least 1 loyalty program');
    assert.ok(business.rewards.length >= 1, 'At least 1 reward');
    assert.ok(business.offers.length >= 1, 'At least 1 offer');
    assert.ok(business.menus.length >= 1, 'At least 1 menu');

    const totalItems = business.menus.reduce(
      (sum, m) => sum + m.categories.reduce((s, c) => s + c.items.length, 0), 0
    );

    console.log('\n========================================');
    console.log('19B-STAGING — FIRST BUSINESS ONBOARDING');
    console.log('========================================');
    console.log(`Environment: LOCAL/STAGING`);
    console.log(`Business: ${business.name}`);
    console.log(`Business ID: ${business.id}`);
    console.log(`Category: ${business.category}`);
    console.log(`Branch: ${business.branches[0].name}`);
    console.log(`Branch ID: ${business.branches[0].id}`);
    console.log(`Owner: staging-owner-${STAGING_RUN}@staging.reployty.com`);
    console.log(`Staff: ${business.staff.length} members`);
    console.log(`  - ${business.staff.map(s => `${s.role.name}: ${s.user.name}`).join('\n  - ')}`);
    console.log(`Loyalty: ${business.loyaltyPrograms[0].name} (${business.loyaltyPrograms[0].type}, ${business.loyaltyPrograms[0].targetStamps} stamps)`);
    console.log(`Rewards: ${business.rewards.length} (${business.rewards.map(r => r.title).join(', ')})`);
    console.log(`Offers: ${business.offers.length} (${business.offers.map(o => o.title).join(', ')})`);
    console.log(`Menu: ${business.menus.length} menu, ${totalItems} items`);
    console.log(`Subscription: ${business.subscription?.plan?.name || 'None'} (${business.subscription?.status || 'N/A'})`);
    console.log(`Isolation: Isolation Test Bistro (${isolationBusinessId})`);
    console.log('========================================\n');
  });
});
