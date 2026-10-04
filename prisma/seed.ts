/**
 * Reployty Development Seed Script
 * Populates local PostgreSQL with realistic development & demo tenants.
 * NOTE: Application architecture does NOT depend on seed data to function.
 */

import { PrismaClient, BusinessCategory, CustomerEventType, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { code: 'CUSTOMERS_VIEW', name: 'View Customers', category: 'Customers' },
  { code: 'CUSTOMERS_EDIT', name: 'Create/Edit Customers', category: 'Customers' },
  { code: 'LOYALTY_VIEW', name: 'View Loyalty Programs', category: 'Loyalty' },
  { code: 'LOYALTY_MANAGE', name: 'Manage Loyalty Programs', category: 'Loyalty' },
  { code: 'REWARDS_VIEW', name: 'View Rewards', category: 'Rewards' },
  { code: 'REWARDS_MANAGE', name: 'Manage Rewards Catalog', category: 'Rewards' },
  { code: 'REWARDS_REDEEM', name: 'Redeem Customer Rewards', category: 'Rewards' },
  { code: 'OFFERS_VIEW', name: 'View Offers', category: 'Offers' },
  { code: 'OFFERS_MANAGE', name: 'Manage Offers', category: 'Offers' },
  { code: 'OFFERS_REDEEM', name: 'Redeem Customer Offers', category: 'Offers' },
  { code: 'REVIEWS_VIEW', name: 'View Reviews', category: 'Reviews' },
  { code: 'REVIEWS_MANAGE', name: 'Manage Reviews', category: 'Reviews' },
  { code: 'CAMPAIGNS_VIEW', name: 'View Campaigns', category: 'Campaigns' },
  { code: 'CAMPAIGNS_MANAGE', name: 'Manage Campaigns', category: 'Campaigns' },
  { code: 'SEGMENTS_VIEW', name: 'View Customer Segments', category: 'Customers' },
  { code: 'SEGMENTS_MANAGE', name: 'Manage Customer Segments', category: 'Customers' },
  { code: 'ANALYTICS_VIEW', name: 'View Analytics', category: 'Analytics' },
  { code: 'STAFF_VIEW', name: 'View Staff', category: 'Staff' },
  { code: 'STAFF_MANAGE', name: 'Manage Staff & Roles', category: 'Staff' },
  { code: 'BILLING_VIEW', name: 'View Billing', category: 'Billing' },
  { code: 'BILLING_MANAGE', name: 'Manage Billing', category: 'Billing' },
  { code: 'SETTINGS_VIEW', name: 'View Settings', category: 'Settings' },
  { code: 'SETTINGS_MANAGE', name: 'Manage Settings', category: 'Settings' },
  { code: 'CATALOG_VIEW', name: 'View Catalog & Menu', category: 'Catalog' },
  { code: 'CATALOG_MANAGE', name: 'Manage Catalog & Menu', category: 'Catalog' },
];

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowBootstrap = process.env.ALLOW_PRODUCTION_BOOTSTRAP === 'true';

  if (isProduction && !allowBootstrap) {
    console.error('⛔ FATAL: Cannot execute development seed scripts in PRODUCTION environment.');
    console.error('To initialize only essential system roles, permissions, and plans, set ALLOW_PRODUCTION_BOOTSTRAP=true.');
    process.exit(1);
  }

  console.log(`🌱 Starting Reployty ${isProduction ? 'production bootstrap' : 'development seed'}...`);

  // 1. Seed System Permissions
  console.log('Seeding system permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }

  // 2. Seed System Roles (Owner, Manager, Staff)
  console.log('Seeding system roles...');
  const ownerRole = await prisma.role.upsert({
    where: { id: 'role_owner_system' },
    update: {},
    create: {
      id: 'role_owner_system',
      name: 'OWNER',
      description: 'Full business ownership and management permissions',
      isSystem: true,
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { id: 'role_manager_system' },
    update: {},
    create: {
      id: 'role_manager_system',
      name: 'MANAGER',
      description: 'Operations, loyalty, and customer management permissions',
      isSystem: true,
    },
  });

  const staffRole = await prisma.role.upsert({
    where: { id: 'role_staff_system' },
    update: {},
    create: {
      id: 'role_staff_system',
      name: 'STAFF',
      description: 'Counter cashier, stamp awarding and reward redemption permissions',
      isSystem: true,
    },
  });

  // Attach all permissions to Owner role
  const allPerms = await prisma.permission.findMany();
  for (const p of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ownerRole.id,
          permissionId: p.id,
        },
      },
      update: {},
      create: {
        roleId: ownerRole.id,
        permissionId: p.id,
      },
    });
  }

  // Attach management permissions to Manager role
  const managerPerms = allPerms.filter(p => p.code !== 'BILLING_MANAGE');
  for (const p of managerPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: managerRole.id,
          permissionId: p.id,
        },
      },
      update: {},
      create: {
        roleId: managerRole.id,
        permissionId: p.id,
      },
    });
  }

  // Attach operational permissions to Staff role
  const staffPermCodes = ['CUSTOMERS_VIEW', 'CUSTOMERS_EDIT', 'LOYALTY_VIEW', 'LOYALTY_MANAGE', 'REWARDS_REDEEM', 'OFFERS_VIEW', 'OFFERS_REDEEM'];
  for (const code of staffPermCodes) {
    const p = allPerms.find(item => item.code === code);
    if (p) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: staffRole.id,
            permissionId: p.id,
          },
        },
        update: {},
        create: {
          roleId: staffRole.id,
          permissionId: p.id,
        },
      });
    }
  }

  // 3. Seed Subscription Plans
  console.log('Seeding subscription plans...');
  const freePlan = await prisma.plan.upsert({
    where: { slug: 'free' },
    update: {
      name: 'Free Starter',
      description: 'Essential digital loyalty card and customer CRM for single-location businesses.',
      priceMinor: 0,
      yearlyPriceMinor: 0,
      currency: 'INR',
      features: ['CUSTOMER_CRM', 'LOYALTY', 'CATALOG', 'BRANCHES', 'STAFF'],
      limits: { maxRewards: 2, maxOffers: 1, monthlyAiDrafts: 0, exportsAllowed: false },
      maxCustomers: 100,
      maxBranches: 1,
      maxStaff: 2,
      isActive: true,
    },
    create: {
      name: 'Free Starter',
      slug: 'free',
      description: 'Essential digital loyalty card and customer CRM for single-location businesses.',
      priceMinor: 0,
      yearlyPriceMinor: 0,
      currency: 'INR',
      features: ['CUSTOMER_CRM', 'LOYALTY', 'CATALOG', 'BRANCHES', 'STAFF'],
      limits: { maxRewards: 2, maxOffers: 1, monthlyAiDrafts: 0, exportsAllowed: false },
      maxCustomers: 100,
      maxBranches: 1,
      maxStaff: 2,
      isActive: true,
    },
  });

  const starterPlan = await prisma.plan.upsert({
    where: { slug: 'starter' },
    update: {
      name: 'Starter Regulars',
      description: 'Core loyalty engine with rewards, customer reviews, and staff terminal.',
      priceMinor: 149900, // 1,499.00 INR
      yearlyPriceMinor: 1499000, // 14,990.00 INR
      currency: 'INR',
      features: ['CUSTOMER_CRM', 'LOYALTY', 'REWARDS', 'OFFERS', 'REVIEWS', 'CATALOG', 'BRANCHES', 'STAFF', 'ANALYTICS', 'EXPORTS'],
      limits: { maxRewards: 50, maxOffers: 25, monthlyAiDrafts: 10, exportsAllowed: true },
      maxCustomers: 1000,
      maxBranches: 2,
      maxStaff: 5,
      isActive: true,
    },
    create: {
      name: 'Starter Regulars',
      slug: 'starter',
      description: 'Core loyalty engine with rewards, customer reviews, and staff terminal.',
      priceMinor: 149900,
      yearlyPriceMinor: 1499000,
      currency: 'INR',
      features: ['CUSTOMER_CRM', 'LOYALTY', 'REWARDS', 'OFFERS', 'REVIEWS', 'CATALOG', 'BRANCHES', 'STAFF', 'ANALYTICS', 'EXPORTS'],
      limits: { maxRewards: 50, maxOffers: 25, monthlyAiDrafts: 10, exportsAllowed: true },
      maxCustomers: 1000,
      maxBranches: 2,
      maxStaff: 5,
      isActive: true,
    },
  });

  const growthPlan = await prisma.plan.upsert({
    where: { slug: 'growth' },
    update: {
      name: 'Growth Retention',
      description: 'Complete retention stack including Analytics BI, AI Review Assistant, and multi-branch intelligence.',
      priceMinor: 299900, // 2,999.00 INR
      yearlyPriceMinor: 2999000, // 29,990.00 INR
      currency: 'INR',
      features: ['CUSTOMER_CRM', 'LOYALTY', 'REWARDS', 'OFFERS', 'REVIEWS', 'CATALOG', 'BRANCHES', 'STAFF', 'ANALYTICS', 'AI_REVIEW_ASSISTANT', 'EXPORTS'],
      limits: { maxRewards: 500, maxOffers: 250, monthlyAiDrafts: 100, exportsAllowed: true },
      maxCustomers: 5000,
      maxBranches: 5,
      maxStaff: 15,
      isActive: true,
    },
    create: {
      name: 'Growth Retention',
      slug: 'growth',
      description: 'Complete retention stack including Analytics BI, AI Review Assistant, and multi-branch intelligence.',
      priceMinor: 299900,
      yearlyPriceMinor: 2999000,
      currency: 'INR',
      features: ['CUSTOMER_CRM', 'LOYALTY', 'REWARDS', 'OFFERS', 'REVIEWS', 'CATALOG', 'BRANCHES', 'STAFF', 'ANALYTICS', 'AI_REVIEW_ASSISTANT', 'EXPORTS'],
      limits: { maxRewards: 500, maxOffers: 250, monthlyAiDrafts: 100, exportsAllowed: true },
      maxCustomers: 5000,
      maxBranches: 5,
      maxStaff: 15,
      isActive: true,
    },
  });

  const enterprisePlan = await prisma.plan.upsert({
    where: { slug: 'enterprise' },
    update: {
      name: 'Enterprise Scale',
      description: 'High-volume multi-location franchises with dedicated limits and advanced tools.',
      priceMinor: 999900, // 9,999.00 INR
      yearlyPriceMinor: 9999000, // 99,990.00 INR
      currency: 'INR',
      features: ['CUSTOMER_CRM', 'LOYALTY', 'REWARDS', 'OFFERS', 'REVIEWS', 'CATALOG', 'BRANCHES', 'STAFF', 'ANALYTICS', 'AI_REVIEW_ASSISTANT', 'EXPORTS', 'ADVANCED_ANALYTICS'],
      limits: { maxRewards: 500, maxOffers: 250, monthlyAiDrafts: 1000, exportsAllowed: true },
      maxCustomers: 50000,
      maxBranches: 50,
      maxStaff: 100,
      isActive: true,
    },
    create: {
      name: 'Enterprise Scale',
      slug: 'enterprise',
      description: 'High-volume multi-location franchises with dedicated limits and advanced tools.',
      priceMinor: 999900,
      yearlyPriceMinor: 9999000,
      currency: 'INR',
      features: ['CUSTOMER_CRM', 'LOYALTY', 'REWARDS', 'OFFERS', 'REVIEWS', 'CATALOG', 'BRANCHES', 'STAFF', 'ANALYTICS', 'AI_REVIEW_ASSISTANT', 'EXPORTS', 'ADVANCED_ANALYTICS'],
      limits: { maxRewards: 500, maxOffers: 250, monthlyAiDrafts: 1000, exportsAllowed: true },
      maxCustomers: 50000,
      maxBranches: 50,
      maxStaff: 100,
      isActive: true,
    },
  });

  if (isProduction) {
    console.log('🛡️ Production bootstrap complete: System permissions, system roles, and subscription plans initialized.');
    console.log('Skipping all demo businesses, test users, and sample customer generation in production.');
    return;
  }

  // 4. Seed Platform Admin & Demo Users
  console.log('Seeding users with hashed passwords...');
  const adminPasswordHash = bcrypt.hashSync('AdminPass123!', 10);
  const ownerPasswordHash = bcrypt.hashSync('OwnerPass123!', 10);
  const staffPasswordHash = bcrypt.hashSync('StaffPass123!', 10);
  const testPasswordHash = bcrypt.hashSync('TestPass123!', 10);

  await prisma.user.upsert({
    where: { email: 'admin@reployty.com' },
    update: {
      passwordHash: adminPasswordHash,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: 'admin@reployty.com',
      name: 'Platform Administrator',
      passwordHash: adminPasswordHash,
      status: UserStatus.ACTIVE,
      isSuperAdmin: true,
    },
  });

  const marcusOwner = await prisma.user.upsert({
    where: { email: 'marcus@reployty.com' },
    update: {
      passwordHash: ownerPasswordHash,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: 'marcus@reployty.com',
      name: 'Marcus Vance',
      phone: '+1 (555) 234-5678',
      passwordHash: ownerPasswordHash,
      status: UserStatus.ACTIVE,
      isSuperAdmin: false,
    },
  });

  const sarahStaff = await prisma.user.upsert({
    where: { email: 'sarah.cashier@reployty.com' },
    update: {
      passwordHash: staffPasswordHash,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: 'sarah.cashier@reployty.com',
      name: 'Sarah Jenkins',
      phone: '+1 (555) 345-9999',
      passwordHash: staffPasswordHash,
      status: UserStatus.ACTIVE,
      isSuperAdmin: false,
    },
  });

  // Seed Suspended User for testing
  await prisma.user.upsert({
    where: { email: 'suspended@reployty.com' },
    update: {
      passwordHash: testPasswordHash,
      status: UserStatus.SUSPENDED,
    },
    create: {
      email: 'suspended@reployty.com',
      name: 'Suspended Account User',
      passwordHash: testPasswordHash,
      status: UserStatus.SUSPENDED,
      isSuperAdmin: false,
    },
  });

  // Seed Disabled User for testing
  await prisma.user.upsert({
    where: { email: 'disabled@reployty.com' },
    update: {
      passwordHash: testPasswordHash,
      status: UserStatus.DISABLED,
    },
    create: {
      email: 'disabled@reployty.com',
      name: 'Disabled Account User',
      passwordHash: testPasswordHash,
      status: UserStatus.DISABLED,
      isSuperAdmin: false,
    },
  });

  // 5. Seed Primary Demo Business: The Roasted Bean Café
  console.log('Seeding The Roasted Bean Café...');
  const cafeBusiness = await prisma.business.upsert({
    where: { slug: 'roasted-bean-cafe' },
    update: {
      description: 'Craft coffee, freshly baked artisanal pastries & cozy vibes.',
      city: 'Downtown',
      state: 'California',
      country: 'US',
      postalCode: '94105',
      themePreset: 'CAFE',
      onboardingCompleted: true,
      onboardingStep: 6,
    },
    create: {
      name: 'The Roasted Bean Café',
      slug: 'roasted-bean-cafe',
      category: BusinessCategory.CAFE,
      description: 'Craft coffee, freshly baked artisanal pastries & cozy vibes.',
      primaryColor: '#B45309',
      secondaryColor: '#78350F',
      themePreset: 'CAFE',
      phone: '+1 (555) 234-5678',
      email: 'contact@roastedbeancafe.com',
      address: '142 Market Street, Downtown',
      city: 'Downtown',
      state: 'California',
      country: 'US',
      postalCode: '94105',
      website: 'https://roastedbeancafe.com',
      googleReviewUrl: 'https://g.page/r/roasted-bean-cafe/review',
      planId: starterPlan.id,
      onboardingCompleted: true,
      onboardingStep: 6,
    },
  });

  // Seed Main Branch
  const cafeMainBranch = await prisma.branch.upsert({
    where: { id: 'branch_cafe_main' },
    update: {},
    create: {
      id: 'branch_cafe_main',
      businessId: cafeBusiness.id,
      name: 'Downtown Flagship',
      code: 'DT-01',
      address: '142 Market Street, Downtown',
      phone: '+1 (555) 234-5678',
      isMainBranch: true,
    },
  });

  // Attach Staff Memberships
  await prisma.staffMembership.upsert({
    where: {
      userId_businessId: {
        userId: marcusOwner.id,
        businessId: cafeBusiness.id,
      },
    },
    update: {},
    create: {
      userId: marcusOwner.id,
      businessId: cafeBusiness.id,
      roleId: ownerRole.id,
      status: 'ACTIVE',
    },
  });

  await prisma.staffMembership.upsert({
    where: {
      userId_businessId: {
        userId: sarahStaff.id,
        businessId: cafeBusiness.id,
      },
    },
    update: {},
    create: {
      userId: sarahStaff.id,
      businessId: cafeBusiness.id,
      branchId: cafeMainBranch.id,
      roleId: staffRole.id,
      status: 'ACTIVE',
    },
  });

  // 6. Seed Counter Standee QR
  await prisma.qRCode.upsert({
    where: { code: 'ROASTED-DT01' },
    update: {},
    create: {
      businessId: cafeBusiness.id,
      branchId: cafeMainBranch.id,
      code: 'ROASTED-DT01',
      type: 'BRANCH_COUNTER',
      destinationUrl: `https://reployty.com/join/${cafeBusiness.slug}?branch=${cafeMainBranch.code}`,
      scanCount: 142,
    },
  });

  // 7. Seed Loyalty Program
  const loyaltyProgram = await prisma.loyaltyProgram.upsert({
    where: { id: 'prog_cafe_stamps' },
    update: {},
    create: {
      id: 'prog_cafe_stamps',
      businessId: cafeBusiness.id,
      name: 'Coffee Club 10-Stamp Pass',
      type: 'STAMP',
      targetStamps: 10,
      rewardTitle: 'Free Specialty Coffee or Pastry',
      status: 'ACTIVE',
      rulesConfig: {
        stampsPerVisit: 1,
        minSpendMinor: 0,
      },
    },
  });

  // 8. Seed Rewards
  const freeCoffeeReward = await prisma.reward.upsert({
    where: { id: 'rew_cafe_free_coffee' },
    update: {},
    create: {
      id: 'rew_cafe_free_coffee',
      businessId: cafeBusiness.id,
      title: 'Free Specialty Drink or Dessert',
      description: 'Any hot or iced espresso drink, matcha latte, or freshly baked morning pastry.',
      stampsRequired: 10,
      status: 'ACTIVE',
      expiryDays: 30,
    },
  });

  // 9. Seed Customers for The Roasted Bean Café
  console.log('Seeding sample customers...');
  const sampleCustomersData = [
    {
      name: 'Elena Rostova',
      phone: '+1 (555) 321-4567',
      email: 'elena.rostova@example.com',
      stampsCollected: 8,
      status: 'VIP' as const,
      totalVisits: 14,
      totalSpendMinor: 8450,
    },
    {
      name: 'David Chen',
      phone: '+1 (555) 432-5678',
      email: 'david.chen@example.com',
      stampsCollected: 10,
      status: 'ACTIVE' as const,
      totalVisits: 22,
      totalSpendMinor: 14200,
    },
    {
      name: 'Liam Gallagher',
      phone: '+1 (555) 654-7890',
      email: 'liam.g@example.com',
      stampsCollected: 9,
      status: 'AT_RISK' as const,
      totalVisits: 11,
      totalSpendMinor: 6800,
    },
  ];

  for (const cd of sampleCustomersData) {
    const customer = await prisma.customer.upsert({
      where: {
        businessId_phone: {
          businessId: cafeBusiness.id,
          phone: cd.phone,
        },
      },
      update: {},
      create: {
        businessId: cafeBusiness.id,
        branchId: cafeMainBranch.id,
        name: cd.name,
        phone: cd.phone,
        email: cd.email,
        status: cd.status,
        totalVisits: cd.totalVisits,
        totalSpendMinor: cd.totalSpendMinor,
        stampsBalance: cd.stampsCollected,
        lastVisitAt: new Date(Date.now() - 3600000 * 4),
      },
    });

    // Create Active Card
    const card = await prisma.loyaltyCard.upsert({
      where: { id: `card_${customer.id}` },
      update: {},
      create: {
        id: `card_${customer.id}`,
        businessId: cafeBusiness.id,
        customerId: customer.id,
        programId: loyaltyProgram.id,
        stampsCollected: cd.stampsCollected,
        totalStampsNeeded: 10,
        status: cd.stampsCollected >= 10 ? 'COMPLETED' : 'ACTIVE',
      },
    });

    // If David Chen has 10 stamps, issue ready redemption
    if (cd.stampsCollected >= 10) {
      await prisma.rewardRedemption.upsert({
        where: { redemptionCode: 'RPL-CHEN-FREE' },
        update: {},
        create: {
          businessId: cafeBusiness.id,
          branchId: cafeMainBranch.id,
          rewardId: freeCoffeeReward.id,
          customerId: customer.id,
          redemptionCode: 'RPL-CHEN-FREE',
          status: 'AVAILABLE',
          expiresAt: new Date(Date.now() + 30 * 86400000),
        },
      });
    }

    // Record joined event
    await prisma.customerEvent.create({
      data: {
        businessId: cafeBusiness.id,
        customerId: customer.id,
        type: CustomerEventType.CUSTOMER_JOINED,
        metadata: { source: 'SEED_INITIAL' },
      },
    });
  }

  // 10. Seed Menu Catalog for The Roasted Bean
  console.log('Seeding menu catalog...');
  const cafeMenu = await prisma.menu.upsert({
    where: { id: 'menu_cafe_standard' },
    update: {},
    create: {
      id: 'menu_cafe_standard',
      businessId: cafeBusiness.id,
      name: 'Café Beverage & Bakery Menu',
    },
  });

  const espressoCategory = await prisma.menuCategory.upsert({
    where: { id: 'cat_cafe_espresso' },
    update: {},
    create: {
      id: 'cat_cafe_espresso',
      menuId: cafeMenu.id,
      name: 'Espresso & Handcrafted Drinks',
      sortOrder: 1,
    },
  });

  await prisma.menuItem.upsert({
    where: { id: 'item_flat_white' },
    update: {},
    create: {
      id: 'item_flat_white',
      categoryId: espressoCategory.id,
      name: 'Artisan Flat White',
      description: 'Double ristretto with silky micro-foamed milk',
      priceMinor: 38000, // 380.00 INR
    },
  });

  await prisma.menuItem.upsert({
    where: { id: 'item_cold_brew' },
    update: {},
    create: {
      id: 'item_cold_brew',
      categoryId: espressoCategory.id,
      name: 'Single-Origin Nitro Cold Brew',
      description: '18-hour cold steeped Ethiopian Yirgacheffe on nitro tap',
      priceMinor: 42000, // 420.00 INR
    },
  });

  // 11. Seed Additional Businesses for Multi-Tenant Testing
  console.log('Seeding second business: Luxe & Glow Beauty Bar...');
  const salonBusiness = await prisma.business.upsert({
    where: { slug: 'luxe-glow-beauty' },
    update: {
      description: 'Premium hair, nail & organic spa care in Pearl District.',
      city: 'Pearl District',
      state: 'California',
      country: 'US',
      postalCode: '94107',
      themePreset: 'SALON',
      onboardingCompleted: true,
      onboardingStep: 6,
    },
    create: {
      name: 'Luxe & Glow Beauty Bar',
      slug: 'luxe-glow-beauty',
      category: BusinessCategory.SALON,
      description: 'Premium hair, nail & organic spa care in Pearl District.',
      primaryColor: '#DB2777',
      secondaryColor: '#9D174D',
      themePreset: 'SALON',
      phone: '+1 (555) 345-6789',
      address: '58 Pearl Boulevard, Suite B',
      city: 'Pearl District',
      state: 'California',
      country: 'US',
      postalCode: '94107',
      planId: starterPlan.id,
      onboardingCompleted: true,
      onboardingStep: 6,
    },
  });

  await prisma.branch.upsert({
    where: { id: 'branch_salon_main' },
    update: {},
    create: {
      id: 'branch_salon_main',
      businessId: salonBusiness.id,
      name: 'Westside Studio',
      address: '58 Pearl Boulevard, Suite B',
      city: 'Pearl District',
      isMainBranch: true,
    },
  });

  // Seed Salon Services
  const hairCategory = await prisma.serviceCategory.upsert({
    where: { id: 'cat_salon_hair' },
    update: {},
    create: {
      id: 'cat_salon_hair',
      businessId: salonBusiness.id,
      name: 'Hair Styling & Treatments',
      sortOrder: 1,
    },
  });

  await prisma.service.upsert({
    where: { id: 'srv_signature_haircut' },
    update: {},
    create: {
      id: 'srv_signature_haircut',
      categoryId: hairCategory.id,
      name: 'Signature Cut & Botanical Blowdry',
      durationMinutes: 45,
      priceMinor: 6500, // $65.00
      isAvailable: true,
    },
  });

  await prisma.service.upsert({
    where: { id: 'srv_organic_color' },
    update: {},
    create: {
      id: 'srv_organic_color',
      categoryId: hairCategory.id,
      name: 'Organic Gloss & Color Treatment',
      durationMinutes: 90,
      priceMinor: 12000, // $120.00
      isAvailable: true,
    },
  });

  // Seed Café Retail Products
  const merchCategory = await prisma.productCategory.upsert({
    where: { id: 'cat_cafe_merch' },
    update: {},
    create: {
      id: 'cat_cafe_merch',
      businessId: cafeBusiness.id,
      name: 'Artisan Beans & Merchandise',
      sortOrder: 1,
    },
  });

  await prisma.product.upsert({
    where: { id: 'prod_whole_bean' },
    update: {},
    create: {
      id: 'prod_whole_bean',
      categoryId: merchCategory.id,
      name: 'Ethiopian Yirgacheffe Whole Bean (250g)',
      sku: 'BEAN-YIRG-250',
      priceMinor: 85000, // 850.00 INR
      stockQuantity: 45,
      isAvailable: true,
    },
  });

  await prisma.product.upsert({
    where: { id: 'prod_ceramic_mug' },
    update: {},
    create: {
      id: 'prod_ceramic_mug',
      categoryId: merchCategory.id,
      name: 'Matte Ceramic Reployty Mug',
      sku: 'MUG-MATTE-01',
      priceMinor: 55000, // 550.00 INR
      stockQuantity: 28,
      isAvailable: true,
    },
  });

  // Attach Marcus to Salon as MANAGER (tests multi-business access)
  await prisma.staffMembership.upsert({
    where: {
      userId_businessId: {
        userId: marcusOwner.id,
        businessId: salonBusiness.id,
      },
    },
    update: {},
    create: {
      userId: marcusOwner.id,
      businessId: salonBusiness.id,
      roleId: managerRole.id,
      status: 'ACTIVE',
    },
  });

  // 12. Seed Third Business: Iron Pulse Fitness (Where Marcus has NO membership)
  console.log('Seeding third business: Iron Pulse Fitness...');
  const gymBusiness = await prisma.business.upsert({
    where: { slug: 'iron-pulse-fitness' },
    update: {
      description: 'High-intensity functional training, weights and cardio sanctuary.',
      city: 'Westside',
      state: 'California',
      country: 'US',
      postalCode: '94109',
      themePreset: 'GYM',
      onboardingCompleted: true,
      onboardingStep: 6,
    },
    create: {
      name: 'Iron Pulse Fitness',
      slug: 'iron-pulse-fitness',
      category: BusinessCategory.GYM,
      description: 'High-intensity functional training, weights and cardio sanctuary.',
      primaryColor: '#059669',
      secondaryColor: '#065F46',
      themePreset: 'GYM',
      phone: '+1 (555) 456-7890',
      address: '900 Metro Parkway, Westside',
      city: 'Westside',
      state: 'California',
      country: 'US',
      postalCode: '94109',
      planId: starterPlan.id,
      onboardingCompleted: true,
      onboardingStep: 6,
    },
  });

  await prisma.branch.upsert({
    where: { id: 'branch_gym_main' },
    update: {},
    create: {
      id: 'branch_gym_main',
      businessId: gymBusiness.id,
      name: 'Main Gymnasium',
      address: '900 Metro Parkway, Westside',
      city: 'Westside',
      isMainBranch: true,
    },
  });

  // 13. Seed Fourth Business: New Wave Bakery (Incomplete onboarding for onboarding flow testing)
  console.log('Seeding fourth business: New Wave Bakery (Incomplete onboarding)...');
  const bakeryOwnerPassword = bcrypt.hashSync('BakerPass123!', 10);
  const chloeBaker = await prisma.user.upsert({
    where: { email: 'chloe.baker@reployty.com' },
    update: {
      passwordHash: bakeryOwnerPassword,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: 'chloe.baker@reployty.com',
      name: 'Chloe Baker',
      phone: '+1 (555) 789-0123',
      passwordHash: bakeryOwnerPassword,
      status: UserStatus.ACTIVE,
      isSuperAdmin: false,
    },
  });

  const bakeryBusiness = await prisma.business.upsert({
    where: { slug: 'new-wave-bakery' },
    update: {
      onboardingCompleted: false,
      onboardingStep: 1,
    },
    create: {
      name: 'New Wave Bakery',
      slug: 'new-wave-bakery',
      category: BusinessCategory.CAFE,
      description: 'Fresh sourdough, croissants & specialty cold brew.',
      primaryColor: '#B45309',
      secondaryColor: '#78350F',
      themePreset: 'CAFE',
      phone: '+1 (555) 789-0123',
      address: '320 Mission St',
      city: 'San Francisco',
      state: 'California',
      country: 'US',
      postalCode: '94105',
      planId: starterPlan.id,
      onboardingCompleted: false,
      onboardingStep: 1,
    },
  });

  // Attach Chloe as OWNER of New Wave Bakery to test onboarding experience
  await prisma.staffMembership.upsert({
    where: {
      userId_businessId: {
        userId: chloeBaker.id,
        businessId: bakeryBusiness.id,
      },
    },
    update: {},
    create: {
      userId: chloeBaker.id,
      businessId: bakeryBusiness.id,
      roleId: ownerRole.id,
      status: 'ACTIVE',
    },
  });

  // 12. Seed Public QR Codes for Customer PWA Experience
  console.log('Seeding public QR codes for Customer Experience...');
  await prisma.qRCode.upsert({
    where: { code: 'bean-stand-01' },
    update: {},
    create: {
      code: 'bean-stand-01',
      businessId: cafeBusiness.id,
      branchId: cafeMainBranch.id,
      type: 'BUSINESS_STAND',
      destinationUrl: '/join/bean-stand-01',
      status: 'ACTIVE',
    },
  });

  await prisma.qRCode.upsert({
    where: { code: 'luxe-stand-01' },
    update: {},
    create: {
      code: 'luxe-stand-01',
      businessId: salonBusiness.id,
      type: 'BUSINESS_STAND',
      destinationUrl: '/join/luxe-stand-01',
      status: 'ACTIVE',
    },
  });

  await prisma.qRCode.upsert({
    where: { code: 'iron-stand-01' },
    update: {},
    create: {
      code: 'iron-stand-01',
      businessId: gymBusiness.id,
      type: 'BUSINESS_STAND',
      destinationUrl: '/join/iron-stand-01',
      status: 'ACTIVE',
    },
  });

  await prisma.qRCode.upsert({
    where: { code: 'bakery-stand-01' },
    update: {},
    create: {
      code: 'bakery-stand-01',
      businessId: bakeryBusiness.id,
      type: 'BUSINESS_STAND',
      destinationUrl: '/join/bakery-stand-01',
      status: 'ACTIVE',
    },
  });

  // 17. Seed Phase 12 Sample Offers for The Roasted Bean Café
  console.log('Seeding Phase 12 sample promotional offers...');
  await prisma.offer.upsert({
    where: { id: 'offer_cafe_welcome_20' },
    update: {},
    create: {
      id: 'offer_cafe_welcome_20',
      businessId: cafeBusiness.id,
      title: 'Welcome 20% OFF',
      description: 'Enjoy 20% off your entire order on your first visit!',
      type: 'PERCENTAGE_DISCOUNT',
      discountValue: 20,
      minPurchaseMinor: 15000,
      maxDiscountMinor: 10000,
      startDate: new Date(Date.now() - 7 * 86400000),
      endDate: new Date(Date.now() + 30 * 86400000),
      usageLimitPerCustomer: 1,
      status: 'ACTIVE',
      eligibilityConfig: {
        targetAudience: 'NEW_CUSTOMERS',
        terms: 'Valid on first visit only. Cannot be combined with other offers.',
      },
    },
  });

  await prisma.offer.upsert({
    where: { id: 'offer_cafe_flat_50' },
    update: {},
    create: {
      id: 'offer_cafe_flat_50',
      businessId: cafeBusiness.id,
      title: 'Flat ₹50 OFF',
      description: 'Flat ₹50 discount on any purchase of ₹200 or more.',
      type: 'FIXED_DISCOUNT',
      discountValue: 5000,
      minPurchaseMinor: 20000,
      startDate: new Date(Date.now() - 3 * 86400000),
      endDate: new Date(Date.now() + 14 * 86400000),
      usageLimitPerCustomer: 3,
      status: 'ACTIVE',
      eligibilityConfig: {
        targetAudience: 'ALL',
        terms: 'Applicable on all beverage and pastry orders.',
      },
    },
  });

  // 17. Seed Business Subscriptions, Invoices & Payments
  console.log('Seeding business subscriptions, invoices & payments...');

  // Roasted Bean Café -> Growth Plan (Monthly)
  await prisma.business.update({
    where: { id: cafeBusiness.id },
    data: { planId: growthPlan.id },
  });

  const cafeSub = await prisma.subscription.upsert({
    where: { businessId: cafeBusiness.id },
    update: {
      planId: growthPlan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date(Date.now() - 15 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 15 * 86400000),
      cancelAtPeriodEnd: false,
    },
    create: {
      businessId: cafeBusiness.id,
      planId: growthPlan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date(Date.now() - 15 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 15 * 86400000),
      cancelAtPeriodEnd: false,
    },
  });

  await prisma.payment.upsert({
    where: { id: 'pay_cafe_initial' },
    update: {},
    create: {
      id: 'pay_cafe_initial',
      businessId: cafeBusiness.id,
      subscriptionId: cafeSub.id,
      amountMinor: 299900,
      currency: 'INR',
      status: 'SUCCESS',
      provider: 'DIRECT',
      providerPaymentId: 'pay_demo_cafe_001',
      paymentMethod: 'UPI / NetBanking',
      createdAt: new Date(Date.now() - 15 * 86400000),
    },
  });

  await prisma.invoice.upsert({
    where: { invoiceNumber: 'INV-2026-0001' },
    update: {},
    create: {
      businessId: cafeBusiness.id,
      subscriptionId: cafeSub.id,
      invoiceNumber: 'INV-2026-0001',
      amountMinor: 299900,
      currency: 'INR',
      status: 'PAID',
      billingPeriod: 'Monthly (Growth Retention)',
      issuedAt: new Date(Date.now() - 15 * 86400000),
      paidAt: new Date(Date.now() - 15 * 86400000),
    },
  });

  // New Wave Bakery -> Starter Plan (Monthly)
  await prisma.business.update({
    where: { id: bakeryBusiness.id },
    data: { planId: starterPlan.id },
  });

  const bakerySub = await prisma.subscription.upsert({
    where: { businessId: bakeryBusiness.id },
    update: {
      planId: starterPlan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date(Date.now() - 5 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 25 * 86400000),
      cancelAtPeriodEnd: false,
    },
    create: {
      businessId: bakeryBusiness.id,
      planId: starterPlan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date(Date.now() - 5 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 25 * 86400000),
      cancelAtPeriodEnd: false,
    },
  });

  await prisma.payment.upsert({
    where: { id: 'pay_bakery_initial' },
    update: {},
    create: {
      id: 'pay_bakery_initial',
      businessId: bakeryBusiness.id,
      subscriptionId: bakerySub.id,
      amountMinor: 149900,
      currency: 'INR',
      status: 'SUCCESS',
      provider: 'DIRECT',
      providerPaymentId: 'pay_demo_bakery_001',
      paymentMethod: 'Credit Card',
      createdAt: new Date(Date.now() - 5 * 86400000),
    },
  });

  await prisma.invoice.upsert({
    where: { invoiceNumber: 'INV-2026-0002' },
    update: {},
    create: {
      businessId: bakeryBusiness.id,
      subscriptionId: bakerySub.id,
      invoiceNumber: 'INV-2026-0002',
      amountMinor: 149900,
      currency: 'INR',
      status: 'PAID',
      billingPeriod: 'Monthly (Starter Regulars)',
      issuedAt: new Date(Date.now() - 5 * 86400000),
      paidAt: new Date(Date.now() - 5 * 86400000),
    },
  });

  // Luxe & Glow Beauty Bar -> Starter Plan (Yearly)
  await prisma.subscription.upsert({
    where: { businessId: salonBusiness.id },
    update: {
      planId: starterPlan.id,
      status: 'ACTIVE',
      billingInterval: 'YEARLY',
      currentPeriodStart: new Date(Date.now() - 30 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 335 * 86400000),
    },
    create: {
      businessId: salonBusiness.id,
      planId: starterPlan.id,
      status: 'ACTIVE',
      billingInterval: 'YEARLY',
      currentPeriodStart: new Date(Date.now() - 30 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 335 * 86400000),
    },
  });

  // Iron Pulse Fitness -> Growth Plan (Monthly)
  await prisma.subscription.upsert({
    where: { businessId: gymBusiness.id },
    update: {
      planId: growthPlan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date(Date.now() - 10 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
    },
    create: {
      businessId: gymBusiness.id,
      planId: growthPlan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date(Date.now() - 10 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
    },
  });

  console.log('✅ Seed completed successfully!');
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
