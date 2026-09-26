import express from 'express';
import { Server } from 'http';
import { apiApp } from '../../src/server/api/app';
import { prisma } from '../../src/server/db/client';
import { hashPassword, createSession } from '../../src/server/auth/sessionService';
import { createCustomerSession } from '../../src/server/services/customerAuthService';
import { BusinessCategory, UserStatus, Role } from '@prisma/client';

export interface TestServerContext {
  server: Server;
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServerContext> {
  const app = express();
  app.use('/api', apiApp);
  app.use(apiApp);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        server,
        baseUrl,
        stop: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

export async function apiRequest(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    token?: string;
    customerToken?: string;
  } = {}
): Promise<{ status: number; headers: Headers; body: any; cookie?: string }> {
  const headers = new Headers(options.headers || {});
  
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
    headers.set('Cookie', `reployty_session=${options.token}`);
  }
  if (options.customerToken) {
    headers.set('Cookie', `reployty_customer_session=${options.customerToken}`);
  }

  let fetchBody: any = undefined;
  if (options.body !== undefined) {
    if (typeof options.body === 'object') {
      headers.set('Content-Type', 'application/json');
      fetchBody = JSON.stringify(options.body);
    } else {
      fetchBody = String(options.body);
    }
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: fetchBody,
  });

  let body: any = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  return {
    status: res.status,
    headers: res.headers,
    body,
    cookie: res.headers.get('set-cookie') || undefined,
  };
}

export interface E2ETestFixtures {
  runId: string;
  adminUser: any;
  adminSession: any;
  starterPlan: any;
  growthPlan: any;
  ownerRole: Role;
  managerRole: Role;
  staffRole: Role;
  businessA: any;
  businessB: any;
  branchA1: any;
  branchA2: any;
  branchB1: any;
  ownerA: any;
  ownerASession: any;
  managerA: any;
  managerASession: any;
  staffA1: any;
  staffA1Session: any;
  ownerB: any;
  ownerBSession: any;
  managerB: any;
  managerBSession: any;
  staffB: any;
  staffBSession: any;
  customerA: any;
  customerASession: any;
  customerB: any;
  customerBSession: any;
}

