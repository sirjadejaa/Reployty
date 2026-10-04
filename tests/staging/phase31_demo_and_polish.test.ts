import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { seedDemo, cleanDemo } from '../../prisma/demoSeed';
import { resolvePublicQr } from '../../src/server/services/customerPwaService';

test('PHASE 31: DEMO READINESS, SIMULATION & POLISH TEST SUITE', async (t) => {
  let serverCtx: TestServerContext;

  t.before(async () => {
    serverCtx = await startTestServer();
  });

  t.after(async () => {
    // Ensure demo records are cleaned up after tests
    await cleanDemo();
    await serverCtx.stop();
  });


  await t.test('1. Demo Seeding idempotently provisions Demo Café and Demo Salon', async () => {
    // Run seed
    await seedDemo();

    // Verify Demo Café exists
    const cafe = await prisma.business.findUnique({
      where: { slug: 'demo-cafe' },
      include: {
        branches: true,
        loyaltyPrograms: true,
        rewards: true,
        qrCodes: true,
        staff: { include: { user: true, role: true } },
      },
    });

    assert.ok(cafe, 'Demo Café must exist in database');
    assert.equal(cafe.name, 'Demo Café');
    assert.equal(cafe.category, 'CAFE');
    assert.equal(cafe.primaryColor, '#B45309');
    assert.ok(cafe.branches.length >= 1, 'Should have at least 1 branch');
    assert.ok(cafe.loyaltyPrograms.length >= 1, 'Should have at least 1 loyalty program');
    assert.ok(cafe.rewards.length >= 2, 'Should have at least 2 reward catalog items');
    assert.ok(cafe.qrCodes.some(q => q.code === 'demo-cafe-stand'), 'Should have demo-cafe-stand QR code');

    // Verify Demo Salon exists
    const salon = await prisma.business.findUnique({
      where: { slug: 'demo-salon' },
      include: {
        branches: true,
        qrCodes: true,
      },
    });

    assert.ok(salon, 'Demo Salon must exist in database');
    assert.equal(salon.category, 'SALON');
    assert.equal(salon.primaryColor, '#DB2777');

    // Verify Synthetic Customer Alex Rivera
    const alex = await prisma.customer.findFirst({
      where: {
        businessId: cafe.id,
        phone: '+15550100001',
      },
      include: {
        loyaltyCards: true,
        rewardRedemptions: true,
      },
    });

    assert.ok(alex, 'Synthetic customer Alex Rivera must exist');
    assert.equal(alex.loyaltyCards[0]?.stampsCollected, 4, 'Alex should have 4 stamps pre-collected');
    assert.ok(
      alex.rewardRedemptions.some(r => r.redemptionCode === 'DEMO-FREE-BREW'),
      'Should have pre-staged DEMO-FREE-BREW redemption voucher'
    );
  });

  await t.test('2. Public Customer QR resolves correctly for Demo Café', async () => {
    const resolution = await resolvePublicQr('demo-cafe-stand');

    assert.equal(resolution.business.name, 'Demo Café');
    assert.equal(resolution.business.category, 'CAFE');
    assert.equal(resolution.business.primaryColor, '#B45309');
    assert.equal(resolution.branch?.name, 'Downtown Roastery');
    assert.equal(resolution.qrCode.code, 'demo-cafe-stand');
  });

  await t.test('3. Cashier Terminal verifies and executes redemption of DEMO-FREE-BREW', async () => {
    const cafe = await prisma.business.findUniqueOrThrow({ where: { slug: 'demo-cafe' } });
    const cashierUser = await prisma.user.findUniqueOrThrow({ where: { email: 'cashier.cafe@reployty.test' } });

    // Create session for cashier
    const sessionToken = 'test-token-cashier-' + Date.now();
    await prisma.session.create({
      data: {
        userId: cashierUser.id,
        sessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const requestOptions = {
      token: sessionToken,
      headers: {
        'x-business-id': cafe.id,
      },
    };

    // 1. Verify / Lookup Code
    const lookupRes = await apiRequest(
      serverCtx.baseUrl,
      '/api/business/redemptions/lookup/DEMO-FREE-BREW',
      {
        method: 'GET',
        ...requestOptions,
      }
    );

    assert.equal(lookupRes.status, 200);
    assert.equal(lookupRes.body.isValid, true);
    assert.equal(lookupRes.body.redemption?.redemptionCode, 'DEMO-FREE-BREW');

    // 2. Complete Redemption
    const completeRes = await apiRequest(
      serverCtx.baseUrl,
      '/api/business/redemptions/validate',
      {
        method: 'POST',
        body: { code: 'DEMO-FREE-BREW' },
        ...requestOptions,
      }
    );

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.success, true);
    assert.equal(completeRes.body.redemption?.status, 'REDEEMED');

    // 3. Second redemption attempt must return isValid: false or error
    const secondLookup = await apiRequest(
      serverCtx.baseUrl,
      '/api/business/redemptions/lookup/DEMO-FREE-BREW',
      {
        method: 'GET',
        ...requestOptions,
      }
    );

    assert.equal(secondLookup.status, 200);
    assert.equal(secondLookup.body.isValid, false);
    assert.equal(secondLookup.body.redemption?.status, 'REDEEMED');
  });



  await t.test('4. Demo Cleanup surgically removes demo records without altering real tenants', async () => {
    // Ensure real or non-demo seed business exists
    const roastedBean = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
    });

    // Run cleanDemo
    await cleanDemo();

    // Verify demo businesses are gone
    const demoCafe = await prisma.business.findUnique({ where: { slug: 'demo-cafe' } });
    const demoSalon = await prisma.business.findUnique({ where: { slug: 'demo-salon' } });
    assert.equal(demoCafe, null, 'Demo Café must be cleaned');
    assert.equal(demoSalon, null, 'Demo Salon must be cleaned');

    // Verify demo users are gone
    const demoAdmin = await prisma.user.findUnique({ where: { email: 'admin.demo@reployty.test' } });
    assert.equal(demoAdmin, null, 'Demo Admin must be cleaned');

    // If roasted-bean-cafe existed prior, it must remain completely untouched
    if (roastedBean) {
      const checkRoastedBean = await prisma.business.findUnique({
        where: { slug: 'roasted-bean-cafe' },
      });
      assert.ok(checkRoastedBean, 'Non-demo business (roasted-bean-cafe) must NOT be deleted by demo cleanup');
    }

    // Re-seeding after cleanup should succeed without errors
    await seedDemo();
    const reseedeDemo = await prisma.business.findUnique({ where: { slug: 'demo-cafe' } });
    assert.ok(reseedeDemo, 'Re-seeding demo businesses after cleanup must succeed');
  });
});
