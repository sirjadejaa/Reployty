import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import { updateBusinessBranding, getBusinessBranding } from '../../src/server/services/businessService';
import { getCustomerLoyaltyState } from '../../src/server/services/loyaltyService';
import { createCustomerSession } from '../../src/server/services/customerAuthService';

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

async function runDigitalCardThemeSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 10: DIGITAL LOYALTY CARD & THEME ENGINE TEST SUITE');
  console.log('==================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 0. Locate Seeded Tenants and Users
    // -------------------------------------------------------------------------
    const cafe = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
    });
    const salon = await prisma.business.findUnique({
      where: { slug: 'luxe-glow-beauty' },
    });
    const marcus = await prisma.user.findUnique({
      where: { email: 'marcus@reployty.com' },
    });

    if (!cafe || !salon || !marcus) {
      throw new Error('Required seeded businesses or users missing.');
    }

    const cafeCtx = await getTenantContext(marcus.id, cafe.id);
    const salonCtx = await getTenantContext(marcus.id, salon.id);

    // Login as Marcus to obtain business admin cookie
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'marcus@reployty.com', password: 'OwnerPass123!' }),
    });
    assert(loginRes.status === 200, 'Owner authenticated successfully');
    const ownerCookie = `reployty_session=${loginRes.data.sessionToken}`;

    // Ensure session is set to Cafe
    await request('/api/auth/switch-tenant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ businessId: cafe.id }),
    });

    // -------------------------------------------------------------------------
    // 1. Business Branding & Controlled Theme Engine Updates
    // -------------------------------------------------------------------------
    console.log('[1] Theme Preset & Hex Color Validation:');

    // 1.1 Valid preset and colors update successfully
    const validUpdate = await updateBusinessBranding(cafeCtx as any, {
      themePreset: 'CAFE',
      primaryColor: '#78350F',
      secondaryColor: '#291809',
    });
    assert(validUpdate.themePreset === 'CAFE', 'Valid theme preset CAFE applied');
    assert(validUpdate.primaryColor === '#78350F', 'Valid primary color #78350F applied');
    assert(validUpdate.secondaryColor === '#291809', 'Valid secondary color #291809 applied');

    // 1.2 Invalid theme preset rejected
    let rejectedPreset = false;
    try {
      await updateBusinessBranding(cafeCtx as any, {
        themePreset: 'CYBERPUNK_NEON' as any,
      });
    } catch (err: any) {
      rejectedPreset = err.code === 'INVALID_PRESET' || err.message.includes('Invalid theme preset');
    }
    assert(rejectedPreset, 'Server rejects unsupported theme preset CYBERPUNK_NEON (400)');

    // 1.3 Invalid hex color rejected
    let rejectedColor = false;
    try {
      await updateBusinessBranding(cafeCtx as any, {
        primaryColor: 'not-a-color-injection; background: red;',
      });
    } catch (err: any) {
      rejectedColor = err.code === 'INVALID_COLOR' || err.message.includes('valid hex color');
    }
    assert(rejectedColor, 'Server rejects invalid primary color injection (400)');

    let rejectedSecondary = false;
    try {
      await updateBusinessBranding(cafeCtx as any, {
        secondaryColor: 'rgb(255, 0, 0)',
      });
    } catch (err: any) {
      rejectedSecondary = err.code === 'INVALID_COLOR' || err.message.includes('valid hex color');
    }
    assert(rejectedSecondary, 'Server rejects non-hex format rgb(...) for secondary color (400)');

    // -------------------------------------------------------------------------
    // 2. HTTP API Branding Endpoints & Tenant Isolation
    // -------------------------------------------------------------------------
    console.log('\n[2] HTTP REST Branding Validation & Tenant Isolation:');

    // 2.1 PUT /api/business/branding with invalid preset returns 400
    const httpInvalidPreset = await request('/api/business/branding', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerCookie,
      },
      body: JSON.stringify({
        themePreset: 'SUPER_UNKNOWN_PRESET',
      }),
    });
    assert(httpInvalidPreset.status === 400, 'HTTP PUT /api/business/branding returns 400 on invalid preset');

    // 2.2 PUT /api/business/branding with invalid hex returns 400
    const httpInvalidColor = await request('/api/business/branding', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerCookie,
      },
      body: JSON.stringify({
        primaryColor: 'blue',
      }),
    });
    assert(httpInvalidColor.status === 400, 'HTTP PUT /api/business/branding returns 400 on named color "blue"');

    // 2.3 PUT /api/business/branding with valid RESTAURANT preset
    const httpValidUpdate = await request('/api/business/branding', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerCookie,
      },
      body: JSON.stringify({
        themePreset: 'RESTAURANT',
        primaryColor: '#DC2626',
        secondaryColor: '#1F2937',
      }),
    });
    assert(httpValidUpdate.status === 200, 'HTTP PUT /api/business/branding returns 200 OK');
    assert(httpValidUpdate.data.themePreset === 'RESTAURANT', 'Theme preset updated to RESTAURANT via API');

    // 2.4 Strict Tenant Isolation: Cafe branding change did NOT touch Salon
    const salonBranding = await getBusinessBranding(salonCtx as any);
    assert(salonBranding.themePreset !== 'RESTAURANT', 'Tenant Isolation: Salon branding unmodified by Cafe update');

    // -------------------------------------------------------------------------
    // 3. Customer Digital Loyalty Card State & Server Authority
    // -------------------------------------------------------------------------
    console.log('\n[3] Customer Loyalty Card State & Branding Delivery:');

    // Locate or create an active test customer for Cafe
    let testCustomer = await prisma.customer.findFirst({
      where: { businessId: cafe.id, status: 'ACTIVE' },
      include: { loyaltyCards: true },
    });

    if (!testCustomer) {
      testCustomer = await prisma.customer.create({
        data: {
          businessId: cafe.id,
          phone: '+15559876543',
          name: 'Phase 10 Regular',
          status: 'ACTIVE',
          stampsBalance: 4,
          pointsBalance: 400,
        },
        include: { loyaltyCards: true },
      });
    }

    // 3.1 Fetch customer loyalty state through loyalty service
    const customerSession = await createCustomerSession(testCustomer.id, cafe.id);
    const loyaltyState = await getCustomerLoyaltyState(customerSession);
    assert(loyaltyState.business !== null && loyaltyState.business !== undefined, 'Loyalty state includes business branding object');
    assert(loyaltyState.business?.name === cafe.name, 'Business name matches server-authoritative tenant record');
    assert(loyaltyState.business?.themePreset === 'RESTAURANT', 'Branded theme preset delivered to customer card');
    assert(loyaltyState.business?.primaryColor === '#DC2626', 'Primary color delivered to customer card');
    assert(loyaltyState.customer !== null && loyaltyState.customer !== undefined, 'Loyalty state includes customer identity');
    assert(loyaltyState.customer?.phone === testCustomer.phone, 'Customer phone correctly returned');
    assert(loyaltyState.card !== undefined, 'Customer loyalty card details returned');

    // 3.2 Customer PWA Session HTTP GET /api/customer/loyalty
    const customerCookie = `reployty_customer_session=${customerSession.sessionToken}`;

    const httpCustomerLoyalty = await request('/api/customer/loyalty', {
      headers: {
        Cookie: customerCookie,
      },
    });
    if (httpCustomerLoyalty.status !== 200) {
      console.log('Customer Loyalty HTTP error:', httpCustomerLoyalty.status, httpCustomerLoyalty.data);
    }
    assert(httpCustomerLoyalty.status === 200, 'GET /api/customer/loyalty returns 200 OK');
    assert(httpCustomerLoyalty.data.business.themePreset === 'RESTAURANT', 'Customer endpoint returns RESTAURANT preset');
    assert(httpCustomerLoyalty.data.business.primaryColor === '#DC2626', 'Customer endpoint returns primaryColor');
    assert(httpCustomerLoyalty.data.customer.phone === testCustomer.phone, 'Customer endpoint returns customer identity');
    assert(typeof httpCustomerLoyalty.data.card.stampsCollected === 'number', 'Server-authoritative stamps collected returned');

    // -------------------------------------------------------------------------
    // 4. Reset Branding to Clean State
    // -------------------------------------------------------------------------
    await updateBusinessBranding(cafeCtx as any, {
      themePreset: 'CAFE',
      primaryColor: '#78350F',
      secondaryColor: '#291809',
    });

    console.log('\n==================================================================');
    console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================================\n');

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal test error in Phase 10 suite:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runDigitalCardThemeSuite();
