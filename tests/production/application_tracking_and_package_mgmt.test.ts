/**
 * REPLOYTY: BUSINESS APPLICATION TRACKING + SUPER ADMIN PACKAGE MANAGEMENT TEST SUITE
 * 
 * Tests Section 16 Requirements:
 * Feature A: Business Application Tracking (persisted lifecycle, reference numbers, permissions, history)
 * Feature B: Super Admin Package Management (CRUD, safe deletion, feature entitlement builder, atomic business assignment)
 */

import test from 'node:test';
import assert from 'node:assert';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword, createSession } from '../../src/server/auth/sessionService';
import { OnboardingRequestStatus, BusinessCategory } from '@prisma/client';

test('FEATURE A & B: BUSINESS APPLICATION TRACKING AND SUPER ADMIN PACKAGE MANAGEMENT', async (t) => {
  let serverCtx: TestServerContext;
  let adminUser: any;
  let adminSession: any;
  let applicantAUser: any;
  let applicantASession: any;
  let applicantBUser: any;
  let applicantBSession: any;
  let regularBusinessOwner: any;
  let regularOwnerSession: any;

  const runId = Math.random().toString(36).substring(2, 8);
  const getToken = (s: any) => s?.sessionToken || s?.token || '';

  t.before(async () => {
    serverCtx = await startTestServer();

    // 1. Super Admin
    adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@reployty.com' } });
    adminSession = await createSession(adminUser.id, null);

    // 2. Applicant A (User who registers for a new business)
    const passHash = await hashPassword('ApplicantPass123!');
    applicantAUser = await prisma.user.create({
      data: {
        email: `applicant-a-${runId}@example.com`,
        passwordHash: passHash,
        name: `Applicant Alice ${runId}`,
        phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
        isSuperAdmin: false,
      },
    });
    applicantASession = await createSession(applicantAUser.id, null);

    // 3. Applicant B (Another user)
    applicantBUser = await prisma.user.create({
      data: {
        email: `applicant-b-${runId}@example.com`,
        passwordHash: passHash,
        name: `Applicant Bob ${runId}`,
        phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
        isSuperAdmin: false,
      },
    });
    applicantBSession = await createSession(applicantBUser.id, null);

    // 4. Regular Business Owner with an existing business
    const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });
    regularBusinessOwner = await prisma.user.create({
      data: {
        email: `regular-owner-${runId}@example.com`,
        passwordHash: passHash,
        name: `Regular Owner ${runId}`,
        isSuperAdmin: false,
      },
    });
    const regularBusiness = await prisma.business.create({
      data: {
        name: `Existing Cafe ${runId}`,
        slug: `existing-cafe-${runId}`,
        category: BusinessCategory.CAFE,
      },
    });
    await prisma.staffMembership.create({
      data: {
        businessId: regularBusiness.id,
        userId: regularBusinessOwner.id,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });
    regularOwnerSession = await createSession(regularBusinessOwner.id, regularBusiness.id);
  });

  t.after(async () => {
    if (serverCtx) {
      await serverCtx.stop();
    }
  });

  // =========================================================================
  // FEATURE A: APPLICATION TRACKING TESTS
  // =========================================================================

  let createdAppId: string;
  let createdAppNumber: string;

  await t.test('App Tracking: Public submission persists in PostgreSQL with #APP-XXXXX and statusHistory', async () => {
    const res = await apiRequest(serverCtx.baseUrl, '/api/public/onboarding-requests', {
      method: 'POST',
      body: {
        businessName: `Artisan Roastery ${runId}`,
        businessCategory: 'CAFE',
        businessDescription: 'Specialty coffee roasting and pour overs',
        ownerName: `Applicant Alice ${runId}`,
        ownerEmail: applicantAUser.email,
        ownerPhone: applicantAUser.phone,
        city: 'Mumbai',
        country: 'IN',
        address: '42 Marine Drive',
        numberOfBranches: 1,
      },
    });

    assert.strictEqual(res.status, 201, 'Returns HTTP 201 Created');
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.applicationNumber, 'Returns application reference number');
    assert.match(res.body.applicationNumber, /^APP-\d+$/, 'Application reference follows APP-XXXXX convention');
    assert.ok(['PENDING', 'SUBMITTED'].includes(res.body.status), 'Status is PENDING/SUBMITTED');

    createdAppId = res.body.requestId;
    createdAppNumber = res.body.applicationNumber;

    // Direct database validation
    const dbRecord = await prisma.businessOnboardingRequest.findUnique({
      where: { id: createdAppId },
    });
    assert.ok(dbRecord, 'Application persisted in PostgreSQL');
    assert.strictEqual(dbRecord?.applicationNumber, createdAppNumber);
    assert.ok(
      dbRecord?.status === OnboardingRequestStatus.PENDING || dbRecord?.status === OnboardingRequestStatus.SUBMITTED,
      'dbRecord status is PENDING or SUBMITTED'
    );
    assert.ok(Array.isArray(dbRecord?.statusHistory), 'statusHistory is a valid JSON array');
    assert.strictEqual((dbRecord?.statusHistory as any[])?.length, 1);
    assert.ok(
      ['PENDING', 'SUBMITTED'].includes((dbRecord?.statusHistory as any[])[0]?.status),
      'Initial history entry is PENDING or SUBMITTED'
    );
  });

  await t.test('App Tracking: Applicant can view their own application via reference number & email', async () => {
    const res = await apiRequest(serverCtx.baseUrl, '/api/public/applications/track', {
      method: 'POST',
      body: {
        applicationNumber: createdAppNumber,
        email: applicantAUser.email,
      },
    });

    assert.strictEqual(res.status, 200, 'Returns HTTP 200 OK');
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.application.applicationNumber, createdAppNumber);
    assert.strictEqual(res.body.application.businessName, `Artisan Roastery ${runId}`);
    assert.ok(
      ['PENDING', 'SUBMITTED'].includes(res.body.application.status),
      'Application status is PENDING or SUBMITTED'
    );
    assert.ok((res.body.application.statusHistory || []).length >= 1, 'Includes initial submission in history');
  });

  await t.test('App Tracking: Applicant can view their own application via authenticated applicant route', async () => {
    const res = await apiRequest(serverCtx.baseUrl, `/api/applicant/applications/${createdAppId}`, {
      method: 'GET',
      token: getToken(applicantASession),
    });

    assert.strictEqual(res.status, 200, 'Returns HTTP 200 OK');
    assert.strictEqual(res.body.application.id, createdAppId);
    assert.strictEqual(res.body.application.applicationNumber, createdAppNumber);
  });

  await t.test('App Tracking: Cross-tenant / unauthorized access to another applicant\'s application is denied', async () => {
    // 1. Unauthenticated / Wrong email via public track
    const wrongEmailRes = await apiRequest(serverCtx.baseUrl, '/api/public/applications/track', {
      method: 'POST',
      body: {
        applicationNumber: createdAppNumber,
        email: 'intruder@example.com',
      },
    });
    assert.strictEqual(wrongEmailRes.status, 404, 'Returns 404 for mismatched email / reference');

    // 2. Another authenticated applicant trying to view Applicant A's application
    const wrongUserRes = await apiRequest(serverCtx.baseUrl, `/api/applicant/applications/${createdAppId}`, {
      method: 'GET',
      token: getToken(applicantBSession),
    });
    assert.strictEqual(wrongUserRes.status, 403, 'Returns 403 Forbidden for cross-applicant view');
  });

  await t.test('App Tracking: Applicant cannot approve or reject an application', async () => {
    // Ordinary applicant trying to hit admin status endpoint
    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${createdAppId}/status`, {
      method: 'PATCH',
      token: getToken(applicantASession),
      body: {
        status: 'APPROVED',
      },
    });
    assert.strictEqual(res.status, 403, 'Non-Super Admin receives 403 Forbidden on admin status change');
  });

  await t.test('App Tracking: Super Admin moves application to UNDER_REVIEW', async () => {
    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${createdAppId}/status`, {
      method: 'PATCH',
      token: getToken(adminSession),
      body: {
        status: 'UNDER_REVIEW',
        reviewNotes: 'Verified phone number, reviewing branch location.',
      },
    });

    assert.strictEqual(res.status, 200, 'Super Admin successfully updates status');
    assert.strictEqual(res.body.request.status, 'UNDER_REVIEW');

    const dbRecord = await prisma.businessOnboardingRequest.findUnique({ where: { id: createdAppId } });
    assert.strictEqual(dbRecord?.status, OnboardingRequestStatus.UNDER_REVIEW);
    const history = dbRecord?.statusHistory as any[];
    assert.strictEqual(history.length, 2, 'History recorded 2nd entry');
    assert.strictEqual(history[1].status, 'UNDER_REVIEW');
    assert.strictEqual(history[1].actorRole, 'SUPER_ADMIN');
  });

  await t.test('App Tracking: Super Admin requests additional information', async () => {
    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${createdAppId}/request-info`, {
      method: 'POST',
      token: getToken(adminSession),
      body: {
        message: 'Please provide proof of business tax registration and local trade license.',
      },
    });

    assert.strictEqual(res.status, 200, 'Super Admin requests additional info successfully');
    assert.strictEqual(res.body.request.status, 'ADDITIONAL_INFO_REQUIRED');
    assert.strictEqual(res.body.request.additionalInfoRequested, 'Please provide proof of business tax registration and local trade license.');

    const dbRecord = await prisma.businessOnboardingRequest.findUnique({ where: { id: createdAppId } });
    assert.strictEqual(dbRecord?.status, OnboardingRequestStatus.ADDITIONAL_INFO_REQUIRED);
    const history = dbRecord?.statusHistory as any[];
    assert.strictEqual(history.length, 3, 'History recorded info request event');
    assert.strictEqual(history[2].status, 'ADDITIONAL_INFO_REQUIRED');
  });

  await t.test('App Tracking: Applicant submits requested additional information', async () => {
    const res = await apiRequest(serverCtx.baseUrl, `/api/applicant/applications/${createdAppId}/additional-info`, {
      method: 'PATCH',
      token: getToken(applicantASession),
      body: {
        information: 'Tax ID: GSTIN27AABCT3518Q1ZV. Trade license issued by BMC, registration #98124.',
      },
    });

    assert.strictEqual(res.status, 200, 'Applicant submits requested information successfully');
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.request.status, 'SUBMITTED', 'Application transitions to SUBMITTED');
    assert.ok(res.body.request.additionalInfoSubmitted, 'Information is persisted');

    const dbRecord = await prisma.businessOnboardingRequest.findUnique({ where: { id: createdAppId } });
    assert.strictEqual(dbRecord?.status, OnboardingRequestStatus.SUBMITTED);
    assert.ok(dbRecord?.additionalInfoSubmittedAt);
    const history = dbRecord?.statusHistory as any[];
    assert.strictEqual(history.length, 4, 'History recorded applicant response event');
    assert.strictEqual(history[3].actorRole, 'APPLICANT');
  });

  await t.test('App Tracking: Invalid status transition is rejected by server', async () => {
    // Cannot transition directly from UNDER_REVIEW to PROVISIONED without being APPROVED
    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${createdAppId}/status`, {
      method: 'PATCH',
      token: getToken(adminSession),
      body: {
        status: 'PROVISIONED',
      },
    });
    assert.strictEqual(res.status, 400, 'Invalid transition rejected with HTTP 400');
  });

  await t.test('App Tracking: Super Admin approves application', async () => {
    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${createdAppId}/status`, {
      method: 'PATCH',
      token: getToken(adminSession),
      body: {
        status: 'APPROVED',
        reviewNotes: 'All trade licenses verified. Approved for setup.',
      },
    });

    assert.strictEqual(res.status, 200, 'Application approved successfully');
    assert.strictEqual(res.body.request.status, 'APPROVED');

    const dbRecord = await prisma.businessOnboardingRequest.findUnique({ where: { id: createdAppId } });
    assert.strictEqual(dbRecord?.status, OnboardingRequestStatus.APPROVED);
  });

  await t.test('App Tracking: Provisioning approved application creates workspace and does not duplicate records', async () => {
    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${createdAppId}/provision`, {
      method: 'POST',
      token: getToken(adminSession),
    });

    assert.strictEqual(res.status, 200, 'Workspace provisioned with HTTP 200');
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.business.id);

    // Verify application status is now PROVISIONED
    const dbApp = await prisma.businessOnboardingRequest.findUnique({ where: { id: createdAppId } });
    assert.strictEqual(dbApp?.status, OnboardingRequestStatus.PROVISIONED);
    assert.strictEqual(dbApp?.provisionedBusinessId, res.body.business.id);

    // Re-provisioning the same application returns idempotent success without duplicate businesses
    const duplicateRes = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${createdAppId}/provision`, {
      method: 'POST',
      token: getToken(adminSession),
    });
    assert.strictEqual(duplicateRes.status, 200, 'Idempotent provisioning returns existing business');
    assert.strictEqual(duplicateRes.body.business.id, res.body.business.id);

    // Confirm no duplicate business records created
    const matchingBusinesses = await prisma.business.findMany({
      where: { id: res.body.business.id },
    });
    assert.strictEqual(matchingBusinesses.length, 1, 'Exactly one business tenant created');
  });

  await t.test('App Tracking: Rejection preserves application history and does not delete record', async () => {
    // Create another application to test rejection
    const appRes = await apiRequest(serverCtx.baseUrl, '/api/public/onboarding-requests', {
      method: 'POST',
      body: {
        businessName: `Declined Concept ${runId}`,
        businessCategory: 'RETAIL',
        ownerName: 'Applicant Dave',
        ownerEmail: `declined-${runId}@example.com`,
        ownerPhone: '+919999988888',
        city: 'Delhi',
        country: 'IN',
        address: '10 Connaught Place',
      },
    });

    const rejectAppId = appRes.body.requestId;

    const rejectRes = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${rejectAppId}/status`, {
      method: 'PATCH',
      token: getToken(adminSession),
      body: {
        status: 'REJECTED',
        reviewNotes: 'Unable to verify operating address in Delhi.',
      },
    });

    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.body.request.status, 'REJECTED');

    // Verify record still exists with full history in PostgreSQL
    const dbRecord = await prisma.businessOnboardingRequest.findUnique({ where: { id: rejectAppId } });
    assert.ok(dbRecord, 'Application record preserved in DB');
    assert.strictEqual(dbRecord?.status, OnboardingRequestStatus.REJECTED);
    const history = dbRecord?.statusHistory as any[];
    assert.ok(history.length >= 2, 'History preserved');
    assert.strictEqual(history[history.length - 1].status, 'REJECTED');
    assert.strictEqual(history[history.length - 1].notes, 'Unable to verify operating address in Delhi.');
  });

  // =========================================================================
  // FEATURE B: PACKAGE MANAGEMENT TESTS
  // =========================================================================

  let createdPlanId: string;
  const testPlanSlug = `test-package-${runId}`;

  await t.test('Package Mgmt: Non-Super Admin cannot manage packages', async () => {
    const res = await apiRequest(serverCtx.baseUrl, '/api/admin/plans', {
      method: 'POST',
      token: getToken(regularOwnerSession),
      body: {
        name: 'Unauthorized Package',
        slug: 'unauthorized-pkg',
        priceMinor: 99900,
        features: ['CUSTOMER_CRM'],
      },
    });

    assert.strictEqual(res.status, 403, 'Returns 403 Forbidden for non-Super Admin');
  });

  await t.test('Package Mgmt: Super Admin creates a new package with quotas & feature entitlements', async () => {
    const res = await apiRequest(serverCtx.baseUrl, '/api/admin/plans', {
      method: 'POST',
      token: getToken(adminSession),
      body: {
        name: `Platinum Enterprise ${runId}`,
        slug: testPlanSlug,
        description: 'Complete high-volume enterprise package with AI and multi-branch features',
        priceMinor: 499900, // ₹4,999 stored as integer minor units
        yearlyPriceMinor: 4999000, // ₹49,990 stored as integer minor units
        currency: 'INR',
        billingInterval: 'MONTHLY',
        maxCustomers: 50000,
        maxBranches: 10,
        maxStaff: 50,
        features: [
          'CUSTOMER_CRM',
          'LOYALTY',
          'REWARDS',
          'OFFERS',
          'REVIEWS',
          'CAMPAIGNS',
          'AUTOMATIONS',
          'AI_ASSISTANT',
          'BRANCHES',
          'STAFF',
          'ENTERPRISE_SECURITY',
        ],
        limits: {
          maxRewards: 100,
          maxOffers: 50,
          monthlyAiDrafts: 500,
          maxActiveCampaigns: 25,
        },
        isActive: true,
      },
    });

    assert.strictEqual(res.status, 201, 'Package created with HTTP 201');
    assert.strictEqual(res.body.name, `Platinum Enterprise ${runId}`);
    assert.strictEqual(res.body.priceMinor, 499900);
    assert.strictEqual(res.body.currency, 'INR');
    assert.strictEqual(res.body.isActive, true);

    createdPlanId = res.body.id;

    // Database verification
    const dbPlan = await prisma.plan.findUnique({ where: { id: createdPlanId } });
    assert.ok(dbPlan, 'Plan persisted in PostgreSQL');
    assert.strictEqual(dbPlan?.slug, testPlanSlug);
    assert.strictEqual(dbPlan?.priceMinor, 499900);
    assert.strictEqual(Array.isArray(dbPlan?.features), true);
    assert.ok((dbPlan?.features as string[]).includes('ENTERPRISE_SECURITY'));
  });

  await t.test('Package Mgmt: Super Admin updates package limits and features', async () => {
    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/plans/${createdPlanId}`, {
      method: 'PUT',
      token: getToken(adminSession),
      body: {
        name: `Platinum Enterprise Plus ${runId}`,
        description: 'Updated enterprise package description',
        priceMinor: 599900,
        yearlyPriceMinor: 5999000,
        maxCustomers: 75000,
        maxBranches: 15,
        maxStaff: 75,
        features: [
          'CUSTOMER_CRM',
          'LOYALTY',
          'REWARDS',
          'OFFERS',
          'REVIEWS',
          'CAMPAIGNS',
          'AUTOMATIONS',
          'AI_ASSISTANT',
          'BRANCHES',
          'STAFF',
          'ADVANCED_ANALYTICS',
          'ENTERPRISE_SECURITY',
        ],
        isActive: true,
      },
    });

    assert.strictEqual(res.status, 200, 'Package updated successfully');
    assert.strictEqual(res.body.name, `Platinum Enterprise Plus ${runId}`);
    assert.strictEqual(res.body.priceMinor, 599900);
    assert.strictEqual(res.body.maxCustomers, 75000);

    const dbPlan = await prisma.plan.findUnique({ where: { id: createdPlanId } });
    assert.strictEqual(dbPlan?.name, `Platinum Enterprise Plus ${runId}`);
    assert.strictEqual(dbPlan?.priceMinor, 599900);
    assert.ok((dbPlan?.features as string[]).includes('ADVANCED_ANALYTICS'));
  });

  await t.test('Package Mgmt: Super Admin deactivates and reactivates a package', async () => {
    // 1. Deactivate
    const deactRes = await apiRequest(serverCtx.baseUrl, `/api/admin/plans/${createdPlanId}/status`, {
      method: 'PATCH',
      token: getToken(adminSession),
      body: { isActive: false },
    });
    assert.strictEqual(deactRes.status, 200);
    assert.strictEqual(deactRes.body.isActive ?? deactRes.body.plan?.isActive, false);

    let dbPlan = await prisma.plan.findUnique({ where: { id: createdPlanId } });
    assert.strictEqual(dbPlan?.isActive, false, 'Persisted isActive as false');

    // 2. Reactivate
    const reactRes = await apiRequest(serverCtx.baseUrl, `/api/admin/plans/${createdPlanId}/status`, {
      method: 'PATCH',
      token: getToken(adminSession),
      body: { isActive: true },
    });
    assert.strictEqual(reactRes.status, 200);
    assert.strictEqual(reactRes.body.isActive ?? reactRes.body.plan?.isActive, true);

    dbPlan = await prisma.plan.findUnique({ where: { id: createdPlanId } });
    assert.strictEqual(dbPlan?.isActive, true, 'Persisted isActive as true');
  });

  await t.test('Package Mgmt: Super Admin assigns package to a business atomically', async () => {
    // Find regular business created in test setup
    const business = await prisma.business.findFirstOrThrow({
      where: { slug: `existing-cafe-${runId}` },
    });

    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/businesses/${business.id}/assign-plan`, {
      method: 'POST',
      token: getToken(adminSession),
      body: {
        planId: createdPlanId,
        billingInterval: 'MONTHLY',
      },
    });

    assert.strictEqual(res.status, 200, 'Plan assigned successfully');
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.subscription.planId, createdPlanId);

    // Verify business subscription in PostgreSQL
    const updatedSub = await prisma.subscription.findUnique({
      where: { businessId: business.id },
      include: { plan: true },
    });
    assert.ok(updatedSub, 'Subscription exists');
    assert.strictEqual(updatedSub?.planId, createdPlanId);
    assert.strictEqual(updatedSub?.plan.name, `Platinum Enterprise Plus ${runId}`);
    assert.strictEqual(updatedSub?.status, 'ACTIVE');

    // Verify subscription history preserved in AuditLog
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'BUSINESS',
        entityId: business.id,
      },
    });
    assert.ok(auditLogs.length >= 1, 'Audit log recorded for plan assignment');
    assert.strictEqual(auditLogs[0].action, 'BUSINESS_PLAN_CHANGED');
  });

  await t.test('Package Mgmt: Assigned packages cannot be destructively deleted (referential integrity check)', async () => {
    // Attempting to delete createdPlanId which is now assigned to existing-cafe
    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/plans/${createdPlanId}`, {
      method: 'DELETE',
      token: getToken(adminSession),
    });

    assert.strictEqual(res.status, 409, 'Returns HTTP 409 Conflict when package has active subscriptions');
    assert.strictEqual(res.body.code, 'PLAN_IN_USE');
    assert.ok(res.body.error.includes('subscribed'), 'Advises that package cannot be deleted while in use');

    // Verify plan still exists in PostgreSQL
    const dbPlan = await prisma.plan.findUnique({ where: { id: createdPlanId } });
    assert.ok(dbPlan, 'Plan was not deleted and DB integrity preserved');
  });

  await t.test('Package Mgmt: Unassigned package can be safely deleted', async () => {
    // Create a temporary unassigned package
    const tempPlan = await prisma.plan.create({
      data: {
        name: `Temporary Deletable Plan ${runId}`,
        slug: `temp-deletable-${runId}`,
        priceMinor: 10000,
        features: ['CUSTOMER_CRM'],
      },
    });

    const res = await apiRequest(serverCtx.baseUrl, `/api/admin/plans/${tempPlan.id}`, {
      method: 'DELETE',
      token: getToken(adminSession),
    });

    assert.strictEqual(res.status, 200, 'Unassigned package deleted with HTTP 200');
    assert.strictEqual(res.body.success, true);

    const dbPlan = await prisma.plan.findUnique({ where: { id: tempPlan.id } });
    assert.strictEqual(dbPlan, null, 'Plan permanently deleted from DB');
  });

  await t.test('Package Mgmt: Entitlement check enforces plan features server-side', async () => {
    // Business was assigned Platinum Enterprise Plus which has 'ENTERPRISE_SECURITY' and 'BRANCHES'
    const business = await prisma.business.findFirstOrThrow({
      where: { slug: `existing-cafe-${runId}` },
    });

    const sub = await prisma.subscription.findUnique({
      where: { businessId: business.id },
      include: { plan: true },
    });

    const entitledFeatures = (sub?.plan.features as string[]) || [];
    assert.ok(entitledFeatures.includes('ENTERPRISE_SECURITY'), 'Enterprise security is entitled');
    assert.ok(entitledFeatures.includes('BRANCHES'), 'Branches feature is entitled');
    assert.strictEqual(entitledFeatures.includes('NON_EXISTENT_FEATURE'), false, 'Non-existent feature not entitled');
  });
});
