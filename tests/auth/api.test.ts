import http from 'http';

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

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; headers: Headers; data: any; cookie?: string }> {
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

async function runApiSuite() {
  console.log('\n======================================================');
  console.log('REPLOYTY PROMPT 3: HTTP API AUTH & SESSION TEST SUITE');
  console.log('======================================================\n');

  try {
    // 1. Unauthenticated request to /api/auth/me should return 401
    console.log('[1] Unauthenticated Access Guard:');
    const unauthMe = await request('/api/auth/me');
    assert(unauthMe.status === 401, 'Unauthenticated GET /api/auth/me returns 401');

    // 2. Invalid login returns 401
    console.log('\n[2] Invalid Credentials Handling:');
    const invalidLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'marcus@reployty.com', password: 'WrongPassword999!' }),
    });
    assert(invalidLogin.status === 401, 'Invalid password returns 401 INVALID_CREDENTIALS');
    assert(invalidLogin.data.code === 'INVALID_CREDENTIALS', 'Returns error code INVALID_CREDENTIALS');

    // 3. Suspended account returns 403
    console.log('\n[3] Suspended Account Access Gate:');
    const suspendedLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'suspended@reployty.com', password: 'TestPass123!' }),
    });
    assert(suspendedLogin.status === 403, 'Suspended account returns 403 Forbidden');
    assert(suspendedLogin.data.code === 'ACCOUNT_INACTIVE', 'Returns code ACCOUNT_INACTIVE');

    // 4. Valid Login as Marcus (Owner)
    console.log('\n[4] Valid Login Flow & Session Cookie:');
    const validLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'marcus@reployty.com', password: 'OwnerPass123!' }),
    });
    assert(validLogin.status === 200, 'Valid login returns 200 OK');
    assert(validLogin.data.user.email === 'marcus@reployty.com', 'User DTO contains correct email');
    assert(!('passwordHash' in validLogin.data.user), 'User DTO excludes passwordHash');
    assert(!!validLogin.data.sessionToken, 'Returns sessionToken in response payload');

    const sessionCookieHeader = validLogin.cookie;
    assert(!!sessionCookieHeader, 'Set-Cookie header received');
    const sessionTokenMatch = sessionCookieHeader?.match(/reployty_session=([^;]+)/);
    const sessionToken = sessionTokenMatch ? sessionTokenMatch[1] : '';
    assert(!!sessionToken, 'reployty_session cookie present');

    const cookieHeader = `reployty_session=${sessionToken}`;

    // 5. Authenticated /api/auth/me
    console.log('\n[5] Session Identity & Memberships (/api/auth/me):');
    const authMe = await request('/api/auth/me', {
      headers: { Cookie: cookieHeader },
    });
    assert(authMe.status === 200, 'Authenticated /api/auth/me returns 200');
    assert(authMe.data.user.name === 'Marcus Vance', 'Authenticated user is Marcus Vance');
    assert(authMe.data.currentBusiness.name === 'The Roasted Bean Café', 'Default tenant is The Roasted Bean Café');
    assert(authMe.data.memberships.length === 2, 'User has 2 authorized memberships (Cafe & Salon)');

    // 6. Access protected customer data
    console.log('\n[6] Protected Resource Access (/api/customers):');
    const customersRes = await request('/api/customers', {
      headers: { Cookie: cookieHeader },
    });
    assert(customersRes.status === 200, 'GET /api/customers returns 200');
    assert(Array.isArray(customersRes.data.data), 'Returns customer array');
    assert(customersRes.data.data.length > 0, 'Contains customers for current tenant');

    // 7. Tenant Switch to Luxe & Glow Beauty Bar
    console.log('\n[7] Multi-Tenant Switching (/api/auth/switch-tenant):');
    const salonMembership = authMe.data.memberships.find((m: any) => m.businessSlug === 'luxe-glow-beauty');
    assert(!!salonMembership, 'Salon membership found');

    const switchRes = await request('/api/auth/switch-tenant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ businessId: salonMembership.businessId }),
    });
    assert(switchRes.status === 200, 'POST /api/auth/switch-tenant to authorized Salon returns 200');
    assert(switchRes.data.currentBusiness.name === 'Luxe & Glow Beauty Bar', 'Active business switched to Salon');

    // Verify /api/auth/me now shows Salon
    const meAfterSwitch = await request('/api/auth/me', {
      headers: { Cookie: cookieHeader },
    });
    assert(meAfterSwitch.data.currentBusiness.id === salonMembership.businessId, 'Session now bound to Salon businessId');

    // 8. Attempt Unauthorized Tenant Switch (Iron Pulse Fitness)
    console.log('\n[8] Unauthorized Switch Blocking:');
    const unauthSwitch = await request('/api/auth/switch-tenant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ businessId: 'biz_gym_unauthorized_999' }),
    });
    assert(unauthSwitch.status === 403, 'Switching to unauthorized business returns 403 Forbidden');
    assert(unauthSwitch.data.code === 'UNAUTHORIZED_TENANT', 'Returns code UNAUTHORIZED_TENANT');

    // 9. Logout
    console.log('\n[9] Logout & Revocation (/api/auth/logout):');
    const logoutRes = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200');

    // Subsequent /api/auth/me with revoked token returns 401
    const meAfterLogout = await request('/api/auth/me', {
      headers: { Cookie: cookieHeader },
    });
    assert(meAfterLogout.status === 401, 'Revoked session returns 401 Unauthenticated');

  } catch (err) {
    console.error('API test failed with error:', err);
    testFailed++;
  }

  console.log('\n======================================================');
  console.log(`API TEST SUITE FINISHED: ${testPassed} PASSED, ${testFailed} FAILED`);
  console.log('======================================================\n');

  if (testFailed > 0) {
    process.exit(1);
  }
}

runApiSuite();
