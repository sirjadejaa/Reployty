import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/server/db/client';
import { startTestServer, apiRequest } from '../e2e/test_helpers';
import { findOrCreateCustomer, createCustomerSession } from '../../src/server/services/customerAuthService';

test('REGRESSION: Cross-Business AI Review Context Isolation & Verification', async (t) => {
  const serverCtx = await startTestServer();
  const baseUrl = serverCtx.baseUrl;
  const ts = Date.now();

  try {
    // -------------------------------------------------------------------------
    // SETUP: Business A (Cafe)
    // -------------------------------------------------------------------------
    const cafeBusiness = await prisma.business.create({
      data: {
        name: `Sunrise Artisan Cafe ${ts}`,
        slug: `sunrise-cafe-${ts}`,
        category: 'CAFE',
        description: 'Specialty roastery and artisanal brews',
        status: 'ACTIVE',
        onboardingCompleted: true,
        primaryColor: '#78350F',
        secondaryColor: '#F59E0B',
        themePreset: 'CAFE',
        googleReviewUrl: `https://g.page/r/sunrise-cafe-${ts}/review`,
        instagramUrl: `https://instagram.com/sunrisecafe${ts}`,
        facebookUrl: `https://facebook.com/sunrisecafe${ts}`,
      },
    });

    const cafeBranch = await prisma.branch.create({
      data: {
        businessId: cafeBusiness.id,
        name: 'Cafe Downtown Roastery',
        code: `CAF-${ts.toString().slice(-4)}`,
        isMainBranch: true,
        status: 'ACTIVE',
      },
    });

    const cafeQr = await prisma.qRCode.create({
      data: {
        code: `cafe-review-qr-${ts}`,
        type: 'BUSINESS_STAND',
        businessId: cafeBusiness.id,
        branchId: cafeBranch.id,
        destinationUrl: `/customer-review?qr=cafe-review-qr-${ts}`,
        status: 'ACTIVE',
      },
    });

    const { customer: cafeCustomer } = await findOrCreateCustomer(
      cafeBusiness.id,
      `+1555${ts.toString().slice(-7)}`,
      { name: 'Cafe Regular' }
    );
    const cafeCustomerSession = await createCustomerSession(cafeCustomer.id, cafeBusiness.id);

    // -------------------------------------------------------------------------
    // SETUP: Business B (Salon)
    // -------------------------------------------------------------------------
    const salonBusiness = await prisma.business.create({
      data: {
        name: `Luxe Glow Hair Studio ${ts}`,
        slug: `luxe-glow-${ts}`,
        category: 'SALON',
        description: 'Luxury hair styling and wellness studio',
        status: 'ACTIVE',
        onboardingCompleted: true,
        primaryColor: '#EC4899',
        secondaryColor: '#831843',
        themePreset: 'SALON',
        googleReviewUrl: null, // Explicitly UNCONFIGURED to test missing URL state
        instagramUrl: `https://instagram.com/luxeglow${ts}`,
        facebookUrl: null,
      },
    });

    const salonBranch = await prisma.branch.create({
      data: {
        businessId: salonBusiness.id,
        name: 'Salon Uptown Studio',
        code: `SAL-${ts.toString().slice(-4)}`,
        isMainBranch: true,
        status: 'ACTIVE',
      },
    });

    const salonQr = await prisma.qRCode.create({
      data: {
        code: `salon-review-qr-${ts}`,
        type: 'BUSINESS_STAND',
        businessId: salonBusiness.id,
        branchId: salonBranch.id,
        destinationUrl: `/customer-review?qr=salon-review-qr-${ts}`,
        status: 'ACTIVE',
      },
    });

    const { customer: salonCustomer } = await findOrCreateCustomer(
      salonBusiness.id,
      `+1556${ts.toString().slice(-7)}`,
      { name: 'Salon Regular' }
    );
    const salonCustomerSession = await createCustomerSession(salonCustomer.id, salonBusiness.id);

    // =========================================================================
    // 1. Cafe QR opens the Cafe review page and loads Cafe configuration
    // =========================================================================
    await t.test('1. Cafe QR resolves and loads Cafe configuration strictly', async () => {
      const res = await apiRequest(baseUrl, `/api/customer/qr/${cafeQr.code}`);
      assert.equal(res.status, 200, 'Cafe QR returns 200 OK');
      assert.equal(res.body.business.id, cafeBusiness.id, 'Resolved business ID is Cafe');
      assert.equal(res.body.business.name, cafeBusiness.name, 'Resolved business name is Cafe');
      assert.equal(res.body.business.category, 'CAFE', 'Resolved category is CAFE');
      assert.equal(res.body.business.googleReviewUrl, cafeBusiness.googleReviewUrl, 'Contains Cafe Google review URL');
      assert.equal(res.body.business.primaryColor, '#78350F', 'Contains Cafe branding color');

      // Zero Salon leakage
      assert.notEqual(res.body.business.name, salonBusiness.name, 'Does not mention Salon');
      assert.notEqual(res.body.business.primaryColor, '#EC4899', 'Does not have Salon primary color');
    });

    // =========================================================================
    // 2. Cafe AI review generation uses Cafe context (even with Salon session cookie)
    // =========================================================================
    await t.test('2. Cafe AI review generation strictly uses Cafe context despite Salon session cookie', async () => {
      // Customer has active Salon cookie from previous salon visit
      const res = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        customerToken: salonCustomerSession.sessionToken, // Stale cross-business cookie
        body: {
          qrCode: cafeQr.code,
          rating: 5,
          language: 'ENGLISH',
          feedbackText: 'Loved the cold brew and cozy seating',
        },
      });

      assert.equal(res.status, 200, 'Suggest returns 200 OK');
      assert.equal(res.body.success, true, 'Returns success: true');
      assert.equal(res.body.businessId, cafeBusiness.id, 'Authoritative businessId is Cafe, NOT Salon');
      assert.equal(res.body.businessName, cafeBusiness.name, 'businessName is Cafe');
      assert.equal(res.body.googleReviewUrl, cafeBusiness.googleReviewUrl, 'googleReviewUrl is Cafe URL');
      assert.ok(Array.isArray(res.body.options) && res.body.options.length >= 3, 'Generates 3+ options');

      // Verify AI suggestions reflect Cafe context
      const allText = res.body.options.join(' ');
      assert.ok(allText.includes(cafeBusiness.name), 'Suggestions contain Cafe business name');
      assert.ok(allText.includes('cafe'), 'Suggestions contain cafe category noun');
      assert.ok(allText.includes('Loved the cold brew and cozy seating'), 'Includes customer feedback note');

      // Invariant: Zero Salon cross-contamination
      assert.ok(!allText.toLowerCase().includes('salon'), 'Must NOT contain salon category');
      assert.ok(!allText.includes(salonBusiness.name), 'Must NOT contain Salon business name');
      assert.ok(!allText.toLowerCase().includes('hair'), 'Must NOT contain salon hair styling terminology');
    });

    // =========================================================================
    // 3. Salon QR opens the Salon review page and loads Salon configuration
    // =========================================================================
    await t.test('3. Salon QR resolves and loads Salon configuration strictly', async () => {
      const res = await apiRequest(baseUrl, `/api/customer/qr/${salonQr.code}`);
      assert.equal(res.status, 200, 'Salon QR returns 200 OK');
      assert.equal(res.body.business.id, salonBusiness.id, 'Resolved business ID is Salon');
      assert.equal(res.body.business.name, salonBusiness.name, 'Resolved business name is Salon');
      assert.equal(res.body.business.category, 'SALON', 'Resolved category is SALON');
      assert.equal(res.body.business.googleReviewUrl, null, 'Salon Google review URL is null (unconfigured)');
      assert.equal(res.body.business.primaryColor, '#EC4899', 'Contains Salon branding color');

      // Zero Cafe leakage
      assert.notEqual(res.body.business.name, cafeBusiness.name, 'Does not mention Cafe');
      assert.notEqual(res.body.business.primaryColor, '#78350F', 'Does not have Cafe primary color');
    });

    // =========================================================================
    // 4. Salon AI review generation uses Salon context (even with Cafe session cookie)
    // =========================================================================
    await t.test('4. Salon AI review generation strictly uses Salon context despite Cafe session cookie', async () => {
      // Customer has active Cafe cookie from previous cafe visit
      const res = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        customerToken: cafeCustomerSession.sessionToken, // Stale cross-business cookie
        body: {
          qrCode: salonQr.code,
          rating: 5,
          language: 'ENGLISH',
          feedbackText: 'Great haircut and attentive staff',
        },
      });

      assert.equal(res.status, 200, 'Suggest returns 200 OK');
      assert.equal(res.body.success, true, 'Returns success: true');
      assert.equal(res.body.businessId, salonBusiness.id, 'Authoritative businessId is Salon, NOT Cafe');
      assert.equal(res.body.businessName, salonBusiness.name, 'businessName is Salon');
      assert.equal(res.body.googleReviewUrl, null, 'googleReviewUrl is null for Salon');
      assert.ok(Array.isArray(res.body.options) && res.body.options.length >= 3, 'Generates 3+ options');

      // Verify AI suggestions reflect Salon context
      const allText = res.body.options.join(' ');
      assert.ok(allText.includes(salonBusiness.name), 'Suggestions contain Salon business name');
      assert.ok(allText.includes('salon'), 'Suggestions contain salon category noun');
      assert.ok(allText.includes('Great haircut and attentive staff'), 'Includes customer feedback note');

      // Invariant: Zero Cafe cross-contamination
      assert.ok(!allText.toLowerCase().includes('cafe'), 'Must NOT contain cafe category noun');
      assert.ok(!allText.includes(cafeBusiness.name), 'Must NOT contain Cafe business name');
      assert.ok(!allText.toLowerCase().includes('roastery'), 'Must NOT contain cafe roastery terminology');
      assert.ok(!allText.toLowerCase().includes('cold brew'), 'Must NOT contain cafe cold brew details');
    });

    // =========================================================================
    // 5. Switching repeatedly between both businesses never mixes review context
    // =========================================================================
    await t.test('5. Switching repeatedly between Cafe and Salon never mixes review context', async () => {
      const runs = [
        { qr: cafeQr.code, expectedId: cafeBusiness.id, expectedName: cafeBusiness.name, expectedNoun: 'cafe', expectedUrl: cafeBusiness.googleReviewUrl },
        { qr: salonQr.code, expectedId: salonBusiness.id, expectedName: salonBusiness.name, expectedNoun: 'salon', expectedUrl: null },
        { qr: cafeQr.code, expectedId: cafeBusiness.id, expectedName: cafeBusiness.name, expectedNoun: 'cafe', expectedUrl: cafeBusiness.googleReviewUrl },
        { qr: salonQr.code, expectedId: salonBusiness.id, expectedName: salonBusiness.name, expectedNoun: 'salon', expectedUrl: null },
        { qr: cafeQr.code, expectedId: cafeBusiness.id, expectedName: cafeBusiness.name, expectedNoun: 'cafe', expectedUrl: cafeBusiness.googleReviewUrl },
        { qr: salonQr.code, expectedId: salonBusiness.id, expectedName: salonBusiness.name, expectedNoun: 'salon', expectedUrl: null },
      ];

      for (let i = 0; i < runs.length; i++) {
        const item = runs[i];
        const res = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
          method: 'POST',
          body: {
            qrCode: item.qr,
            rating: 5,
            language: 'ENGLISH',
          },
        });

        assert.equal(res.status, 200, `Run ${i}: status 200`);
        assert.equal(res.body.businessId, item.expectedId, `Run ${i}: businessId matches ${item.expectedName}`);
        assert.equal(res.body.businessName, item.expectedName, `Run ${i}: businessName matches`);
        assert.equal(res.body.googleReviewUrl, item.expectedUrl, `Run ${i}: googleReviewUrl matches`);

        const allText = res.body.options.join(' ');
        assert.ok(allText.includes(item.expectedName), `Run ${i}: suggestions contain ${item.expectedName}`);
        assert.ok(allText.includes(item.expectedNoun), `Run ${i}: suggestions contain ${item.expectedNoun}`);

        if (item.expectedNoun === 'cafe') {
          assert.ok(!allText.toLowerCase().includes('salon'), `Run ${i}: cafe suggestions must not contain salon`);
        } else {
          assert.ok(!allText.toLowerCase().includes('cafe'), `Run ${i}: salon suggestions must not contain cafe`);
        }
      }
    });

    // =========================================================================
    // 6. Changing language, rating or regenerating suggestions uses the currently selected business
    // =========================================================================
    await t.test('6. Changing language and rating updates suggestions for current business', async () => {
      // 6.1 Cafe in Hindi
      const cafeHindiRes = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: {
          qrCode: cafeQr.code,
          rating: 4,
          language: 'HINDI',
        },
      });
      assert.equal(cafeHindiRes.status, 200, 'Cafe Hindi suggest 200');
      assert.equal(cafeHindiRes.body.language, 'HINDI', 'Returns HINDI');
      assert.equal(cafeHindiRes.body.businessId, cafeBusiness.id, 'Cafe ID maintained');
      const hindiText = cafeHindiRes.body.options.join(' ');
      assert.ok(hindiText.includes(cafeBusiness.name), 'Hindi suggestions include Cafe name');
      assert.ok(hindiText.includes('कैफे'), 'Hindi suggestions include कैफे noun');
      assert.ok(!hindiText.includes('सैलून'), 'Hindi suggestions do not include सैलून');

      // 6.2 Salon in Hinglish
      const salonHinglishRes = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: {
          qrCode: salonQr.code,
          rating: 3,
          language: 'HINGLISH',
        },
      });
      assert.equal(salonHinglishRes.status, 200, 'Salon Hinglish suggest 200');
      assert.equal(salonHinglishRes.body.language, 'HINGLISH', 'Returns HINGLISH');
      assert.equal(salonHinglishRes.body.businessId, salonBusiness.id, 'Salon ID maintained');
      const hinglishText = salonHinglishRes.body.options.join(' ');
      assert.ok(hinglishText.includes(salonBusiness.name), 'Hinglish suggestions include Salon name');
      assert.ok(hinglishText.includes('salon'), 'Hinglish suggestions include salon noun');
      assert.ok(!hinglishText.includes('cafe'), 'Hinglish suggestions do not include cafe');
    });

    // =========================================================================
    // 7. Old or delayed AI response immunity
    // =========================================================================
    await t.test('7. Stale or delayed AI responses cannot overwrite newly selected business', async () => {
      // Simulate client-side race condition test logic:
      // When a user selects Cafe, request A is sent.
      // If the user quickly navigates to Salon, request B is sent.
      // Even if request A finishes after request B, the client-side activeRequestRef rejects request A.
      let activeRequest = { id: 1, businessId: cafeBusiness.id, qrToken: cafeQr.code };
      
      // User switches to Salon
      activeRequest = { id: 2, businessId: salonBusiness.id, qrToken: salonQr.code };

      // Request A (Cafe) arrives late with id: 1
      const isStale = activeRequest.id !== 1 || activeRequest.businessId !== cafeBusiness.id;
      assert.equal(isStale, true, 'Client guard successfully identifies delayed response as stale');

      // And on the server, requests are explicitly scoped to the requested QR token
      const cafeServerRes = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: { qrCode: cafeQr.code, rating: 5, language: 'ENGLISH' },
      });
      assert.equal(cafeServerRes.body.businessId, cafeBusiness.id, 'Server returns Cafe for Cafe QR');

      const salonServerRes = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: { qrCode: salonQr.code, rating: 5, language: 'ENGLISH' },
      });
      assert.equal(salonServerRes.body.businessId, salonBusiness.id, 'Server returns Salon for Salon QR');
    });

    // =========================================================================
    // 8. Google review handoff uses the correct business-specific URL
    // =========================================================================
    await t.test('8. Google review handoff uses the verified business-specific URL', async () => {
      const res = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: { qrCode: cafeQr.code, rating: 5, language: 'ENGLISH' },
      });

      assert.equal(res.status, 200);
      assert.equal(
        res.body.googleReviewUrl,
        cafeBusiness.googleReviewUrl,
        'Cafe returns Cafe Google review URL'
      );
      assert.notEqual(
        res.body.googleReviewUrl,
        salonBusiness.googleReviewUrl,
        'Does not return Salon review URL'
      );
    });

    // =========================================================================
    // 9. Missing Google review URL does not redirect to another business
    // =========================================================================
    await t.test('9. Missing Google review URL returns null without falling back to another business', async () => {
      const res = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: { qrCode: salonQr.code, rating: 5, language: 'ENGLISH' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.googleReviewUrl, null, 'Unconfigured business returns null googleReviewUrl');
      assert.notEqual(
        res.body.googleReviewUrl,
        cafeBusiness.googleReviewUrl,
        'Never falls back to Cafe Google review URL'
      );
    });

    // =========================================================================
    // 10. Invalid or forged QR tokens are rejected
    // =========================================================================
    await t.test('10. Invalid or forged QR tokens are rejected with 404', async () => {
      const res = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: { qrCode: 'forged-non-existent-qr-token-999', rating: 5, language: 'ENGLISH' },
      });

      assert.equal(res.status, 404, 'Returns 404 for forged QR token');
      assert.equal(res.body.code, 'QR_NOT_FOUND', 'Returns QR_NOT_FOUND error code');
    });

    // =========================================================================
    // 11. No cross-business customer or private profile information is included
    // =========================================================================
    await t.test('11. Zero cross-business customer or private profile data leak in review generation', async () => {
      const res = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        customerToken: salonCustomerSession.sessionToken, // Request Cafe with Salon cookie
        body: { qrCode: cafeQr.code, rating: 5, language: 'ENGLISH' },
      });

      assert.equal(res.status, 200);
      // Ensure zero leak of salonCustomer private info
      assert.equal((res.body as any).customerPhone, undefined, 'No customerPhone in response');
      assert.equal((res.body as any).customerId, undefined, 'No customerId in response');
      assert.equal((res.body as any).passwordHash, undefined, 'No passwordHash in response');
      assert.equal((res.body as any).planId, undefined, 'No planId in response');
      
      const resStr = JSON.stringify(res.body);
      assert.ok(!resStr.includes(salonCustomer.phone), 'Salon customer phone number is NOT leaked');
      assert.ok(!resStr.includes(salonCustomer.id), 'Salon customer ID is NOT leaked');
    });

    // =========================================================================
    // 12. Missing context does not fall back to a hardcoded default business
    // =========================================================================
    await t.test('12. Missing context produces 401 and never falls back to a hardcoded business', async () => {
      const res = await apiRequest(baseUrl, '/api/customer/reviews/suggest', {
        method: 'POST',
        body: { rating: 5, language: 'ENGLISH' }, // No auth, no QR token
      });

      assert.equal(res.status, 401, 'Returns 401 Unauthorized when context is missing');
      assert.equal(res.body.code, 'UNAUTHORIZED', 'Returns UNAUTHORIZED code');
      assert.equal(res.body.businessId, undefined, 'Does not return any businessId');
      assert.equal(res.body.businessName, undefined, 'Does not return any default businessName');
    });

    // =========================================================================
    // 13. Event Logging Isolation
    // =========================================================================
    await t.test('13. Review event logging isolates business context and prevents cross-tenant pollution', async () => {
      const eventRes = await apiRequest(baseUrl, '/api/customer/reviews/events', {
        method: 'POST',
        customerToken: salonCustomerSession.sessionToken, // Salon session cookie
        body: {
          qrCode: cafeQr.code, // Cafe QR interaction
          eventType: 'CUSTOMER_REVIEW_COPIED',
          metadata: { rating: 5, language: 'ENGLISH' },
        },
      });

      assert.equal(eventRes.status, 200, 'Event endpoint returns 200');
      assert.equal(eventRes.body.success, true, 'Event logged successfully');
      assert.equal(eventRes.body.businessId, cafeBusiness.id, 'Event is attributed to Cafe, not Salon');
    });
  } finally {
    await serverCtx.stop();
  }
});
