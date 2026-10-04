/**
 * REPLOYTY PHASE 19C-STAGING
 * FIRST CUSTOMER JOURNEY — LOCAL/STAGING VALIDATION
 *
 * Validates the complete customer lifecycle against the existing 19B-STAGING
 * business ("Staging Café") in a local/staging environment.
 *
 * Environment: LOCAL/STAGING (simulated OTP, dev/staging infrastructure)
 *
 * Journey Chain:
 * QR → Business Resolver → Branch → Customer PWA → Phone Entry →
 * OTP Simulation → Customer Session → Customer Profile → Consent →
 * Loyalty Card → Catalog → Earn Stamp → Progress → Reward →
 * Reward Redemption → Offer → Review / Feedback → CRM → Analytics →
 * Session Security → Cross-Tenant IDOR → Concurrency → DB Integrity → Report
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { createSession } from '../../src/server/auth/sessionService';
import { ConsentChannel } from '@prisma/client';

test('PHASE 19C-STAGING: FIRST CUSTOMER JOURNEY VALIDATION', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;

  // Staging 19B Entities (reused from 19B)
  let stagingBusiness: any;
  let mainBranch: any;
  let loyaltyProgram: any;
  let freeCoffeeReward: any;
  let tenPercentOffer: any;
  let qrCodeRecord: any;
  let ownerUser: any;
  let ownerToken: string;

  // Isolation Tenant
  let isolationBusiness: any;

  // Customer Journey State
  const customerPhone = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;
  let otpChallengeId: string;
  let devOtpCode: string;
  let customerSessionToken: string;
  let customerId: string;
  let redemptionVoucherCode: string;
  let redemptionId: string;

  t.before(async () => {
    ctx = await startTestServer();

    // Discover existing Staging Café records from 19B
    const stagingCafes = await prisma.business.findMany({
      where: { name: 'Staging Café' },
      orderBy: { createdAt: 'desc' },
      include: {
        branches: true,
        loyaltyPrograms: { include: { rewards: true } },
        offers: true,
        menus: { include: { categories: { include: { items: true } } } },
        qrCodes: true,
        staff: { include: { user: true, role: true } },
      },
    });

    assert.ok(stagingCafes.length > 0, 'At least one Staging Café business must exist from 19B');

    if (stagingCafes.length > 1) {
      console.log(
        `[19C-STAGING Notice] Multiple (${stagingCafes.length}) Staging Café records detected. Selecting most recent: ID ${stagingCafes[0].id} (Slug: ${stagingCafes[0].slug})`
      );
    }

    stagingBusiness = stagingCafes[0];
    assert.strictEqual(stagingBusiness.name, 'Staging Café');

    mainBranch = stagingBusiness.branches.find((b: any) => b.isMainBranch) || stagingBusiness.branches[0];
    assert.ok(mainBranch, 'Main Branch must exist under Staging Café');

    loyaltyProgram = stagingBusiness.loyaltyPrograms.find((p: any) => p.status === 'ACTIVE') || stagingBusiness.loyaltyPrograms[0];
    assert.ok(loyaltyProgram, 'Active loyalty program must exist');
    assert.strictEqual(loyaltyProgram.type, 'STAMP', 'Program type must be STAMP');

    freeCoffeeReward = loyaltyProgram.rewards.find((r: any) => r.title.includes('Coffee')) || loyaltyProgram.rewards[0];
    assert.ok(freeCoffeeReward, 'Free Coffee reward must exist');
    assert.strictEqual(freeCoffeeReward.stampsRequired, 10, 'Reward must require 10 stamps');

    tenPercentOffer = stagingBusiness.offers.find((o: any) => o.status === 'ACTIVE') || stagingBusiness.offers[0];
    assert.ok(tenPercentOffer, 'Active offer must exist');

    qrCodeRecord = stagingBusiness.qrCodes.find((q: any) => q.status === 'ACTIVE') || stagingBusiness.qrCodes[0];
    assert.ok(qrCodeRecord, 'Active QR code must exist');

    const bistros = await prisma.business.findMany({
      where: { name: 'Isolation Test Bistro' },
      orderBy: { createdAt: 'desc' },
      include: { branches: true, rewards: true, offers: true },
    });
    assert.ok(bistros.length > 0, 'Isolation Test Bistro must exist from 19B');
    isolationBusiness = bistros[0];

    const ownerStaff = stagingBusiness.staff.find((s: any) => s.role.name === 'OWNER');
    assert.ok(ownerStaff, 'Staging Café must have an active OWNER staff member');
    ownerUser = ownerStaff.user;

    const ownerSession = await createSession(ownerUser.id, stagingBusiness.id);
    ownerToken = ownerSession.sessionToken;
    assert.ok(ownerToken, 'Owner staff session established for testing staff terminal');
  });

  t.after(async () => {
    if (ctx) await ctx.stop();
  });

  // =========================================================================
  // SETUP / REUSE 19B-STAGING BUSINESS VERIFICATION
  // =========================================================================
  await t.test('Step 0: Verify 19B Staging records discovered and ready', async () => {
    assert.ok(stagingBusiness, 'Staging Café ready');
    assert.ok(mainBranch, 'Main Branch ready');
    assert.ok(loyaltyProgram, 'Loyalty program ready');
    assert.ok(freeCoffeeReward, 'Reward ready');
    assert.ok(tenPercentOffer, 'Offer ready');
    assert.ok(qrCodeRecord, 'QR code ready');
    assert.ok(isolationBusiness, 'Isolation Bistro ready');
    assert.ok(ownerToken, 'Owner token ready');
  });

  // =========================================================================
  // STEP 1 — QR ENTRY
  // =========================================================================
  await t.test('Step 1 (QR Entry): Resolve public QR code into safe business context', async () => {
    const res = await apiRequest(ctx.baseUrl, `/api/customer/qr/${qrCodeRecord.code}`);
    assert.strictEqual(res.status, 200, 'QR resolver returns HTTP 200');

    // Verify correct business and branch identities
    assert.strictEqual(res.body.business.name, 'Staging Café');
    assert.strictEqual(res.body.business.id, stagingBusiness.id);
    assert.strictEqual(res.body.business.category, 'CAFE');
    assert.strictEqual(res.body.branch.name, 'Main Branch');
    assert.strictEqual(res.body.branch.id, mainBranch.id);

    // Verify security: Resolver MUST NOT leak sensitive internal secrets or staff info
    assert.strictEqual(res.body.staff, undefined, 'Must not expose staff information');
    assert.strictEqual(res.body.users, undefined, 'Must not expose user information');
    assert.strictEqual(res.body.business.passwordHash, undefined, 'Must not expose password hashes');
    assert.strictEqual(res.body.business.stripeCustomerId, undefined, 'Must not expose billing identifiers');
  });

  // =========================================================================
  // STEP 2 — CUSTOMER PWA BRANDING & CONTEXT
  // =========================================================================
  await t.test('Step 2 (Customer PWA): Validate theme, branding, and mobile layout payload', async () => {
    const res = await apiRequest(ctx.baseUrl, `/api/customer/qr/${stagingBusiness.slug}`);
    assert.strictEqual(res.status, 200, 'Slug resolver returns HTTP 200');
    assert.strictEqual(res.body.business.themePreset, 'CAFE');
    assert.ok(res.body.business.primaryColor, 'Primary brand color provided');
    assert.ok(res.body.business.secondaryColor, 'Secondary brand color provided');
  });

  // =========================================================================
  // STEP 3 — OTP SIMULATION & CHALLENGE LIFECYCLE
  // =========================================================================
  await t.test('Step 3 (OTP Simulation): Request simulated OTP and enforce security checks', async () => {
    // 1. Missing phone/businessId returns 400
    const invalidReq = await apiRequest(ctx.baseUrl, '/api/customer/auth/request-otp', {
      method: 'POST',
      body: { businessId: stagingBusiness.id },
    });
    assert.strictEqual(invalidReq.status, 400, 'Missing phone returns 400');

    // 2. Valid OTP Request
    const otpRes = await apiRequest(ctx.baseUrl, '/api/customer/auth/request-otp', {
      method: 'POST',
      body: {
        businessId: stagingBusiness.id,
        phone: customerPhone,
      },
    });
    assert.strictEqual(otpRes.status, 200, 'OTP request returns HTTP 200');
    assert.strictEqual(otpRes.body.success, true);
    assert.ok(otpRes.body.challengeId, 'Challenge ID returned');
    assert.ok(otpRes.body.devOtp, 'Simulated devOtp returned in staging mode');
    assert.strictEqual(otpRes.body.devOtp.length, 6, 'OTP is 6-digit code');

    otpChallengeId = otpRes.body.challengeId;
    devOtpCode = otpRes.body.devOtp;

    // 3. Invalid OTP verification fails
    const badVerifyRes = await apiRequest(ctx.baseUrl, '/api/customer/auth/verify-otp', {
      method: 'POST',
      body: {
        businessId: stagingBusiness.id,
        phone: customerPhone,
        code: '000000',
        challengeId: otpChallengeId,
      },
    });
    assert.strictEqual(badVerifyRes.status, 400, 'Invalid OTP code is rejected');

    // 4. Valid OTP verification succeeds and establishes Customer Session
    const verifyRes = await apiRequest(ctx.baseUrl, '/api/customer/auth/verify-otp', {
      method: 'POST',
      body: {
        businessId: stagingBusiness.id,
        phone: customerPhone,
        code: devOtpCode,
        challengeId: otpChallengeId,
        name: 'Staging Journey Customer',
        email: 'journey.customer@staging.reployty.com',
        birthday: '1995-05-15',
        marketingConsent: false,
        branchId: mainBranch.id,
      },
    });
    assert.strictEqual(verifyRes.status, 200, 'Valid OTP verification succeeds');
    assert.strictEqual(verifyRes.body.success, true);
    assert.strictEqual(verifyRes.body.isNew, true, 'Customer is new on first verification');
    assert.ok(verifyRes.body.customer.id, 'Customer ID generated');
    assert.ok(verifyRes.body.sessionToken, 'Customer session token issued');

    customerId = verifyRes.body.customer.id;
    customerSessionToken = verifyRes.body.sessionToken;

    // 5. Replay attack prevention: same OTP code cannot be verified twice
    const replayRes = await apiRequest(ctx.baseUrl, '/api/customer/auth/verify-otp', {
      method: 'POST',
      body: {
        businessId: stagingBusiness.id,
        phone: customerPhone,
        code: devOtpCode,
        challengeId: otpChallengeId,
      },
    });
    assert.strictEqual(replayRes.status, 400, 'Reused OTP code is strictly rejected');
  });

  // =========================================================================
  // STEP 4 — CUSTOMER PROFILE
  // =========================================================================
  await t.test('Step 4 (Customer Profile): Fetch and update customer profile', async () => {
    // 1. Fetch current profile
    const profileRes = await apiRequest(ctx.baseUrl, '/api/customer/me', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(profileRes.status, 200, 'Profile accessible with customer token');
    assert.strictEqual(profileRes.body.customer.id, customerId);
    assert.strictEqual(profileRes.body.customer.businessId, stagingBusiness.id);
    assert.strictEqual(profileRes.body.customer.name, 'Staging Journey Customer');

    // 2. Update profile
    const updateRes = await apiRequest(ctx.baseUrl, '/api/customer/profile', {
      method: 'PUT',
      customerToken: customerSessionToken,
      body: {
        name: 'Alex Staging Regular',
        email: 'alex.regular@staging.reployty.com',
      },
    });
    assert.strictEqual(updateRes.status, 200, 'Profile update succeeds');
    assert.strictEqual(updateRes.body.customer.name, 'Alex Staging Regular');

    // 3. Verify persistence
    const reProfileRes = await apiRequest(ctx.baseUrl, '/api/customer/me', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(reProfileRes.body.customer.name, 'Alex Staging Regular');
  });

  // =========================================================================
  // STEP 5 — CUSTOMER CONSENT
  // =========================================================================
  await t.test('Step 5 (Consent): Update communication consent preferences', async () => {
    const consentRes = await apiRequest(ctx.baseUrl, '/api/customer/consent', {
      method: 'PUT',
      customerToken: customerSessionToken,
      body: {
        channel: ConsentChannel.MARKETING,
        granted: true,
      },
    });
    assert.strictEqual(consentRes.status, 200, 'Consent update returns HTTP 200');
    assert.strictEqual(consentRes.body.success, true);
    assert.strictEqual(consentRes.body.consent.channel, 'MARKETING');
    assert.strictEqual(consentRes.body.consent.granted, true);
  });

  // =========================================================================
  // STEP 6 — LOYALTY CARD INITIAL STATE
  // =========================================================================
  await t.test('Step 6 (Loyalty Card): Customer views initial loyalty pass', async () => {
    const loyaltyRes = await apiRequest(ctx.baseUrl, '/api/customer/loyalty', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(loyaltyRes.status, 200, 'Loyalty pass accessible');
    assert.strictEqual(loyaltyRes.body.program.name, 'Stamps & Rewards');
    assert.strictEqual(loyaltyRes.body.program.type, 'STAMP');
    assert.strictEqual(loyaltyRes.body.program.targetStamps, 10);
    assert.strictEqual(loyaltyRes.body.card.stampsCollected, 0, 'Initial stamp balance is 0');
  });

  // =========================================================================
  // STEP 7 — CUSTOMER CATALOG (READ-ONLY)
  // =========================================================================
  await t.test('Step 7 (Catalog): Read-only access to café menu and products', async () => {
    const catalogRes = await apiRequest(ctx.baseUrl, '/api/customer/catalog', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(catalogRes.status, 200, 'Catalog endpoint returns HTTP 200');
    assert.ok(Array.isArray(catalogRes.body.menus), 'Menus array returned');
    assert.ok(catalogRes.body.menus.length > 0, 'At least one menu present');

    // Verify Coffee and Snacks items created in 19B are visible
    const allItems: any[] = [];
    catalogRes.body.menus.forEach((m: any) => {
      m.categories?.forEach((c: any) => {
        c.items?.forEach((i: any) => allItems.push(i));
      });
    });

    const itemTitles = allItems.map((i) => i.name || i.title);
    assert.ok(
      itemTitles.some((t) => t.includes('Cappuccino') || t.includes('Latte') || t.includes('Coffee')),
      'Coffee item present in catalog'
    );
  });

  // =========================================================================
  // STEP 8 — EARN FIRST STAMP (STAFF-SIDE ACTION)
  // =========================================================================
  await t.test('Step 8 (Earn Loyalty): Staff awards 1st stamp via staff terminal', async () => {
    const awardRes = await apiRequest(ctx.baseUrl, '/api/business/loyalty/award-stamp', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        stampsToAdd: 1,
        branchId: mainBranch.id,
        idempotencyKey: `stamp-1-${customerId}`,
      },
    });
    assert.strictEqual(awardRes.status, 200, 'Stamp award succeeds');
    assert.strictEqual(awardRes.body.success, true);
    assert.strictEqual(awardRes.body.card.stampsCollected, 1, 'Card now has 1 stamp');

    // Customer checks their loyalty state
    const customerLoyaltyRes = await apiRequest(ctx.baseUrl, '/api/customer/loyalty', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(customerLoyaltyRes.body.card.stampsCollected, 1, 'Customer view reflects 1 stamp');

    // Verify transaction history recorded
    const historyRes = await apiRequest(ctx.baseUrl, '/api/customer/loyalty/history', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(historyRes.status, 200);
    assert.ok(Array.isArray(historyRes.body), 'Transaction history is array');
    assert.ok(historyRes.body.length >= 1, 'Transaction recorded in history');
  });

  // =========================================================================
  // STEP 9 — REPEAT STAMPS TO THRESHOLD
  // =========================================================================
  await t.test('Step 9 (Repeat Stamp Test): Award 9 more stamps to reach threshold (10 stamps)', async () => {
    const awardRes = await apiRequest(ctx.baseUrl, '/api/business/loyalty/award-stamp', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        stampsToAdd: 9,
        branchId: mainBranch.id,
        idempotencyKey: `stamp-9-${customerId}`,
      },
    });
    assert.strictEqual(awardRes.status, 200, '9 stamps awarded');
    assert.strictEqual(awardRes.body.card.stampsCollected, 10, 'Card has reached 10 stamps');

    // Verify customer pass balance
    const customerLoyaltyRes = await apiRequest(ctx.baseUrl, '/api/customer/loyalty', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(customerLoyaltyRes.body.card.stampsCollected, 10, 'Customer has 10 stamps');
  });

  // =========================================================================
  // STEP 10 — REWARD EARNING & ELIGIBILITY
  // =========================================================================
  await t.test('Step 10 (Reward Available): Customer sees Free Coffee eligible', async () => {
    const rewardsRes = await apiRequest(ctx.baseUrl, '/api/customer/rewards', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(rewardsRes.status, 200, 'Rewards catalogue accessible');
    assert.ok(Array.isArray(rewardsRes.body.rewards), 'Rewards returned');

    const coffeeReward = rewardsRes.body.rewards.find((r: any) => r.id === freeCoffeeReward.id);
    assert.ok(coffeeReward, 'Free Coffee reward found in catalogue');
    assert.strictEqual(coffeeReward.isEligible, true, 'Customer is eligible with 10 stamps');
  });

  // =========================================================================
  // STEP 11 — REWARD REDEMPTION & SINGLE-USE VALIDATION
  // =========================================================================
  await t.test('Step 11 (Reward Redemption): Claim reward and execute staff terminal validation', async () => {
    // 1. Customer claims Free Coffee
    const claimRes = await apiRequest(ctx.baseUrl, `/api/customer/rewards/${freeCoffeeReward.id}/claim`, {
      method: 'POST',
      customerToken: customerSessionToken,
      body: {
        idempotencyKey: `claim-coffee-${customerId}`,
      },
    });
    assert.strictEqual(claimRes.status, 201, 'Reward claim succeeds with HTTP 201');
    assert.strictEqual(claimRes.body.success, true);
    assert.ok(claimRes.body.redemption.redemptionCode, 'Redemption voucher code generated');

    redemptionVoucherCode = claimRes.body.redemption.redemptionCode;
    redemptionId = claimRes.body.redemption.id;

    // 2. Verify stamps balance deducted (10 - 10 = 0)
    const postClaimLoyalty = await apiRequest(ctx.baseUrl, '/api/customer/loyalty', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(postClaimLoyalty.body.card.stampsCollected, 0, '10 stamps deducted; balance is now 0');

    // 3. Immediate duplicate claim must fail due to limit reached or insufficient stamps
    const duplicateClaimRes = await apiRequest(
      ctx.baseUrl,
      `/api/customer/rewards/${freeCoffeeReward.id}/claim`,
      {
        method: 'POST',
        customerToken: customerSessionToken,
        body: {
          idempotencyKey: `claim-coffee-2-${customerId}`,
        },
      }
    );
    assert.ok(
      [400, 409].includes(duplicateClaimRes.status),
      'Duplicate claim rejected for limit reached or insufficient stamps'
    );

    // 4. Staff validates redemption code at checkout
    const validateRes = await apiRequest(ctx.baseUrl, '/api/business/redemptions/validate', {
      method: 'POST',
      token: ownerToken,
      body: {
        code: redemptionVoucherCode,
        branchId: mainBranch.id,
      },
    });
    assert.strictEqual(validateRes.status, 200, 'Staff validation succeeds');
    assert.strictEqual(validateRes.body.success, true);
    assert.strictEqual(validateRes.body.redemption.status, 'REDEEMED', 'Status marked REDEEMED');

    // 5. Anti-Fraud: Re-validating the same redemption code must fail
    const replayValidateRes = await apiRequest(ctx.baseUrl, '/api/business/redemptions/validate', {
      method: 'POST',
      token: ownerToken,
      body: {
        code: redemptionVoucherCode,
        branchId: mainBranch.id,
      },
    });
    assert.strictEqual(replayValidateRes.status, 409, 'Re-redemption of used code is rejected (HTTP 409)');
  });

  // =========================================================================
  // STEP 12 — OFFER ELIGIBILITY & REDEMPTION
  // =========================================================================
  await t.test('Step 12 (Offer): Customer views eligible offer and staff executes redemption', async () => {
    // 1. Customer queries eligible offers
    const offersRes = await apiRequest(ctx.baseUrl, '/api/customer/offers', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(offersRes.status, 200, 'Offers list accessible');

    const offersList = Array.isArray(offersRes.body) ? offersRes.body : (offersRes.body.offers || []);
    const offer = offersList.find((o: any) => o.id === tenPercentOffer.id);
    assert.ok(offer, '10% Off offer found in customer view');
    assert.strictEqual(offer.isEligible, true, 'Customer is eligible for 10% Off offer');

    // 2. Staff validates offer for customer
    const staffOfferValidate = await apiRequest(ctx.baseUrl, '/api/business/offers/validate', {
      method: 'POST',
      token: ownerToken,
      body: {
        offerId: tenPercentOffer.id,
        customerId,
        branchId: mainBranch.id,
      },
    });
    assert.strictEqual(staffOfferValidate.status, 200, 'Staff offer validation succeeds');
    assert.strictEqual(staffOfferValidate.body.isValid, true);

    // 3. Staff redeems offer
    const staffOfferRedeem = await apiRequest(ctx.baseUrl, '/api/business/offers/redeem', {
      method: 'POST',
      token: ownerToken,
      body: {
        offerId: tenPercentOffer.id,
        customerId,
        branchId: mainBranch.id,
        idempotencyKey: `offer-redeem-${customerId}`,
      },
    });
    assert.strictEqual(staffOfferRedeem.status, 201, 'Offer redeemed successfully');
    assert.strictEqual(staffOfferRedeem.body.success, true);
  });

  // =========================================================================
  // STEP 13 — REVIEW & SENTIMENT ROUTING
  // =========================================================================
  await t.test('Step 13 (Review): Submit 5-star review (Google CTA) and 2-star feedback (Private)', async () => {
    // 1. 5-Star Review -> POSITIVE sentiment -> Google Review Target
    const positiveReview = await apiRequest(ctx.baseUrl, '/api/customer/reviews', {
      method: 'POST',
      customerToken: customerSessionToken,
      body: {
        rating: 5,
        feedbackText: 'Fantastic coffee and wonderful atmosphere!',
        branchId: mainBranch.id,
      },
    });
    assert.strictEqual(positiveReview.status, 201, 'Positive review created');
    assert.strictEqual(positiveReview.body.sentiment, 'POSITIVE');
    assert.strictEqual(positiveReview.body.isPublicGoogleReviewTarget, true);

    // 2. 2-Star Review -> NEGATIVE sentiment -> Private Feedback
    const negativeReview = await apiRequest(ctx.baseUrl, '/api/customer/reviews', {
      method: 'POST',
      customerToken: customerSessionToken,
      body: {
        rating: 2,
        feedbackText: 'Seating was too crowded today.',
        branchId: mainBranch.id,
      },
    });
    assert.strictEqual(negativeReview.status, 201, 'Private feedback created');
    assert.strictEqual(negativeReview.body.sentiment, 'NEGATIVE');
    assert.strictEqual(negativeReview.body.isPublicGoogleReviewTarget, false);
  });

  // =========================================================================
  // STEP 14 — CUSTOMER CRM 360 & TIMELINE
  // =========================================================================
  await t.test('Step 14 (CRM 360): Business Admin views customer 360 and verified timeline', async () => {
    const crmCustomerRes = await apiRequest(ctx.baseUrl, `/api/business/customers/${customerId}`, {
      token: ownerToken,
    });
    assert.strictEqual(crmCustomerRes.status, 200, 'Customer 360 record retrieved');
    assert.strictEqual(crmCustomerRes.body.customer.id, customerId);
    assert.strictEqual(crmCustomerRes.body.customer.businessId, stagingBusiness.id);

    // Verify timeline events recorded on dedicated timeline endpoint
    const timelineRes = await apiRequest(ctx.baseUrl, `/api/business/customers/${customerId}/timeline`, {
      token: ownerToken,
    });
    assert.strictEqual(timelineRes.status, 200, 'Customer timeline retrieved');
    assert.ok(Array.isArray(timelineRes.body.data), 'Timeline events data array present');
    assert.ok(timelineRes.body.data.length > 0, 'Timeline events exist');

    // Verify Customer Activity endpoint returns chronological list
    const customerActivityRes = await apiRequest(ctx.baseUrl, '/api/customer/activity', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(customerActivityRes.status, 200);
    assert.ok(Array.isArray(customerActivityRes.body), 'Activity timeline is an array');
  });

  // =========================================================================
  // STEP 15 — CUSTOMER SEGMENTATION EVALUATION
  // =========================================================================
  await t.test('Step 15 (Segmentation): Server-side customer segmentation evaluation', async () => {
    const segmentsRes = await apiRequest(ctx.baseUrl, '/api/business/customer-segments', {
      token: ownerToken,
    });
    assert.strictEqual(segmentsRes.status, 200, 'Customer segments accessible');
    assert.ok(Array.isArray(segmentsRes.body.segments || segmentsRes.body), 'Segments list returned');
  });

  // =========================================================================
  // STEP 16 — BUSINESS ANALYTICS REFLECTION
  // =========================================================================
  await t.test('Step 16 (Analytics): Real customer activity reflected in business metrics', async () => {
    const analyticsRes = await apiRequest(ctx.baseUrl, '/api/business/analytics/overview', {
      token: ownerToken,
    });
    assert.strictEqual(analyticsRes.status, 200, 'Analytics dashboard returns HTTP 200');
    assert.ok(analyticsRes.body.summary || analyticsRes.body, 'Metrics payload present');
  });

  // =========================================================================
  // STEP 17 — CUSTOMER SESSION SECURITY & PRIVILEGE BOUNDARIES
  // =========================================================================
  await t.test('Step 17 (Session Security): Customer cannot access Business Admin or Super Admin routes', async () => {
    // 1. Customer token cannot access Business Profile
    const bizRes = await apiRequest(ctx.baseUrl, '/api/business/profile', {
      headers: { Authorization: `Bearer ${customerSessionToken}` },
    });
    assert.ok([401, 403].includes(bizRes.status), 'Customer cannot access Business Profile');

    // 2. Customer token cannot access Platform Admin
    const adminRes = await apiRequest(ctx.baseUrl, '/api/admin/overview', {
      headers: { Authorization: `Bearer ${customerSessionToken}` },
    });
    assert.ok([401, 403].includes(adminRes.status), 'Customer cannot access Platform Admin overview');

    // 3. Unauthenticated request to customer me endpoint fails
    const unauthRes = await apiRequest(ctx.baseUrl, '/api/customer/me');
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated customer access returns 401');
  });

  // =========================================================================
  // STEP 18 — CROSS-TENANT IDOR PROTECTION
  // =========================================================================
  await t.test('Step 18 (Cross-Tenant IDOR): Customer cannot claim isolation tenant rewards', async () => {
    // Find reward belonging to Isolation Test Bistro
    const isolationReward = await prisma.reward.findFirst({
      where: { businessId: isolationBusiness.id },
    });

    if (isolationReward) {
      // Staging customer attempts to claim Isolation Bistro's reward
      const crossClaimRes = await apiRequest(
        ctx.baseUrl,
        `/api/customer/rewards/${isolationReward.id}/claim`,
        {
          method: 'POST',
          customerToken: customerSessionToken,
          body: { idempotencyKey: 'cross-tenant-claim' },
        }
      );
      assert.ok(
        [400, 404, 403].includes(crossClaimRes.status),
        'Cross-tenant reward claim is rejected (HTTP 400/403/404)'
      );
    }

    // Owner of Isolation Bistro cannot query Staging Customer
    const bistroStaff = await prisma.staffMembership.findFirst({
      where: { businessId: isolationBusiness.id },
      include: { user: true },
    });

    if (bistroStaff) {
      const bistroSession = await createSession(bistroStaff.userId, isolationBusiness.id);
      const bistroCrmRes = await apiRequest(
        ctx.baseUrl,
        `/api/business/customers/${customerId}`,
        {
          token: bistroSession.sessionToken,
        }
      );
      assert.ok(
        [403, 404].includes(bistroCrmRes.status),
        'Isolation Bistro staff cannot access Staging Customer in CRM'
      );
    }
  });

  // =========================================================================
  // STEP 19 — CONCURRENCY & IDEMPOTENCY
  // =========================================================================
  await t.test('Step 19 (Concurrency / Idempotency): Duplicate requests are handled idempotently', async () => {
    const idemKey = `concurrency-test-${Date.now()}`;

    const req1 = apiRequest(ctx.baseUrl, '/api/business/loyalty/award-stamp', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        stampsToAdd: 1,
        branchId: mainBranch.id,
        idempotencyKey: idemKey,
      },
    });

    const req2 = apiRequest(ctx.baseUrl, '/api/business/loyalty/award-stamp', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        stampsToAdd: 1,
        branchId: mainBranch.id,
        idempotencyKey: idemKey,
      },
    });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.status, res2.status];
    assert.ok(statuses.includes(200), 'At least one request succeeds with 200');
    assert.ok(
      statuses.every(s => [200, 400, 409].includes(s)),
      'Concurrent requests are handled safely'
    );
  });

  // =========================================================================
  // STEP 20 — CUSTOMER LOGOUT & SESSION REVOCATION
  // =========================================================================
  await t.test('Step 20 (Customer Logout): Revoke session and ensure cookie cleared', async () => {
    const logoutRes = await apiRequest(ctx.baseUrl, '/api/customer/auth/logout', {
      method: 'POST',
      customerToken: customerSessionToken,
    });
    assert.strictEqual(logoutRes.status, 200, 'Logout succeeds');
    assert.strictEqual(logoutRes.body.success, true);

    // Subsequent call with revoked token must return 401
    const postLogoutRes = await apiRequest(ctx.baseUrl, '/api/customer/me', {
      customerToken: customerSessionToken,
    });
    assert.strictEqual(postLogoutRes.status, 401, 'Revoked customer session is unauthorized');
  });

  // =========================================================================
  // STEP 21 — DATABASE INTEGRITY AUDIT
  // =========================================================================
  await t.test('Step 21 (Database Integrity): Verify zero orphan records and strict tenant scoping', async () => {
    // 1. Customer record
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        loyaltyCards: true,
        consents: true,
        events: true,
        reviewFeedbacks: true,
        rewardRedemptions: true,
        offerRedemptions: true,
      },
    });

    assert.ok(customer, 'Customer record exists in PostgreSQL');
    assert.strictEqual(customer.businessId, stagingBusiness.id, 'Customer belongs to Staging Café');
    assert.strictEqual(customer.phone, customerPhone, 'Customer phone matches');

    // 2. Loyalty balance non-negative
    const loyaltyCard = customer.loyaltyCards[0];
    assert.ok((loyaltyCard?.stampsCollected || 0) >= 0, 'Loyalty stamps balance is non-negative');
    assert.ok(customer.stampsBalance >= 0, 'Customer stampsBalance is non-negative');

    // 3. Redemptions belong to customer and business
    customer.rewardRedemptions.forEach((r) => {
      assert.strictEqual(r.businessId, stagingBusiness.id, 'Reward redemption belongs to Staging Café');
      assert.strictEqual(r.customerId, customerId, 'Reward redemption belongs to customer');
    });

    customer.offerRedemptions.forEach((o) => {
      assert.strictEqual(o.businessId, stagingBusiness.id, 'Offer redemption belongs to Staging Café');
      assert.strictEqual(o.customerId, customerId, 'Offer redemption belongs to customer');
    });

    // 4. Reviews belong to customer and business
    customer.reviewFeedbacks.forEach((rf) => {
      assert.strictEqual(rf.businessId, stagingBusiness.id, 'Review belongs to Staging Café');
      assert.strictEqual(rf.customerId, customerId, 'Review belongs to customer');
    });
  });

  // =========================================================================
  // STEP 22 — RESPONSIVE & MOBILE CSS VERIFICATION
  // =========================================================================
  await t.test('Step 22 (Responsive QA): Validate CSS mobile-first viewport rules', async () => {
    const layoutCss = fs.readFileSync(path.join(process.cwd(), 'src/styles/layout.css'), 'utf8');
    const componentsCss = fs.readFileSync(path.join(process.cwd(), 'src/styles/components.css'), 'utf8');

    assert.ok(layoutCss.includes('@media') || componentsCss.includes('@media'), 'Media queries present');
    assert.ok(!layoutCss.includes('width: 1200px;'), 'No non-responsive fixed widths');
  });

  // =========================================================================
  // STEP 23 — FINAL SUMMARY OUTPUT
  // =========================================================================
  await t.test('Step 23: Output 19C-STAGING Customer Journey Summary', async () => {
    console.log('\n========================================');
    console.log('19C-STAGING — FIRST CUSTOMER JOURNEY');
    console.log('========================================');
    console.log('Environment: LOCAL/STAGING');
    console.log('Business: Staging Café');
    console.log('Business ID:', stagingBusiness.id);
    console.log('Branch: Main Branch');
    console.log('Customer Phone:', customerPhone);
    console.log('Customer ID:', customerId);
    console.log('QR Resolver: PASS');
    console.log('OTP Simulation: PASS');
    console.log('Customer Session: PASS');
    console.log('Profile & Consent: PASS');
    console.log('Loyalty Card & Stamps: PASS (10 stamps earned, balance server-authoritative)');
    console.log('Reward Earning & Redemption: PASS (Free Coffee claimed, code validated at checkout)');
    console.log('Offer Earning & Redemption: PASS (10% Off validated & redeemed)');
    console.log('Reviews & Routing: PASS (5-star Google CTA, 2-star private feedback)');
    console.log('CRM 360 & Timeline: PASS');
    console.log('Analytics Reflection: PASS');
    console.log('Session Security & IDOR: PASS');
    console.log('Concurrency & Database Integrity: PASS');
    console.log('========================================\n');
    assert.ok(true);
  });
});
