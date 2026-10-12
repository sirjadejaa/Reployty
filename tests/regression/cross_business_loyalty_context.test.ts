import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/server/db/client';
import { startTestServer } from '../e2e/test_helpers';
import { upsertLoyaltyProgram } from '../../src/server/services/loyaltyService';
import { TenantContext } from '../../src/server/auth/tenantContext';

test('REGRESSION: Cross-Business Loyalty Card Context Isolation', async (t) => {
  const serverCtx = await startTestServer();
  const baseUrl = serverCtx.baseUrl;
  const ts = Date.now();

  try {
    // -------------------------------------------------------------------------
    // SETUP: Business A (Cafe - Stamp Program)
    // -------------------------------------------------------------------------
    const cafeBusiness = await prisma.business.create({
      data: {
        name: `Sunrise Artisan Cafe ${ts}`,
        slug: `sunrise-cafe-${ts}`,
        category: 'CAFE',
        status: 'ACTIVE',
        onboardingCompleted: true,
        primaryColor: '#78350F',
        secondaryColor: '#F59E0B',
        themePreset: 'CAFE',
      },
    });

    const cafeBranch = await prisma.branch.create({
      data: {
        businessId: cafeBusiness.id,
        name: 'Main Roastery',
        code: `CAF-${ts.toString().slice(-4)}`,
        isMainBranch: true,
        status: 'ACTIVE',
      },
    });

    const cafeOwner = await prisma.user.create({
      data: {
        email: `cafe.owner.${ts}@example.com`,
        name: 'Cafe Owner',
        passwordHash: 'dummy',
        status: 'ACTIVE',
      },
    });

    const roleOwner = await prisma.role.findFirst({ where: { name: 'OWNER' } });
    await prisma.staffMembership.create({
      data: {
        businessId: cafeBusiness.id,
        userId: cafeOwner.id,
        branchId: cafeBranch.id,
        roleId: roleOwner!.id,
        status: 'ACTIVE',
      },
    });

    const cafeTenantCtx: TenantContext = {
      user: { id: cafeOwner.id, email: cafeOwner.email, name: cafeOwner.name, isSuperAdmin: false },
      userId: cafeOwner.id,
      userEmail: cafeOwner.email,
      userName: cafeOwner.name,
      isSuperAdmin: false,
      businessId: cafeBusiness.id,
      businessName: cafeBusiness.name,
      businessCategory: 'CAFE',
      roleName: 'OWNER',
      permissions: new Set(['*']),
      hasPermission: () => true,
      isOwner: true,
    } as any;

    await upsertLoyaltyProgram(cafeTenantCtx, {
      name: 'Cafe Stamp Club',
      type: 'STAMP',
      targetStamps: 8,
      rewardTitle: 'Free Signature Espresso',
      status: 'ACTIVE',
    });

    const cafeQrToken = `cafe-qr-${ts}`;
    await prisma.qRCode.create({
      data: {
        businessId: cafeBusiness.id,
        branchId: cafeBranch.id,
        code: cafeQrToken,
        type: 'BRANCH_COUNTER',
        status: 'ACTIVE',
        destinationUrl: `https://reployty.com/join/${cafeQrToken}`,
      },
    });

    // -------------------------------------------------------------------------
    // SETUP: Business B (Salon - Points Program)
    // -------------------------------------------------------------------------
    const salonBusiness = await prisma.business.create({
      data: {
        name: `Luxe Glow Salon ${ts}`,
        slug: `luxe-salon-${ts}`,
        category: 'SALON',
        status: 'ACTIVE',
        onboardingCompleted: true,
        primaryColor: '#831843',
        secondaryColor: '#EC4899',
        themePreset: 'SALON',
      },
    });

    const salonBranch = await prisma.branch.create({
      data: {
        businessId: salonBusiness.id,
        name: 'Styling Studio',
        code: `SAL-${ts.toString().slice(-4)}`,
        isMainBranch: true,
        status: 'ACTIVE',
      },
    });

    const salonOwner = await prisma.user.create({
      data: {
        email: `salon.owner.${ts}@example.com`,
        name: 'Salon Owner',
        passwordHash: 'dummy',
        status: 'ACTIVE',
      },
    });

    await prisma.staffMembership.create({
      data: {
        businessId: salonBusiness.id,
        userId: salonOwner.id,
        branchId: salonBranch.id,
        roleId: roleOwner!.id,
        status: 'ACTIVE',
      },
    });

    const salonTenantCtx: TenantContext = {
      user: { id: salonOwner.id, email: salonOwner.email, name: salonOwner.name, isSuperAdmin: false },
      userId: salonOwner.id,
      userEmail: salonOwner.email,
      userName: salonOwner.name,
      isSuperAdmin: false,
      businessId: salonBusiness.id,
      businessName: salonBusiness.name,
      businessCategory: 'SALON',
      roleName: 'OWNER',
      permissions: new Set(['*']),
      hasPermission: () => true,
      isOwner: true,
    } as any;

    await upsertLoyaltyProgram(salonTenantCtx, {
      name: 'Salon VIP Rewards',
      type: 'POINTS',
      pointsPerDollar: 10,
      redemptionPoints: 500,
      rewardTitle: '20% Off Styling Session',
      status: 'ACTIVE',
    });

    const salonQrToken = `salon-qr-${ts}`;
    await prisma.qRCode.create({
      data: {
        businessId: salonBusiness.id,
        branchId: salonBranch.id,
        code: salonQrToken,
        type: 'BRANCH_COUNTER',
        status: 'ACTIVE',
        destinationUrl: `https://reployty.com/join/${salonQrToken}`,
      },
    });

    const sharedPhone = '+15559871234';
    let cafeSessionToken = '';
    let salonSessionToken = '';

    // -------------------------------------------------------------------------
    // 1. CAFE FLOW
    // -------------------------------------------------------------------------
    await t.test('1. Cafe QR scan, landing, registration, and loyalty card', async () => {
      // Step 1: Scan Cafe QR & resolve business
      const resolveRes = await fetch(`${baseUrl}/api/customer/qr/${cafeQrToken}`);
      assert.equal(resolveRes.status, 200);
      const resolveData = await resolveRes.json();
      assert.equal(resolveData.business.id, cafeBusiness.id);
      assert.equal(resolveData.business.name, cafeBusiness.name);

      // Step 2: Request OTP & register customer for Cafe
      const otpReqRes = await fetch(`${baseUrl}/api/customer/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: cafeBusiness.id, phone: sharedPhone }),
      });
      assert.equal(otpReqRes.status, 200);
      const otpReqData = await otpReqRes.json();
      const devOtp = otpReqData.devOtp || '123456';

      // Step 3: Verify OTP and create Cafe session
      const verifyRes = await fetch(`${baseUrl}/api/customer/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: cafeBusiness.id,
          phone: sharedPhone,
          code: devOtp,
          name: 'Alice Customer',
        }),
      });
      assert.equal(verifyRes.status, 200);
      const verifyData = await verifyRes.json();
      cafeSessionToken = verifyData.sessionToken;
      assert.ok(cafeSessionToken, 'Cafe session token must be returned');

      // Step 4: Claim QR visit earning for Cafe
      const claimRes = await fetch(`${baseUrl}/api/customer/qr/claim-earning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cafeSessionToken}`,
        },
        body: JSON.stringify({
          qrCode: cafeQrToken,
          idempotencyKey: `cafe_visit_${ts}`,
        }),
      });
      assert.equal(claimRes.status, 200);
      const claimData = await claimRes.json();
      assert.equal(claimData.earnedType, 'STAMP');
      assert.equal(claimData.newStamps, 1);

      // Step 5: Open Cafe loyalty card
      const loyaltyRes = await fetch(`${baseUrl}/api/customer/loyalty?qr=${cafeQrToken}`, {
        headers: {
          'Authorization': `Bearer ${cafeSessionToken}`,
          'Cookie': `reployty_customer_session=${cafeSessionToken}`,
        },
      });
      assert.equal(loyaltyRes.status, 200);
      const loyaltyData = await loyaltyRes.json();

      // Assertions for Cafe card
      assert.equal(loyaltyData.business.id, cafeBusiness.id);
      assert.equal(loyaltyData.business.name, cafeBusiness.name);
      assert.equal(loyaltyData.program.name, 'Cafe Stamp Club');
      assert.equal(loyaltyData.program.type, 'STAMP');
      assert.equal(loyaltyData.program.targetStamps, 8);
      assert.equal(loyaltyData.program.rewardTitle, 'Free Signature Espresso');
      assert.equal(loyaltyData.card.stampsCollected, 1);
      assert.equal(loyaltyData.customer.name, 'Alice Customer');
      assert.equal(loyaltyData.isEnrolled, true);
    });

    // -------------------------------------------------------------------------
    // 2. SALON FLOW (Context Isolation: Cafe session must NOT leak into Salon)
    // -------------------------------------------------------------------------
    await t.test('2. Salon QR scan shows Salon branding and unenrolled preview without Cafe leakage', async () => {
      // Step 1: Scan Salon QR & resolve business
      const resolveRes = await fetch(`${baseUrl}/api/customer/qr/${salonQrToken}`);
      assert.equal(resolveRes.status, 200);
      const resolveData = await resolveRes.json();
      assert.equal(resolveData.business.id, salonBusiness.id);
      assert.equal(resolveData.business.name, salonBusiness.name);

      // Step 2: Open Salon landing / me endpoint with Cafe session cookie
      // The server MUST NOT return Cafe customer profile for Salon QR!
      const meRes = await fetch(`${baseUrl}/api/customer/me?qr=${salonQrToken}`, {
        headers: {
          // Cafe cookie sent (mimics browser carrying single origin cookie)
          'Cookie': `reployty_customer_session=${cafeSessionToken}`,
        },
      });
      assert.equal(meRes.status, 200);
      const meData = await meRes.json();

      // Verify business is Salon, but customer is NOT authenticated for Salon
      assert.equal(meData.business.id, salonBusiness.id);
      assert.equal(meData.business.name, salonBusiness.name);
      assert.equal(meData.isAuthenticated, false);
      assert.equal(meData.isEnrolled, false);
      assert.equal(meData.customer, null);

      // Step 3: Open Salon loyalty card while having Cafe cookie
      const loyaltyRes = await fetch(`${baseUrl}/api/customer/loyalty?qr=${salonQrToken}`, {
        headers: {
          'Cookie': `reployty_customer_session=${cafeSessionToken}`,
        },
      });
      assert.equal(loyaltyRes.status, 200);
      const loyaltyData = await loyaltyRes.json();

      // Crucial: Must be Salon's loyalty program, in UNENROLLED state
      assert.equal(loyaltyData.business.id, salonBusiness.id);
      assert.equal(loyaltyData.business.name, salonBusiness.name);
      assert.equal(loyaltyData.program.name, 'Salon VIP Rewards');
      assert.equal(loyaltyData.program.type, 'POINTS');
      assert.equal(loyaltyData.program.rewardTitle, '20% Off Styling Session');
      assert.equal(loyaltyData.isEnrolled, false);
      assert.equal(loyaltyData.requiresEnrollment, true);

      // Crucial anti-leakage assertion: No Cafe data, no card, no customer profile
      assert.equal(loyaltyData.customer, null);
      assert.equal(loyaltyData.card, null);
      assert.equal(loyaltyData.recentTransactions.length, 0);
    });

    // -------------------------------------------------------------------------
    // 3. CROSS-BUSINESS REGISTRATION & MULTI-TENANT MEMBERSHIPS
    // -------------------------------------------------------------------------
    await t.test('3. Register same phone at Salon, maintaining separate memberships & balances', async () => {
      // Step 1: Register shared phone at Salon
      const otpReqRes = await fetch(`${baseUrl}/api/customer/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: salonBusiness.id, phone: sharedPhone }),
      });
      assert.equal(otpReqRes.status, 200);
      const otpReqData = await otpReqRes.json();
      const devOtp = otpReqData.devOtp || '123456';

      const verifyRes = await fetch(`${baseUrl}/api/customer/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: salonBusiness.id,
          phone: sharedPhone,
          code: devOtp,
          name: 'Alice Salon Member',
        }),
      });
      assert.equal(verifyRes.status, 200);
      const verifyData = await verifyRes.json();
      salonSessionToken = verifyData.sessionToken;
      assert.ok(salonSessionToken, 'Salon session token must be returned');

      // Verify that database holds two distinct customer records for the two businesses
      const cafeDbCustomer = await prisma.customer.findFirst({
        where: { businessId: cafeBusiness.id, phone: sharedPhone },
      });
      const salonDbCustomer = await prisma.customer.findFirst({
        where: { businessId: salonBusiness.id, phone: sharedPhone },
      });
      assert.ok(cafeDbCustomer, 'Cafe customer record exists');
      assert.ok(salonDbCustomer, 'Salon customer record exists');
      assert.notEqual(cafeDbCustomer.id, salonDbCustomer.id, 'Customer records must have distinct IDs per business');

      // Step 2: Claim visit earning at Salon
      const claimRes = await fetch(`${baseUrl}/api/customer/qr/claim-earning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${salonSessionToken}`,
        },
        body: JSON.stringify({
          qrCode: salonQrToken,
          idempotencyKey: `salon_visit_${ts}`,
        }),
      });
      assert.equal(claimRes.status, 200);
      const claimData = await claimRes.json();
      assert.equal(claimData.earnedType, 'POINTS');
      assert.ok(claimData.deltaPoints > 0, 'Salon visit earned points');

      // Step 3: Fetch Cafe card with Cafe token -> displays Cafe stamps
      const cafeLoyaltyRes = await fetch(`${baseUrl}/api/customer/loyalty?qr=${cafeQrToken}`, {
        headers: {
          'Authorization': `Bearer ${cafeSessionToken}`,
        },
      });
      assert.equal(cafeLoyaltyRes.status, 200);
      const cafeData = await cafeLoyaltyRes.json();
      assert.equal(cafeData.business.id, cafeBusiness.id);
      assert.equal(cafeData.program.type, 'STAMP');
      assert.equal(cafeData.card.stampsCollected, 1);
      assert.equal(cafeData.card.pointsBalance, 0);

      // Step 4: Fetch Salon card with Salon token -> displays Salon points
      const salonLoyaltyRes = await fetch(`${baseUrl}/api/customer/loyalty?qr=${salonQrToken}`, {
        headers: {
          'Authorization': `Bearer ${salonSessionToken}`,
        },
      });
      assert.equal(salonLoyaltyRes.status, 200);
      const salonData = await salonLoyaltyRes.json();
      assert.equal(salonData.business.id, salonBusiness.id);
      assert.equal(salonData.program.type, 'POINTS');
      assert.ok(salonData.card.pointsBalance > 0, 'Salon points balance is active');
      assert.equal(salonData.card.stampsCollected, 0);
    });

    // -------------------------------------------------------------------------
    // 4. REPEATED SWITCHING BETWEEN CAFE & SALON JOURNEYS
    // -------------------------------------------------------------------------
    await t.test('4. Repeated switching between Cafe and Salon QR journeys produces correct card every time', async () => {
      for (let i = 0; i < 4; i++) {
        // Cafe Check
        const cafeRes = await fetch(`${baseUrl}/api/customer/loyalty?qr=${cafeQrToken}`, {
          headers: { 'Authorization': `Bearer ${cafeSessionToken}` },
        });
        const cafeJson = await cafeRes.json();
        assert.equal(cafeJson.business.id, cafeBusiness.id);
        assert.equal(cafeJson.program.name, 'Cafe Stamp Club');
        assert.equal(cafeJson.card.stampsCollected, 1);

        // Salon Check
        const salonRes = await fetch(`${baseUrl}/api/customer/loyalty?qr=${salonQrToken}`, {
          headers: { 'Authorization': `Bearer ${salonSessionToken}` },
        });
        const salonJson = await salonRes.json();
        assert.equal(salonJson.business.id, salonBusiness.id);
        assert.equal(salonJson.program.name, 'Salon VIP Rewards');
        assert.ok(salonJson.card.pointsBalance > 0);
      }
    });

    // -------------------------------------------------------------------------
    // 5. SECURITY & TENANT ENFORCEMENT
    // -------------------------------------------------------------------------
    await t.test('5. Manipulated/forged tokens cannot expose another business data', async () => {
      // Trying to access Cafe card using Salon session token:
      // The server must reject cross-tenant session reuse and return unenrolled preview
      const mismatchRes = await fetch(`${baseUrl}/api/customer/loyalty?qr=${cafeQrToken}`, {
        headers: {
          'Authorization': `Bearer ${salonSessionToken}`,
        },
      });
      assert.equal(mismatchRes.status, 200);
      const mismatchData = await mismatchRes.json();

      // Verified: Returns Cafe program preview, but customer data is NULL
      assert.equal(mismatchData.business.id, cafeBusiness.id);
      assert.equal(mismatchData.isEnrolled, false);
      assert.equal(mismatchData.customer, null);
      assert.equal(mismatchData.card, null);

      // Manipulated QR token (non-existent QR)
      const fakeQrRes = await fetch(`${baseUrl}/api/customer/loyalty?qr=non-existent-qr-token`, {
        headers: {
          'Authorization': `Bearer ${cafeSessionToken}`,
        },
      });
      assert.equal(fakeQrRes.status, 404);
    });
  } finally {
    await serverCtx.stop();
  }
});
