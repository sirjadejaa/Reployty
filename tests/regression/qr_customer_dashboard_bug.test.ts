import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/server/db/client';
import { upsertLoyaltyProgram, getCustomerLoyaltyState, claimCustomerQrEarning } from '../../src/server/services/loyaltyService';
import { getBusinessQrCode, getBusinessDashboard } from '../../src/server/services/businessService';
import { resolvePublicQr, getCustomerProfile, updateCustomerProfile } from '../../src/server/services/customerPwaService';
import { requestOtp, verifyOtp } from '../../src/server/services/otpService';
import { findOrCreateCustomer, createCustomerSession } from '../../src/server/services/customerAuthService';
import { getBusinessCustomers } from '../../src/server/services/crmService';
import { TenantContext } from '../../src/server/auth/tenantContext';

test('SIMULATE USER REPRODUCTION: QR Customer Registration & Dashboard Visibility', async (t) => {
  const ts = Date.now();
  
  // 1. Create a new business account
  const business = await prisma.business.create({
    data: {
      name: `Repro Cafe ${ts}`,
      slug: `repro-cafe-${ts}`,
      category: 'CAFE',
      status: 'ACTIVE',
      onboardingCompleted: true,
      onboardingStep: 6,
      phone: '+91 99887 76655',
      address: '42 Main St',
    },
  });

  const branch = await prisma.branch.create({
    data: {
      businessId: business.id,
      name: 'Main Branch',
      code: 'MAIN-01',
      isMainBranch: true,
      status: 'ACTIVE',
    },
  });

  const owner = await prisma.user.create({
    data: {
      email: `repro.owner.${ts}@example.com`,
      name: 'Repro Owner',
      passwordHash: 'dummy',
      status: 'ACTIVE',
    },
  });

  const role = await prisma.role.findFirst({ where: { name: 'OWNER' } });
  await prisma.staffMembership.create({
    data: {
      businessId: business.id,
      userId: owner.id,
      branchId: branch.id,
      roleId: role!.id,
      status: 'ACTIVE',
    },
  });

  const tenantCtx: TenantContext = {
    user: { id: owner.id, email: owner.email, name: owner.name, isSuperAdmin: false },
    userId: owner.id,
    userEmail: owner.email,
    userName: owner.name,
    isSuperAdmin: false,
    businessId: business.id,
    businessName: business.name,
    businessCategory: 'CAFE',
    roleName: 'OWNER',
    permissions: new Set(['*']),
    hasPermission: () => true,
    isOwner: true,
  } as any;

  // 2. Configure a stamp-based loyalty program
  const program = await upsertLoyaltyProgram(tenantCtx, {
    name: 'Coffee Stamp Card',
    type: 'STAMP',
    targetStamps: 10,
    rewardTitle: 'Free Espresso',
    status: 'ACTIVE',
  });

  assert.equal(program.type, 'STAMP', 'Program type should be STAMP');

  // 3. Generate business QR code
  const qr = await getBusinessQrCode(tenantCtx);
  assert.ok(qr.code, 'QR code must be generated');

  // 4. Resolve QR code as a customer on mobile
  const resolvedQr = await resolvePublicQr(qr.code);
  assert.equal(resolvedQr.business.id, business.id, 'Resolved business must match');

  // 5. Customer enters phone and requests OTP
  const customerPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
  const otpReq = await requestOtp({ businessId: resolvedQr.business.id, phone: customerPhone });
  assert.ok(otpReq.challengeId);
  const otpCode = otpReq.devOtp || '123456';

  // 6. Customer verifies OTP
  const otpVerify = await verifyOtp({
    businessId: resolvedQr.business.id,
    phone: customerPhone,
    code: otpCode,
    challengeId: otpReq.challengeId,
  });
  assert.equal(otpVerify.verified, true);

  const { customer, isNew } = await findOrCreateCustomer(resolvedQr.business.id, otpVerify.phone, {
    source: 'PWA_QR_VERIFICATION',
    branchId: resolvedQr.branch?.id,
  });
  assert.ok(customer.id);
  assert.equal(isNew, true);

  // 7. Customer enters name
  const customerSession = await createCustomerSession(customer.id, business.id);
  const customerCtx = {
    customerId: customer.id,
    businessId: business.id,
    sessionToken: customerSession.sessionToken,
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    business: { id: business.id, name: business.name, slug: business.slug, category: business.category },
  } as any;

  await updateCustomerProfile(customerCtx, { name: 'Alice Customer' });

  // 8. Auto-earning claim from QR scan
  const claimResult = await claimCustomerQrEarning(customerCtx, {
    qrCode: qr.code,
    idempotencyKey: `scan_${qr.code}_${Date.now()}`,
  });
  console.log('Claim result:', claimResult);

  // 9. Customer views digital loyalty card
  const loyaltyState = await getCustomerLoyaltyState(customerCtx);
  console.log('Loyalty state:', JSON.stringify(loyaltyState, null, 2));

  // 10. Customer profile via getCustomerProfile (/api/customer/me)
  const profile = await getCustomerProfile(customerCtx);
  console.log('Profile from /api/customer/me:', JSON.stringify(profile.loyaltyState, null, 2));

  // 11. Business Dashboard
  const dashboard = await getBusinessDashboard(tenantCtx);
  console.log('Dashboard metrics:', dashboard.metrics);
  console.log('Dashboard loyaltyProgram:', dashboard.loyaltyProgram);

  // 12. Business Customers Directory
  const customersList = await getBusinessCustomers(tenantCtx, {});
  console.log('Customers count in directory:', customersList.data.length);
  console.log('Customer data in directory:', customersList.data[0]);

  // Teardown
  await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: owner.id } }).catch(() => {});
});
