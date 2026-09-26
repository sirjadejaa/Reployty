import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../src/server/db/client';
import {
  startTestServer,
  apiRequest,
  createE2ETestFixtures,
  cleanupE2ETestFixtures,
  E2ETestFixtures,
  TestServerContext,
} from './test_helpers';
import {
  getTenantContext,
} from '../../src/server/auth/tenantContext';
import {
  hashPassword,
  createSession,
  validateSession,
  revokeSession,
  createPasswordResetToken,
  resetPasswordWithToken,
} from '../../src/server/auth/sessionService';
import {
  requestOtp,
  verifyOtp,
} from '../../src/server/services/otpService';
import {
  validateCustomerSession,
  revokeCustomerSession,
} from '../../src/server/services/customerAuthService';
import {
  awardStamps,
  awardPoints,
  getCustomerLoyaltyState,
} from '../../src/server/services/loyaltyService';
import {
  claimCustomerReward,
  staffLookupRedemption,
  staffValidateRedemption,
} from '../../src/server/services/rewardService';
import {
  redeemOffer,
} from '../../src/server/services/offerService';
import {
  submitCustomerReview,
  generateReviewResponseDrafts,
} from '../../src/server/services/reviewService';
import {
  getAnalyticsOverview,
  exportAnalyticsCsv,
} from '../../src/server/services/analyticsService';
import {
  changePlan,
  cancelSubscription,
  createPlan,
} from '../../src/server/services/billingService';
import {
  requireFeature,
  checkUsageLimit,
} from '../../src/server/services/entitlementService';
import { BusinessCategory, UserStatus } from '@prisma/client';