export async function createE2ETestFixtures(): Promise<E2ETestFixtures> {
  const runId = Math.random().toString(36).substring(2, 8);

  // Retrieve base roles & plans
  const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });
  const managerRole = await prisma.role.findFirstOrThrow({ where: { name: 'MANAGER' } });
  const staffRole = await prisma.role.findFirstOrThrow({ where: { name: 'STAFF' } });

  const starterPlan = await prisma.plan.findFirstOrThrow({ where: { slug: 'free' } });
  const growthPlan = await prisma.plan.findFirstOrThrow({ where: { slug: 'growth' } });

  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@reployty.com' } });
  const adminSession = await createSession(adminUser.id, null);

  const defaultPasswordHash = await hashPassword('Password123!');

  // 1. Create Business A (Cafe)
  const businessA = await prisma.business.create({
    data: {
      name: `E2E Cafe A ${runId}`,
      slug: `e2e-cafe-a-${runId}`,
      category: BusinessCategory.CAFE,
      phone: `+1555${Math.floor(100000 + Math.random() * 900000)}`,
      email: `cafe-a-${runId}@example.com`,
      primaryColor: '#7C3AED',
      secondaryColor: '#4C1D95',
      themePreset: 'CAFE',
      planId: growthPlan.id,
      onboardingCompleted: true,
      onboardingStep: 6,
    },
  });

  await prisma.subscription.create({
    data: {
      businessId: businessA.id,
      planId: growthPlan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    },
  });

  const branchA1 = await prisma.branch.create({
    data: {
      businessId: businessA.id,
      name: 'Downtown Main A1',
      code: `A1-${runId.toUpperCase()}`,
      isMainBranch: true,
    },
  });

  const branchA2 = await prisma.branch.create({
    data: {
      businessId: businessA.id,
      name: 'Uptown Branch A2',
      code: `A2-${runId.toUpperCase()}`,
      isMainBranch: false,
    },
  });

  // 2. Create Business B (Salon)
  const businessB = await prisma.business.create({
    data: {
      name: `E2E Salon B ${runId}`,
      slug: `e2e-salon-b-${runId}`,
      category: BusinessCategory.SALON,
      phone: `+1555${Math.floor(100000 + Math.random() * 900000)}`,
      email: `salon-b-${runId}@example.com`,
      primaryColor: '#EC4899',
      secondaryColor: '#BE185D',
      themePreset: 'SALON',
      planId: starterPlan.id,
      onboardingCompleted: true,
      onboardingStep: 6,
    },
  });

  await prisma.subscription.create({
    data: {
      businessId: businessB.id,
      planId: starterPlan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    },
  });

  const branchB1 = await prisma.branch.create({
    data: {
      businessId: businessB.id,
      name: 'Main Salon B1',
      code: `B1-${runId.toUpperCase()}`,
      isMainBranch: true,
    },
  });

  // 3. Create Users for Business A
  const ownerA = await prisma.user.create({
    data: {
      email: `owner.a.${runId}@reployty.com`,
      name: `Owner A ${runId}`,
      passwordHash: defaultPasswordHash,
      status: UserStatus.ACTIVE,
      memberships: {
        create: {
          businessId: businessA.id,
          roleId: ownerRole.id,
          status: 'ACTIVE',
        },
      },
    },
  });
  const ownerASession = await createSession(ownerA.id, businessA.id);

  const managerA = await prisma.user.create({
    data: {
      email: `manager.a.${runId}@reployty.com`,
      name: `Manager A ${runId}`,
      passwordHash: defaultPasswordHash,
      status: UserStatus.ACTIVE,
      memberships: {
        create: {
          businessId: businessA.id,
          roleId: managerRole.id,
          status: 'ACTIVE',
        },
      },
    },
  });
  const managerASession = await createSession(managerA.id, businessA.id);

  const staffA1 = await prisma.user.create({
    data: {
      email: `staff.a1.${runId}@reployty.com`,
      name: `Staff A1 Restricted ${runId}`,
      passwordHash: defaultPasswordHash,
      status: UserStatus.ACTIVE,
      memberships: {
        create: {
          businessId: businessA.id,
          branchId: branchA1.id,
          roleId: staffRole.id,
          status: 'ACTIVE',
        },
      },
    },
  });
  const staffA1Session = await createSession(staffA1.id, businessA.id);

  // 4. Create Users for Business B
  const ownerB = await prisma.user.create({
    data: {
      email: `owner.b.${runId}@reployty.com`,
      name: `Owner B ${runId}`,
      passwordHash: defaultPasswordHash,
      status: UserStatus.ACTIVE,
      memberships: {
        create: {
          businessId: businessB.id,
          roleId: ownerRole.id,
          status: 'ACTIVE',
        },
      },
    },
  });
  const ownerBSession = await createSession(ownerB.id, businessB.id);

  const managerB = await prisma.user.create({
    data: {
      email: `manager.b.${runId}@reployty.com`,
      name: `Manager B ${runId}`,
      passwordHash: defaultPasswordHash,
      status: UserStatus.ACTIVE,
      memberships: {
        create: {
          businessId: businessB.id,
          roleId: managerRole.id,
          status: 'ACTIVE',
        },
      },
    },
  });
  const managerBSession = await createSession(managerB.id, businessB.id);

  const staffB = await prisma.user.create({
    data: {
      email: `staff.b.${runId}@reployty.com`,
      name: `Staff B ${runId}`,
      passwordHash: defaultPasswordHash,
      status: UserStatus.ACTIVE,
      memberships: {
        create: {
          businessId: businessB.id,
          branchId: branchB1.id,
          roleId: staffRole.id,
          status: 'ACTIVE',
        },
      },
    },
  });
  const staffBSession = await createSession(staffB.id, businessB.id);

  // 5. Create Customers
  const customerA = await prisma.customer.create({
    data: {
      businessId: businessA.id,
      branchId: branchA1.id,
      name: `Customer A ${runId}`,
      phone: `+1555${Math.floor(100000 + Math.random() * 900000)}`,
      email: `cust.a.${runId}@example.com`,
      stampsBalance: 0,
      pointsBalance: 0,
      totalVisits: 0,
      marketingConsent: true,
      status: 'ACTIVE',
    },
  });
  const customerASession = await createCustomerSession(customerA.id, businessA.id);

  const customerB = await prisma.customer.create({
    data: {
      businessId: businessB.id,
      branchId: branchB1.id,
      name: `Customer B ${runId}`,
      phone: `+1555${Math.floor(100000 + Math.random() * 900000)}`,
      email: `cust.b.${runId}@example.com`,
      stampsBalance: 0,
      pointsBalance: 0,
      totalVisits: 0,
      marketingConsent: true,
      status: 'ACTIVE',
    },
  });
  const customerBSession = await createCustomerSession(customerB.id, businessB.id);

  return {
    runId,
    adminUser,
    adminSession,
    starterPlan,
    growthPlan,
    ownerRole,
    managerRole,
    staffRole,
    businessA,
    businessB,
    branchA1,
    branchA2,
    branchB1,
    ownerA,
    ownerASession,
    managerA,
    managerASession,
    staffA1,
    staffA1Session,
    ownerB,
    ownerBSession,
    managerB,
    managerBSession,
    staffB,
    staffBSession,
    customerA,
    customerASession,
    customerB,
    customerBSession,
  };
}

