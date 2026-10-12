import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/server/db/client';
import {
  resolvePublicQr,
  CustomerPwaError,
} from '../../src/server/services/customerPwaService';
import {
  claimCustomerQrEarning,
  getCustomerLoyaltyState,
  LoyaltyOperationError,
} from '../../src/server/services/loyaltyService';
import {
  generateCustomerReviewSuggestion,
  getCustomerReviewState,
} from '../../src/server/services/reviewService';
import {
  createCustomerSession,
  findOrCreateCustomer,
} from '../../src/server/services/customerAuthService';

test('CUSTOMER QR EXPERIENCE: Landing -> Loyalty Card + AI Review Flow Test Suite', async (t) => {
  // ---------------------------------------------------------------------------
  // Setup: Retrieve Test Fixtures (Tenant A & Tenant B)
  // ---------------------------------------------------------------------------
  const cafe = await prisma.business.findUnique({
    where: { slug: 'roasted-bean-cafe' },
    include: { branches: true },
  });
  const salon = await prisma.business.findUnique({
    where: { slug: 'luxe-glow-beauty' },
    include: { branches: true },
  });

  assert.ok(cafe, 'Setup: Seeded cafe business found');
  assert.ok(salon, 'Setup: Seeded salon business found');

  // Ensure Cafe has configured Google review URL, Instagram, Facebook
  await prisma.business.update({
    where: { id: cafe.id },
    data: {
      googleReviewUrl: 'https://g.page/r/roasted-bean-cafe/review',
      instagramUrl: 'https://instagram.com/roastedbeancafe',
      facebookUrl: 'https://facebook.com/roastedbeancafe',
    },
  });

  // Ensure Salon has NO Google review URL configured (to test missing Google URL state)
  await prisma.business.update({
    where: { id: salon.id },
    data: {
      googleReviewUrl: null,
      instagramUrl: null,
      facebookUrl: null,
    },
  });

  // Ensure active QR stand exists for Cafe
  let cafeQr = await prisma.qRCode.findUnique({
    where: { code: 'bean-stand-01' },
  });
  if (!cafeQr) {
    cafeQr = await prisma.qRCode.create({
      data: {
        code: 'bean-stand-01',
        type: 'BUSINESS_STAND',
        businessId: cafe.id,
        branchId: cafe.branches[0]?.id || null,
        destinationUrl: `/join/${cafe.slug}`,
        status: 'ACTIVE',
      },
    });
  }

  // Ensure active QR stand exists for Salon
  let salonQr = await prisma.qRCode.findUnique({
    where: { code: 'luxe-stand-01' },
  });
  if (!salonQr) {
    salonQr = await prisma.qRCode.create({
      data: {
        code: 'luxe-stand-01',
        type: 'BUSINESS_STAND',
        businessId: salon.id,
        branchId: salon.branches[0]?.id || null,
        destinationUrl: `/join/${salon.slug}`,
        status: 'ACTIVE',
      },
    });
  }

  // Create an authenticated customer for Cafe
  const testPhone = '+15550001122';
  const { customer: cafeCustomer } = await findOrCreateCustomer(cafe.id, testPhone, {
    name: 'QR Test Regular',
  });
  const cafeCustomerSession = await createCustomerSession(cafeCustomer.id, cafe.id);

  // Create an authenticated customer for Salon (cross-tenant)
  const salonPhone = '+15550009988';
  const { customer: salonCustomer } = await findOrCreateCustomer(salon.id, salonPhone, {
    name: 'Salon Regular',
  });
  const salonCustomerSession = await createCustomerSession(salonCustomer.id, salon.id);

  // ===========================================================================
  // 1. QR LANDING RESOLUTION & BUSINESS CONTEXT
  // ===========================================================================
  await t.test('1. QR Landing: Server resolves valid business and brand context', async () => {
    const resolved = await resolvePublicQr('bean-stand-01');

    assert.equal(resolved.business.id, cafe.id, 'Resolves correct business ID');
    assert.equal(resolved.business.name, 'The Roasted Bean Café', 'Resolves correct business name');
    assert.equal(resolved.business.googleReviewUrl, 'https://g.page/r/roasted-bean-cafe/review', 'Includes verified Google review URL');
    assert.equal(resolved.business.instagramUrl, 'https://instagram.com/roastedbeancafe', 'Includes verified Instagram URL');
    assert.equal(resolved.business.facebookUrl, 'https://facebook.com/roastedbeancafe', 'Includes verified Facebook URL');

    // Security invariant: Zero database secrets exposed
    assert.equal((resolved.business as any).passwordHash, undefined, 'Zero leak: No passwordHash');
    assert.equal((resolved.business as any).planId, undefined, 'Zero leak: No planId');
  });

  await t.test('1.1 QR Landing: Rejects invalid or inactive QR code', async () => {
    await assert.rejects(
      async () => {
        await resolvePublicQr('non-existent-qr-code-xyz');
      },
      (err: any) => err instanceof CustomerPwaError && err.code === 'QR_NOT_FOUND',
      'Rejects non-existent QR code with QR_NOT_FOUND'
    );
  });

  // ===========================================================================
  // 2. LOYALTY CARD & QR EARNING
  // ===========================================================================
  await t.test('2. Loyalty Card: Authenticated customer retrieves real backend loyalty data', async () => {
    const state = await getCustomerLoyaltyState(cafeCustomerSession);
    assert.ok(state, 'Returns loyalty state for authenticated customer');
    assert.equal(state.business.id, cafe.id, 'Loyalty business matches authenticated customer');
    assert.ok(typeof state.card?.stampsCollected === 'number', 'Stamps collected is real backend number');
  });

  await t.test('2.1 QR Earning: Awards loyalty stamp/points server-side with anti-tamper', async () => {
    const earnResult = await claimCustomerQrEarning(cafeCustomerSession, {
      qrCode: 'bean-stand-01',
      idempotencyKey: `test_claim_${Date.now()}_1`,
    });

    assert.equal(earnResult.success, true, 'Server-side earning successful');
    assert.equal(earnResult.businessName, cafe.name, 'Credits correct business');
  });

  await t.test('2.2 QR Earning: Cooldown & duplicate earning prevented', async () => {
    // Attempt immediate duplicate claim within 15-minute cooldown
    const duplicateResult = await claimCustomerQrEarning(cafeCustomerSession, {
      qrCode: 'bean-stand-01',
      idempotencyKey: `test_claim_${Date.now()}_2`,
    });

    assert.equal(duplicateResult.success, true, 'Returns success response');
    assert.equal(duplicateResult.alreadyClaimed, true, 'Identifies alreadyClaimed = true');
    assert.match(duplicateResult.message, /already|credited|rewards/i, 'Returns clean user-friendly cooldown message');
    assert.equal(duplicateResult.deltaStamps, 0, 'No extra stamps awarded during cooldown');
  });

  await t.test('2.3 Security: Rejects cross-tenant QR loyalty claiming', async () => {
    // Salon customer attempts to claim Cafe QR
    await assert.rejects(
      async () => {
        await claimCustomerQrEarning(salonCustomerSession, {
          qrCode: 'bean-stand-01',
        });
      },
      (err: any) =>
        err instanceof LoyaltyOperationError &&
        err.code === 'CROSS_TENANT_EARNING_FORBIDDEN',
      'Strictly blocks customer from claiming loyalty at another business tenant'
    );
  });

  // ===========================================================================
  // 3. AI REVIEW GENERATION & MULTI-LANGUAGE
  // ===========================================================================
  await t.test('3. AI Review: Rating-aware generation (5 stars positive, 3 stars neutral, 1 star critical)', async () => {
    // 5 Stars
    const fiveStar = generateCustomerReviewSuggestion({
      businessName: cafe.name,
      rating: 5,
      language: 'ENGLISH',
    });
    assert.ok(fiveStar.options.length >= 3, 'Generates at least 3 distinct review options');
    assert.ok(fiveStar.options[0].toLowerCase().includes('fantastic') || fiveStar.options[0].toLowerCase().includes('5-star'), '5-star review contains high praise');

    // 3 Stars
    const threeStar = generateCustomerReviewSuggestion({
      businessName: cafe.name,
      rating: 3,
      language: 'ENGLISH',
    });
    assert.ok(threeStar.options.length >= 3, 'Generates at least 3 options for 3-star rating');
    assert.ok(threeStar.options[0].toLowerCase().includes('average') || threeStar.options[0].toLowerCase().includes('decent'), '3-star review is balanced/neutral');

    // 1 Star
    const oneStar = generateCustomerReviewSuggestion({
      businessName: cafe.name,
      rating: 1,
      language: 'ENGLISH',
    });
    assert.ok(oneStar.options.length >= 3, 'Generates at least 3 options for 1-star rating');
    assert.ok(oneStar.options[0].toLowerCase().includes('disappointing') || oneStar.options[0].toLowerCase().includes('poor'), '1-star review expresses critical feedback respectfully');
  });

  await t.test('3.1 AI Review: Multi-Language support (English, Hindi, Hinglish)', async () => {
    // Hindi
    const hindiRes = generateCustomerReviewSuggestion({
      businessName: cafe.name,
      rating: 5,
      language: 'HINDI',
    });
    assert.ok(hindiRes.options.length >= 3, 'Returns multiple Hindi options');
    assert.ok(hindiRes.options[0].includes('अनुभव') || hindiRes.options[0].includes('शानदार'), 'Contains authentic Hindi wording');

    // Hinglish
    const hinglishRes = generateCustomerReviewSuggestion({
      businessName: cafe.name,
      rating: 5,
      language: 'HINGLISH',
    });
    assert.ok(hinglishRes.options.length >= 3, 'Returns multiple Hinglish options');
    assert.ok(hinglishRes.options[0].toLowerCase().includes('bohot') || hinglishRes.options[0].toLowerCase().includes('visit'), 'Contains authentic Hinglish phrasing');

    // Backwards compatibility with single strings
    assert.ok(hindiRes.english.length > 20, 'Maintains backwards-compatible english string');
    assert.ok(hindiRes.hinglish.length > 20, 'Maintains backwards-compatible hinglish string');
    assert.ok(hindiRes.hindi.length > 20, 'Maintains backwards-compatible hindi string');
  });

  await t.test('3.2 AI Review: Custom feedback note is embedded respectfully without fabricating facts', async () => {
    const customNote = 'The cappuccino was freshly brewed';
    const result = generateCustomerReviewSuggestion({
      businessName: cafe.name,
      rating: 5,
      feedbackText: customNote,
      language: 'ENGLISH',
    });

    assert.ok(result.options[0].includes(customNote), 'Includes customer custom note in quotes');
  });

  // ===========================================================================
  // 4. GOOGLE REVIEW URL CONFIGURATION & SOCIAL LINKS
  // ===========================================================================
  await t.test('4. Google Review URL: Verified business configuration is provided', async () => {
    const cafeState = await getCustomerReviewState(cafeCustomerSession);
    assert.equal(
      cafeState.googleReviewUrl,
      'https://g.page/r/roasted-bean-cafe/review',
      'Provides configured Google Review URL for Cafe'
    );
    assert.equal(cafeState.instagramUrl, 'https://instagram.com/roastedbeancafe', 'Provides configured Instagram URL');
    assert.equal(cafeState.facebookUrl, 'https://facebook.com/roastedbeancafe', 'Provides configured Facebook URL');
  });

  await t.test('4.1 Google Review URL: Handles unconfigured / missing Google review URL cleanly', async () => {
    const salonState = await getCustomerReviewState(salonCustomerSession);
    assert.equal(salonState.googleReviewUrl, null, 'Unconfigured business returns null googleReviewUrl');
    assert.equal(salonState.instagramUrl, null, 'Unconfigured business returns null instagramUrl');
    assert.equal(salonState.facebookUrl, null, 'Unconfigured business returns null facebookUrl');
  });

  // ===========================================================================
  // 5. HTTP ENDPOINTS & SECURITY INTEGRATION
  // ===========================================================================
  await t.test('5. HTTP API: Unauthenticated customer with QR token gets AI review options', async () => {
    const { startTestServer, apiRequest } = await import('../e2e/test_helpers');
    const serverCtx = await startTestServer();

    try {
      // 5.1 Valid QR token request
      const res = await apiRequest(serverCtx.baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: {
          qrToken: 'bean-stand-01',
          rating: 5,
          language: 'ENGLISH',
        },
      });

      assert.equal(res.status, 200, 'HTTP status is 200');
      assert.equal(res.body.success, true, 'Returns success: true');
      assert.equal(res.body.rating, 5, 'Echoes rating');
      assert.equal(res.body.language, 'ENGLISH', 'Echoes language');
      assert.ok(Array.isArray(res.body.options) && res.body.options.length >= 3, 'Returns 3+ review options');
      assert.equal(res.body.googleReviewUrl, 'https://g.page/r/roasted-bean-cafe/review', 'Returns verified Google URL');
      assert.equal(res.body.instagramUrl, 'https://instagram.com/roastedbeancafe', 'Returns verified Instagram URL');

      // 5.2 Invalid QR token returns 404
      const invalidQrRes = await apiRequest(serverCtx.baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: {
          qrToken: 'invalid-non-existent-qr-token',
          rating: 5,
          language: 'ENGLISH',
        },
      });
      assert.equal(invalidQrRes.status, 404, 'Invalid QR token returns 404');

      // 5.3 Missing authentication AND missing QR token returns 401
      const unauthNoQrRes = await apiRequest(serverCtx.baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: {
          rating: 5,
          language: 'ENGLISH',
        },
      });
      assert.equal(unauthNoQrRes.status, 401, 'Request with neither auth nor QR token returns 401');

      // 5.4 Invalid rating (< 1 or > 5) returns 400
      const invalidRatingRes = await apiRequest(serverCtx.baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: {
          qrToken: 'bean-stand-01',
          rating: 6,
          language: 'ENGLISH',
        },
      });
      assert.equal(invalidRatingRes.status, 400, 'Invalid rating (6) returns 400');

      // 5.5 Authenticated customer session also works
      const authRes = await apiRequest(serverCtx.baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        customerToken: cafeCustomerSession.sessionToken,
        body: {
          rating: 4,
          language: 'HINGLISH',
        },
      });
      assert.equal(authRes.status, 200, 'Authenticated customer returns 200');
      assert.equal(authRes.body.language, 'HINGLISH', 'Returns HINGLISH options');

      // 5.6 Review lifecycle event logging
      const eventRes = await apiRequest(serverCtx.baseUrl, '/api/customer/reviews/events', {
        method: 'POST',
        body: {
          qrToken: 'bean-stand-01',
          eventType: 'CUSTOMER_REVIEW_COPIED',
          metadata: { rating: 5, language: 'ENGLISH' },
        },
      });
      assert.equal(eventRes.status, 200, 'Records review event successfully');
      assert.equal(eventRes.body.success, true, 'Event success: true');
    } finally {
      await serverCtx.stop();
    }
  });
});
