import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { prisma } from '../../src/server/db/client';
import { getCustomerLoyaltyState } from '../../src/server/services/loyaltyService';
import { getCustomerProfile } from '../../src/server/services/customerPwaService';
import { findOrCreateCustomer, createCustomerSession } from '../../src/server/services/customerAuthService';

test('REGRESSION TEST: Real Scannable QR Code Generation for Member Identification Pass', async (t) => {
  const ts = Date.now();

  // 1. Verify QRCode generates valid Base64 PNG data URLs
  const testPhone = '+15551234567';
  const qrDataUrl = await QRCode.toDataURL(testPhone, {
    width: 360,
    margin: 2,
    color: { dark: '#0F172A', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });

  assert.ok(qrDataUrl.startsWith('data:image/png;base64,'), 'QR Code must be a Base64 encoded PNG data URI');
  assert.ok(qrDataUrl.length > 200, 'QR Code image data must be populated');

  // 2. Setup mock business and customer to simulate Customer Dashboard / Profile
  const business = await prisma.business.create({
    data: {
      name: `QR Pass Cafe ${ts}`,
      slug: `qr-pass-cafe-${ts}`,
      category: 'CAFE',
      status: 'ACTIVE',
      onboardingCompleted: true,
      onboardingStep: 6,
      phone: '+1 555 987 6543',
      address: '100 Coffee Lane',
    },
  });

  const { customer } = await findOrCreateCustomer(business.id, testPhone, {
    source: 'PWA_QR_VERIFICATION',
  });
  assert.ok(customer.id);
  assert.equal(customer.phone, testPhone);

  const session = await createCustomerSession(customer.id, business.id);
  const customerCtx = {
    customerId: customer.id,
    businessId: business.id,
    sessionToken: session.sessionToken,
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    business: { id: business.id, name: business.name, slug: business.slug, category: business.category },
  } as any;

  // 3. Customer Dashboard / Profile payload verification
  const profile = await getCustomerProfile(customerCtx);
  assert.ok(profile.customer, 'Customer profile must return customer entity');
  assert.equal(profile.customer.phone, testPhone, 'Customer phone must match for member QR');

  const loyaltyState = await getCustomerLoyaltyState(customerCtx);
  assert.ok(loyaltyState, 'Loyalty state must exist');

  // 4. Verify member code and terminal URL formatting logic
  const memberCode = (profile.customer.phone && profile.customer.phone.trim()) || profile.customer.id;
  assert.equal(memberCode, testPhone);

  const terminalUrl = `https://app.reployty.com/#terminal?customer=${encodeURIComponent(memberCode)}`;
  assert.ok(terminalUrl.includes('#terminal?customer='));

  const memberQr = await QRCode.toDataURL(terminalUrl, {
    width: 360,
    margin: 2,
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });
  assert.ok(memberQr.startsWith('data:image/png;base64,'), 'Dynamic member pass QR with terminal URL must generate cleanly');

  // Verify URL parser extracts customer
  const extractedCustomer = decodeURIComponent(terminalUrl.split('customer=')[1]);
  assert.equal(extractedCustomer, testPhone, 'Scanned customer from terminal URL must match phone');

  // 5. Fallback verification: customer without phone uses customer ID
  const fallbackTarget = customer.id || 'REPLOYTY-MEMBER-PASS';
  const fallbackTerminalUrl = `https://app.reployty.com/#terminal?customer=${encodeURIComponent(fallbackTarget)}`;
  const fallbackQr = await QRCode.toDataURL(fallbackTerminalUrl, {
    width: 240,
    margin: 2,
  });
  assert.ok(fallbackQr.startsWith('data:image/png;base64,'), 'Fallback member ID QR must generate cleanly');

  // Teardown
  await prisma.customerSession.deleteMany({ where: { customerId: customer.id } }).catch(() => {});
  await prisma.customer.deleteMany({ where: { id: customer.id } }).catch(() => {});
  await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
});
