import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword } from '../../src/server/auth/sessionService';
import {
  provisionBusinessFromRequest,
  completeInvitationSetup,
} from '../../src/server/services/managedProvisioningService';
import { resolvePublicQr } from '../../src/server/services/customerPwaService';

test('MANAGED BUSINESS PROVISIONING + CLIENT ONBOARDING TEST SUITE', async (t) => {
  let serverCtx: TestServerContext;
  let superAdminUser: any;
  let superAdminSession: any;
  let regularUser: any;
  let regularSession: any;
  let superAdminContext: TenantContext;
  let testBusinessA: any;
  let testRoleOwner: any;

  t.before(async () => {
    serverCtx = await startTestServer();

    // 1. Ensure OWNER role exists
    testRoleOwner = await prisma.role.findFirst({
      where: { name: 'OWNER' },
    });
    if (!testRoleOwner) {
      testRoleOwner = await prisma.role.create({
        data: {
          name: 'OWNER',
          description: 'Full business workspace ownership',
          isSystem: true,
        },
      });
    }


    // 2. Create Super Admin User & Session
    const superAdminPasswordHash = await hashPassword('SuperAdminPass2026!');
    superAdminUser = await prisma.user.upsert({
      where: { email: 'superadmin.provisioning@reployty.com' },
      update: { isSuperAdmin: true, status: 'ACTIVE' },
      create: {
        email: 'superadmin.provisioning@reployty.com',
        name: 'Super Admin Provisioner',
        passwordHash: superAdminPasswordHash,
        isSuperAdmin: true,
        status: 'ACTIVE',
      },
    });

    const superAdminSessionToken = 'test-token-superadmin-' + crypto.randomUUID();
    superAdminSession = await prisma.session.create({
      data: {
        userId: superAdminUser.id,
        sessionToken: superAdminSessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    superAdminContext = {
      user: {
        id: superAdminUser.id,
        email: superAdminUser.email,
        name: superAdminUser.name,
        isSuperAdmin: true,
      },
      userId: superAdminUser.id,
      userEmail: superAdminUser.email,
      userName: superAdminUser.name,
      isSuperAdmin: true,
      businessId: 'platform',
      businessName: 'Reployty Platform',
      businessCategory: 'SaaS',
      roleName: 'SUPER_ADMIN',
      permissions: new Set(['*']),
      hasPermission: () => true,
      isOwner: true,
    } as any;


    // 3. Create Regular Business Staff User & Session (for isolation and RBAC tests)
    const regularPasswordHash = await hashPassword('RegularStaffPass2026!');
    testBusinessA = await prisma.business.create({
      data: {
        name: 'Existing Tenant Cafe',
        slug: 'existing-tenant-' + Date.now(),
        category: 'CAFE',
        status: 'ACTIVE',
      },
    });

    regularUser = await prisma.user.create({
      data: {
        email: `regular.staff.${Date.now()}@reployty.com`,
        name: 'Regular Staff Member',
        passwordHash: regularPasswordHash,
        isSuperAdmin: false,
        status: 'ACTIVE',
      },
    });

    await prisma.staffMembership.create({
      data: {
        businessId: testBusinessA.id,
        userId: regularUser.id,
        roleId: testRoleOwner.id,
        status: 'ACTIVE',
      },
    });

    const regularSessionToken = 'test-token-regular-' + crypto.randomUUID();
    regularSession = await prisma.session.create({
      data: {
        userId: regularUser.id,
        businessId: testBusinessA.id,
        sessionToken: regularSessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  });

  t.after(async () => {
    if (serverCtx) {
      await serverCtx.stop();
    }
  });

  // ==========================================================================
  // 1. PUBLIC ONBOARDING SUBMISSION TESTS
  // ==========================================================================
  await t.test('Step 1: Public Client Onboarding Form creates PENDING request without activating tenant', async () => {
    const payload = {
      businessName: 'Artisan Roast Roastery',
      category: 'CAFE',
      description: 'Single-origin espresso and artisanal baked goods',
      website: 'https://artisanroast.example.com',
      businessPhone: '+91 98200 11223',
      ownerName: 'Rahul Sharma',
      ownerEmail: `rahul.sharma.${Date.now()}@example.com`,
      ownerPhone: '+91 98200 44556',
      country: 'India',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      address: '104 100ft Road, Indiranagar',
      numberOfBranches: 1,
      themePreset: 'WARM_ARTISAN',
    };

    const res = await apiRequest(serverCtx.baseUrl, '/api/public/onboarding-requests', {
      method: 'POST',
      body: payload,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    // Section 12: Professional confirmation message without internal ID leaks
    assert.match(res.body.message, /setup request has been received/i);

    // Verify record in PostgreSQL database
    const createdReq = await prisma.businessOnboardingRequest.findFirst({
      where: { ownerEmail: payload.ownerEmail.toLowerCase() },
    });

    assert.ok(createdReq, 'Onboarding request must exist in database');
    assert.equal(createdReq.status, 'PENDING');
    assert.equal(createdReq.businessName, payload.businessName);
    assert.equal(createdReq.businessCategory, 'CAFE');
    assert.equal(createdReq.estimatedBranches, 1);
    assert.equal(createdReq.provisionedBusinessId, null, 'Tenant must not be provisioned yet');


    // Verify no active business with this email was created directly
    const bizCheck = await prisma.business.findFirst({
      where: { email: payload.ownerEmail.toLowerCase() },
    });
    assert.equal(bizCheck, null, 'Public submission must never directly create an active tenant');
  });

  await t.test('Step 2: Public submission validation rejects missing required fields and malformed emails', async () => {
    // Missing business name
    const res1 = await apiRequest(serverCtx.baseUrl, '/api/public/onboarding-requests', {
      method: 'POST',
      body: {
        category: 'CAFE',
        ownerName: 'Jane Doe',
        ownerEmail: 'jane@example.com',
        ownerPhone: '+91 9876543210',
        country: 'India',
        city: 'Mumbai',
        address: 'Bandra West',
      },
    });
    assert.equal(res1.status, 400);
    assert.match(res1.body.error, /Business name must be at least 2 characters/i);


    // Malformed email
    const res2 = await apiRequest(serverCtx.baseUrl, '/api/public/onboarding-requests', {
      method: 'POST',
      body: {
        businessName: 'Invalid Email Cafe',
        category: 'CAFE',
        ownerName: 'Jane Doe',
        ownerEmail: 'not-an-email',
        ownerPhone: '+91 9876543210',
        country: 'India',
        city: 'Mumbai',
        address: 'Bandra West',
      },
    });
    assert.equal(res2.status, 400);
    assert.match(res2.body.error, /valid.*email/i);
  });


  // ==========================================================================
  // 2. SUPER ADMIN REVIEW & RBAC SECURITY
  // ==========================================================================
  await t.test('Step 3: Super Admin endpoint rejects unauthenticated and non-admin requests', async () => {
    // 1. Unauthenticated request -> 401
    const resUnauth = await apiRequest(serverCtx.baseUrl, '/api/admin/onboarding-requests');
    assert.equal(resUnauth.status, 401);

    // 2. Regular non-super-admin user -> 403 Forbidden
    const resForbidden = await apiRequest(serverCtx.baseUrl, '/api/admin/onboarding-requests', {
      token: regularSession.sessionToken,
    });
    assert.equal(resForbidden.status, 403);
    assert.equal(resForbidden.body.code, 'FORBIDDEN_SUPER_ADMIN');
  });

  await t.test('Step 4: Super Admin can list, filter, search, and update application status', async () => {
    const uniqueEmail = `review.test.${Date.now()}@example.com`;
    const appReq = await prisma.businessOnboardingRequest.create({
      data: {
        businessName: 'The Nordic Bakery',
        businessCategory: 'BAKERY',
        ownerName: 'Soren Lind',
        ownerEmail: uniqueEmail,
        ownerPhone: '+91 98111 22334',
        country: 'India',
        city: 'Delhi',
        address: 'Hauz Khas Village',
        status: 'PENDING',
      },
    });

    // 1. List with Super Admin session
    const listRes = await apiRequest(serverCtx.baseUrl, '/api/admin/onboarding-requests', {
      token: superAdminSession.sessionToken,
    });
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.items));
    assert.ok(listRes.body.counts);

    // 2. Search by business name
    const searchRes = await apiRequest(serverCtx.baseUrl, '/api/admin/onboarding-requests?search=Nordic', {
      token: superAdminSession.sessionToken,
    });
    assert.equal(searchRes.status, 200);
    const found = searchRes.body.items.some((i: any) => i.id === appReq.id);
    assert.ok(found, 'Search should locate the application');

    // 3. Update status to UNDER_REVIEW
    const updateRes = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${appReq.id}/status`, {
      method: 'PATCH',
      token: superAdminSession.sessionToken,
      body: { status: 'UNDER_REVIEW', reviewNotes: 'Identity confirmed via phone.' },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.request.status, 'UNDER_REVIEW');
    assert.equal(updateRes.body.request.notes, 'Identity confirmed via phone.');


    // 4. Update status to APPROVED
    const approveRes = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${appReq.id}/status`, {
      method: 'PATCH',
      token: superAdminSession.sessionToken,
      body: { status: 'APPROVED' },
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.request.status, 'APPROVED');
  });

  // ==========================================================================
  // 3. ATOMIC PROVISIONING TRANSACTION
  // ==========================================================================
  await t.test('Step 5: Super Admin provision atomically creates Business, Branch, Owner User, StaffMembership, QRCode, and OwnerInvitation', async () => {
    const ownerEmail = `artisan.owner.${Date.now()}@example.com`;
    const appReq = await prisma.businessOnboardingRequest.create({
      data: {
        businessName: 'Artisan Roast Flagship',
        businessCategory: 'CAFE',
        businessDescription: 'Artisanal roastery and kitchen',
        ownerName: 'Vikram Mehta',
        ownerEmail,
        ownerPhone: '+91 98200 99887',

        country: 'India',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        address: 'Bandra West, Pali Hill',
        status: 'APPROVED',
      },
    });

    const provisionRes = await apiRequest(serverCtx.baseUrl, `/api/admin/onboarding-requests/${appReq.id}/provision`, {
      method: 'POST',
      token: superAdminSession.sessionToken,
    });

    assert.equal(provisionRes.status, 200);
    assert.equal(provisionRes.body.success, true);
    assert.equal(provisionRes.body.alreadyProvisioned, false);

    const { business, owner, branch, qrCode, invitation } = provisionRes.body;

    // Verify Business
    assert.ok(business.id);
    assert.equal(business.name, 'Artisan Roast Flagship');
    assert.equal(business.status, 'ACTIVE');

    // Verify Main Branch
    assert.ok(branch.id);
    assert.equal(branch.code, 'MAIN-01');


    // Verify Owner User
    assert.ok(owner.id);
    assert.equal(owner.email, ownerEmail.toLowerCase());

    // Verify StaffMembership in DB
    const membership = await prisma.staffMembership.findFirst({
      where: { businessId: business.id, userId: owner.id },
      include: { role: true },
    });
    assert.ok(membership);
    assert.equal(membership.role.name, 'OWNER');
    assert.equal(membership.status, 'ACTIVE');

    // Verify Customer Entry QR Code
    assert.ok(qrCode.code);
    assert.match(qrCode.destinationUrl, new RegExp(`/join/${business.slug}`));

    // Verify Owner Invitation
    assert.ok(invitation.id);
    assert.ok(invitation.rawToken, 'Must generate raw setup token for owner');
    assert.match(invitation.setupUrl, new RegExp(`#setup-password\\?token=${invitation.rawToken}`));

    // Verify DB OnboardingRequest is PROVISIONED
    const updatedReq = await prisma.businessOnboardingRequest.findUnique({
      where: { id: appReq.id },
    });
    assert.equal(updatedReq?.status, 'PROVISIONED');
    assert.equal(updatedReq?.provisionedBusinessId, business.id);

    // Verify Audit Log recorded
    const auditLogs = await prisma.auditLog.findMany({
      where: { businessId: business.id, action: 'BUSINESS_PROVISIONED' },
    });
    assert.ok(auditLogs.length > 0, 'Audit log must record business provisioning');

  });

  // ==========================================================================
  // 4. IDEMPOTENCY & DUPLICATE PROTECTION
  // ==========================================================================
  await t.test('Step 6: Idempotent provisioning guard prevents duplicate business or owner creation', async () => {
    const ownerEmail = `idempotent.${Date.now()}@example.com`;
    const appReq = await prisma.businessOnboardingRequest.create({
      data: {
        businessName: 'Duplicate Test Cafe',
        businessCategory: 'CAFE',
        ownerName: 'Pooja Roy',
        ownerEmail,

        ownerPhone: '+91 98333 44556',
        country: 'India',
        city: 'Pune',
        address: 'Koregaon Park',
        status: 'PENDING',
      },
    });

    // 1. First provision call
    const res1 = await provisionBusinessFromRequest(superAdminContext, appReq.id);
    assert.equal(res1.alreadyProvisioned, false);
    const initialBusinessId = res1.business.id;

    // 2. Second provision call (should be idempotent)
    const res2 = await provisionBusinessFromRequest(superAdminContext, appReq.id);
    assert.equal(res2.alreadyProvisioned, true);
    assert.equal(res2.business.id, initialBusinessId);

    // Count businesses in DB matching slug
    const count = await prisma.business.count({
      where: { id: initialBusinessId },
    });
    assert.equal(count, 1, 'Business must not be created more than once');
  });

  // ==========================================================================
  // 5. SECURE INVITATION & PASSWORD SETUP FLOW
  // ==========================================================================
  await t.test('Step 7: Owner verifies invitation token, sets initial password, and receives authenticated session', async () => {
    const ownerEmail = `invitation.flow.${Date.now()}@example.com`;
    const appReq = await prisma.businessOnboardingRequest.create({
      data: {
        businessName: 'Serene Spa & Wellness',
        businessCategory: 'SPA',
        ownerName: 'Ananya Singhania',
        ownerEmail,

        ownerPhone: '+91 98444 55667',
        country: 'India',
        city: 'Goa',
        address: 'Calangute Main Road',
        status: 'PENDING',
      },
    });

    // Provision business
    const provisionResult = await provisionBusinessFromRequest(superAdminContext, appReq.id);
    const rawToken = provisionResult.invitation!.rawToken;

    // 1. Verify invitation token via public API
    const verifyRes = await apiRequest(serverCtx.baseUrl, `/api/public/invitations/verify?token=${rawToken}`);

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.valid, true);
    assert.equal(verifyRes.body.businessName, 'Serene Spa & Wellness');
    assert.equal(verifyRes.body.ownerEmail, ownerEmail.toLowerCase());

    // 2. Reject weak password (< 8 chars)
    const weakRes = await apiRequest(serverCtx.baseUrl, '/api/public/invitations/complete', {
      method: 'POST',
      body: { token: rawToken, password: 'short' },
    });
    assert.equal(weakRes.status, 400);
    assert.match(weakRes.body.error, /at least 8 characters/i);

    // 3. Complete password setup with strong password
    const completeRes = await apiRequest(serverCtx.baseUrl, '/api/public/invitations/complete', {
      method: 'POST',
      body: { token: rawToken, password: 'SecurePassword2026!' },
    });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.success, true);
    assert.ok(completeRes.body.sessionToken);

    // 4. Verify Owner User in database can authenticate with new password
    const userInDb = await prisma.user.findUnique({
      where: { email: ownerEmail.toLowerCase() },
    });
    assert.ok(userInDb?.passwordHash);

    // 5. Single-use token enforcement: Re-using the same token fails
    const reusedRes = await apiRequest(serverCtx.baseUrl, '/api/public/invitations/complete', {
      method: 'POST',
      body: { token: rawToken, password: 'AnotherPassword2026!' },
    });

    assert.equal(reusedRes.status, 400);
    assert.match(reusedRes.body.error, /already been used/i);
  });

  await t.test('Step 8: Expired or malformed invitation tokens are strictly rejected', async () => {
    // 1. Malformed token
    const malformedRes = await apiRequest(serverCtx.baseUrl, '/api/public/invitations/verify?token=short');
    assert.equal(malformedRes.status, 400);

    // 2. Expired invitation in database
    const fakeToken = crypto.randomBytes(32).toString('hex');
    const fakeTokenHash = crypto.createHash('sha256').update(fakeToken).digest('hex');

    const tempBiz = await prisma.business.create({
      data: { name: 'Expired Token Cafe', slug: 'expired-' + Date.now(), category: 'CAFE' },
    });
    const tempUser = await prisma.user.create({
      data: { email: `expired.${Date.now()}@example.com`, name: 'Expired User' },
    });

    await prisma.ownerInvitation.create({
      data: {
        tokenHash: fakeTokenHash,
        businessId: tempBiz.id,
        userId: tempUser.id,
        expiresAt: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
      },
    });

    const expiredRes = await apiRequest(serverCtx.baseUrl, `/api/public/invitations/verify?token=${fakeToken}`);

    assert.equal(expiredRes.status, 400);
    assert.match(expiredRes.body.error, /expired/i);
  });

  // ==========================================================================
  // 6. CUSTOMER ENTRY QR CODE RESOLUTION
  // ==========================================================================
  await t.test('Step 9: Customer Entry QR Code resolves destination join URL for Customer PWA', async () => {
    const ownerEmail = `qr.resolution.${Date.now()}@example.com`;
    const appReq = await prisma.businessOnboardingRequest.create({
      data: {
        businessName: 'The Tea Lounge',
        businessCategory: 'CAFE',
        ownerName: 'Tanvi Shah',
        ownerEmail,
        ownerPhone: '+91 98555 66778',
        country: 'India',
        city: 'Kolkata',
        address: 'Park Street',
        status: 'PENDING',
      },
    });

    const provisionResult = await provisionBusinessFromRequest(superAdminContext, appReq.id);
    const qrCode = provisionResult.qrCode;

    // Resolve via customerPwaService
    const resolved = await resolvePublicQr(qrCode.code);
    assert.ok(resolved);
    assert.equal(resolved.business.name, 'The Tea Lounge');
    assert.equal(resolved.business.id, provisionResult.business.id);

  });

  // ==========================================================================
  // 7. TENANT ISOLATION & ACCESS CONTROL
  // ==========================================================================
  await t.test('Step 10: Provisioned business owner is scoped to own tenant and blocked from cross-tenant access', async () => {
    // 1. Provision Business B
    const emailB = `tenant.b.owner.${Date.now()}@example.com`;
    const reqB = await prisma.businessOnboardingRequest.create({
      data: {
        businessName: 'Tenant B Specialty Coffee',
        businessCategory: 'CAFE',
        ownerName: 'Owner B',
        ownerEmail: emailB,

        ownerPhone: '+91 98777 88990',
        country: 'India',
        city: 'Hyderabad',
        address: 'Jubilee Hills',
        status: 'PENDING',
      },
    });
    const provB = await provisionBusinessFromRequest(superAdminContext, reqB.id);

    // Complete setup for Owner B
    const setupB = await completeInvitationSetup(provB.invitation!.rawToken, 'SecurePassTenantB2026!');
    const sessionTokenB = setupB.sessionToken;

    // 2. Owner B requests customers of their own business -> Success
    const ownRes = await apiRequest(serverCtx.baseUrl, '/api/customers', {
      token: sessionTokenB,
    });
    assert.equal(ownRes.status, 200);

    // 3. Create customer inside Business A (testBusinessA)
    const customerA = await prisma.customer.create({
      data: {
        businessId: testBusinessA.id,
        phone: '+919999900001',
        name: 'Customer of Business A',
      },
    });

    // 4. Owner B tries to access Business A's customer by ID -> 404 (IDOR block)
    const crossRes = await apiRequest(serverCtx.baseUrl, `/api/customers/${customerA.id}`, {
      token: sessionTokenB,
    });
    assert.equal(crossRes.status, 404);
    assert.equal(crossRes.body.code, 'NOT_FOUND');

    // 5. Owner B tries to access Super Admin overview -> 403 Forbidden
    const adminRes = await apiRequest(serverCtx.baseUrl, '/api/admin/overview', {
      token: sessionTokenB,
    });
    assert.equal(adminRes.status, 403);
  });
});
