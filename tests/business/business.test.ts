import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import {
  getBusinessProfile,
  updateBusinessProfile,
  getBusinessBranches,
  createBranch,
  updateBranch,
  getBusinessStaff,
  inviteOrAddStaff,
  updateStaffMembership,
  getBusinessBranding,
  updateBusinessBranding,
  getOnboardingState,
  updateOnboardingState,
  getBusinessDashboard,
} from '../../src/server/services/businessService';

const BASE_URL = 'http://localhost:3000';

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

async function request(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; headers: Headers; data: any; cookie?: string }> {
  const url = `${BASE_URL}${path}`;
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

async function runBusinessSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 5: BUSINESS ADMIN & ONBOARDING AUTOMATED TEST SUITE');
  console.log('==================================================================\n');

  try {
    // 0. Locate Test Tenants and Users
    const cafe = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
    });
    const salon = await prisma.business.findUnique({
      where: { slug: 'luxe-glow-beauty' },
    });
    const bakery = await prisma.business.findUnique({
      where: { slug: 'new-wave-bakery' },
    });
    const marcus = await prisma.user.findUnique({
      where: { email: 'marcus@reployty.com' },
    });
    const sarah = await prisma.user.findUnique({
      where: { email: 'sarah.cashier@reployty.com' },
    });

    if (!cafe || !salon || !bakery || !marcus || !sarah) {
      throw new Error('Required seeded businesses and users missing.');
    }

    const cafeCtx = await getTenantContext(marcus.id, cafe.id);
    const salonCtx = await getTenantContext(marcus.id, salon.id);

    console.log('[1] Business Profile Service & Audit Trail:');
    // 1.1 Fetch profile
    const cafeProfile = await getBusinessProfile(cafeCtx as any);
    assert(cafeProfile.id === cafe.id, 'Fetched business profile matches context businessId');
    assert(cafeProfile.name === cafe.name, 'Profile contains accurate business name');
    assert(cafeProfile.category === cafe.category, 'Profile contains accurate business category');
    assert(typeof cafeProfile.onboardingCompleted === 'boolean', 'Profile contains onboardingCompleted flag');

    // 1.2 Update profile
    const originalPhone = cafeProfile.phone;
    const testPhone = '+1 (555) 777-8888';
    const updatedProfile = await updateBusinessProfile(cafeCtx as any, {
      phone: testPhone,
      city: 'San Francisco Downtown',
      postalCode: '94103',
    });
    assert(updatedProfile.phone === testPhone, 'Profile phone updated in PostgreSQL');
    assert(updatedProfile.city === 'San Francisco Downtown', 'Profile city updated in PostgreSQL');

    // 1.3 Verify Audit Log for Business Update
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        businessId: cafe.id,
        action: 'BUSINESS_UPDATED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(auditLog !== null, 'Immutable audit log recorded for BUSINESS_UPDATED');
    assert(auditLog?.actorUserId === marcus.id, 'Audit log correctly attributes actor userId');

    // Restore original phone
    await updateBusinessProfile(cafeCtx as any, { phone: originalPhone || '' });

    console.log('\n[2] Branch Management & IDOR Isolation Invariant:');
    // 2.1 List branches
    const cafeBranches = await getBusinessBranches(cafeCtx as any);
    assert(Array.isArray(cafeBranches) && cafeBranches.length > 0, 'Branches listed for Cafe');
    const mainBranch = cafeBranches.find((b) => b.isMainBranch);
    assert(mainBranch !== undefined, 'Main flagship branch identified');

    // 2.2 Create new branch
    const createdBranch = await createBranch(cafeCtx as any, {
      name: 'North Beach Roastery',
      code: 'NB-01',
      address: '456 Columbus Ave',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94133',
      timezone: 'America/Los_Angeles',
    });
    assert(createdBranch.name === 'North Beach Roastery', 'New branch created in PostgreSQL');
    assert(createdBranch.businessId === cafe.id, 'Branch strictly associated with Cafe businessId');

    // 2.3 Strict IDOR Defense Invariant
    // Salon context attempts to access or update Cafe branch
    let idorFailed = false;
    try {
      await updateBranch(salonCtx as any, createdBranch.id, { name: 'Hacked Branch Name' });
    } catch (err: any) {
      idorFailed = true;
      assert(err.message.includes('not found') || err.message.includes('denied'), 'Cross-tenant branch update blocked');
    }
    assert(idorFailed, 'Security Invariant: Salon cannot update Cafe branch (IDOR blocked)');

    // 2.4 Set Main Branch toggle
    const mainBranchUpdate = await updateBranch(cafeCtx as any, createdBranch.id, { isMainBranch: true });
    assert(mainBranchUpdate.isMainBranch === true, 'Created branch set as main branch');
    const previousMain = await prisma.branch.findUnique({ where: { id: mainBranch!.id } });
    assert(previousMain?.isMainBranch === false, 'Previous main branch demoted (single-main invariant)');

    // Restore original main branch & clean up
    await updateBranch(cafeCtx as any, mainBranch!.id, { isMainBranch: true });
    await prisma.branch.delete({ where: { id: createdBranch.id } });
    const branchCheck = await prisma.branch.findUnique({ where: { id: createdBranch.id } });
    assert(branchCheck === null, 'Test branch deleted cleanly');

    console.log('\n[3] Staff Roster, Roles & Self-Lockout Defense:');
    // 3.1 List staff members
    const staffList = await getBusinessStaff(cafeCtx as any);
    assert(Array.isArray(staffList) && staffList.length >= 2, 'Staff roster loaded for Cafe');
    const marcusMembership = staffList.find((s) => s.user.email === 'marcus@reployty.com');
    assert(marcusMembership?.role.name === 'OWNER', 'Marcus verified as OWNER in roster');

    // 3.2 Self-Deactivation Protection Invariant
    let selfDeactivationBlocked = false;
    try {
      await updateStaffMembership(cafeCtx as any, marcusMembership!.id, { status: 'DEACTIVATED' });
    } catch (err: any) {
      selfDeactivationBlocked = true;
      assert(err.message.includes('cannot deactivate your own') || err.message.includes('lockout'), 'Self-deactivation error message returned');
    }
    assert(selfDeactivationBlocked, 'Security Invariant: Owner cannot deactivate their own membership');

    // 3.3 Invite new staff member
    const cashierRole = await prisma.role.findFirst({ where: { name: 'STAFF', isSystem: true } });
    const invitedStaff = await inviteOrAddStaff(cafeCtx as any, {
      name: 'Oliver Queen Barista',
      email: 'oliver.test@reployty.com',
      roleId: cashierRole!.id,
    });
    assert(invitedStaff.user.email === 'oliver.test@reployty.com', 'Staff user created and invited');
    assert(invitedStaff.role.name === 'STAFF', 'Staff membership role assigned');

    // 3.4 Deactivate invited staff member
    const deactivated = await updateStaffMembership(cafeCtx as any, invitedStaff.id, { status: 'DEACTIVATED' });
    assert(deactivated.status === 'DEACTIVATED', 'Invited staff membership successfully deactivated');

    // Clean up test staff
    await prisma.staffMembership.delete({ where: { id: invitedStaff.id } });
    await prisma.user.delete({ where: { email: 'oliver.test@reployty.com' } });

    console.log('\n[4] Branding & Visual Theme Presets:');
    // 4.1 Fetch branding
    const branding = await getBusinessBranding(cafeCtx as any);
    assert(typeof branding.themePreset === 'string', 'Theme preset returned');
    assert(typeof branding.primaryColor === 'string', 'Primary color returned');

    // 4.2 Update branding with valid preset
    const updatedBranding = await updateBusinessBranding(cafeCtx as any, {
      themePreset: 'CAFE',
      primaryColor: '#4F6BFF',
      secondaryColor: '#0F172A',
    });
    assert(updatedBranding.themePreset === 'CAFE', 'Theme preset updated in PostgreSQL');
    assert(updatedBranding.primaryColor === '#4F6BFF', 'Brand color set to canonical Reployty #4F6BFF');

    // 4.3 Invariant: Reject invalid preset
    let invalidPresetRejected = false;
    try {
      await updateBusinessBranding(cafeCtx as any, {
        themePreset: 'NON_EXISTENT_INVALID_PRESET',
      });
    } catch (err) {
      invalidPresetRejected = true;
    }
    assert(invalidPresetRejected, 'Invalid theme preset rejected by service layer');

    console.log('\n[5] Onboarding Wizard State Machine & Resumability:');
    const bakeryOwner = await prisma.user.findUnique({
      where: { email: 'chloe.baker@reployty.com' },
    });
    const bakeryCtx = await getTenantContext(bakeryOwner!.id, bakery.id);

    // 5.1 Check initial onboarding state
    const bakeryOnboarding = await getOnboardingState(bakeryCtx as any);
    assert(bakeryOnboarding.onboardingCompleted === false, 'New Wave Bakery starts with onboardingCompleted: false');
    assert(bakeryOnboarding.onboardingStep >= 1, 'Current onboarding step tracked');

    // 5.2 Step progress save
    const step2Progress = await updateOnboardingState(bakeryCtx as any, 2, false);
    assert(step2Progress.onboardingStep === 2, 'Onboarding step advanced to 2');

    // 5.3 Step 6 Complete
    const completedOnboarding = await updateOnboardingState(bakeryCtx as any, 6, true);
    assert(completedOnboarding.onboardingCompleted === true, 'Onboarding marked completed in PostgreSQL');
    assert(completedOnboarding.onboardingStep === 6, 'Final onboarding step is 6');

    // Restore bakery onboarding state for UI demonstration
    await prisma.business.update({
      where: { id: bakery.id },
      data: { onboardingCompleted: false, onboardingStep: 1 },
    });

    console.log('\n[6] Dashboard Live Aggregation & Real Metrics:');
    const dashboardData = await getBusinessDashboard(cafeCtx as any);
    assert(dashboardData.business.id === cafe.id, 'Dashboard scoped to Cafe');
    assert(typeof dashboardData.metrics.totalCustomers === 'number', 'Real customer count calculated');
    assert(typeof dashboardData.metrics.activeBranches === 'number', 'Real branch count calculated');
    assert(typeof dashboardData.metrics.staffMembers === 'number', 'Real staff count calculated');
    assert(typeof dashboardData.metrics.loyaltyPrograms === 'number', 'Real loyalty program count calculated');
    if (dashboardData.loyaltyProgram) {
      assert(dashboardData.loyaltyProgram.status === 'ACTIVE', 'Active loyalty program returned in dashboard');
      assert(typeof dashboardData.loyaltyProgram.name === 'string', 'Loyalty program has real name');
      assert(typeof dashboardData.loyaltyProgram.activeCardsCount === 'number', 'Active cards count is real number');
    }
    assert(Array.isArray(dashboardData.recentActivity), 'Recent audit trail returned as array');
    assert(dashboardData.onboarding.totalSteps === 6, 'Onboarding checklist has 6 steps');


    console.log('\n[7] HTTP REST API & Multi-Tenant Security Gates:');
    // 7.1 Unauthenticated requests to /api/business/* return 401
    const unauthProfile = await request('/api/business/profile');
    assert(unauthProfile.status === 401, 'Unauthenticated GET /api/business/profile returns 401');

    const unauthBranches = await request('/api/business/branches');
    assert(unauthBranches.status === 401, 'Unauthenticated GET /api/business/branches returns 401');

    // 7.2 Authenticate as Marcus Vance (Owner of Cafe & Salon)
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'marcus@reployty.com', password: 'OwnerPass123!' }),
    });
    assert(loginRes.status === 200, 'Owner login successful');
    assert(!!loginRes.data?.sessionToken, 'Session token obtained in payload');
    const ownerCookie = `reployty_session=${loginRes.data.sessionToken}`;

    // Guarantee tenant switch to Cafe
    await request('/api/auth/switch-tenant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ businessId: cafe.id }),
    });

    // 7.3 GET /api/business/profile
    const profileRes = await request('/api/business/profile', {
      headers: { Cookie: ownerCookie },
    });
    assert(profileRes.status === 200, 'GET /api/business/profile returns 200 OK');
    assert(profileRes.data.id === cafe.id, 'Profile matches authenticated tenant context');

    // 7.4 GET /api/business/branches
    const branchesRes = await request('/api/business/branches', {
      headers: { Cookie: ownerCookie },
    });
    assert(branchesRes.status === 200, 'GET /api/business/branches returns 200 OK');
    assert(Array.isArray(branchesRes.data), 'Branches returned as array');

    // 7.5 GET /api/business/staff
    const staffRes = await request('/api/business/staff', {
      headers: { Cookie: ownerCookie },
    });
    assert(staffRes.status === 200, 'GET /api/business/staff returns 200 OK');
    assert(Array.isArray(staffRes.data) && staffRes.data.length > 0, 'Staff members returned in API response');

    const rolesRes = await request('/api/business/roles', {
      headers: { Cookie: ownerCookie },
    });
    assert(rolesRes.status === 200, 'GET /api/business/roles returns 200 OK');
    assert(Array.isArray(rolesRes.data) && rolesRes.data.length > 0, 'System roles returned for invitation assignment');

    // 7.6 GET /api/business/branding
    const brandingRes = await request('/api/business/branding', {
      headers: { Cookie: ownerCookie },
    });
    assert(brandingRes.status === 200, 'GET /api/business/branding returns 200 OK');
    assert(brandingRes.data.themePreset !== undefined, 'Branding config contains themePreset');

    // 7.7 GET /api/business/dashboard
    const dashRes = await request('/api/business/dashboard', {
      headers: { Cookie: ownerCookie },
    });
    assert(dashRes.status === 200, 'GET /api/business/dashboard returns 200 OK');
    assert(dashRes.data.business.name === cafe.name, 'Dashboard business matches Cafe');
    assert(dashRes.data.metrics.totalCustomers >= 3, 'Metrics accurately report at least 3 seeded customers');

    // 7.8 Cross-Tenant IDOR Attack via REST API
    // Fetch a branch belonging to Salon
    const salonBranch = await prisma.branch.findFirst({
      where: { businessId: salon.id },
    });
    assert(salonBranch !== null, 'Salon branch located for IDOR test');

    // Marcus is currently session-bound to Cafe. Attempt to PUT to Salon branch ID via /api/business/branches/:id
    const idorApiRes = await request(`/api/business/branches/${salonBranch!.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ name: 'Malicious Cross-Tenant Rename' }),
    });
    assert(
      idorApiRes.status === 404 || idorApiRes.status === 403,
      'HTTP API IDOR Defense: Cross-tenant branch mutation blocked (404/403)'
    );

    // 7.9 RBAC Authorization Gate
    // Login as Sarah Jenkins (Cashier / Staff - lacks SETTINGS_MANAGE and STAFF_MANAGE)
    const cashierLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah.cashier@reployty.com', password: 'StaffPass123!' }),
    });
    assert(cashierLogin.status === 200, 'Cashier login successful');
    assert(!!cashierLogin.data?.sessionToken, 'Cashier session token obtained');
    const cashierCookie = `reployty_session=${cashierLogin.data.sessionToken}`;

    // Sarah attempts to update business profile
    const cashierProfileUpdate = await request('/api/business/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cashierCookie,
      },
      body: JSON.stringify({ name: 'Cashier Hijack Name' }),
    });
    assert(cashierProfileUpdate.status === 403, 'RBAC Gate: Cashier denied PUT /api/business/profile (403 Forbidden)');
    assert(cashierProfileUpdate.data.code === 'FORBIDDEN_PERMISSION', 'Returns code FORBIDDEN_PERMISSION');

    // Sarah attempts to invite staff member
    const cashierInvite = await request('/api/business/staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cashierCookie,
      },
      body: JSON.stringify({
        name: 'Unauthorized User',
        email: 'unauth@reployty.com',
        roleId: cashierRole!.id,
      }),
    });
    assert(cashierInvite.status === 403, 'RBAC Gate: Cashier denied POST /api/business/staff (403 Forbidden)');

    console.log('\n==================================================================');
    console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================================\n');

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution exception:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBusinessSuite();
