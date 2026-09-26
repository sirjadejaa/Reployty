import { prisma } from '../../src/server/db/client';
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  revokeSession,
  switchSessionTenant,
  createPasswordResetToken,
  resetPasswordWithToken,
} from '../../src/server/auth/sessionService';
import { getTenantContext, requireRole, requirePermission } from '../../src/server/auth/tenantContext';
import { getCustomers, getCustomerById } from '../../src/server/services/customerService';
import { loginRateLimiter } from '../../src/server/auth/rateLimiter';

let testPassedCount = 0;
let testFailedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testPassedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    testFailedCount++;
  }
}

async function runSecuritySuite() {
  console.log('\n======================================================');
  console.log('REPLOYTY PROMPT 3: AUTH & TENANT SECURITY TEST SUITE');
  console.log('======================================================\n');

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Password Hashing Invariant (Bcrypt)
    // ------------------------------------------------------------------------
    console.log('[1] Password Hashing & Bcrypt Verification:');
    const rawPass = 'SuperSecret123!';
    const hashed = await hashPassword(rawPass);
    assert(hashed.startsWith('$2a$') || hashed.startsWith('$2b$'), 'Password is hashed with bcrypt');
    assert(hashed !== rawPass, 'Plaintext password is never stored or matched directly');
    const validMatch = await verifyPassword(rawPass, hashed);
    assert(validMatch === true, 'Valid password verifies successfully against hash');
    const invalidMatch = await verifyPassword('WrongPassword', hashed);
    assert(invalidMatch === false, 'Invalid password is firmly rejected');

    // ------------------------------------------------------------------------
    // TEST 2: Seeded User & Account Status Verification
    // ------------------------------------------------------------------------
    console.log('\n[2] Seeded User & Account Status Checks:');
    const ownerUser = await prisma.user.findUnique({
      where: { email: 'marcus@reployty.com' },
      include: { memberships: { include: { business: true, role: true } } },
    });
    assert(!!ownerUser, 'Marcus Vance (Owner) exists in PostgreSQL');
    assert(ownerUser?.status === 'ACTIVE', 'Marcus Vance is in ACTIVE status');
    assert(ownerUser?.memberships.length === 2, 'Marcus has multi-tenant memberships (2 businesses: Cafe & Salon)');

    const suspendedUser = await prisma.user.findUnique({
      where: { email: 'suspended@reployty.com' },
    });
    assert(suspendedUser?.status === 'SUSPENDED', 'Suspended test user has SUSPENDED status');

    const disabledUser = await prisma.user.findUnique({
      where: { email: 'disabled@reployty.com' },
    });
    assert(disabledUser?.status === 'DISABLED', 'Disabled test user has DISABLED status');

    // ------------------------------------------------------------------------
    // TEST 3: Database-Backed Session Lifecycle
    // ------------------------------------------------------------------------
    console.log('\n[3] Session Creation, Validation, and Revocation:');
    const cafeBiz = ownerUser!.memberships.find(m => m.business.category === 'CAFE')!.business;
    const session = await createSession(ownerUser!.id, cafeBiz.id, '127.0.0.1', 'Node-TestSuite/1.0');
    assert(!!session.sessionToken, 'Session token generated');
    assert(session.revokedAt === null, 'New session is not revoked');
    assert(session.expiresAt > new Date(), 'Session expires in the future');

    const validatedSession = await validateSession(session.sessionToken);
    assert(!!validatedSession, 'Session successfully validated against PostgreSQL');
    assert(validatedSession?.userId === ownerUser!.id, 'Session belongs to Marcus Vance');

    await revokeSession(session.sessionToken);
    const postRevoke = await validateSession(session.sessionToken);
    assert(postRevoke === null, 'Revoked session is rejected by validateSession');

    // ------------------------------------------------------------------------
    // TEST 4: Role & Permission Enforcement (Owner vs Staff)
    // ------------------------------------------------------------------------
    console.log('\n[4] RBAC & Granular Permission Checks:');
    const ownerCtx = await getTenantContext(ownerUser!.id, cafeBiz.id);
    assert(ownerCtx.isOwner === true, 'Marcus is recognized as OWNER');
    assert(ownerCtx.hasPermission('SETTINGS_MANAGE') === true, 'Owner has SETTINGS_MANAGE permission');
    assert(ownerCtx.hasPermission('LOYALTY_MANAGE') === true, 'Owner has LOYALTY_MANAGE permission');
    assert(ownerCtx.hasPermission('REWARDS_REDEEM') === true, 'Owner has REWARDS_REDEEM permission');

    const staffUser = await prisma.user.findUnique({
      where: { email: 'sarah.cashier@reployty.com' },
      include: { memberships: { include: { business: true, role: true } } },
    });
    assert(!!staffUser, 'Sarah Jenkins (Staff) exists in database');
    const staffCtx = await getTenantContext(staffUser!.id, cafeBiz.id);
    assert(staffCtx.isOwner === false, 'Sarah is NOT an owner');
    assert(staffCtx.roleName === 'STAFF', 'Sarah has STAFF role');
    assert(staffCtx.hasPermission('CUSTOMERS_VIEW') === true, 'Staff has CUSTOMERS_VIEW permission');
    assert(staffCtx.hasPermission('REWARDS_REDEEM') === true, 'Staff has REWARDS_REDEEM permission');
    assert(staffCtx.hasPermission('STAFF_MANAGE') === false, 'Staff is DENIED STAFF_MANAGE permission');
    assert(staffCtx.hasPermission('SETTINGS_MANAGE') === false, 'Staff is DENIED SETTINGS_MANAGE permission');

    // Test requireRole and requirePermission throw errors properly
    let roleDenied = false;
    try {
      requireRole(staffCtx, ['OWNER', 'MANAGER']);
    } catch {
      roleDenied = true;
    }
    assert(roleDenied === true, 'requireRole rejects STAFF when OWNER/MANAGER is required');

    let permDenied = false;
    try {
      requirePermission(staffCtx, 'SETTINGS_MANAGE');
    } catch {
      permDenied = true;
    }
    assert(permDenied === true, 'requirePermission rejects missing SETTINGS_MANAGE permission');

    // ------------------------------------------------------------------------
    // TEST 5: Tenant Isolation & IDOR Protection
    // ------------------------------------------------------------------------
    console.log('\n[5] Multi-Tenant Data Isolation & IDOR Defense:');
    // Fetch customers belonging to Cafe
    const cafeCustomersRes = await getCustomers(ownerCtx);
    const cafeCustomers = cafeCustomersRes.data;
    assert(cafeCustomers.length > 0, `Retrieved ${cafeCustomers.length} customers in Cafe tenant`);
    for (const c of cafeCustomers) {
      assert(c.businessId === cafeBiz.id, `Customer ${c.name} matches Cafe businessId`);
    }

    // Now resolve context for Salon
    const salonBiz = ownerUser!.memberships.find(m => m.business.category === 'SALON')!.business;
    const salonCtx = await getTenantContext(ownerUser!.id, salonBiz.id);
    const salonCustomersRes = await getCustomers(salonCtx);
    const salonCustomers = salonCustomersRes.data;
    for (const c of salonCustomers) {
      assert(c.businessId === salonBiz.id, `Salon customer ${c.name} matches Salon businessId`);
    }

    // Attempt IDOR: Request a Cafe customer ID using Salon tenant context
    const cafeCustId = cafeCustomers[0].id;
    const idorResult = await getCustomerById(salonCtx, cafeCustId);
    assert(idorResult === null, 'Cross-tenant customer fetch (IDOR) returns null / 404');

    // Fetching the same customer with Cafe context succeeds
    const legitResult = await getCustomerById(ownerCtx, cafeCustId);
    assert(legitResult !== null && legitResult.id === cafeCustId, 'Customer fetch with matching tenant context succeeds');

    // ------------------------------------------------------------------------
    // TEST 6: Multi-Tenant Switching Invariants
    // ------------------------------------------------------------------------
    console.log('\n[6] Tenant Switching Invariants:');
    const switchSession = await createSession(ownerUser!.id, cafeBiz.id, '127.0.0.1', 'Node-TestSuite/1.0');
    assert(switchSession.businessId === cafeBiz.id, 'Session initially bound to Cafe');

    // Switch to authorized business (Salon)
    const updatedSwitch = await switchSessionTenant(switchSession.sessionToken, salonBiz.id);
    assert(updatedSwitch.businessId === salonBiz.id, 'Session switched successfully to authorized Salon business');

    // Attempt switch to unauthorized business (Tuscan Bistro or Gym where Marcus has no membership)
    const gymBiz = await prisma.business.findFirst({ where: { slug: 'iron-pulse-fitness' } });
    assert(!!gymBiz, 'Iron Pulse Fitness exists in DB');

    let switchDenied = false;
    try {
      await switchSessionTenant(switchSession.sessionToken, gymBiz!.id);
    } catch {
      switchDenied = true;
    }
    assert(switchDenied === true, 'Unauthorized tenant switch is blocked with an error');

    // Clean up switch session
    await revokeSession(switchSession.sessionToken);

    // ------------------------------------------------------------------------
    // TEST 7: Rate Limiter Invariant
    // ------------------------------------------------------------------------
    console.log('\n[7] Brute-Force Rate Limiting Invariant:');
    const testIp = '192.168.1.99_attacker';
    loginRateLimiter.reset(testIp);
    let attemptsBlocked = false;
    for (let i = 0; i < 7; i++) {
      const res = loginRateLimiter.consume(testIp);
      if (!res.allowed) {
        attemptsBlocked = true;
        break;
      }
    }
    assert(attemptsBlocked === true, 'Rate limiter triggers after max failed attempts');
    loginRateLimiter.reset(testIp);

    // ------------------------------------------------------------------------
    // TEST 8: Password Reset Token Security
    // ------------------------------------------------------------------------
    console.log('\n[8] Secure Password Reset Token Flow:');
    const resetResult = await createPasswordResetToken('marcus@reployty.com');
    assert(!!resetResult && !!resetResult.rawToken, 'Password reset token generated');

    const resetSuccess = await resetPasswordWithToken(resetResult!.rawToken, 'NewOwnerPassword123!');
    assert(resetSuccess.success === true, 'Password reset succeeded with valid token');

    // Verify token cannot be re-used
    let tokenReused = false;
    try {
      await resetPasswordWithToken(resetResult!.rawToken, 'AnotherPass123!');
    } catch {
      tokenReused = true;
    }
    assert(tokenReused === true, 'Used password reset token cannot be reused');

    // Verify login with new password
    const updatedMarcus = await prisma.user.findUnique({ where: { email: 'marcus@reployty.com' } });
    const verifyNewPass = await verifyPassword('NewOwnerPassword123!', updatedMarcus!.passwordHash);
    assert(verifyNewPass === true, 'New password verifies against updated database hash');

    // Reset back to standard password for future tests
    await resetPasswordWithToken(
      (await createPasswordResetToken('marcus@reployty.com'))!.rawToken,
      'OwnerPass123!'
    );
    console.log('  (Restored Marcus password to OwnerPass123!)');

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    testFailedCount++;
  }

  console.log('\n======================================================');
  console.log(`TEST SUITE FINISHED: ${testPassedCount} PASSED, ${testFailedCount} FAILED`);
  console.log('======================================================\n');

  if (testFailedCount > 0) {
    process.exit(1);
  }
}

runSecuritySuite()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