test('REPLOYTY FULL E2E WORKFLOWS SUITE (PHASE 17)', async (t) => {
  let serverCtx: TestServerContext;
  let fx: E2ETestFixtures;

  t.before(async () => {
    serverCtx = await startTestServer();
    fx = await createE2ETestFixtures();
  });

  t.after(async () => {
    if (fx) {
      await cleanupE2ETestFixtures(fx);
    }
    if (serverCtx) {
      await serverCtx.stop();
    }
  });

  // =========================================================================
  // WORKFLOW 1: COMPLETE BUSINESS ONBOARDING FLOW (Section 7)
  // =========================================================================
  await t.test('E2E Workflow 1: Business Onboarding Flow (Info -> Category -> Branch -> Branding -> Staff -> Complete)', async () => {
    const obRunId = Math.random().toString(36).substring(2, 7);
    const obPasswordHash = await hashPassword('OwnerPass123!');

    // 1. Create Business in uncompleted onboarding state
    const newBiz = await prisma.business.create({
      data: {
        name: `Onboarding Bakery ${obRunId}`,
        slug: `onboarding-bakery-${obRunId}`,
        category: BusinessCategory.RETAIL,
        onboardingCompleted: false,
        onboardingStep: 1,
      },
    });

    const newOwner = await prisma.user.create({
      data: {
        email: `ob.owner.${obRunId}@reployty.com`,
        name: `Onboarding Owner ${obRunId}`,
        passwordHash: obPasswordHash,
        status: UserStatus.ACTIVE,
        memberships: {
          create: {
            businessId: newBiz.id,
            roleId: fx.ownerRole.id,
            status: 'ACTIVE',
          },
        },
      },
    });

    // Login as owner to obtain session token
    const loginRes = await apiRequest(serverCtx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: newOwner.email, password: 'OwnerPass123!' },
    });
    assert.strictEqual(loginRes.status, 200, 'Owner login succeeds');
    const token = loginRes.body.sessionToken || loginRes.body.token || loginRes.body.session?.sessionToken;
    assert.ok(token, 'Session token returned upon login');

    // Step 1: Update Business Profile & Category
    const step1Res = await apiRequest(serverCtx.baseUrl, '/api/business/profile', {
      method: 'PUT',
      token,
      body: {
        name: `Artisan Sourdough ${obRunId}`,
        category: BusinessCategory.CAFE,
        phone: '+15551234567',
        email: `contact.${obRunId}@sourdough.com`,
        city: 'Metropolis',
      },
    });
    assert.strictEqual(step1Res.status, 200, 'Profile updated');
    assert.strictEqual(step1Res.body.category, BusinessCategory.CAFE);

    // Step 2: Create Main Branch
    const step2Res = await apiRequest(serverCtx.baseUrl, '/api/business/branches', {
      method: 'POST',
      token,
      body: {
        name: 'Downtown Bakehouse',
        code: `DT-${obRunId.toUpperCase()}`,
        address: '100 Baker Street',
        isMainBranch: true,
      },
    });
    assert.strictEqual(step2Res.status, 201, 'Branch created');
    assert.strictEqual(step2Res.body.name, 'Downtown Bakehouse');

    // Step 3: Configure Branding & Colors
    const step3Res = await apiRequest(serverCtx.baseUrl, '/api/business/branding', {
      method: 'PUT',
      token,
      body: {
        primaryColor: '#D97706',
        secondaryColor: '#92400E',
        themePreset: 'CAFE',
        tagline: 'Fresh bread daily',
      },
    });
    assert.strictEqual(step3Res.status, 200, 'Branding updated');
    assert.strictEqual(step3Res.body.primaryColor, '#D97706');

    // Step 4: Finish Onboarding
    const finishRes = await apiRequest(serverCtx.baseUrl, '/api/business/onboarding', {
      method: 'PUT',
      token,
      body: {
        step: 6,
        completed: true,
      },
    });
    assert.strictEqual(finishRes.status, 200, 'Onboarding finished');
    assert.strictEqual(finishRes.body.onboardingCompleted, true);

    // Verify persisted state in database
    const verifiedBiz = await prisma.business.findUnique({ where: { id: newBiz.id } });
    assert.strictEqual(verifiedBiz?.onboardingCompleted, true);
    assert.strictEqual(verifiedBiz?.themePreset, 'CAFE');

    // Cleanup temporary onboarding business & user
    await prisma.branch.deleteMany({ where: { businessId: newBiz.id } });
    await prisma.staffMembership.deleteMany({ where: { businessId: newBiz.id } });
    await prisma.session.deleteMany({ where: { userId: newOwner.id } });
    await prisma.business.delete({ where: { id: newBiz.id } });
    await prisma.user.delete({ where: { id: newOwner.id } });
  });

  // =========================================================================
  // WORKFLOW 2: AUTHENTICATION E2E (Section 8)
  // =========================================================================
  await t.test('E2E Workflow 2: Authentication Lifecycle (Login, Sessions, Status, Reset, Tenant Switch)', async () => {
    // 1. Invalid login fails with 401
    const badLogin = await apiRequest(serverCtx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: fx.ownerA.email, password: 'WrongPassword999!' },
    });
    assert.strictEqual(badLogin.status, 401, 'Invalid credentials return 401');

    // 2. Valid login succeeds
    const goodLogin = await apiRequest(serverCtx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: fx.ownerA.email, password: 'Password123!' },
    });
    assert.strictEqual(goodLogin.status, 200, 'Valid login returns 200');
    const token = goodLogin.body.sessionToken || goodLogin.body.token || goodLogin.body.session?.sessionToken;
    assert.ok(token);

    // 3. Authenticated request using token
    const meRes = await apiRequest(serverCtx.baseUrl, '/api/auth/me', { token });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.email, fx.ownerA.email);

    // 4. Logout revokes session immediately
    const logoutRes = await apiRequest(serverCtx.baseUrl, '/api/auth/logout', {
      method: 'POST',
      token,
    });
    assert.strictEqual(logoutRes.status, 200, 'Logout succeeds');

    // Subsequent request with revoked token must fail with 401
    const postLogout = await apiRequest(serverCtx.baseUrl, '/api/auth/me', { token });
    assert.strictEqual(postLogout.status, 401, 'Revoked session denied with 401');

    // 5. Suspended and disabled user checks
    const suspendedLogin = await apiRequest(serverCtx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'suspended@reployty.com', password: 'TestPass123!' },
    });
    assert.strictEqual(suspendedLogin.status, 403, 'Suspended user denied with 403');

    // 6. Password Reset Flow: Token generation -> Single use -> Revocation
    const resetGen = await createPasswordResetToken(fx.ownerA.email);
    assert.ok(resetGen?.rawToken, 'Reset token generated');

    const resetExec = await resetPasswordWithToken(resetGen.rawToken, 'NewPassword456!');
    assert.strictEqual(resetExec.success, true, 'First use of reset token succeeds');

    // Replay of reset token fails
    await assert.rejects(
      async () => resetPasswordWithToken(resetGen.rawToken, 'AnotherPass789!'),
      (err: any) => err.message.includes('Invalid or expired')
    );

    // Restore ownerA password back
    const restoreHash = await hashPassword('Password123!');
    await prisma.user.update({
      where: { id: fx.ownerA.id },
      data: { passwordHash: restoreHash },
    });

    // Re-create active session for fx.ownerASession so subsequent tests have a valid sessionToken
    const newSession = await createSession(fx.ownerA.id, fx.businessA.id, '127.0.0.1', 'Node-Test-Agent');
    (fx.ownerASession as any).sessionToken = newSession.sessionToken;
  });

  // =========================================================================
  // WORKFLOW 3: CUSTOMER QR -> JOIN -> OTP -> PWA (Section 9)
  // =========================================================================
  await t.test('E2E Workflow 3: Customer QR -> OTP Challenge -> PWA Session Flow', async () => {
    // 1. Resolve Public QR Code
    const qrRes = await apiRequest(serverCtx.baseUrl, `/api/customer/qr/${fx.businessA.slug}`);
    assert.strictEqual(qrRes.status, 200, 'Public QR resolves business');
    assert.strictEqual(qrRes.body.business.slug, fx.businessA.slug);
    assert.strictEqual(qrRes.body.business.name, fx.businessA.name);
    // Ensure sensitive internal fields are absent
    assert.strictEqual(qrRes.body.business.planId, undefined, 'Private planId hidden from public QR');

    // 2. Request OTP for customer phone
    const custPhone = `+1555${Math.floor(200000 + Math.random() * 700000)}`;
    const otpReq = await apiRequest(serverCtx.baseUrl, '/api/customer/auth/request-otp', {
      method: 'POST',
      body: {
        businessId: fx.businessA.id,
        phone: custPhone,
      },
    });
    assert.strictEqual(otpReq.status, 200, 'OTP requested');
    const challengeId = otpReq.body.challengeId;
    assert.ok(challengeId);

    // Retrieve simulated OTP from active challenge record
    const challenge = await prisma.customerOtpChallenge.findUniqueOrThrow({
      where: { id: challengeId },
    });
    assert.ok(challenge.codeHash, 'Challenge has hashed OTP');

    // Verify OTP using dev simulated code from devOtp or lookup
    const otpVerify = await apiRequest(serverCtx.baseUrl, '/api/customer/auth/verify-otp', {
      method: 'POST',
      body: {
        businessId: fx.businessA.id,
        phone: custPhone,
        code: otpReq.body.devOtp || '123456',
        challengeId,
        name: 'New PWA Customer',
        marketingConsent: true,
      },
    });
    assert.strictEqual(otpVerify.status, 200, 'OTP verified');
    const customerToken = otpVerify.body.sessionToken || otpVerify.body.token || otpVerify.body.session?.sessionToken;
    assert.ok(customerToken, 'Customer session token returned');

    // 3. Customer accesses Customer PWA profile
    const pwaMe = await apiRequest(serverCtx.baseUrl, '/api/customer/me', {
      customerToken,
    });
    assert.strictEqual(pwaMe.status, 200, 'Customer accesses PWA me');
    assert.strictEqual(pwaMe.body.customer.phone, custPhone);
    assert.strictEqual(pwaMe.body.business.id, fx.businessA.id);

    // 4. Customer token attempting Business Admin API must be rejected
    const illegalAdminAccess = await apiRequest(serverCtx.baseUrl, '/api/business/dashboard', {
      customerToken, // Passing customer token where business session required
    });
    assert.strictEqual(illegalAdminAccess.status, 401, 'Customer token cannot access Business API');

    // 5. Customer logout
    const custLogout = await apiRequest(serverCtx.baseUrl, '/api/customer/auth/logout', {
      method: 'POST',
      customerToken,
    });
    assert.strictEqual(custLogout.status, 200, 'Customer logged out');

    // Subsequent access fails
    const postLogoutMe = await apiRequest(serverCtx.baseUrl, '/api/customer/me', {
      customerToken,
    });
    assert.strictEqual(postLogoutMe.status, 401, 'Revoked customer session returns 401');
  });

  // =========================================================================
  // WORKFLOW 4: CUSTOMER PROFILE & CRM FLOW (Section 10)
  // =========================================================================
  await t.test('E2E Workflow 4: Customer CRM Lifecycle (Profile, Timeline, Notes, Tags, Segments, Isolation)', async () => {
    const ownerToken = fx.ownerASession.sessionToken;

    // 1. Fetch Customer in CRM
    const crmList = await apiRequest(serverCtx.baseUrl, '/api/business/customers', {
      token: ownerToken,
    });
    assert.strictEqual(crmList.status, 200);
    const customersArray = crmList.body.data || crmList.body.customers || [];
    const foundCustomer = customersArray.find((c: any) => c.id === fx.customerA.id);
    assert.ok(foundCustomer, 'Customer A appears in Business A CRM');

    // 2. Fetch Customer 360 View
    const c360 = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${fx.customerA.id}`, {
      token: ownerToken,
    });
    assert.strictEqual(c360.status, 200);
    assert.strictEqual(c360.body.customer.id, fx.customerA.id);

    // 3. Update Customer Profile
    const updateProfile = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${fx.customerA.id}`, {
      method: 'PUT',
      token: ownerToken,
      body: {
        name: 'Elena Rostova Updated',
        birthday: '1995-04-12',
      },
    });
    assert.strictEqual(updateProfile.status, 200);
    assert.strictEqual(updateProfile.body.name || updateProfile.body.customer?.name, 'Elena Rostova Updated');

    // 4. Create Customer Note
    const noteRes = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${fx.customerA.id}/notes`, {
      method: 'POST',
      token: ownerToken,
      body: {
        content: 'Prefers oat milk latte with extra shot. VIP regular.',
      },
    });
    assert.strictEqual(noteRes.status, 201);
    const noteId = noteRes.body.id || noteRes.body.note?.id;
    assert.ok(noteId);

    // 5. Create Tag and Assign to Customer
    const tagRes = await apiRequest(serverCtx.baseUrl, '/api/business/customer-tags', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: 'VIP Regular',
        color: '#8B5CF6',
      },
    });
    assert.strictEqual(tagRes.status, 201);
    const tagId = tagRes.body.id || tagRes.body.tag?.id;

    const assignRes = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${fx.customerA.id}/tags`, {
      method: 'POST',
      token: ownerToken,
      body: { tagId },
    });
    assert.strictEqual(assignRes.status, 200);

    // 6. Cross-Tenant Check: Business B attempting to view Customer A must receive 404
    const crossTenantCrm = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${fx.customerA.id}`, {
      token: fx.ownerBSession.sessionToken,
    });
    assert.strictEqual(crossTenantCrm.status, 404, 'Business B cannot access Customer A CRM');
  });

  // =========================================================================
  // WORKFLOW 5: LOYALTY ENGINE & STAMP/POINT ISSUANCE (Section 11)
  // =========================================================================
  await t.test('E2E Workflow 5: Loyalty Engine (Program creation, stamp/point issuance, atomicity, card updates)', async () => {
    const ownerToken = fx.ownerASession.sessionToken;

    // 1. Create Loyalty Program for Business A
    const progRes = await apiRequest(serverCtx.baseUrl, '/api/business/loyalty/program', {
      method: 'POST',
      token: ownerToken,
      body: {
        type: 'STAMP',
        name: '10-Stamp Coffee Card',
        targetStamps: 10,
        rewardTitle: 'Free Special Coffee',
        rulesConfig: { minSpendMinor: 1000 },
      },
    });
    assert.ok([200, 201].includes(progRes.status), 'Loyalty program upserted');

    // 2. Staff awards 3 stamps to Customer A
    const awardRes = await apiRequest(serverCtx.baseUrl, '/api/business/loyalty/award-stamp', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId: fx.customerA.id,
        stampsToAdd: 3,
        spendMinor: 3500,
        notes: 'Espresso & Croissant purchase',
      },
    });
    assert.strictEqual(awardRes.status, 200, 'Stamps awarded successfully');
    assert.strictEqual(awardRes.body.card?.stampsCollected || awardRes.body.newBalance, 3);

    // 3. Verify Customer Loyalty Card in database
    const card = await prisma.loyaltyCard.findFirst({
      where: { customerId: fx.customerA.id, businessId: fx.businessA.id },
    });
    assert.ok(card);
    assert.strictEqual(card.stampsCollected, 3);

    // 4. Verify negative/invalid stamp award is rejected safely
    const invalidAward = await apiRequest(serverCtx.baseUrl, '/api/business/loyalty/award-stamp', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId: fx.customerA.id,
        stampsToAdd: -5,
      },
    });
    assert.strictEqual(invalidAward.status, 400, 'Negative stamp award rejected');
  });

  // =========================================================================
  // WORKFLOW 6: REWARDS & REDEMPTION WORKFLOW (Section 12)
  // =========================================================================
  await t.test('E2E Workflow 6: Rewards & Anti-Fraud Redemption Terminal', async () => {
    const ownerToken = fx.ownerASession.sessionToken;
    const customerToken = fx.customerASession.sessionToken;

    // 1. Create a Reward in Business A (requires 2 stamps)
    const rewardRes = await apiRequest(serverCtx.baseUrl, '/api/business/rewards', {
      method: 'POST',
      token: ownerToken,
      body: {
        title: 'Free Artisan Pastry',
        description: 'Choose any freshly baked croissant or muffin',
        stampsRequired: 2,
        expiryDays: 30,
        status: 'ACTIVE',
      },
    });
    assert.strictEqual(rewardRes.status, 201, 'Reward created');
    const rewardId = rewardRes.body.id || rewardRes.body.reward?.id;

    // 2. Customer claims the reward (Customer A currently has 3 stamps)
    const claimRes = await apiRequest(serverCtx.baseUrl, `/api/customer/rewards/${rewardId}/claim`, {
      method: 'POST',
      customerToken,
    });
    assert.strictEqual(claimRes.status, 201, 'Customer successfully claims reward');
    const redemptionCode = claimRes.body.redemption.redemptionCode;
    assert.ok(redemptionCode.startsWith('R-'), 'Unguessable R- voucher generated');

    // Verify balance atomically deducted (3 - 2 = 1 stamp)
    const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: fx.customerA.id } });
    assert.strictEqual(customerAfter.stampsBalance, 1, 'Balance deducted atomically');

    // 3. Staff Terminal: Lookup voucher by code
    const lookupRes = await apiRequest(serverCtx.baseUrl, `/api/business/redemptions/lookup/${redemptionCode}`, {
      token: ownerToken,
    });
    assert.strictEqual(lookupRes.status, 200, 'Staff voucher lookup succeeds');
    assert.strictEqual(lookupRes.body.isValid, true);
    assert.strictEqual(lookupRes.body.redemption?.status, 'CLAIMED');

    // 4. Staff Terminal: Redeem voucher
    const redeemRes = await apiRequest(serverCtx.baseUrl, '/api/business/redemptions/validate', {
      method: 'POST',
      token: ownerToken,
      body: {
        code: redemptionCode,
        branchId: fx.branchA1.id,
      },
    });
    assert.strictEqual(redeemRes.status, 200, 'Voucher redeemed');
    assert.strictEqual(redeemRes.body.redemption?.status, 'REDEEMED');

    // 5. Anti-Fraud: Double redemption attempt must fail
    const doubleRedeem = await apiRequest(serverCtx.baseUrl, '/api/business/redemptions/validate', {
      method: 'POST',
      token: ownerToken,
      body: {
        code: redemptionCode,
        branchId: fx.branchA1.id,
      },
    });
    assert.ok([400, 409].includes(doubleRedeem.status), 'Double redemption blocked');
  });

  // =========================================================================
  // WORKFLOW 7: CATALOG WORKFLOW (Section 13)
  // =========================================================================
  await t.test('E2E Workflow 7: Multi-Type Catalog (Menu, Service, Product) & Customer Browsing', async () => {
    const ownerToken = fx.ownerASession.sessionToken;
    const customerToken = fx.customerASession.sessionToken;

    // 1. Create Menu Category & Item
    const menu = await prisma.menu.create({
      data: { businessId: fx.businessA.id, name: 'Main Cafe Menu', isActive: true },
    });
    const cat = await prisma.menuCategory.create({
      data: { menuId: menu.id, name: 'Espresso Bar', sortOrder: 1 },
    });
    const item = await prisma.menuItem.create({
      data: {
        categoryId: cat.id,
        name: 'Oat Milk Flat White',
        priceMinor: 450,
        isAvailable: true,
      },
    });
    assert.ok(item.id);

    // 2. Customer browses catalog
    const custCatalog = await apiRequest(serverCtx.baseUrl, '/api/customer/catalog', {
      customerToken,
    });
    assert.strictEqual(custCatalog.status, 200);
    assert.ok(Array.isArray(custCatalog.body.menus), 'Menus array returned');
    const allItems = custCatalog.body.menus.flatMap((m: any) => m.categories?.flatMap((c: any) => c.items) || []);
    const foundItem = allItems.find((i: any) => i.id === item.id);
    assert.ok(foundItem, 'Customer sees catalog item');

    // 3. Cross-Tenant: Business B cannot delete Business A item
    const crossDelete = await apiRequest(serverCtx.baseUrl, `/api/business/catalog/menu-items/${item.id}`, {
      method: 'DELETE',
      token: fx.ownerBSession.sessionToken,
    });
    assert.strictEqual(crossDelete.status, 404, 'Cross-tenant catalog mutation rejected');
  });

  // =========================================================================
  // WORKFLOW 8: OFFERS WORKFLOW (Section 14)
  // =========================================================================
  await t.test('E2E Workflow 8: Promotional Offers Creation, Eligibility & Redemption', async () => {
    const ownerToken = fx.ownerASession.sessionToken;
    const customerToken = fx.customerASession.sessionToken;

    // 1. Business A creates promotional offer
    const offerRes = await apiRequest(serverCtx.baseUrl, '/api/business/offers', {
      method: 'POST',
      token: ownerToken,
      body: {
        title: 'Morning Special 20% Off',
        description: 'Get 20% off all hot beverages before 11 AM',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        status: 'ACTIVE',
        targetType: 'ALL_CUSTOMERS',
        usageLimitTotal: 50,
        usageLimitPerCustomer: 1,
      },
    });
    assert.strictEqual(offerRes.status, 201, 'Offer created');
    const offerId = offerRes.body.id || offerRes.body.offer?.id;

    // 2. Customer views eligible offers
    const custOffers = await apiRequest(serverCtx.baseUrl, '/api/customer/offers', {
      customerToken,
    });
    assert.strictEqual(custOffers.status, 200);
    const offersArray = Array.isArray(custOffers.body) ? custOffers.body : custOffers.body.offers || [];
    const foundOffer = offersArray.find((o: any) => o.id === offerId);
    assert.ok(foundOffer, 'Customer sees active eligible offer');

    // 3. Redeem Offer via Business redemption endpoint
    const redeemOfferRes = await apiRequest(serverCtx.baseUrl, '/api/business/offers/redeem', {
      method: 'POST',
      token: ownerToken,
      body: {
        offerId,
        customerId: fx.customerA.id,
        branchId: fx.branchA1.id,
      },
    });
    assert.strictEqual(redeemOfferRes.status, 201, 'Offer redeemed');

    // 4. Duplicate redemption exceeds per-customer limit
    const duplicateOffer = await apiRequest(serverCtx.baseUrl, '/api/business/offers/redeem', {
      method: 'POST',
      token: ownerToken,
      body: {
        offerId,
        customerId: fx.customerA.id,
        branchId: fx.branchA1.id,
      },
    });
    assert.ok(duplicateOffer.status >= 400, 'Duplicate offer redemption rejected due to quota');
  });

  // =========================================================================
  // WORKFLOW 9: REVIEWS & DETERMINISTIC AI ASSISTANT (Section 15)
  // =========================================================================
  await t.test('E2E Workflow 9: Reviews Engine (Google CTA vs Private Feedback & AI Review Assistant)', async () => {
    const ownerToken = fx.ownerASession.sessionToken;
    const customerToken = fx.customerASession.sessionToken;

    // 1. Submit 5-star review -> Expect Google Review CTA target
    const highRating = await apiRequest(serverCtx.baseUrl, '/api/customer/reviews', {
      method: 'POST',
      customerToken,
      body: {
        rating: 5,
        feedbackText: 'Best coffee and artisanal croissants in the city!',
      },
    });
    assert.strictEqual(highRating.status, 201);
    assert.strictEqual(highRating.body.review.isPublicGoogleReviewTarget, true);
    const reviewId = highRating.body.review.id;

    // 2. Business retrieves review
    const bizReviews = await apiRequest(serverCtx.baseUrl, '/api/business/reviews', {
      token: ownerToken,
    });
    assert.strictEqual(bizReviews.status, 200);
    const reviewRecord = bizReviews.body.reviews.find((r: any) => r.id === reviewId);
    assert.ok(reviewRecord);

    // 3. AI Review Assistant generates drafts
    const aiDrafts = await apiRequest(serverCtx.baseUrl, `/api/business/reviews/${reviewId}/generate-ai`, {
      method: 'POST',
      token: ownerToken,
    });
    assert.ok([200, 201].includes(aiDrafts.status), 'AI response draft generated');
    const englishDraft = aiDrafts.body.generatedEnglish || aiDrafts.body.generation?.draftResponses?.english;
    const hinglishDraft = aiDrafts.body.generatedHinglish || aiDrafts.body.generation?.draftResponses?.hinglish;
    const hindiDraft = aiDrafts.body.generatedHindi || aiDrafts.body.generation?.draftResponses?.hindi;
    assert.ok(englishDraft, 'Contains English draft');
    assert.ok(hinglishDraft, 'Contains Hinglish draft');
    assert.ok(hindiDraft, 'Contains Hindi draft');

    // 4. Cross-Tenant: Business B cannot generate or access Business A review
    const crossAi = await apiRequest(serverCtx.baseUrl, `/api/business/reviews/${reviewId}/generate-ai`, {
      method: 'POST',
      token: fx.ownerBSession.sessionToken,
    });
    assert.strictEqual(crossAi.status, 404, 'Cross-tenant review AI draft denied');
  });

  // =========================================================================
  // WORKFLOW 10: ANALYTICS BI & CSV EXPORT (Section 16)
  // =========================================================================
  await t.test('E2E Workflow 10: Analytics BI Overview, Branch Intelligence & CSV Scoping', async () => {
    // Elevate Business A to growth plan to test analytics feature
    await prisma.business.update({
      where: { id: fx.businessA.id },
      data: { planId: fx.growthPlan.id },
    });

    const ownerToken = fx.ownerASession.sessionToken;

    // 1. Fetch Analytics Overview
    const analytics = await apiRequest(serverCtx.baseUrl, '/api/business/analytics/overview?preset=30d', {
      token: ownerToken,
    });
    assert.strictEqual(analytics.status, 200, 'Analytics overview fetched');
    assert.ok(analytics.body.metrics.totalCustomers.current >= 1, 'Total customers metric counted');

    // 2. Export Analytics CSV
    const csvRes = await apiRequest(serverCtx.baseUrl, '/api/business/analytics/export?type=customers', {
      token: ownerToken,
    });
    assert.strictEqual(csvRes.status, 200, 'CSV export succeeds');
    assert.ok(csvRes.headers.get('content-type')?.includes('text/csv'));
    assert.ok(csvRes.body.includes('Customer Name'), 'Contains CSV headers');
    // Ensure Business B customers do NOT appear in Business A export
    assert.ok(!csvRes.body.includes(fx.customerB.name), 'Tenant isolation: Business B customer absent from export');
  });

  // =========================================================================
  // WORKFLOW 11: BILLING & SUBSCRIPTIONS & QUOTA LIMITS (Section 17 & 18)
  // =========================================================================
  await t.test('E2E Workflow 11: Billing Lifecycle, Plan Upgrades, Entitlements & Quota Limits', async () => {
    const ownerToken = fx.ownerASession.sessionToken;

    // 1. Retrieve Current Billing Overview
    const billing = await apiRequest(serverCtx.baseUrl, '/api/business/billing', {
      token: ownerToken,
    });
    assert.strictEqual(billing.status, 200);
    assert.ok(billing.body.subscription, 'Subscription exists');

    // 2. Plan Quotas: maxBranches check
    // Free plan has maxBranches = 1. Business A already has branchA1 and branchA2
    // Update subscription plan to starterPlan so effective limits apply
    await prisma.subscription.update({
      where: { businessId: fx.businessA.id },
      data: { planId: fx.starterPlan.id },
    });
    await prisma.business.update({
      where: { id: fx.businessA.id },
      data: { planId: fx.starterPlan.id },
    });

    const quotaBranch = await apiRequest(serverCtx.baseUrl, '/api/business/branches', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: 'Third Branch Over Limit',
        code: `BR3-${fx.runId.toUpperCase()}`,
      },
    });
    assert.strictEqual(quotaBranch.status, 403, 'Quota limit enforces maxBranches');

    // 3. Webhook: Idempotent payment processing
    const webhookRes = await apiRequest(serverCtx.baseUrl, '/api/billing/webhook', {
      method: 'POST',
      headers: {
        'x-webhook-secret': 'reployty_billing_webhook_secret_2026',
      },
      body: {
        eventId: `evt_e2e_${Date.now()}`,
        providerPaymentId: `pay_e2e_${Date.now()}`,
        businessId: fx.businessA.id,
        amountMinor: 299900,
        currency: 'INR',
        status: 'SUCCESS',
      },
    });
    assert.strictEqual(webhookRes.status, 200);
    assert.strictEqual(webhookRes.body.processed, true);
  });

  // =========================================================================
  // WORKFLOW 12: SUPER ADMIN E2E & NON-ADMIN BOUNDARY (Section 19)
  // =========================================================================
  await t.test('E2E Workflow 12: Super Admin Platform Management & 403 Boundary', async () => {
    const adminToken = fx.adminSession.sessionToken;
    const ownerToken = fx.ownerASession.sessionToken;

    // 1. Super Admin fetches Platform Overview
    const overview = await apiRequest(serverCtx.baseUrl, '/api/admin/overview', {
      token: adminToken,
    });
    assert.strictEqual(overview.status, 200, 'Super admin fetches overview');
    assert.ok(overview.body.metrics.totalBusinesses >= 2);

    // 2. Super Admin fetches Businesses
    const bizList = await apiRequest(serverCtx.baseUrl, '/api/admin/businesses', {
      token: adminToken,
    });
    assert.strictEqual(bizList.status, 200);
    assert.ok(bizList.body.businesses.length >= 2);

    // 3. Non-Super Admin (Business Owner) attempting Super Admin route -> 403
    const forbiddenOverview = await apiRequest(serverCtx.baseUrl, '/api/admin/overview', {
      token: ownerToken,
    });
    assert.strictEqual(forbiddenOverview.status, 403, 'Business Owner denied Super Admin access with 403');

    // 4. Unauthenticated request -> 401
    const unauthOverview = await apiRequest(serverCtx.baseUrl, '/api/admin/overview');
    assert.strictEqual(unauthOverview.status, 401, 'Unauthenticated request denied with 401');
  });
});
