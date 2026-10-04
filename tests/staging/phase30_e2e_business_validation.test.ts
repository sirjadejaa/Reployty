import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword } from '../../src/server/auth/sessionService';

test('PHASE 30: LOCAL DEVELOPMENT & END-TO-END BUSINESS VALIDATION', async () => {
  const serverCtx: TestServerContext = await startTestServer();

  try {
    // 1. Ensure required System Roles exist
    const roles = ['OWNER', 'MANAGER', 'STAFF'];
    for (const r of roles) {
      const existing = await prisma.role.findFirst({ where: { name: r } });
      if (!existing) {
        await prisma.role.create({
          data: {
            name: r,
            description: `System ${r} role`,
            isSystem: true,
          },
        });
      }
    }

    // 2. Setup Super Admin
    const superAdminHash = await hashPassword('SuperAdminPass2026!');
    const superAdminUser = await prisma.user.upsert({
      where: { email: 'superadmin.phase30@reployty.test' },
      update: { isSuperAdmin: true, status: 'ACTIVE' },
      create: {
        email: 'superadmin.phase30@reployty.test',
        name: 'Super Admin Phase 30',
        passwordHash: superAdminHash,
        isSuperAdmin: true,
        status: 'ACTIVE',
      },
    });

    const superAdminSessionToken = 'test-token-sa-p30-' + crypto.randomUUID();
    await prisma.session.create({
      data: {
        userId: superAdminUser.id,
        sessionToken: superAdminSessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // ========================================================================
    // SECTION 1: Public Client Onboarding Submissions (#get-started)
    // ========================================================================
    console.log('[1] Public Client Onboarding Submissions (#get-started)');
    const emailA = `phase30.cafe.${Date.now()}@example.test`;
    const emailB = `phase30.salon.${Date.now()}@example.test`;

    // 1.1 Submit Business A: Phase 30 Test Café
    const resA = await apiRequest(serverCtx.baseUrl, '/api/public/onboarding-requests', {
      method: 'POST',
      body: {
        businessName: 'Phase 30 Test Café',
        category: 'CAFE',
        description: 'Specialty pour-overs and artisanal sourdough',
        ownerName: 'Aarav Mehta',
        ownerEmail: emailA,
        ownerPhone: '+91 98200 30001',
        country: 'IN',
        city: 'Ahmedabad',
        address: 'CG Road, Navrangpura',
        state: 'Gujarat',
        postalCode: '380009',
        estimatedBranches: 1,
        themePreset: 'CAFE',
        primaryColor: '#4F6BFF',
      },
    });

    assert.equal(resA.status, 201);
    assert.equal(resA.body.success, true);

    const createdReqA = await prisma.businessOnboardingRequest.findFirst({
      where: { ownerEmail: emailA.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(createdReqA);
    assert.equal(createdReqA.status, 'PENDING');
    assert.equal(createdReqA.businessName, 'Phase 30 Test Café');
    const requestIdA = createdReqA.id;

    // 1.2 Submit Business B: Phase 30 Test Salon
    const resB = await apiRequest(serverCtx.baseUrl, '/api/public/onboarding-requests', {
      method: 'POST',
      body: {
        businessName: 'Phase 30 Test Salon',
        category: 'SALON',
        description: 'Luxury hair styling and skincare lounge',
        ownerName: 'Priya Sharma',
        ownerEmail: emailB,
        ownerPhone: '+91 98200 30002',
        country: 'IN',
        city: 'Ahmedabad',
        address: 'Bodakdev, SG Highway',
        state: 'Gujarat',
        postalCode: '380054',
        estimatedBranches: 2,
        themePreset: 'SALON',
        primaryColor: '#7C3AED',
      },
    });

    assert.equal(resB.status, 201);
    assert.equal(resB.body.success, true);

    const createdReqB = await prisma.businessOnboardingRequest.findFirst({
      where: { ownerEmail: emailB.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(createdReqB);
    assert.equal(createdReqB.status, 'PENDING');
    assert.equal(createdReqB.businessName, 'Phase 30 Test Salon');
    const requestIdB = createdReqB.id;

    // 1.3 Validation: Missing required fields rejected (400)
    const invalidRes = await apiRequest(serverCtx.baseUrl, '/api/public/onboarding-requests', {
      method: 'POST',
      body: {
        businessName: '',
        ownerEmail: 'not-an-email',
      },
    });
    assert.equal(invalidRes.status, 400);

    // ========================================================================
    // SECTION 2: Super Admin Review & Workflow Transitions
    // ========================================================================
    console.log('[2] Super Admin Review & Workflow Transitions');
    // 2.1 List applications as Super Admin
    const listRes = await apiRequest(serverCtx.baseUrl, '/api/admin/onboarding-requests?status=PENDING', {
      token: superAdminSessionToken,
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.items.some((r: any) => r.id === requestIdA));

    // 2.2 Search filter
    const searchRes = await apiRequest(serverCtx.baseUrl, '/api/admin/onboarding-requests?search=Café', {
      token: superAdminSessionToken,
    });
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.body.items.some((r: any) => r.id === requestIdA));


    // 2.3 Status Transition to UNDER_REVIEW
    const statusRes = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${requestIdA}/status`, {
      method: 'PATCH',
      token: superAdminSessionToken,
      body: { status: 'UNDER_REVIEW', notes: 'Verified location and commercial license' },
    });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.request.status, 'UNDER_REVIEW');

    // ========================================================================
    // SECTION 3: Super Admin Atomic Provisioning
    // ========================================================================
    console.log('[3] Super Admin Atomic Provisioning');
    // 3.1 Provision Business A
    const provResA = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${requestIdA}/provision`, {
      method: 'POST',
      token: superAdminSessionToken,
    });

    assert.equal(provResA.status, 200);
    assert.ok(provResA.body.business);
    assert.equal(provResA.body.business.status, 'ACTIVE');
    assert.equal(provResA.body.alreadyProvisioned, false);
    assert.ok(provResA.body.invitation.setupUrl);
    assert.ok(provResA.body.invitation.rawToken);
    assert.ok(provResA.body.qrCode);

    const businessAId = provResA.body.business.id;
    const ownerAToken = provResA.body.invitation.rawToken;
    assert.equal(provResA.body.qrCode.destinationUrl, `/join/${provResA.body.business.slug}`);

    // 3.2 Provision Business B
    const provResB = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${requestIdB}/provision`, {
      method: 'POST',
      token: superAdminSessionToken,
    });

    assert.equal(provResB.status, 200);
    const businessBId = provResB.body.business.id;
    const ownerBToken = provResB.body.invitation.rawToken;


    // 3.3 Idempotency: Re-provisioning does not duplicate records
    const dupRes = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${requestIdA}/provision`, {
      method: 'POST',
      token: superAdminSessionToken,
    });
    assert.equal(dupRes.status, 200);
    assert.equal(dupRes.body.business.id, businessAId);

    // ========================================================================
    // SECTION 4: Owner Password Setup & Invitation Flow
    // ========================================================================
    console.log('[4] Owner Password Setup & Invitation Flow');
    // 4.1 Verify invitation token
    const verifyRes = await apiRequest(serverCtx.baseUrl, `/api/public/invitations/verify?token=${ownerAToken}`);
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.businessName, 'Phase 30 Test Café');
    assert.equal(verifyRes.body.ownerEmail, emailA.toLowerCase());


    // 4.2 Complete setup: Set password for Owner A
    const completeResA = await apiRequest(serverCtx.baseUrl, '/api/public/invitations/complete', {
      method: 'POST',
      body: {
        token: ownerAToken,
        password: 'Phase30OwnerPass!',
      },
    });

    assert.equal(completeResA.status, 200);
    assert.ok(completeResA.body.sessionToken);
    const ownerASessionToken = completeResA.body.sessionToken;

    // Complete setup for Owner B
    const completeResB = await apiRequest(serverCtx.baseUrl, '/api/public/invitations/complete', {
      method: 'POST',
      body: {
        token: ownerBToken,
        password: 'Phase30SalonPass!',
      },
    });
    assert.equal(completeResB.status, 200);
    const ownerBSessionToken = completeResB.body.sessionToken;

    // 4.3 Single-use enforcement: Reusing token is rejected (400)
    const reuseRes = await apiRequest(serverCtx.baseUrl, '/api/public/invitations/complete', {
      method: 'POST',
      body: {
        token: ownerAToken,
        password: 'AnotherPassword123!',
      },
    });
    assert.equal(reuseRes.status, 400);

    // ========================================================================
    // SECTION 5: Business Admin Operations & Onboarding Completion
    // ========================================================================
    console.log('[5] Business Admin Operations & Onboarding Completion');
    // 5.1 Fetch dashboard before completion (honest setup state)
    const dashRes = await apiRequest(serverCtx.baseUrl, '/api/business/dashboard', {
      token: ownerASessionToken,
    });
    assert.equal(dashRes.status, 200);
    assert.equal(dashRes.body.business.id, businessAId);
    assert.equal(dashRes.body.onboarding.isCompleted, false);

    // 5.2 Configure Branding
    const brandRes = await apiRequest(serverCtx.baseUrl, '/api/business/branding', {
      method: 'PUT',
      token: ownerASessionToken,
      body: {
        themePreset: 'CAFE',
        primaryColor: '#4F6BFF',
        secondaryColor: '#1E293B',
      },
    });
    assert.equal(brandRes.status, 200);

    // 5.3 Verify Free plan branch limit (maxBranches: 1)
    const overLimitBranchRes = await apiRequest(serverCtx.baseUrl, '/api/business/branches', {
      method: 'POST',
      token: ownerASessionToken,
      body: {
        name: 'Vastrapur Branch',
        code: 'VAST-02',
      },
    });
    assert.equal(overLimitBranchRes.status, 403);
    assert.equal(overLimitBranchRes.body.code, 'LIMIT_EXCEEDED');

    // Upgrade to Growth Plan (maxBranches: 5)
    const growthPlan = await prisma.plan.findUnique({ where: { slug: 'growth' } });
    if (growthPlan) {
      await prisma.subscription.upsert({
        where: { businessId: businessAId },
        update: { planId: growthPlan.id, status: 'ACTIVE' },
        create: {
          businessId: businessAId,
          planId: growthPlan.id,
          status: 'ACTIVE',
          billingInterval: 'MONTHLY',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      });
    }

    // Now branch creation succeeds under Growth plan
    const branchRes = await apiRequest(serverCtx.baseUrl, '/api/business/branches', {
      method: 'POST',
      token: ownerASessionToken,
      body: {
        name: 'Vastrapur Branch',
        code: 'VAST-02',
        address: 'Near Vastrapur Lake',
        city: 'Ahmedabad',
        state: 'Gujarat',
        country: 'IN',
        phone: '+91 98200 30005',
        timezone: 'Asia/Kolkata',
      },
    });
    assert.equal(branchRes.status, 201);
    assert.equal(branchRes.body.code, 'VAST-02');


    // 5.4 Complete Onboarding
    const onboardDone = await apiRequest(serverCtx.baseUrl, '/api/business/onboarding', {
      method: 'PATCH',
      token: ownerASessionToken,
      body: { step: 6, completed: true },
    });
    assert.equal(onboardDone.status, 200);
    assert.equal(onboardDone.body.onboardingCompleted, true);

    // ========================================================================
    // SECTION 6: Multi-Tenant Isolation & RBAC Boundaries
    // ========================================================================
    console.log('[6] Multi-Tenant Isolation & RBAC Boundaries');
    // 6.1 Owner A reading Business A profile succeeds
    const profileA = await apiRequest(serverCtx.baseUrl, '/api/business/profile', {
      token: ownerASessionToken,
    });
    assert.equal(profileA.status, 200);
    assert.equal(profileA.body.name, 'Phase 30 Test Café');

    // 6.2 Owner B reading Business B profile succeeds
    const profileB = await apiRequest(serverCtx.baseUrl, '/api/business/profile', {
      token: ownerBSessionToken,
    });
    assert.equal(profileB.status, 200);
    assert.equal(profileB.body.name, 'Phase 30 Test Salon');

    // 6.3 Cross-tenant IDOR defense: Owner A querying branches sees only Business A branches
    const branchesA = await apiRequest(serverCtx.baseUrl, '/api/business/branches', {
      token: ownerASessionToken,
    });
    assert.equal(branchesA.status, 200);
    assert.equal(branchesA.body.length, 2);
    assert.ok(branchesA.body.some((b: any) => b.code === 'VAST-02'));

    // Owner B sees only Business B branches
    const branchesB = await apiRequest(serverCtx.baseUrl, '/api/business/branches', {
      token: ownerBSessionToken,
    });
    assert.equal(branchesB.status, 200);
    assert.equal(branchesB.body.length, 1);
    assert.ok(!branchesB.body.some((b: any) => b.code === 'VAST-02'));


    // ========================================================================
    // SECTION 7: Customer Journey, QR Resolution & OTP Authentication
    // ========================================================================
    console.log('[7] Customer Journey, QR Resolution & OTP Authentication');
    const bizA = await prisma.business.findUnique({ where: { id: businessAId } });
    assert.ok(bizA);

    // 7.1 Resolve business standee QR
    const qrRes = await apiRequest(serverCtx.baseUrl, `/api/customer/qr/${bizA.slug}`);
    assert.equal(qrRes.status, 200);
    assert.equal(qrRes.body.business.name, 'Phase 30 Test Café');

    // 7.2 Request OTP (simulation mode)
    const customerPhone = '+919876500030';
    const otpReq = await apiRequest(serverCtx.baseUrl, '/api/customer/auth/request-otp', {
      method: 'POST',
      body: {
        phone: customerPhone,
        businessId: bizA.id,
      },
    });
    assert.equal(otpReq.status, 200);
    const challengeId = otpReq.body.challengeId;
    const devOtp = otpReq.body.devOtp;

    // 7.3 Verify OTP and record marketing consent
    const otpVerify = await apiRequest(serverCtx.baseUrl, '/api/customer/auth/verify-otp', {
      method: 'POST',
      body: {
        businessId: bizA.id,
        phone: customerPhone,
        challengeId,
        code: devOtp,
        name: 'Devansh Parekh',
        marketingConsent: true,
      },
    });


    assert.equal(otpVerify.status, 200);
    assert.ok(otpVerify.body.customer);
    assert.equal(otpVerify.body.customer.marketingConsent, true);
    const customerId = otpVerify.body.customer.id;
    const customerSessionToken = otpVerify.body.sessionToken;

    // ========================================================================
    // SECTION 8: Loyalty Program, Stamp Earning & Reward Redemption
    // ========================================================================
    console.log('[8] Loyalty Program, Stamp Earning & Reward Redemption');
    // 8.1 Create STAMP Loyalty Program
    const progRes = await apiRequest(serverCtx.baseUrl, '/api/business/loyalty/program', {
      method: 'POST',
      token: ownerASessionToken,
      body: {
        name: 'Café Regulars Club',
        type: 'STAMP',
        targetStamps: 5,
        rewardTitle: 'Free Single-Origin Brew',
        status: 'ACTIVE',
      },
    });
    assert.equal(progRes.status, 201);

    // 8.2 Award 5 stamps to customer to complete card
    const awardRes = await apiRequest(serverCtx.baseUrl, '/api/business/loyalty/award-stamp', {
      method: 'POST',
      token: ownerASessionToken,
      body: {
        customerId,
        stampsToAdd: 5,
        idempotencyKey: 'phase30-award-' + crypto.randomUUID(),
      },
    });
    assert.equal(awardRes.status, 200);
    assert.equal(awardRes.body.card.stampsCollected, 5);

    // 8.3 Create Reward
    const rewardRes = await apiRequest(serverCtx.baseUrl, '/api/business/rewards', {
      method: 'POST',
      token: ownerASessionToken,
      body: {
        title: 'Free Single-Origin Brew',
        description: 'Choice of Ethiopian or Colombian pour-over',
        stampsRequired: 5,
        status: 'ACTIVE',
      },
    });
    assert.equal(rewardRes.status, 201);

    const rewardAId = rewardRes.body.id;

    // 8.4 Customer claims eligible reward (creates voucher)
    const claimRes = await apiRequest(serverCtx.baseUrl, `/api/customer/rewards/${rewardAId}/claim`, {
      method: 'POST',
      customerToken: customerSessionToken,
      body: {
        idempotencyKey: 'phase30-claim-' + crypto.randomUUID(),
      },
    });
    assert.equal(claimRes.status, 201);
    assert.ok(claimRes.body.redemption);
    const voucherCode = claimRes.body.redemption.redemptionCode || claimRes.body.redemption.code;
    assert.ok(voucherCode);


    // 8.5 Staff validates and redeems voucher
    const validateRes = await apiRequest(serverCtx.baseUrl, '/api/business/redemptions/validate', {
      method: 'POST',
      token: ownerASessionToken,
      body: {
        code: voucherCode,
      },
    });
    assert.equal(validateRes.status, 200);
    assert.equal(validateRes.body.redemption.status, 'REDEEMED');

    // 8.6 Anti-fraud check: Re-redeeming used voucher is blocked (409)
    const dupRedeem = await apiRequest(serverCtx.baseUrl, '/api/business/redemptions/validate', {
      method: 'POST',
      token: ownerASessionToken,
      body: {
        code: voucherCode,
      },
    });
    assert.equal(dupRedeem.status, 409);
    assert.equal(dupRedeem.body.code, 'ALREADY_REDEEMED');

    // ========================================================================
    // SECTION 9: CRM, Customer Timeline & Dynamic Segmentation
    // ========================================================================
    console.log('[9] CRM, Customer Timeline & Dynamic Segmentation');
    // 9.1 Timeline audit of customer activity
    const timelineRes = await apiRequest(serverCtx.baseUrl, `/api/business/customers/${customerId}/timeline`, {
      token: ownerASessionToken,
    });
    assert.equal(timelineRes.status, 200);
    assert.ok(Array.isArray(timelineRes.body.data));
    assert.ok(timelineRes.body.data.length > 0);

    // 9.2 Create Dynamic Segment
    const segRes = await apiRequest(serverCtx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerASessionToken,
      body: {
        name: 'Active Regulars',
        description: 'Customers with visits registered',
        ruleDefinition: {
          logic: 'AND',
          conditions: [
            { field: 'totalVisits', operator: 'GREATER_THAN_OR_EQUAL', value: 0 },
          ],
        },
      },
    });
    assert.equal(segRes.status, 201);
    assert.ok(segRes.body.id);

    // 9.3 Preview dynamic segment rules
    const prevRes = await apiRequest(serverCtx.baseUrl, '/api/business/segments/preview', {
      method: 'POST',
      token: ownerASessionToken,
      body: {
        ruleDefinition: {
          logic: 'AND',
          conditions: [
            { field: 'totalVisits', operator: 'GREATER_THAN_OR_EQUAL', value: 0 },
          ],
        },
      },
    });
    assert.equal(prevRes.status, 200);
    assert.ok(typeof prevRes.body.matchingCount === 'number');

    // ========================================================================
    // SECTION 10: Billing & Usage Metering Enforcement
    // ========================================================================
    console.log('[10] Billing & Usage Metering Enforcement');
    const meterRes = await apiRequest(serverCtx.baseUrl, '/api/business/billing', {
      token: ownerASessionToken,
    });
    assert.equal(meterRes.status, 200);
    assert.ok(meterRes.body.subscription);
    assert.ok(meterRes.body.plan);
    assert.ok(meterRes.body.usage);
    assert.ok(typeof meterRes.body.usage.maxBranches === 'number');
    assert.ok(typeof meterRes.body.usage.maxCustomers === 'number');

    console.log('✅ ALL PHASE 30 END-TO-END VALIDATION STEPS COMPLETED SUCCESSFULLY!');


  } finally {
    await serverCtx.stop();
  }
});
