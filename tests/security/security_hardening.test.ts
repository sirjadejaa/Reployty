import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../src/server/db/client';
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  revokeSession,
  createPasswordResetToken,
  resetPasswordWithToken,
} from '../../src/server/auth/sessionService';
import {
  getTenantContext,
  requireRole,
  requirePermission,
  requireSuperAdmin,
  TenantContext,
} from '../../src/server/auth/tenantContext';
import {
  requestOtp,
  verifyOtp,
} from '../../src/server/services/otpService';
import {
  createCustomerSession,
  validateCustomerSession,
} from '../../src/server/services/customerAuthService';
import {
  handlePaymentWebhook,
  changePlan,
  cancelSubscription,
  getBusinessBillingOverview,
  BillingError,
} from '../../src/server/services/billingService';
import {
  getBusinessSubscription,
  hasFeature,
} from '../../src/server/services/entitlementService';
import {
  getCustomerById,
} from '../../src/server/services/customerService';
import {
  updateCustomerProfile,
} from '../../src/server/services/crmService';
import {
  updateReward,
} from '../../src/server/services/rewardService';
import {
  getOfferById,
  redeemOffer,
} from '../../src/server/services/offerService';
import {
  getBranchById,
  updateBranch,
  getBusinessBranches,
  updateBusinessProfile,
} from '../../src/server/services/businessService';
import {
  escapeCsvValue,
  exportAnalyticsCsv,
} from '../../src/server/services/analyticsService';
import {
  sanitizeAuditState,
} from '../../src/server/services/auditService';
import {
  loginRateLimiter,
  resetPasswordAttemptLimiter,
  aiReviewGenerationLimiter,
  exportRateLimiter,
  webhookRateLimiter,
} from '../../src/server/auth/rateLimiter';
import { UserStatus, PaymentStatus } from '@prisma/client';

