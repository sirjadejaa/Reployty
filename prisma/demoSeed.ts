/**
 * Reployty Demo Data Seed & Teardown Script
 * 
 * Provides safe, repeatable, and isolated synthetic demo businesses for client presentations.
 * Uses reserved .test email domains and synthetic phone numbers.
 * Safe to run repeatedly; completely isolated from real and development tenant data.
 */

import { PrismaClient, BusinessCategory, UserStatus, CustomerEventType, RedemptionStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_BUSINESS_SLUGS = ['demo-cafe', 'demo-salon'];
const DEMO_USER_EMAILS = [
  'admin.demo@reployty.test',
  'owner.cafe@reployty.test',
  'cashier.cafe@reployty.test',
  'owner.salon@reployty.test',
  'stylist.salon@reployty.test',
];

export async function cleanDemo() {
  console.log('🧹 Cleaning existing demo data...');

  // 1. Delete synthetic customer accounts
  const demoCustomers = await prisma.customer.findMany({
    where: {
      OR: [
        { email: { endsWith: '@customer.test' } },
        { phone: { in: ['+15550100001', '+15550100002', '+15550100003'] } },
      ],
    },
    select: { id: true },
  });
  const customerIds = demoCustomers.map(c => c.id);

  if (customerIds.length > 0) {
    await prisma.customerEvent.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.rewardRedemption.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.loyaltyCard.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  }


  // 2. Delete demo businesses and cascaded relations
  const demoBusinesses = await prisma.business.findMany({
    where: { slug: { in: DEMO_BUSINESS_SLUGS } },
    select: { id: true },
  });
  const businessIds = demoBusinesses.map(b => b.id);

  if (businessIds.length > 0) {
    await prisma.usageMeterEvent.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.automationExecution.deleteMany({ where: { rule: { businessId: { in: businessIds } } } });
    await prisma.automationRule.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.campaignDelivery.deleteMany({ where: { campaign: { businessId: { in: businessIds } } } });
    await prisma.campaign.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.customerSegment.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.rewardRedemption.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.reward.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.loyaltyCard.deleteMany({ where: { program: { businessId: { in: businessIds } } } });
    await prisma.loyaltyProgram.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.qRCode.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.service.deleteMany({ where: { category: { businessId: { in: businessIds } } } });
    await prisma.serviceCategory.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.product.deleteMany({ where: { category: { businessId: { in: businessIds } } } });
    await prisma.productCategory.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.staffMembership.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.branch.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.subscription.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  }

  // 3. Delete demo users
  await prisma.user.deleteMany({
    where: { email: { in: DEMO_USER_EMAILS } },
  });

  console.log('✅ Demo data cleanup completed successfully.');
}

export async function seedDemo() {
  console.log('🚀 Seeding isolated synthetic demo businesses...');

  // Ensure default plans exist
  let starterPlan = await prisma.plan.findUnique({ where: { slug: 'starter' } });
  if (!starterPlan) {
    starterPlan = await prisma.plan.create({
      data: {
        name: 'Starter Business',
        slug: 'starter',
        description: 'For single-location stores starting out.',
        priceMinor: 299900,
        currency: 'INR',
        maxBranches: 2,
        maxCustomers: 1000,
        maxStaff: 5,
        isActive: true,
      },
    });
  }

  // Ensure system roles exist
  const ownerRole = await prisma.role.findFirst({ where: { name: 'OWNER' } });
  const staffRole = await prisma.role.findFirst({ where: { name: 'STAFF' } });
  if (!ownerRole || !staffRole) {
    throw new Error('System roles not found. Run "npx prisma db seed" first to establish base system permissions and roles.');
  }

  const demoPasswordHash = bcrypt.hashSync('DemoPass123!', 10);

  // 1. Super Admin Demo Account
  await prisma.user.upsert({
    where: { email: 'admin.demo@reployty.test' },
    update: { passwordHash: demoPasswordHash, status: UserStatus.ACTIVE },
    create: {
      email: 'admin.demo@reployty.test',
      name: 'Demo Platform Admin',
      passwordHash: demoPasswordHash,
      status: UserStatus.ACTIVE,
      isSuperAdmin: true,
    },
  });

  // 2. Demo Café Users
  const cafeOwner = await prisma.user.upsert({
    where: { email: 'owner.cafe@reployty.test' },
    update: { passwordHash: demoPasswordHash, status: UserStatus.ACTIVE },
    create: {
      email: 'owner.cafe@reployty.test',
      name: 'Elena Rostova (Demo Café Owner)',
      phone: '+1 (555) 010-1001',
      passwordHash: demoPasswordHash,
      status: UserStatus.ACTIVE,
      isSuperAdmin: false,
    },
  });

  const cafeCashier = await prisma.user.upsert({
    where: { email: 'cashier.cafe@reployty.test' },
    update: { passwordHash: demoPasswordHash, status: UserStatus.ACTIVE },
    create: {
      email: 'cashier.cafe@reployty.test',
      name: 'Sam Barista (Demo Cashier)',
      phone: '+1 (555) 010-1002',
      passwordHash: demoPasswordHash,
      status: UserStatus.ACTIVE,
      isSuperAdmin: false,
    },
  });

  // 3. Demo Salon Users
  const salonOwner = await prisma.user.upsert({
    where: { email: 'owner.salon@reployty.test' },
    update: { passwordHash: demoPasswordHash, status: UserStatus.ACTIVE },
    create: {
      email: 'owner.salon@reployty.test',
      name: 'Chloe Monet (Demo Salon Owner)',
      phone: '+1 (555) 010-2001',
      passwordHash: demoPasswordHash,
      status: UserStatus.ACTIVE,
      isSuperAdmin: false,
    },
  });

  // 4. BUSINESS A: Demo Café
  console.log('Creating Demo Café (Stamps & Rewards)...');
  const demoCafe = await prisma.business.upsert({
    where: { slug: 'demo-cafe' },
    update: {
      onboardingCompleted: true,
      onboardingStep: 6,
    },
    create: {
      name: 'Demo Café',
      slug: 'demo-cafe',
      category: BusinessCategory.CAFE,
      description: 'Artisanal roastery, flaky sourdough pastries & cozy workspace.',
      primaryColor: '#B45309',
      secondaryColor: '#78350F',
      themePreset: 'CAFE',
      phone: '+1 (555) 010-1000',
      email: 'contact@democafe.test',
      address: '100 Coffee Lane',
      city: 'Metro City',
      state: 'CA',
      country: 'US',
      postalCode: '90001',
      planId: starterPlan.id,
      onboardingCompleted: true,
      onboardingStep: 6,
    },
  });

  // Branch
  const cafeBranch = await prisma.branch.upsert({
    where: { id: 'branch_demo_cafe_main' },
    update: {},
    create: {
      id: 'branch_demo_cafe_main',
      businessId: demoCafe.id,
      name: 'Downtown Roastery',
      code: 'DC-01',
      address: '100 Coffee Lane',
      city: 'Metro City',
      phone: '+1 (555) 010-1000',
      isMainBranch: true,
      status: 'ACTIVE',
    },
  });

  // Staff memberships
  await prisma.staffMembership.upsert({
    where: { userId_businessId: { userId: cafeOwner.id, businessId: demoCafe.id } },
    update: { status: 'ACTIVE' },
    create: {
      userId: cafeOwner.id,
      businessId: demoCafe.id,
      roleId: ownerRole.id,
      status: 'ACTIVE',
    },
  });

  await prisma.staffMembership.upsert({
    where: { userId_businessId: { userId: cafeCashier.id, businessId: demoCafe.id } },
    update: { status: 'ACTIVE' },
    create: {
      userId: cafeCashier.id,
      businessId: demoCafe.id,
      roleId: staffRole.id,
      status: 'ACTIVE',
    },
  });

  // Customer Entry Standee QR Code
  await prisma.qRCode.upsert({
    where: { code: 'demo-cafe-stand' },
    update: {},
    create: {
      code: 'demo-cafe-stand',
      businessId: demoCafe.id,
      branchId: cafeBranch.id,
      type: 'BUSINESS_STAND',
      destinationUrl: '/join/demo-cafe',
      status: 'ACTIVE',
    },
  });

  // Loyalty Program: 5 Stamps -> Free Single-Origin Pour-over
  const cafeProgram = await prisma.loyaltyProgram.upsert({
    where: { id: 'prog_demo_cafe_stamps' },
    update: {
      status: 'ACTIVE',
      targetStamps: 5,
      rewardTitle: 'Free Signature Pour-Over',
    },
    create: {
      id: 'prog_demo_cafe_stamps',
      businessId: demoCafe.id,
      name: 'Café Regulars Club',
      type: 'STAMP',
      targetStamps: 5,
      rewardTitle: 'Free Signature Pour-Over',
      status: 'ACTIVE',
    },
  });


  // Rewards Catalog
  const freeCoffeeReward = await prisma.reward.upsert({
    where: { id: 'reward_demo_free_coffee' },
    update: {},
    create: {
      id: 'reward_demo_free_coffee',
      businessId: demoCafe.id,
      title: 'Free Signature Pour-Over',
      description: 'Handcrafted single-origin brew with beans roasted in-house.',
      stampsRequired: 5,
      status: 'ACTIVE',
    },
  });

  await prisma.reward.upsert({
    where: { id: 'reward_demo_croissant' },
    update: {},
    create: {
      id: 'reward_demo_croissant',
      businessId: demoCafe.id,
      title: 'Fresh Almond Croissant',
      description: 'Baked fresh daily with roasted almond flakes and butter.',
      stampsRequired: 3,
      status: 'ACTIVE',
    },
  });

  // Synthetic Customer: Alex Rivera (Has 4 stamps — 1 stamp away from reward!)
  const customerAlex = await prisma.customer.upsert({
    where: { businessId_phone: { businessId: demoCafe.id, phone: '+15550100001' } },
    update: { totalVisits: 4, pointsBalance: 40 },
    create: {
      businessId: demoCafe.id,
      branchId: cafeBranch.id,
      name: 'Alex Rivera (Demo Regular)',
      phone: '+15550100001',
      email: 'alex.regular@customer.test',
      status: 'ACTIVE',
      totalVisits: 4,
      pointsBalance: 40,
      marketingConsent: true,
      lastVisitAt: new Date(Date.now() - 24 * 3600 * 1000), // 1 day ago
    },
  });

  // Customer Loyalty Card with 4 stamps collected
  await prisma.loyaltyCard.upsert({
    where: { customerId_programId: { customerId: customerAlex.id, programId: cafeProgram.id } },
    update: { stampsCollected: 4, status: 'ACTIVE' },
    create: {
      businessId: demoCafe.id,
      customerId: customerAlex.id,
      programId: cafeProgram.id,
      stampsCollected: 4,
      totalStampsNeeded: 5,
      pointsBalance: 40,
      status: 'ACTIVE',
    },
  });

  // Pre-generate a ready-to-redeem voucher for cashier demonstration
  await prisma.rewardRedemption.upsert({
    where: { redemptionCode: 'DEMO-FREE-BREW' },
    update: { status: RedemptionStatus.CLAIMED },
    create: {
      id: 'rdm_demo_sample_voucher',
      businessId: demoCafe.id,
      branchId: cafeBranch.id,
      customerId: customerAlex.id,
      rewardId: freeCoffeeReward.id,
      redemptionCode: 'DEMO-FREE-BREW',
      status: RedemptionStatus.CLAIMED,
      stampsConsumed: 5,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });


  // Customer Activity History
  await prisma.customerEvent.create({
    data: {
      customerId: customerAlex.id,
      businessId: demoCafe.id,
      branchId: cafeBranch.id,
      type: CustomerEventType.CUSTOMER_JOINED,
      metadata: {
        title: 'Joined Demo Café Rewards',
        description: 'Scanned counter QR standee at Downtown Roastery',
      },
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
    },
  });

  await prisma.customerEvent.create({
    data: {
      customerId: customerAlex.id,
      businessId: demoCafe.id,
      branchId: cafeBranch.id,
      type: CustomerEventType.STAMP_ADDED,
      metadata: {
        title: 'Earned 4th Loyalty Stamp',
        description: 'Purchased Single-Origin Cold Brew',
      },
      createdAt: new Date(Date.now() - 24 * 3600 * 1000),
    },
  });


  // Dynamic Segment
  await prisma.customerSegment.upsert({
    where: { id: 'segment_demo_regulars' },
    update: {},
    create: {
      id: 'segment_demo_regulars',
      businessId: demoCafe.id,
      name: 'High-Frequency Regulars',
      description: 'Customers with 3 or more completed visits',
      ruleDefinition: {
        logic: 'AND',
        conditions: [{ field: 'totalVisits', operator: 'GREATER_THAN_OR_EQUAL', value: 3 }],
      },
      status: 'ACTIVE',
    },
  });

  // 5. BUSINESS B: Demo Salon
  console.log('Creating Demo Salon (Services & Points)...');
  const demoSalon = await prisma.business.upsert({
    where: { slug: 'demo-salon' },
    update: {
      onboardingCompleted: true,
      onboardingStep: 6,
    },
    create: {
      name: 'Demo Salon & Spa',
      slug: 'demo-salon',
      category: BusinessCategory.SALON,
      description: 'Luxury organic hair styling, restorative facials & nail lounge.',
      primaryColor: '#DB2777',
      secondaryColor: '#9D174D',
      themePreset: 'SALON',
      phone: '+1 (555) 010-2000',
      email: 'contact@demosalon.test',
      address: '250 Velvet Boulevard',
      city: 'Metro City',
      state: 'CA',
      country: 'US',
      postalCode: '90002',
      planId: starterPlan.id,
      onboardingCompleted: true,
      onboardingStep: 6,
    },
  });

  const salonBranch = await prisma.branch.upsert({
    where: { id: 'branch_demo_salon_main' },
    update: {},
    create: {
      id: 'branch_demo_salon_main',
      businessId: demoSalon.id,
      name: 'Westside Spa & Lounge',
      code: 'DS-01',
      address: '250 Velvet Boulevard',
      city: 'Metro City',
      phone: '+1 (555) 010-2000',
      isMainBranch: true,
      status: 'ACTIVE',
    },
  });

  await prisma.staffMembership.upsert({
    where: { userId_businessId: { userId: salonOwner.id, businessId: demoSalon.id } },
    update: { status: 'ACTIVE' },
    create: {
      userId: salonOwner.id,
      businessId: demoSalon.id,
      roleId: ownerRole.id,
      status: 'ACTIVE',
    },
  });

  await prisma.qRCode.upsert({
    where: { code: 'demo-salon-stand' },
    update: {},
    create: {
      code: 'demo-salon-stand',
      businessId: demoSalon.id,
      branchId: salonBranch.id,
      type: 'BUSINESS_STAND',
      destinationUrl: '/join/demo-salon',
      status: 'ACTIVE',
    },
  });


  // Services Catalog
  const hairCat = await prisma.serviceCategory.upsert({
    where: { id: 'cat_demo_salon_hair' },
    update: {},
    create: {
      id: 'cat_demo_salon_hair',
      businessId: demoSalon.id,
      name: 'Hair Design & Coloring',
      sortOrder: 1,
    },
  });

  await prisma.service.upsert({
    where: { id: 'srv_demo_signature_haircut' },
    update: {},
    create: {
      id: 'srv_demo_signature_haircut',
      categoryId: hairCat.id,
      name: 'Signature Cut & Botanical Blowdry',
      durationMinutes: 45,
      priceMinor: 6500,
      isAvailable: true,
    },
  });

  console.log('🎉 Demo data seeded successfully!');
  console.log('');
  console.log('Demo Credentials & Presentation Access:');
  console.log('---------------------------------------------------------');
  console.log('1. Super Admin: admin.demo@reployty.test / DemoPass123!');
  console.log('2. Demo Café:   owner.cafe@reployty.test / DemoPass123!');
  console.log('   Cashier:     cashier.cafe@reployty.test / DemoPass123!');
  console.log('   Customer QR: http://localhost:5173/#join/demo-cafe');
  console.log('   Sample Code: DEMO-FREE-BREW (Voucher ready for redemption)');
  console.log('3. Demo Salon:  owner.salon@reployty.test / DemoPass123!');
  console.log('   Customer QR: http://localhost:5173/#join/demo-salon');
  console.log('---------------------------------------------------------');
}

// Command-line execution support
if (process.argv[1]?.endsWith('demoSeed.ts') || process.argv[1]?.endsWith('demoSeed.js')) {
  const isClean = process.argv.includes('--clean');
  const action = isClean ? cleanDemo() : seedDemo();
  action
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('Error running demo script:', err);
      prisma.$disconnect();
      process.exit(1);
    });
}
