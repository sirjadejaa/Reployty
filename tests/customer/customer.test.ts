import { prisma } from '../../src/server/db/client';
import {
  normalizePhoneNumber,
  requestOtp,
  verifyOtp,
  hashOtpCode,
  OtpError,
} from '../../src/server/services/otpService';
import {
  createCustomerSession,
  validateCustomerSession,
  revokeCustomerSession,
  findOrCreateCustomer,
} from '../../src/server/services/customerAuthService';
import {
  resolvePublicQr,
  getCustomerProfile,
  updateCustomerProfile,
  updateCustomerConsent,
  getCustomerActivity,
} from '../../src/server/services/customerPwaService';
import { ConsentChannel, CustomerStatus } from '@prisma/client';

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

async function runCustomerSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 6: CUSTOMER PWA, QR & OTP AUTOMATED TEST SUITE');
  console.log('==================================================================\n');

  try {
    // 0. Locate Test Businesses
    const cafe = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
    });
    const salon = await prisma.business.findUnique({
      where: { slug: 'luxe-glow-beauty' },
    });

    if (!cafe || !salon) {
      throw new Error('Test businesses not found. Ensure prisma seed was run.');
    }

    // ========================================================================
    // 1. QR CODE RESOLUTION & PUBLIC CONTEXT
    // ========================================================================
    console.log('[1] QR Code Resolution & Public Context:');

    const qrResult = await resolvePublicQr('bean-stand-01');
    assert(qrResult !== null, 'Resolves existing QR code "bean-stand-01"');
    assert(qrResult.business.name === 'The Roasted Bean Café', 'Resolves correct business name');
    assert(qrResult.business.category === 'CAFE', 'Resolves correct business category');
    assert(qrResult.branch?.name === 'Downtown Flagship', 'Resolves associated branch context');
    assert((qrResult.business as any).passwordHash === undefined, 'Zero-Leak Invariant: No password hashes in QR context');
    assert((qrResult.business as any).planId === undefined, 'Zero-Leak Invariant: No internal plan details in QR context');

    // Test resolution without branch
    const salonQr = await resolvePublicQr('luxe-stand-01');
    assert(salonQr.business.name === 'Luxe & Glow Beauty Bar', 'Resolves business without branch');
    assert(salonQr.branch === null, 'Correctly handles null branch context');

    // Test fallback to business slug
    const slugResult = await resolvePublicQr('roasted-bean-cafe');
    assert(slugResult.business.slug === 'roasted-bean-cafe', 'Falls back to business slug resolution');

    // Test invalid QR code
    let invalidQrThrown = false;
    try {
      await resolvePublicQr('non-existent-qr-code-999');
    } catch (err: any) {
      invalidQrThrown = true;
      assert(err.code === 'QR_NOT_FOUND', 'Unknown QR code throws QR_NOT_FOUND');
    }
    assert(invalidQrThrown, 'Rejects unknown QR code with exception');

    // ========================================================================
    // 2. PHONE NORMALIZATION & OTP SERVICE
    // ========================================================================
    console.log('\n[2] Phone Normalization & OTP Service:');

    assert(normalizePhoneNumber('(555) 234-5678') === '+15552345678', 'Normalizes (555) 234-5678 to E.164');
    assert(normalizePhoneNumber('9876543210', '+91') === '+919876543210', 'Normalizes with +91 default country');
    assert(normalizePhoneNumber('+44 7911 123456') === '+447911123456', 'Normalizes international formatted phone');

    const testPhone = '+15554443322';

    // Request OTP
    const otpChallenge = await requestOtp({
      businessId: cafe.id,
      phone: testPhone,
    });
    assert(Boolean(otpChallenge.challengeId), 'Generates OTP challenge ID');
    assert(otpChallenge.expiresInSeconds === 600, 'Sets 10-minute expiry window');
    assert(Boolean(otpChallenge.devOtp), 'Provides devOtp in development/simulation mode');

    // Check challenge in PostgreSQL
    const challengeRecord = await prisma.customerOtpChallenge.findUnique({
      where: { id: otpChallenge.challengeId },
    });
    assert(challengeRecord !== null, 'Persists challenge record in PostgreSQL');
    assert(challengeRecord?.codeHash !== otpChallenge.devOtp, 'Security Invariant: Code is hashed with SHA-256 (not plaintext)');
    assert(challengeRecord?.codeHash === hashOtpCode(otpChallenge.devOtp!), 'Code hash matches SHA-256 digest');
    assert(challengeRecord?.consumedAt === null, 'Challenge is initially unconsumed');

    // Enforce Resend Cooldown (60s)
    let cooldownBlocked = false;
    try {
      await requestOtp({
        businessId: cafe.id,
        phone: testPhone,
      });
    } catch (err: any) {
      cooldownBlocked = true;
      assert(err.code === 'COOLDOWN_ACTIVE', 'Rejects immediate resend with COOLDOWN_ACTIVE');
    }
    assert(cooldownBlocked, 'Resend cooldown enforced');

    // Verify Incorrect Code
    let invalidCodeThrown = false;
    try {
      await verifyOtp({
        businessId: cafe.id,
        phone: testPhone,
        code: '000000',
        challengeId: otpChallenge.challengeId,
      });
    } catch (err: any) {
      invalidCodeThrown = true;
      assert(err.code === 'INVALID_OTP', 'Incorrect code throws INVALID_OTP');
    }
    assert(invalidCodeThrown, 'Rejects incorrect OTP code');

    // Verify Correct Code
    const verifySuccess = await verifyOtp({
      businessId: cafe.id,
      phone: testPhone,
      code: otpChallenge.devOtp!,
      challengeId: otpChallenge.challengeId,
    });
    assert(verifySuccess.verified === true, 'Successfully verifies correct OTP code');
    assert(verifySuccess.phone === testPhone, 'Returns normalized verified phone');

    // Verify Single-Use Invariant (Cannot verify again)
    let reuseBlocked = false;
    try {
      await verifyOtp({
        businessId: cafe.id,
        phone: testPhone,
        code: otpChallenge.devOtp!,
        challengeId: otpChallenge.challengeId,
      });
    } catch (err: any) {
      reuseBlocked = true;
      assert(err.code === 'OTP_EXPIRED', 'Consumed code cannot be reused (throws OTP_EXPIRED)');
    }
    assert(reuseBlocked, 'Single-use invariant enforced');

    // ========================================================================
    // 3. CUSTOMER IDENTITY & BUSINESS-SCOPED UNIQUENESS
    // ========================================================================
    console.log('\n[3] Customer Identity & Business-Scoped Uniqueness:');

    const customerPhone = '+15557778899';

    // Clean up any test customer from previous runs
    await prisma.customer.deleteMany({
      where: { phone: customerPhone },
    });

    // 1. Create New Customer at Cafe
    const cafeCustomerResult = await findOrCreateCustomer(cafe.id, customerPhone, {
      name: 'Jordan Cafe Regular',
      email: 'jordan@example.com',
      marketingConsent: true,
      source: 'TEST_SUITE',
    });
    assert(cafeCustomerResult.isNew === true, 'First verification flags isNew: true');
    assert(cafeCustomerResult.customer.name === 'Jordan Cafe Regular', 'Stores customer name');
    assert(cafeCustomerResult.customer.phone === customerPhone, 'Stores normalized phone');
    assert(cafeCustomerResult.customer.status === CustomerStatus.ACTIVE, 'Status is ACTIVE');
    assert(cafeCustomerResult.customer.marketingConsent === true, 'Records marketing consent');

    // Check CustomerConsent record
    const consents = await prisma.customerConsent.findMany({
      where: { customerId: cafeCustomerResult.customer.id },
    });
    assert(consents.some(c => c.channel === ConsentChannel.NOTIFICATIONS && c.granted), 'Records mandatory Terms/Privacy consent');
    assert(consents.some(c => c.channel === ConsentChannel.MARKETING && c.granted), 'Records optional marketing consent');

    // Check CustomerEvent record
    const events = await prisma.customerEvent.findMany({
      where: { customerId: cafeCustomerResult.customer.id },
    });
    assert(events.some(e => e.type === 'CUSTOMER_JOINED'), 'Emits CUSTOMER_JOINED timeline event');

    // 2. Returning Customer at Cafe (No duplicate created)
    const returningCafeResult = await findOrCreateCustomer(cafe.id, customerPhone, {
      source: 'TEST_SUITE_RETURN',
    });
    assert(returningCafeResult.isNew === false, 'Returning customer flags isNew: false');
    assert(returningCafeResult.customer.id === cafeCustomerResult.customer.id, 'Preserves existing customer ID');
    assert(returningCafeResult.customer.totalVisits === 2, 'Increments customer total visits count');

    // Verify count in DB is exactly 1 for Cafe
    const cafeCount = await prisma.customer.count({
      where: { businessId: cafe.id, phone: customerPhone },
    });
    assert(cafeCount === 1, 'No duplicate customer record created on subsequent visits');

    // 3. Cross-Business Scoped Uniqueness: Same Phone at Salon
    const salonCustomerResult = await findOrCreateCustomer(salon.id, customerPhone, {
      name: 'Jordan Salon Client',
      marketingConsent: false,
      source: 'TEST_SUITE_SALON',
    });
    assert(salonCustomerResult.isNew === true, 'Same phone at different business creates separate customer');
    assert(salonCustomerResult.customer.id !== cafeCustomerResult.customer.id, 'Generates distinct customer ID for distinct business');
    assert(salonCustomerResult.customer.businessId === salon.id, 'Scopes customer strictly to Salon businessId');
    assert(salonCustomerResult.customer.marketingConsent === false, 'Maintains independent consent preferences per business');

    // ========================================================================
    // 4. CUSTOMER SESSION LIFECYCLE & ISOLATION
    // ========================================================================
    console.log('\n[4] Customer Session Lifecycle & Isolation:');

    // Create session
    const session = await createCustomerSession(
      cafeCustomerResult.customer.id,
      cafe.id,
      '127.0.0.1',
      'TestRunner/1.0'
    );
    assert(Boolean(session.sessionToken), 'Creates 32-byte session token');
    assert(session.expiresAt > new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), 'Sets 30-day session expiry');

    // Validate session
    const validated = await validateCustomerSession(session.sessionToken);
    assert(validated !== null, 'Validates active customer session');
    assert(validated?.customerId === cafeCustomerResult.customer.id, 'Resolves correct customer ID');
    assert(validated?.businessId === cafe.id, 'Resolves correct business ID');
    assert(validated?.business.name === 'The Roasted Bean Café', 'Loads business metadata');

    // Revoke session
    await revokeCustomerSession(session.sessionToken);
    const postRevoke = await validateCustomerSession(session.sessionToken);
    assert(postRevoke === null, 'Revoked session is invalidated immediately');

    // ========================================================================
    // 5. CUSTOMER PWA PROFILE & CONSENT MUTATION
    // ========================================================================
    console.log('\n[5] Customer PWA Profile & Consent Mutation:');

    // Create fresh session context for service testing
    const activeSession = await createCustomerSession(cafeCustomerResult.customer.id, cafe.id);
    const ctx = (await validateCustomerSession(activeSession.sessionToken))!;

    // Get profile
    const profileData = await getCustomerProfile(ctx);
    assert(profileData.customer.name === 'Jordan Cafe Regular', 'Retrieves customer profile');
    assert(profileData.loyaltyState.status === 'PHASE_7_COMING_SOON', 'Returns Phase 7 setup state for loyalty');

    // Update profile
    const updatedCustomer = await updateCustomerProfile(ctx, {
      name: 'Jordan V. Cafe',
      email: 'jordan.v@example.com',
    });
    assert(updatedCustomer.name === 'Jordan V. Cafe', 'Updates customer name in PostgreSQL');
    assert(updatedCustomer.email === 'jordan.v@example.com', 'Updates customer email in PostgreSQL');

    // Update consent (revoke marketing)
    const revokedConsent = await updateCustomerConsent(ctx, {
      channel: ConsentChannel.MARKETING,
      granted: false,
    });
    assert(revokedConsent.granted === false, 'Updates marketing consent to false');

    const customerCheck = await prisma.customer.findUnique({
      where: { id: ctx.customerId },
    });
    assert(customerCheck?.marketingConsent === false, 'Syncs customer.marketingConsent field');

    // Get activity
    const activityEvents = await getCustomerActivity(ctx);
    assert(activityEvents.length > 0, 'Retrieves customer timeline activity');

    // ========================================================================
    // 6. HTTP REST API & END-TO-END FLOW
    // ========================================================================
    console.log('\n[6] HTTP REST API & End-to-End Flow:');

    // 1. GET /api/customer/qr/:code
    const httpQr = await request('/api/customer/qr/bean-stand-01');
    assert(httpQr.status === 200, 'GET /api/customer/qr/bean-stand-01 returns 200 OK');
    assert(httpQr.data.business.name === 'The Roasted Bean Café', 'HTTP returns business details');
    assert(httpQr.data.branch.name === 'Downtown Flagship', 'HTTP returns branch details');

    // 2. Unauthenticated protected customer route returns 401
    const unauthMe = await request('/api/customer/me');
    assert(unauthMe.status === 401, 'Unauthenticated GET /api/customer/me returns 401');
    assert(unauthMe.data.code === 'UNAUTHENTICATED_CUSTOMER', 'Returns UNAUTHENTICATED_CUSTOMER code');

    // 3. POST /api/customer/auth/request-otp
    const httpOtpPhone = '+15553332211';
    // Clear previous challenges and test customers for clean test run
    await prisma.customerOtpChallenge.deleteMany({
      where: { phone: httpOtpPhone },
    });
    await prisma.customer.deleteMany({
      where: { phone: httpOtpPhone },
    });

    const httpOtpReq = await request('/api/customer/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: cafe.id,
        phone: httpOtpPhone,
      }),
    });
    assert(httpOtpReq.status === 200, 'POST /api/customer/auth/request-otp returns 200 OK');
    assert(Boolean(httpOtpReq.data.challengeId), 'HTTP returns challenge ID');
    assert(Boolean(httpOtpReq.data.devOtp), 'HTTP returns devOtp in simulation mode');

    // 4. POST /api/customer/auth/verify-otp
    const httpVerify = await request('/api/customer/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: cafe.id,
        phone: httpOtpPhone,
        code: httpOtpReq.data.devOtp,
        challengeId: httpOtpReq.data.challengeId,
        name: 'Taylor HTTP Regular',
        marketingConsent: true,
      }),
    });
    assert(httpVerify.status === 200, 'POST /api/customer/auth/verify-otp returns 200 OK');
    assert(httpVerify.data.success === true, 'OTP verification succeeds');
    assert(httpVerify.data.customer.name === 'Taylor HTTP Regular', 'Returns created customer');
    assert(Boolean(httpVerify.cookie), 'Sets reployty_customer_session cookie');

    const customerCookie = httpVerify.cookie!;
    assert(customerCookie.includes('reployty_customer_session='), 'Cookie name is reployty_customer_session');
    assert(customerCookie.includes('HttpOnly'), 'Cookie is marked HttpOnly');

    // 5. GET /api/customer/me with session cookie
    const httpMe = await request('/api/customer/me', {
      headers: { Cookie: customerCookie },
    });
    assert(httpMe.status === 200, 'GET /api/customer/me returns 200 OK with session cookie');
    assert(httpMe.data.customer.name === 'Taylor HTTP Regular', 'Returns authenticated customer profile');
    assert(httpMe.data.business.id === cafe.id, 'Profile is scoped to The Roasted Bean Café');

    // 6. PUT /api/customer/profile
    const httpUpdate = await request('/api/customer/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
      },
      body: JSON.stringify({
        name: 'Taylor Modified',
      }),
    });
    assert(httpUpdate.status === 200, 'PUT /api/customer/profile returns 200 OK');
    assert(httpUpdate.data.customer.name === 'Taylor Modified', 'Profile name updated via HTTP API');

    // 7. GET /api/customer/loyalty
    const httpLoyalty = await request('/api/customer/loyalty', {
      headers: { Cookie: customerCookie },
    });
    assert(httpLoyalty.status === 200, 'GET /api/customer/loyalty returns 200 OK');
    assert(httpLoyalty.data.status === 'PHASE_7_SETUP', 'Returns Phase 7 setup state for loyalty pass');

    // 8. Security Separation: Customer session CANNOT access business admin API
    const crossAccess = await request('/api/business/profile', {
      headers: { Cookie: customerCookie },
    });
    assert(crossAccess.status === 401 || crossAccess.status === 403, 'Security Separation: Customer session blocked from business admin API (401/403)');

    // 9. POST /api/customer/auth/logout
    const httpLogout = await request('/api/customer/auth/logout', {
      method: 'POST',
      headers: { Cookie: customerCookie },
    });
    assert(httpLogout.status === 200, 'POST /api/customer/auth/logout returns 200 OK');

    // 10. Post-logout /me returns 401
    const postLogoutMe = await request('/api/customer/me', {
      headers: { Cookie: customerCookie },
    });
    assert(postLogoutMe.status === 401, 'Post-logout request returns 401 Unauthorized');

    console.log('\n==================================================================');
    console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================================\n');

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal test error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runCustomerSuite();