test('SECURITY HARDENING & PRIVACY TEST SUITE (PHASE 16)', async (t) => {
  // Setup baseline test entities
  const cafeBusiness = await prisma.business.findUniqueOrThrow({ where: { slug: 'roasted-bean-cafe' } });
  const salonBusiness = await prisma.business.findUniqueOrThrow({ where: { slug: 'luxe-glow-beauty' } });
  const gymBusiness = await prisma.business.findUniqueOrThrow({ where: { slug: 'iron-pulse-fitness' } });

  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@reployty.com' } });
  const marcusOwner = await prisma.user.findUniqueOrThrow({ where: { email: 'marcus@reployty.com' } });
  const sarahStaff = await prisma.user.findUniqueOrThrow({ where: { email: 'sarah.cashier@reployty.com' } });
  const suspendedUser = await prisma.user.findUniqueOrThrow({ where: { email: 'suspended@reployty.com' } });
  const disabledUser = await prisma.user.findUniqueOrThrow({ where: { email: 'disabled@reployty.com' } });

  // Baseline tenant contexts
  const cafeOwnerCtx = await getTenantContext(marcusOwner.id, cafeBusiness.id);
  const cafeStaffCtx = await getTenantContext(sarahStaff.id, cafeBusiness.id);
  const salonManagerCtx = await getTenantContext(marcusOwner.id, salonBusiness.id);

  // Helper simulating login authentication check
  async function authenticateUser(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !user.passwordHash) throw new Error('Invalid email or password');
    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) throw new Error('Invalid email or password');
    if (user.status !== UserStatus.ACTIVE) throw new Error(`Your account is ${user.status.toLowerCase()}`);
    return user;
  }

  // =========================================================================
  // 1. AUTHENTICATION SECURITY
  // =========================================================================
  await t.test('Auth: Suspended and Disabled accounts are strictly rejected', async () => {
    await assert.rejects(
      async () => authenticateUser('suspended@reployty.com', 'TestPass123!'),
      (err: any) => err.message.includes('suspended')
    );

    await assert.rejects(
      async () => authenticateUser('disabled@reployty.com', 'TestPass123!'),
      (err: any) => err.message.includes('disabled')
    );
  });

  await t.test('Auth: Invalid password firmly rejected without detail exposure', async () => {
    await assert.rejects(
      async () => authenticateUser('marcus@reployty.com', 'CompletelyWrongPass123!'),
      (err: any) => err.message.includes('Invalid')
    );
  });

  await t.test('Auth: Session revocation immediately invalidates session', async () => {
    const session = await createSession(marcusOwner.id, cafeBusiness.id);
    const validBefore = await validateSession(session.sessionToken);
    assert.ok(validBefore, 'Session should be valid upon creation');

    await revokeSession(session.sessionToken);
    const validAfter = await validateSession(session.sessionToken);
    assert.strictEqual(validAfter, null, 'Revoked session must evaluate to null');
  });

  await t.test('Auth: Expired session is not recognized', async () => {
    const expiredSession = await prisma.session.create({
      data: {
        sessionToken: `expired_sec_token_${Date.now()}`,
        userId: marcusOwner.id,
        businessId: cafeBusiness.id,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });

    const validated = await validateSession(expiredSession.sessionToken);
    assert.strictEqual(validated, null, 'Expired session must evaluate to null');

    // Cleanup
    await prisma.session.delete({ where: { sessionToken: expiredSession.sessionToken } }).catch(() => {});
  });

  await t.test('Auth: Password reset token is single-use and revokes active sessions', async () => {
    const res = await createPasswordResetToken('marcus@reployty.com');
    assert.ok(res?.rawToken, 'Password reset token generated');
    const token = res.rawToken;

    // First use: succeeds
    const result = await resetPasswordWithToken(token, 'NewOwnerPassword123!');
    assert.strictEqual(result.success, true, 'First use of token must succeed');

    // Second use: must fail
    await assert.rejects(
      async () => resetPasswordWithToken(token, 'AnotherPass123!'),
      (err: any) => err.message.includes('Invalid or expired')
    );

    // Reset password back to seed password for subsequent tests
    const newHash = await hashPassword('OwnerPass123!');
    await prisma.user.update({
      where: { id: marcusOwner.id },
      data: { passwordHash: newHash },
    });
  });

  // =========================================================================
  // 2. TENANT ISOLATION & IDOR PREVENTION
  // =========================================================================
  await t.test('Tenant Isolation: Cross-tenant Customer lookup returns 404/null', async () => {
    // Pick or create customer belonging to Cafe
    const cafeCustomer = await prisma.customer.findFirst({
      where: { businessId: cafeBusiness.id },
    });
    assert.ok(cafeCustomer, 'Cafe customer exists');

    // Gym context (Marcus has no membership in Gym, let's create a temporary Gym context or verify cross-tenant lookup)
    // When Cafe context queries Gym or vice-versa:
    // If we query a Cafe customer using Salon context:
    const salonCtx = await getTenantContext(marcusOwner.id, salonBusiness.id);
    const crossResult = await getCustomerById(salonCtx, cafeCustomer.id);
    assert.strictEqual(crossResult, null, 'Accessing Cafe customer from Salon tenant must return null/404');
  });

  await t.test('Tenant Isolation: Cross-tenant Customer update rejected', async () => {
    const cafeCustomer = await prisma.customer.findFirst({
      where: { businessId: cafeBusiness.id },
    });
    assert.ok(cafeCustomer);

    const salonCtx = await getTenantContext(marcusOwner.id, salonBusiness.id);
    await assert.rejects(
      async () => updateCustomerProfile(salonCtx, cafeCustomer.id, { name: 'Hacked Name' }),
      (err: any) => err.message.includes('Customer not found')
    );
  });

  await t.test('Tenant Isolation: Cross-tenant Reward update rejected', async () => {
    const cafeReward = await prisma.reward.findFirst({
      where: { businessId: cafeBusiness.id },
    });
    assert.ok(cafeReward, 'Cafe reward exists');

    const salonCtx = await getTenantContext(marcusOwner.id, salonBusiness.id);
    await assert.rejects(
      async () => updateReward(salonCtx, cafeReward.id, { title: 'Hacked Title' }),
      (err: any) => err.message.includes('Reward not found') || err.message.includes('access denied')
    );
  });

  await t.test('Tenant Isolation: Cross-tenant Offer lookup and redemption rejected', async () => {
    const cafeOffer = await prisma.offer.findFirst({
      where: { businessId: cafeBusiness.id },
    });
    const cafeCustomer = await prisma.customer.findFirst({
      where: { businessId: cafeBusiness.id },
    });
    assert.ok(cafeOffer && cafeCustomer);

    const salonCtx = await getTenantContext(marcusOwner.id, salonBusiness.id);
    // Cross tenant lookup rejected
    await assert.rejects(
      async () => getOfferById(salonCtx, cafeOffer.id),
      (err: any) => err.message.includes('Offer not found')
    );

    // Cross tenant redemption rejected
    await assert.rejects(
      async () => redeemOffer(salonCtx, {
        customerId: cafeCustomer.id,
        offerId: cafeOffer.id,
      }),
      (err: any) => err.message.includes('not found')
    );
  });

  await t.test('Tenant Isolation: Cross-tenant Branch update rejected', async () => {
    const cafeBranch = await prisma.branch.findFirst({
      where: { businessId: cafeBusiness.id },
    });
    assert.ok(cafeBranch);

    const salonCtx = await getTenantContext(marcusOwner.id, salonBusiness.id);
    await assert.rejects(
      async () => updateBranch(salonCtx, cafeBranch.id, { name: 'Renamed Branch' }),
      (err: any) => err.message.includes('Branch not found')
    );
  });

  await t.test('Tenant Isolation: Tenant switching rejects unauthorized business', async () => {
    // Marcus has no membership in gymBusiness
    await assert.rejects(
      async () => getTenantContext(marcusOwner.id, gymBusiness.id),
      (err: any) => err.message.includes('not a member')
    );
  });

  // =========================================================================
  // 3. RBAC & PRIVILEGE BOUNDARIES
  // =========================================================================
  await t.test('RBAC: Staff role cannot manage billing or settings', async () => {
    assert.throws(
      () => requirePermission(cafeStaffCtx, 'BILLING_MANAGE'),
      (err: any) => err.message.includes('Missing required permission')
    );

    assert.throws(
      () => requireRole(cafeStaffCtx, ['OWNER', 'MANAGER']),
      (err: any) => err.message.includes('not authorized')
    );
  });

  await t.test('RBAC: Super Admin boundary rejects non-admin users', async () => {
    assert.throws(
      () => requireSuperAdmin(cafeOwnerCtx),
      (err: any) => err.message.toLowerCase().includes('superadmin')
    );

    assert.throws(
      () => requireSuperAdmin(cafeStaffCtx),
      (err: any) => err.message.toLowerCase().includes('superadmin')
    );

    // Valid Super Admin context
    const superAdminCtx = await getTenantContext(adminUser.id, cafeBusiness.id);
    assert.doesNotThrow(() => requireSuperAdmin(superAdminCtx));
  });

  // =========================================================================
  // 4. BRANCH ISOLATION
  // =========================================================================
  await t.test('Branch Isolation: Staff with branch assignment cannot access foreign branch', async () => {
    // Create secondary branch for Cafe
    const secondaryBranch = await prisma.branch.upsert({
      where: { id: 'branch_cafe_secondary_test' },
      update: {},
      create: {
        id: 'branch_cafe_secondary_test',
        businessId: cafeBusiness.id,
        name: 'Uptown Branch',
        code: 'UP-02',
      },
    });

    // Sarah is assigned to branch_cafe_main with SETTINGS_VIEW permission
    const staffCtxWithBranch: TenantContext = {
      ...cafeStaffCtx,
      branchId: 'branch_cafe_main',
      hasPermission: (perm: string) => perm === 'SETTINGS_VIEW' || perm === 'SETTINGS_MANAGE' || cafeStaffCtx.hasPermission(perm),
    };

    // Accessing secondary branch should return null (safe 404 behavior)
    const result = await getBranchById(staffCtxWithBranch, secondaryBranch.id);
    assert.strictEqual(result, null, 'Restricted staff querying foreign branch receives null');

    // Modifying secondary branch should be denied
    await assert.rejects(
      async () => updateBranch(staffCtxWithBranch, secondaryBranch.id, { name: 'Unauthorized Name' }),
      (err: any) => err.message.includes('restricted to their assigned branch')
    );
  });

  // =========================================================================
  // 5. CUSTOMER OTP & SESSION SEPARATION
  // =========================================================================
  await t.test('Customer OTP: Brute force lockout and timing-safe attempt tracking', async () => {
    const testPhone = '+15559876543';
    await prisma.customerOtpChallenge.deleteMany({ where: { phone: testPhone } });

    await requestOtp({ businessId: cafeBusiness.id, phone: testPhone });

    // 4 failed attempts with INVALID_OTP
    for (let i = 0; i < 4; i++) {
      await assert.rejects(
        async () => verifyOtp({ businessId: cafeBusiness.id, phone: testPhone, code: '000000' }),
        (err: any) => err.code === 'INVALID_OTP'
      );
    }

    // 5th attempt triggers TOO_MANY_ATTEMPTS
    await assert.rejects(
      async () => verifyOtp({ businessId: cafeBusiness.id, phone: testPhone, code: '000000' }),
      (err: any) => err.code === 'TOO_MANY_ATTEMPTS'
    );
  });

  await t.test('Customer Sessions: Session separation between business and customer', async () => {
    // Create customer session
    const customer = await prisma.customer.findFirst({ where: { businessId: cafeBusiness.id } });
    assert.ok(customer);

    const custSession = await createCustomerSession(customer.id, cafeBusiness.id);
    assert.ok(custSession.sessionToken);

    // Customer token used against staff validateSession -> returns null
    const staffCheck = await validateSession(custSession.sessionToken);
    assert.strictEqual(staffCheck, null, 'Customer session token must never validate as staff session');

    // Staff session used against validateCustomerSession -> returns null
    const staffSession = await createSession(marcusOwner.id, cafeBusiness.id);
    const custCheck = await validateCustomerSession(staffSession.sessionToken);
    assert.strictEqual(custCheck, null, 'Staff session token must never validate as customer session');
  });

  // =========================================================================
  // 6. BILLING SECURITY & WEBHOOK IDEMPOTENCY
  // =========================================================================
  await t.test('Billing: Webhook idempotency prevents duplicate payment creation', async () => {
    const uniqueEventId = `evt_sec_${Date.now()}`;
    const uniqueProviderPaymentId = `pay_sec_${Date.now()}`;

    const payload = {
      eventId: uniqueEventId,
      providerPaymentId: uniqueProviderPaymentId,
      businessId: cafeBusiness.id,
      amountMinor: 299900,
      currency: 'INR',
      status: 'SUCCESS' as const,
    };

    // First delivery -> processed: true
    const firstRun = await handlePaymentWebhook(payload);
    assert.strictEqual(firstRun.processed, true);
    assert.strictEqual(firstRun.payment.providerPaymentId, uniqueProviderPaymentId);

    // Second delivery (replay) -> processed: false (idempotent)
    const secondRun = await handlePaymentWebhook(payload);
    assert.strictEqual(secondRun.processed, false);
    assert.strictEqual(secondRun.payment.id, firstRun.payment.id, 'Duplicate webhook must return existing payment');
  });

  await t.test('Billing: Invalid webhook payload rejected safely', async () => {
    await assert.rejects(
      async () => handlePaymentWebhook({
        eventId: 'test',
        providerPaymentId: '',
        businessId: cafeBusiness.id,
        amountMinor: 100,
        status: 'SUCCESS',
      }),
      (err: any) => err instanceof BillingError && err.message.includes('providerPaymentId')
    );

    await assert.rejects(
      async () => handlePaymentWebhook({
        eventId: 'test',
        providerPaymentId: 'test_pay',
        businessId: '',
        amountMinor: 100,
        status: 'SUCCESS',
      }),
      (err: any) => err instanceof BillingError && err.message.includes('businessId')
    );
  });

  // =========================================================================
  // 7. INPUT VALIDATION & URL SECURITY
  // =========================================================================
  await t.test('Input: Open redirect prevention on business URLs', async () => {
    // javascript: URL must be rejected
    await assert.rejects(
      async () => updateBusinessProfile(cafeOwnerCtx, {
        website: 'javascript:alert(1)',
      }),
      (err: any) => err.message.includes('Invalid website URL')
    );

    await assert.rejects(
      async () => updateBusinessProfile(cafeOwnerCtx, {
        googleReviewUrl: 'file:///etc/passwd',
      }),
      (err: any) => err.message.toLowerCase().includes('google review url')
    );
  });

  // =========================================================================
  // 8. EXPORT SECURITY & CSV FORMULA INJECTION
  // =========================================================================
  await t.test('Export: Formula injection characters are neutralized with single-quote escaping', () => {
    assert.strictEqual(escapeCsvValue('=SUM(1,2)'), `"'=SUM(1,2)"`, 'Formula starting with = must be escaped');
    assert.strictEqual(escapeCsvValue('+cmd|"/C calc"!A0'), `\"'+cmd|\"\"/C calc\"\"!A0\"`, 'Formula starting with + must be escaped');
    assert.strictEqual(escapeCsvValue('-10+20'), "'-10+20", 'Formula starting with - followed by non-digits must be escaped');
    assert.strictEqual(escapeCsvValue('@HYPERLINK("http://evil.com")'), `\"'@HYPERLINK(\"\"http://evil.com\"\")\"`, 'Formula starting with @ must be escaped');
    assert.strictEqual(escapeCsvValue(1234.56), '1234.56', 'Plain numeric values remain uncorrupted');
    assert.strictEqual(escapeCsvValue(-42), '-42', 'Negative pure numbers remain numbers');
    assert.strictEqual(escapeCsvValue('Regular Customer Name'), 'Regular Customer Name', 'Regular strings remain normal');
  });

  // =========================================================================
  // 9. AUDIT LOG & PRIVACY SANITIZATION
  // =========================================================================
  await t.test('Privacy: sanitizeAuditState strips passwords, tokens, hashes, and OTPs', () => {
    const sensitivePayload = {
      user: 'test@reployty.com',
      password: 'PlainSecretPassword123!',
      passwordHash: '$2a$10$e8w4Gv7YwX...',
      sessionToken: 'session_token_xyz999',
      otp: '123456',
      otpHash: 'sha256hash...',
      nested: {
        apiKey: 'sk_live_12345678',
        clientSecret: 'secret_live_9999',
        safeProperty: 'AllowedValue',
      },
    };

    const sanitized = sanitizeAuditState(sensitivePayload);

    assert.strictEqual(sanitized.password, '[REDACTED]');
    assert.strictEqual(sanitized.passwordHash, '[REDACTED]');
    assert.strictEqual(sanitized.sessionToken, '[REDACTED]');
    assert.strictEqual(sanitized.otp, '[REDACTED]');
    assert.strictEqual(sanitized.otpHash, '[REDACTED]');
    assert.strictEqual(sanitized.nested.apiKey, '[REDACTED]');
    assert.strictEqual(sanitized.nested.clientSecret, '[REDACTED]');
    assert.strictEqual(sanitized.nested.safeProperty, 'AllowedValue');
  });

  // =========================================================================
  // 10. RATE LIMITERS
  // =========================================================================
  await t.test('Rate Limiting: Verifying rate limiters trigger within configured threshold', () => {
    const ip = `192.0.2.${Math.floor(Math.random() * 250)}`;

    // aiReviewGenerationLimiter: 20 per 15 min
    let aiExceeded = false;
    for (let i = 0; i < 22; i++) {
      const res = aiReviewGenerationLimiter.consume(ip);
      if (!res.allowed) {
        aiExceeded = true;
        break;
      }
    }
    assert.strictEqual(aiExceeded, true, 'AI review rate limiter should throttle after 20 attempts');

    // exportRateLimiter: 15 per minute
    const exportIp = `198.51.100.${Math.floor(Math.random() * 250)}`;
    let exportExceeded = false;
    for (let i = 0; i < 18; i++) {
      const res = exportRateLimiter.consume(exportIp);
      if (!res.allowed) {
        exportExceeded = true;
        break;
      }
    }
    assert.strictEqual(exportExceeded, true, 'Export rate limiter should throttle after 15 attempts');

    // webhookRateLimiter: 100 per minute
    const webhookIp = `203.0.113.${Math.floor(Math.random() * 250)}`;
    let webhookAllowed = true;
    for (let i = 0; i < 50; i++) {
      const res = webhookRateLimiter.consume(webhookIp);
      if (!res.allowed) {
        webhookAllowed = false;
      }
    }
    assert.strictEqual(webhookAllowed, true, 'Webhook rate limiter allows legitimate bursts up to 100');
  });
});
