import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/server/db/client';
import {
  PLATFORM_FEATURES,
  hasFeature,
  requireFeature,
  FeatureNotIncludedError,
} from '../../src/server/services/entitlementService';
import {
  claimCustomerQrEarning,
  LoyaltyOperationError,
} from '../../src/server/services/loyaltyService';
import {
  adminAssignBusinessPlan,
  BillingError,
} from '../../src/server/services/billingService';
import { TenantAuthorizationError } from '../../src/server/auth/tenantContext';
import {
  generateCustomerReviewSuggestion,
} from '../../src/server/services/reviewService';
import {
  getBusinessBranding,
  updateBusinessBranding,
} from '../../src/server/services/businessService';
import { TenantContext } from '../../src/server/types/express';
import { CustomerSessionContext } from '../../src/server/services/customerAuthService';
import { seedDemo, cleanDemo } from '../../prisma/demoSeed';

test('PHASE 35: PLATFORM FEATURES, PLAN ASSIGNMENT, QR EARNING & REVIEWS', async (t) => {
  let demoCafeId: string;
  let superAdminUserId: string;
  let nonAdminUserId: string;

  t.before(async () => {
    await seedDemo();

    const cafe = await prisma.business.findUnique({
      where: { slug: 'demo-cafe' },
      include: {
        staff: {
          include: { user: true, role: true },
        },
      },
    });
    assert.ok(cafe, 'Demo Café must exist');
    demoCafeId = cafe.id;

    // Find or create a super admin user for testing
    let superAdmin = await prisma.user.findFirst({
      where: { isSuperAdmin: true },
    });
    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          email: 'test-superadmin-p35@reployty.com',
          name: 'P35 Super Admin',
          passwordHash: 'dummyhash',
          isSuperAdmin: true,
          status: 'ACTIVE',
        },
      });
    }
    superAdminUserId = superAdmin.id;

    // Find non-admin user
    const cashierStaff = cafe.staff.find(s => s.role.name === 'Cashier') || cafe.staff[0];
    nonAdminUserId = cashierStaff.user.id;
  });

  t.after(async () => {
    await cleanDemo();
  });

  await t.test('1. Feature Catalog Integrity & Alias Resolution', async () => {
    // 1.1 Catalog size and categories
    assert.ok(PLATFORM_FEATURES.length >= 18, 'Feature catalog should contain at least 18 canonical features');
    const ids = PLATFORM_FEATURES.map(f => f.id);
    assert.ok(ids.includes('LOYALTY_PROGRAMS'));
    assert.ok(ids.includes('CUSTOMER_QR_JOINING'));
    assert.ok(ids.includes('CUSTOMER_REVIEWS'));
    assert.ok(ids.includes('AUTOMATIONS'));
    assert.ok(ids.includes('CATALOG_MENU'));
    assert.ok(ids.includes('BUSINESS_BRANDING'));

    // 1.2 hasFeature matching canonical and alias keys for business
    assert.equal(await hasFeature(demoCafeId, 'LOYALTY_PROGRAMS'), true);
    assert.equal(await hasFeature(demoCafeId, 'loyalty'), true, 'Should resolve alias loyalty');
    assert.equal(await hasFeature(demoCafeId, 'qr'), true, 'Should resolve alias qr');
    assert.equal(await hasFeature(demoCafeId, 'reviews'), true, 'Should resolve alias reviews');

    // 1.3 requireFeature throws FeatureNotIncludedError when feature missing
    const freePlan = await prisma.plan.findFirst({
      where: { slug: 'free' },
    });
    assert.ok(freePlan, 'Free plan should exist');

    // Create a temporary business on the free plan
    const testFreeBiz = await prisma.business.create({
      data: {
        name: 'Free Tier Test Biz',
        slug: `free-test-${Date.now()}`,
        category: 'RETAIL',
        status: 'ACTIVE',
        planId: freePlan.id,
      },
    });

    await prisma.subscription.create({
      data: {
        businessId: testFreeBiz.id,
        planId: freePlan.id,
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const freeCtx: any = {
      businessId: testFreeBiz.id,
      branchId: 'dummy-branch',
      userId: nonAdminUserId,
      userRole: 'CASHIER',
      permissions: [],
      hasPermission: () => false,
      plan: freePlan,
      auditActor: {
        actorId: nonAdminUserId,
        actorType: 'USER',
        actorName: 'Cashier',
        ipAddress: '127.0.0.1',
      },
    };

    // Free plan does not have AUTOMATIONS
    await assert.rejects(
      async () => {
        await requireFeature(freeCtx, 'AUTOMATIONS');
      },
      (err: any) => err instanceof FeatureNotIncludedError,
      'Should throw FeatureNotIncludedError for AUTOMATIONS on free plan'
    );

    // Clean up test biz
    await prisma.subscription.deleteMany({ where: { businessId: testFreeBiz.id } });
    await prisma.business.delete({ where: { id: testFreeBiz.id } });
  });

  await t.test('2. Super Admin Plan Assignment API Service', async () => {
    // 2.1 Non-superadmin cannot assign plans
    const cashierCtx: any = {
      businessId: demoCafeId,
      branchId: 'b1',
      userId: nonAdminUserId,
      userRole: 'CASHIER',
      permissions: [],
      hasPermission: () => false,
      isSuperAdmin: false,
      plan: null,
      auditActor: {
        actorId: nonAdminUserId,
        actorType: 'USER',
        actorName: 'Cashier',
        ipAddress: '127.0.0.1',
      },
    };

    const growthPlan = await prisma.plan.findFirst({
      where: { slug: 'growth' },
    });
    assert.ok(growthPlan, 'Growth plan should exist');

    await assert.rejects(
      async () => {
        await adminAssignBusinessPlan(cashierCtx, demoCafeId, growthPlan.id);
      },
      (err: any) => err instanceof TenantAuthorizationError,
      'Non-superadmin should be rejected'
    );

    // 2.2 Super admin can assign plan and resets grace period
    const superAdminCtx: any = {
      businessId: demoCafeId,
      branchId: 'b1',
      userId: superAdminUserId,
      userRole: 'OWNER',
      permissions: [],
      hasPermission: () => true,
      isSuperAdmin: true,
      plan: null,
      auditActor: {
        actorId: superAdminUserId,
        actorType: 'USER',
        actorName: 'Platform Super Admin',
        ipAddress: '127.0.0.1',
      },
    };

    const assignResult = await adminAssignBusinessPlan(superAdminCtx, demoCafeId, growthPlan.id);
    assert.equal(assignResult.businessId, demoCafeId);
    assert.equal(assignResult.plan.id, growthPlan.id);
    assert.equal(assignResult.plan.name, growthPlan.name);
    assert.equal(assignResult.subscription.status, 'ACTIVE');

    // Verify Business record updated
    const updatedBusiness = await prisma.business.findUnique({
      where: { id: demoCafeId },
    });
    assert.equal(updatedBusiness?.planId, growthPlan.id);

    // Verify AuditLog written
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        businessId: demoCafeId,
        action: 'BUSINESS_PLAN_CHANGED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(auditLog, 'Audit log for BUSINESS_PLAN_CHANGED should exist');
  });

  await t.test('3. Automatic QR Loyalty Earning with Cooldown & Anti-Tamper', async () => {
    // 3.1 Setup customer and active QR code
    const customer = await prisma.customer.findFirst({
      where: { businessId: demoCafeId },
    });
    assert.ok(customer, 'Customer should exist');

    const qrCode = await prisma.qRCode.findFirst({
      where: { businessId: demoCafeId, status: 'ACTIVE' },
    });
    assert.ok(qrCode, 'QR code should exist');

    const customerCtx: CustomerSessionContext = {
      sessionToken: 'test-session-token',
      customerId: customer.id,
      businessId: demoCafeId,
      customer: {
        id: customer.id,
        businessId: customer.businessId,
        branchId: customer.branchId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        birthday: customer.birthday,
        status: customer.status,
        marketingConsent: customer.marketingConsent,
        totalVisits: customer.totalVisits,
        stampsBalance: customer.stampsBalance,
        pointsBalance: customer.pointsBalance,
        joinedAt: customer.joinedAt,
        lastVisitAt: customer.lastVisitAt,
      },
      business: {
        id: demoCafeId,
        name: 'Demo Café',
        slug: 'demo-cafe',
        category: 'CAFE',
        themePreset: 'CAFE',
        primaryColor: '#B45309',
        logo: null,
      },
    };

    // 3.2 Claim earning for the first time
    const key1 = `test-earn-qr-${Date.now()}-1`;

    const earnResult = await claimCustomerQrEarning(customerCtx, {
      qrCode: qrCode.code,
      idempotencyKey: key1,
    });
    assert.equal(earnResult.success, true);
    assert.ok((earnResult.deltaStamps ?? 0) > 0 || (earnResult.deltaPoints ?? 0) > 0, 'Should earn stamps or points');
    assert.ok(earnResult.message.length > 0, 'Should return confirmation message');

    // 3.3 Anti-Abuse: Immediate second claim on same code returns alreadyClaimed without awarding extra stamps
    const key2 = `test-earn-qr-${Date.now()}-2`;
    const secondClaimResult = await claimCustomerQrEarning(customerCtx, {
      qrCode: qrCode.code,
      idempotencyKey: key2,
    });
    assert.equal(secondClaimResult.alreadyClaimed, true);
    assert.equal(secondClaimResult.deltaStamps, 0);
    assert.equal(secondClaimResult.deltaPoints, 0);
    assert.ok(secondClaimResult.message.includes('already'));

    // 3.4 Idempotency: Replaying exact same idempotency key returns cached result
    const replayResult = await claimCustomerQrEarning(customerCtx, {
      qrCode: qrCode.code,
      idempotencyKey: key1,
    });
    assert.equal(replayResult.alreadyClaimed, true);
    assert.equal(replayResult.deltaStamps, earnResult.deltaStamps);
    assert.equal(replayResult.deltaPoints, earnResult.deltaPoints);

    // 3.5 Anti-Tamper: Tenant mismatch prevention
    const otherBusiness = await prisma.business.findFirst({
      where: { id: { not: demoCafeId } },
    });
    if (otherBusiness) {
      const foreignQr = await prisma.qRCode.findFirst({
        where: { businessId: otherBusiness.id, status: 'ACTIVE' },
      });
      if (foreignQr) {
        await assert.rejects(
          async () => {
            await claimCustomerQrEarning(customerCtx, {
              qrCode: foreignQr.code,
              idempotencyKey: `foreign-${Date.now()}`,
            });
          },
          (err: any) => {
            return err instanceof LoyaltyOperationError && err.code === 'QR_TENANT_MISMATCH';
          },
          'Should reject QR code belonging to a different business'
        );
      }
    }
  });

  await t.test('4. Customer AI Review Suggestions (Multi-Language & Category Context)', () => {
    // 4.1 Rating 5 stars for Cafe
    const highRatingSuggestions = generateCustomerReviewSuggestion({
      businessName: 'The Roast Hub',
      category: 'CAFE',
      rating: 5,
    });

    assert.ok(highRatingSuggestions.english.length > 20, 'English suggestion should have content');
    assert.ok(highRatingSuggestions.hinglish.length > 20, 'Hinglish suggestion should have content');
    assert.ok(highRatingSuggestions.hindi.length > 20, 'Hindi suggestion should have content');
    assert.ok(highRatingSuggestions.english.includes('The Roast Hub'), 'Should include business name');

    // 4.2 Rating 3 stars for Salon
    const midRatingSuggestions = generateCustomerReviewSuggestion({
      businessName: 'Luxe Salon',
      category: 'SALON',
      rating: 3,
    });

    assert.ok(midRatingSuggestions.english.includes('Luxe Salon'));
    assert.ok(midRatingSuggestions.hinglish.length > 10);
    assert.ok(midRatingSuggestions.hindi.length > 10);
  });

  await t.test('5. Branding Logo Configuration & Persistence', async () => {
    const tenantCtx: any = {
      businessId: demoCafeId,
      branchId: 'b1',
      userId: superAdminUserId,
      userRole: 'OWNER',
      isOwner: true,
      isSuperAdmin: true,
      permissions: ['SETTINGS_MANAGE', 'BRANDING_MANAGE'],
      hasPermission: () => true,
      plan: {
        id: 'plan-growth',
        name: 'Growth',
        slug: 'growth',
        tier: 'GROWTH',
        features: ['BUSINESS_BRANDING'],
        limits: {},
        isActive: true,
      },
      auditActor: {
        actorId: superAdminUserId,
        actorType: 'USER',
        actorName: 'Owner',
        ipAddress: '127.0.0.1',
      },
    };

    // Update branding with logo and preset
    const testLogo = 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=100';
    const updated = await updateBusinessBranding(tenantCtx, {
      logo: testLogo,
      themePreset: 'CAFE',
      primaryColor: '#8B4513',
      secondaryColor: '#1A1A1A',
    });

    assert.equal(updated.logo, testLogo);
    assert.equal(updated.themePreset, 'CAFE');
    assert.equal(updated.primaryColor, '#8B4513');

    // Fetch branding to verify persistence
    const fetched = await getBusinessBranding(tenantCtx);
    assert.equal(fetched.logo, testLogo);
    assert.equal(fetched.themePreset, 'CAFE');
  });
});
