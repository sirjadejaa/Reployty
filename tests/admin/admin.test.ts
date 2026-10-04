import { prisma } from '../../src/server/db/client';
import {
  getPlatformOverview,
  getPlatformBusinesses,
  getPlatformBusinessById,
  updatePlatformBusinessStatus,
  getPlatformUsers,
  updatePlatformUserStatus,
  getPlatformMemberships,
  getPlatformRoles,
  getPlatformAuditLogs,
  getPlatformAnalytics,
} from '../../src/server/services/platformService';

import { startTestServer, TestServerContext } from '../e2e/test_helpers';

let serverCtx: TestServerContext | null = null;
let baseUrl = 'http://localhost:3000';

let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
    testPassed++;
  } else {
    console.error(`  ✗ FAIL: ${name} ${detail ? `(${detail})` : ''}`);
    testFailed++;
  }
}

async function apiRequest(path: string, options: RequestInit = {}): Promise<{ status: number; headers: Headers; data: any; cookie?: string }> {
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, options);
  let data: any = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  const setCookie = res.headers.get('set-cookie') || undefined;
  return { status: res.status, headers: res.headers, data, cookie: setCookie };
}

async function runSuperAdminSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PROMPT 4: SUPER ADMIN PLATFORM & GOVERNANCE TEST SUITE');
  console.log('==================================================================\n');

  try {
    try {
      const ping = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (!ping.ok) throw new Error('Not running');
    } catch {
      serverCtx = await startTestServer();
      baseUrl = serverCtx.baseUrl;
    }

    // ------------------------------------------------------------------------
    // SETUP: Fetch seeded Super Admin and standard Business Owner
    // ------------------------------------------------------------------------
    const superAdminUser = await prisma.user.findUnique({

      where: { email: 'admin@reployty.com' },
    });
    assert(!!superAdminUser && superAdminUser.isSuperAdmin === true, 'Super Admin user exists and isSuperAdmin === true');

    const standardOwnerUser = await prisma.user.findUnique({
      where: { email: 'marcus@reployty.com' },
    });
    assert(!!standardOwnerUser && standardOwnerUser.isSuperAdmin === false, 'Standard business owner exists and isSuperAdmin === false');

    const adminCtx = {
      user: {
        id: superAdminUser!.id,
        email: superAdminUser!.email,
        name: superAdminUser!.name,
        isSuperAdmin: true,
      },
    };

    // ------------------------------------------------------------------------
    // SECTION 1: Platform Overview Metrics & Aggregations
    // ------------------------------------------------------------------------
    console.log('\n[1] Platform Overview Metrics:');
    const overview = await getPlatformOverview();
    assert(overview.metrics.totalBusinesses > 0, `Total businesses computed from real DB (${overview.metrics.totalBusinesses})`);
    assert(overview.metrics.totalUsers > 0, `Total users computed from real DB (${overview.metrics.totalUsers})`);
    assert(typeof overview.metrics.activeBusinesses === 'number', 'Active businesses count is numeric');
    assert(typeof overview.metrics.suspendedBusinesses === 'number', 'Suspended businesses count is numeric');
    assert(typeof overview.metrics.totalCustomers === 'number', 'Total customers count is numeric');
    assert(typeof overview.metrics.totalLoyaltyCards === 'number', 'Total loyalty cards count is numeric');
    assert(Array.isArray(overview.recentActivity), 'Recent platform activity returned as array');

    // ------------------------------------------------------------------------
    // SECTION 2: Business Management Directory & Detail
    // ------------------------------------------------------------------------
    console.log('\n[2] Business Directory & Detailed Inspect:');
    const businessesResult = await getPlatformBusinesses({ page: 1, pageSize: 10 });
    assert(businessesResult.businesses.length > 0, 'Businesses listed with pagination');
    assert(businessesResult.totalCount >= businessesResult.businesses.length, 'Total count reflects total platform businesses');

    // Search filter
    const searchResult = await getPlatformBusinesses({ search: 'Roasted' });
    assert(searchResult.businesses.some(b => b.name.includes('Roasted')), 'Search query filters businesses by name');

    // Business Detail Inspection
    const targetBusiness = businessesResult.businesses[0];
    const detail = await getPlatformBusinessById(targetBusiness.id);
    assert(detail !== null && detail.id === targetBusiness.id, 'Detailed business fetched by ID');
    assert(Array.isArray(detail?.branches), 'Business branches loaded in detail');
    assert(Array.isArray(detail?.staffMemberships), 'Staff memberships with roles loaded in detail');
    assert(typeof detail?._count.customers === 'number', 'Customer count included');
    assert(typeof detail?._count.rewards === 'number', 'Reward count included');

    // Non-existent business returns null
    const nonExistent = await getPlatformBusinessById('non_existent_biz_id_12345');
    assert(nonExistent === null, 'Non-existent business ID returns null at service layer');

    // ------------------------------------------------------------------------
    // SECTION 3: Business Lifecycle & Suspension Mutations + Audit Logging
    // ------------------------------------------------------------------------
    console.log('\n[3] Business Suspension & Reactivation Lifecycle:');
    const initialStatus = targetBusiness.status;

    // Suspend
    const suspendResult = await updatePlatformBusinessStatus(
      adminCtx,
      targetBusiness.id,
      'SUSPENDED',
      'Policy violation investigation'
    );
    assert(suspendResult.status === 'SUSPENDED', 'Business status changed to SUSPENDED in DB');

    // Verify AuditLog was recorded
    const suspendLog = await prisma.auditLog.findFirst({
      where: {
        businessId: targetBusiness.id,
        action: 'BUSINESS_SUSPENDED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(!!suspendLog, 'BUSINESS_SUSPENDED audit log recorded in PostgreSQL');
    assert((suspendLog?.newState as any)?.reason === 'Policy violation investigation', 'Audit log stores suspension reason in newState');

    // Reactivate
    const reactivateResult = await updatePlatformBusinessStatus(
      adminCtx,
      targetBusiness.id,
      'ACTIVE',
      'Investigation cleared'
    );
    assert(reactivateResult.status === 'ACTIVE', 'Business status restored to ACTIVE in DB');

    const reactivateLog = await prisma.auditLog.findFirst({
      where: {
        businessId: targetBusiness.id,
        action: 'BUSINESS_REACTIVATED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(!!reactivateLog, 'BUSINESS_REACTIVATED audit log recorded in PostgreSQL');

    // Restore to initialStatus if needed
    if (initialStatus !== 'ACTIVE') {
      await updatePlatformBusinessStatus(adminCtx, targetBusiness.id, initialStatus, undefined);
    }

    // ------------------------------------------------------------------------
    // SECTION 4: User Directory & Invariants (No Password Leaks)
    // ------------------------------------------------------------------------
    console.log('\n[4] User Management & Zero Password Leak Invariant:');
    const usersResult = await getPlatformUsers({ page: 1, pageSize: 20 });
    assert(usersResult.users.length > 0, 'Platform users returned');

    // INVARIANT: passwordHash is NEVER exposed in platform user listing
    const anyPasswordLeaked = usersResult.users.some(u => (u as any).passwordHash !== undefined);
    assert(!anyPasswordLeaked, 'Zero-Leak Invariant: passwordHash is never returned in platform user records');

    // ------------------------------------------------------------------------
    // SECTION 5: User Suspension & Active Session Revocation
    // ------------------------------------------------------------------------
    console.log('\n[5] User Suspension & Session Revocation:');
    // Pick a test user who is active and not super admin
    const userSearch = await getPlatformUsers({ search: 'sarah.cashier@reployty.com', pageSize: 10 });
    let testSubjectUser = userSearch.users.find(u => u.email === 'sarah.cashier@reployty.com');
    if (!testSubjectUser) {
      testSubjectUser = (await prisma.user.findUnique({ where: { email: 'sarah.cashier@reployty.com' } })) as any;
    }
    assert(!!testSubjectUser, 'Target user found for suspension testing');


    // Create a live session for this user to verify revocation
    const testSession = await prisma.session.create({
      data: {
        userId: testSubjectUser!.id,
        sessionToken: `test_token_${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    assert(!!testSession, 'Live session established for target user');

    // Suspend user
    const userSuspendRes = await updatePlatformUserStatus(
      adminCtx,
      testSubjectUser!.id,
      'SUSPENDED',
      'Compromised credentials report'
    );
    assert(userSuspendRes.status === 'SUSPENDED', 'User status updated to SUSPENDED');

    // Verify all sessions were revoked immediately
    const remainingSessions = await prisma.session.findMany({
      where: { userId: testSubjectUser!.id, revokedAt: null },
    });
    assert(remainingSessions.length === 0, 'Security Invariant: All user sessions revoked immediately upon suspension');

    // Verify user audit log
    const userAuditLog = await prisma.auditLog.findFirst({
      where: {
        entityId: testSubjectUser!.id,
        action: 'USER_SUSPENDED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(!!userAuditLog, 'USER_SUSPENDED audit log recorded in PostgreSQL');

    // Reactivate user
    const userReactivateRes = await updatePlatformUserStatus(
      adminCtx,
      testSubjectUser!.id,
      'ACTIVE',
      'Security review completed'
    );
    assert(userReactivateRes.status === 'ACTIVE', 'User status restored to ACTIVE');

    // ------------------------------------------------------------------------
    // SECTION 6: Self-Lockout Defense Invariant
    // ------------------------------------------------------------------------
    console.log('\n[6] Self-Lockout Prevention Invariant:');
    let selfLockoutPrevented = false;
    try {
      await updatePlatformUserStatus(
        adminCtx,
        superAdminUser!.id,
        'SUSPENDED',
        'Accidental self suspension'
      );
    } catch (err: any) {
      if (err.message.toLowerCase().includes('self-lockout') || err.message.toLowerCase().includes('own')) {
        selfLockoutPrevented = true;
      }
    }
    assert(selfLockoutPrevented, 'Self-Lockout Invariant: Super Admin cannot suspend their own active account');

    // ------------------------------------------------------------------------
    // SECTION 7: Staff Memberships & RBAC Roles Listing
    // ------------------------------------------------------------------------
    console.log('\n[7] Staff Memberships & Roles Directory:');
    const membershipsResult = await getPlatformMemberships({ page: 1, pageSize: 10 });
    assert(membershipsResult.memberships.length > 0, 'Platform staff memberships listed');
    assert(!!membershipsResult.memberships[0].businessName, 'Membership includes business reference');
    assert(!!membershipsResult.memberships[0].userName, 'Membership includes user reference');
    assert(!!membershipsResult.memberships[0].role, 'Membership includes role reference');

    const rolesResult = await getPlatformRoles();
    assert(rolesResult.length >= 3, 'Predefined roles listed (Owner, Manager, Staff)');
    assert(rolesResult.every(r => Array.isArray(r.permissions)), 'Every role has an array of assigned permissions');

    // ------------------------------------------------------------------------
    // SECTION 8: Audit Logs Trail
    // ------------------------------------------------------------------------
    console.log('\n[8] Audit Logs Inspection:');
    const logsResult = await getPlatformAuditLogs({ page: 1, pageSize: 20 });
    assert(logsResult.logs.length > 0, 'Audit logs retrieved with pagination');
    const filteredLogs = await getPlatformAuditLogs({ action: 'BUSINESS_SUSPENDED' });
    assert(filteredLogs.logs.every(l => l.action === 'BUSINESS_SUSPENDED'), 'Audit logs filterable by specific action');

    // ------------------------------------------------------------------------
    // SECTION 9: Platform Analytics
    // ------------------------------------------------------------------------
    console.log('\n[9] Platform Analytics Engine:');
    const analytics7d = await getPlatformAnalytics('7d');
    assert(typeof analytics7d.aggregates.newBusinesses === 'number', 'Analytics 7d computes new businesses');
    assert(typeof analytics7d.aggregates.newUsers === 'number', 'Analytics 7d computes new users');
    assert(Array.isArray(analytics7d.categoryBreakdown), 'Analytics includes business category breakdown');

    const analytics30d = await getPlatformAnalytics('30d');
    assert(typeof analytics30d.aggregates.loyaltyTransactions === 'number', 'Analytics 30d computes transactions count');

    // ------------------------------------------------------------------------
    // SECTION 10: HTTP API & Middleware Authorization Gates
    // ------------------------------------------------------------------------
    console.log('\n[10] HTTP API Authorization Chain & Security Gates:');

    // Test 10.1: Unauthenticated request to /api/admin/overview -> 401
    const unauthRes = await apiRequest('/api/admin/overview');
    assert(unauthRes.status === 401, 'Unauthenticated request to /api/admin/overview returns 401 Unauthorized');
    assert(unauthRes.data.code === 'UNAUTHENTICATED', 'Returns UNAUTHENTICATED error code');

    // Test 10.2: Standard business owner login
    const ownerLoginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'marcus@reployty.com', password: 'OwnerPass123!' }),
    });
    assert(ownerLoginRes.status === 200, 'Standard owner logged in successfully');
    const ownerCookie = ownerLoginRes.cookie;

    // Test 10.3: Standard business owner forbidden from /api/admin/* -> 403
    const forbiddenRes = await apiRequest('/api/admin/overview', {
      headers: { Cookie: ownerCookie || '' },
    });
    assert(forbiddenRes.status === 403, 'Standard business owner accessing /api/admin/overview returns 403 Forbidden');
    assert(
      forbiddenRes.data.code === 'FORBIDDEN_SUPER_ADMIN' || forbiddenRes.data.code === 'FORBIDDEN',
      'Returns FORBIDDEN_SUPER_ADMIN error code'
    );

    // Test 10.4: Super Admin login
    const adminLoginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@reployty.com', password: 'AdminPass123!' }),
    });
    assert(adminLoginRes.status === 200, 'Super Admin logged in successfully');
    assert(adminLoginRes.data.user.isSuperAdmin === true, 'Auth response confirms isSuperAdmin: true');
    const adminCookie = adminLoginRes.cookie;

    // Test 10.5: Super Admin authorized to /api/admin/overview -> 200
    const adminOverviewRes = await apiRequest('/api/admin/overview', {
      headers: { Cookie: adminCookie || '' },
    });
    assert(adminOverviewRes.status === 200, 'Super Admin GET /api/admin/overview returns 200 OK');
    assert(adminOverviewRes.data.metrics.totalBusinesses > 0, 'Admin overview returns real business count');

    // Test 10.6: Super Admin GET /api/admin/businesses -> 200
    const adminBizRes = await apiRequest('/api/admin/businesses?page=1&pageSize=5', {
      headers: { Cookie: adminCookie || '' },
    });
    assert(adminBizRes.status === 200, 'Super Admin GET /api/admin/businesses returns 200 OK');
    assert(adminBizRes.data.businesses.length > 0, 'Returns paginated business list');

    // Test 10.7: Super Admin GET /api/admin/users -> 200 (No password leak)
    const adminUsersRes = await apiRequest('/api/admin/users?page=1&pageSize=5', {
      headers: { Cookie: adminCookie || '' },
    });
    assert(adminUsersRes.status === 200, 'Super Admin GET /api/admin/users returns 200 OK');
    const anyApiPassword = adminUsersRes.data.users.some((u: any) => u.passwordHash !== undefined);
    assert(!anyApiPassword, 'API Response Invariant: Zero password hashes leaked via HTTP');

    // Test 10.8: Self-lockout via HTTP PATCH /api/admin/users/:id/status -> 400
    const selfLockoutHttpRes = await apiRequest(`/api/admin/users/${superAdminUser!.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie || '',
      },
      body: JSON.stringify({ status: 'SUSPENDED', reason: 'Self suspension test' }),
    });
    assert(selfLockoutHttpRes.status === 400, 'HTTP API rejects self-lockout with 400 Bad Request');
    assert(selfLockoutHttpRes.data.error.toLowerCase().includes('self-lockout') || selfLockoutHttpRes.data.error.toLowerCase().includes('own'), 'Error message confirms self-lockout prevention');

    // Test 10.9: Super Admin GET /api/admin/audit-logs -> 200
    const adminLogsRes = await apiRequest('/api/admin/audit-logs?pageSize=5', {
      headers: { Cookie: adminCookie || '' },
    });
    assert(adminLogsRes.status === 200, 'Super Admin GET /api/admin/audit-logs returns 200 OK');
    assert(adminLogsRes.data.logs.length > 0, 'Returns audit log entries');

    // Test 10.10: Super Admin GET /api/admin/analytics?range=30d -> 200
    const adminAnalyticsRes = await apiRequest('/api/admin/analytics?range=30d', {
      headers: { Cookie: adminCookie || '' },
    });
    assert(adminAnalyticsRes.status === 200, 'Super Admin GET /api/admin/analytics returns 200 OK');
    assert(adminAnalyticsRes.data.aggregates !== undefined, 'Analytics endpoint returns computed aggregates');
    assert(Array.isArray(adminAnalyticsRes.data.categoryBreakdown), 'Analytics endpoint returns category breakdown');

  } catch (err: any) {
    console.error('Test Suite Runtime Error:', err);
    testFailed++;
  } finally {
    if (serverCtx) {
      await serverCtx.stop().catch(() => {});
    }

    console.log('\n==================================================================');

    console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================================\n');

    if (testFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runSuperAdminSuite();