export async function cleanupE2ETestFixtures(fixtures: E2ETestFixtures): Promise<void> {
  const { businessA, businessB, ownerA, managerA, staffA1, ownerB, managerB, staffB } = fixtures;
  const businessIds = [businessA.id, businessB.id];
  const userIds = [ownerA.id, managerA.id, staffA1.id, ownerB.id, managerB.id, staffB.id];

  try {
    // 1. Delete sessions & customer sessions
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.customerSession.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    
    // 2. Delete audit logs
    await prisma.auditLog.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    // 3. Delete reviews & generations
    await prisma.reviewGeneration.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.reviewFeedback.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    // 4. Delete offer redemptions & offers
    await prisma.offerRedemption.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.offer.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    // 5. Delete reward redemptions & rewards
    await prisma.rewardRedemption.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.reward.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    // 6. Delete catalog items & categories
    await prisma.menuItem.deleteMany({ where: { category: { menu: { businessId: { in: businessIds } } } } }).catch(() => {});
    await prisma.menuCategory.deleteMany({ where: { menu: { businessId: { in: businessIds } } } }).catch(() => {});
    await prisma.menu.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    await prisma.service.deleteMany({ where: { category: { businessId: { in: businessIds } } } }).catch(() => {});
    await prisma.serviceCategory.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    await prisma.product.deleteMany({ where: { category: { businessId: { in: businessIds } } } }).catch(() => {});
    await prisma.productCategory.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    // 7. Delete loyalty transactions, cards, programs
    await prisma.loyaltyTransaction.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.loyaltyCard.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.loyaltyProgram.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    // 8. Delete CRM notes, events, tag mappings, tags, segments
    await prisma.customerNote.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.customerEvent.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.customerTagAssignment.deleteMany({ where: { tag: { businessId: { in: businessIds } } } }).catch(() => {});
    await prisma.customerTag.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.customerSegment.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.customerConsent.deleteMany({ where: { customer: { businessId: { in: businessIds } } } }).catch(() => {});

    // 9. Delete customers
    await prisma.customer.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    // 10. Delete billing invoices, payments, subscriptions
    await prisma.invoice.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.payment.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.subscription.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});

    // 11. Delete staff memberships, branches, businesses, users
    await prisma.staffMembership.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  } catch (err) {
    console.error('Fixture cleanup error:', err);
  }
}
