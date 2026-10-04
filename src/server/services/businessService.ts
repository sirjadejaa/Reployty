import { prisma } from '../db/client';
import { TenantContext, requirePermission, TenantAuthorizationError } from '../auth/tenantContext';
import { createAuditLog } from './auditService';
import { requireFeature, requireUsageLimit } from './entitlementService';
import { BusinessCategory, BranchStatus, MembershipStatus, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

export interface UpdateBusinessProfileInput {
  name?: string;
  category?: BusinessCategory;
  description?: string;
  logo?: string | null;
  phone?: string;
  email?: string;
  website?: string;
  googleReviewUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  timezone?: string;
  currency?: string;
}

export function isValidSafeUrl(str: string): boolean {
  if (!str) return true;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateLogo(logo?: string | null): string | null | undefined {
  if (logo === undefined) return undefined;
  if (logo === null || logo.trim() === '') return null;
  const trimmed = logo.trim();
  const isHttpUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://');
  const isDataUri = trimmed.startsWith('data:image/');
  if (!isHttpUrl && !isDataUri) {
    throw new Error('Invalid logo format. Must be an http/https URL or an image data URI (data:image/...).');
  }
  if (isDataUri && trimmed.length > 700000) {
    throw new Error('Logo image data exceeds 500KB size limit. Please provide a smaller image.');
  }
  return trimmed;
}

export interface CreateBranchInput {
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  timezone?: string;
  isMainBranch?: boolean;
}

export interface UpdateBranchInput {
  name?: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  timezone?: string;
  status?: BranchStatus;
  isMainBranch?: boolean;
}

export interface InviteStaffInput {
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  branchId?: string | null;
}

export interface UpdateStaffInput {
  roleId?: string;
  branchId?: string | null;
  status?: MembershipStatus;
}

export interface UpdateBrandingInput {
  themePreset?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logo?: string;
  coverImage?: string;
}

/**
 * Retrieves full business profile for the active tenant.
 */
export async function getBusinessProfile(ctx: TenantContext) {
  requirePermission(ctx, 'SETTINGS_VIEW');

  const business = await prisma.business.findUnique({
    where: { id: ctx.businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      description: true,
      logo: true,
      coverImage: true,
      primaryColor: true,
      secondaryColor: true,
      themePreset: true,
      timezone: true,
      currency: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      website: true,
      googleReviewUrl: true,
      instagramUrl: true,
      facebookUrl: true,
      whatsappNumber: true,
      status: true,
      onboardingCompleted: true,
      onboardingStep: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          branches: true,
          staff: { where: { status: 'ACTIVE' } },
          customers: true,
        },
      },
    },
  });

  if (!business) {
    throw new TenantAuthorizationError('Business tenant not found');
  }

  return business;
}

/**
 * Updates business profile fields with audit trail.
 */
export async function updateBusinessProfile(
  ctx: TenantContext,
  data: UpdateBusinessProfileInput
) {
  requirePermission(ctx, 'SETTINGS_MANAGE');

  const previous = await prisma.business.findUnique({
    where: { id: ctx.businessId },
  });

  if (!previous) {
    throw new TenantAuthorizationError('Business tenant not found');
  }

  if (data.website !== undefined && data.website.trim()) {
    if (!isValidSafeUrl(data.website.trim())) {
      throw new Error('Invalid website URL. Must start with http:// or https://');
    }
  }
  if (data.googleReviewUrl !== undefined && data.googleReviewUrl.trim()) {
    if (!isValidSafeUrl(data.googleReviewUrl.trim())) {
      throw new Error('Invalid Google review URL. Must start with http:// or https://');
    }
  }

  const updated = await prisma.business.update({
    where: { id: ctx.businessId },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.category ? { category: data.category } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() } : {}),
      ...(data.email !== undefined ? { email: data.email?.trim() } : {}),
      ...(data.website !== undefined ? { website: data.website?.trim() || null } : {}),
      ...(data.googleReviewUrl !== undefined ? { googleReviewUrl: data.googleReviewUrl?.trim() || null } : {}),
      ...(data.address !== undefined ? { address: data.address?.trim() } : {}),
      ...(data.city !== undefined ? { city: data.city?.trim() } : {}),
      ...(data.state !== undefined ? { state: data.state?.trim() } : {}),
      ...(data.country !== undefined ? { country: data.country?.trim() } : {}),
      ...(data.postalCode !== undefined ? { postalCode: data.postalCode?.trim() } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone?.trim() } : {}),
      ...(data.currency !== undefined ? { currency: data.currency?.trim() } : {}),
      ...(data.logo !== undefined ? { logo: validateLogo(data.logo) } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      description: true,
      logo: true,
      phone: true,
      email: true,
      website: true,
      googleReviewUrl: true,
      address: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      timezone: true,
      currency: true,
      updatedAt: true,
    },
  });

  await createAuditLog(ctx, {
    action: 'BUSINESS_UPDATED',
    entityType: 'Business',
    entityId: ctx.businessId,
    previousState: {
      name: previous.name,
      category: previous.category,
      phone: previous.phone,
      email: previous.email,
      address: previous.address,
      city: previous.city,
    },
    newState: data as any,
  });

  return updated;
}

/**
 * Returns real aggregated metrics and setup state for the active business dashboard.
 */
export async function getBusinessDashboard(ctx: TenantContext) {
  const business = await prisma.business.findUnique({
    where: { id: ctx.businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      logo: true,
      themePreset: true,
      onboardingCompleted: true,
      onboardingStep: true,
      phone: true,
      address: true,
    },
  });

  if (!business) {
    throw new TenantAuthorizationError('Business tenant not found');
  }

  const [customerCount, branchCount, staffCount, programCount, recentActivity, activeProgram, entryQrCode] = await Promise.all([
    prisma.customer.count({
      where: { businessId: ctx.businessId },
    }),
    prisma.branch.count({
      where: { businessId: ctx.businessId, status: 'ACTIVE' },
    }),
    prisma.staffMembership.count({
      where: { businessId: ctx.businessId, status: 'ACTIVE' },
    }),
    prisma.loyaltyProgram.count({
      where: { businessId: ctx.businessId, status: 'ACTIVE' },
    }),
    prisma.auditLog.findMany({
      where: { businessId: ctx.businessId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.loyaltyProgram.findFirst({
      where: { businessId: ctx.businessId, status: 'ACTIVE' },
      include: {
        _count: {
          select: { cards: true },
        },
      },
    }),
    prisma.qRCode.findFirst({
      where: { businessId: ctx.businessId, status: 'ACTIVE', type: 'BUSINESS_STAND' },
      select: {
        code: true,
        destinationUrl: true,
        scanCount: true,
      },
    }),
  ]);

  // Compute completed onboarding checklist items
  const checklist = {
    businessInfo: Boolean(business.name && (business.phone || business.address)),
    category: Boolean(business.category),
    branchSetup: branchCount > 0,
    branding: Boolean(business.themePreset),
    staffSetup: staffCount > 1, // More than just the initial creator
    loyaltySetup: programCount > 0,
  };

  const completedStepsCount = Object.values(checklist).filter(Boolean).length;

  return {
    business,
    metrics: {
      totalCustomers: customerCount,
      activeBranches: branchCount,
      staffMembers: staffCount,
      loyaltyPrograms: programCount,
    },
    onboarding: {
      isCompleted: business.onboardingCompleted,
      currentStep: business.onboardingStep,
      completedStepsCount,
      totalSteps: 6,
      checklist,
    },
    loyaltyProgram: activeProgram
      ? {
          id: activeProgram.id,
          name: activeProgram.name,
          type: activeProgram.type,
          targetStamps: activeProgram.targetStamps,
          pointsPerCurrencyMinor: activeProgram.pointsPerCurrencyMinor,
          rewardTitle: activeProgram.rewardTitle,
          status: activeProgram.status,
          activeCardsCount: activeProgram._count.cards,

          qrCode: entryQrCode
            ? {
                code: entryQrCode.code,
                destinationUrl: entryQrCode.destinationUrl,
                scanCount: entryQrCode.scanCount,
              }
            : null,
        }
      : null,
    recentActivity,
  };
}


/**
 * Retrieves the onboarding state for the active business.
 */
export async function getOnboardingState(ctx: TenantContext) {
  requirePermission(ctx, 'SETTINGS_VIEW');

  const business = await prisma.business.findUnique({
    where: { id: ctx.businessId },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      phone: true,
      email: true,
      website: true,
      address: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      themePreset: true,
      primaryColor: true,
      secondaryColor: true,
      onboardingCompleted: true,
      onboardingStep: true,
      branches: {
        where: { status: 'ACTIVE' },
        take: 1,
        select: { id: true, name: true, phone: true, address: true, city: true, timezone: true },
      },
      staff: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          role: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!business) {
    throw new TenantAuthorizationError('Business tenant not found');
  }

  return business;
}

/**
 * Updates onboarding step progression or marks onboarding complete.
 */
export async function updateOnboardingState(
  ctx: TenantContext,
  step: number,
  completed?: boolean
) {
  requirePermission(ctx, 'SETTINGS_MANAGE');

  const validStep = Math.max(1, Math.min(6, step));
  const isComplete = completed !== undefined ? completed : validStep >= 6;

  const previous = await prisma.business.findUnique({
    where: { id: ctx.businessId },
    select: { onboardingStep: true, onboardingCompleted: true },
  });

  const updated = await prisma.business.update({
    where: { id: ctx.businessId },
    data: {
      onboardingStep: validStep,
      onboardingCompleted: isComplete,
    },
    select: {
      id: true,
      name: true,
      onboardingStep: true,
      onboardingCompleted: true,
    },
  });

  await createAuditLog(ctx, {
    action: isComplete ? 'ONBOARDING_COMPLETED' : 'ONBOARDING_UPDATED',
    entityType: 'Business',
    entityId: ctx.businessId,
    previousState: previous as any,
    newState: { onboardingStep: validStep, onboardingCompleted: isComplete },
  });

  return updated;
}

/**
 * Lists branches belonging strictly to the active business.
 */
export async function getBusinessBranches(ctx: TenantContext) {
  requirePermission(ctx, 'SETTINGS_VIEW');

  return prisma.branch.findMany({
    where: {
      businessId: ctx.businessId,
      ...(ctx.branchId && !ctx.isOwner && !ctx.isSuperAdmin ? { id: ctx.branchId } : {}),
    },
    orderBy: [
      { isMainBranch: 'desc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      phone: true,
      timezone: true,
      status: true,
      isMainBranch: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          staff: true,
          customers: true,
          transactions: true,
        },
      },
    },
  });
}

/**
 * Resolves a branch by ID with strict tenant boundary check (IDOR defense).
 */
export async function getBranchById(ctx: TenantContext, branchId: string) {
  requirePermission(ctx, 'SETTINGS_VIEW');

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      businessId: true,
      name: true,
      code: true,
      address: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      phone: true,
      timezone: true,
      status: true,
      isMainBranch: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Cross-tenant IDOR protection: return null if belonging to another business
  if (!branch || branch.businessId !== ctx.businessId) {
    return null;
  }

  // Branch-level isolation: restricted staff cannot access other branches
  if (ctx.branchId && ctx.branchId !== branchId && !ctx.isOwner && !ctx.isSuperAdmin) {
    return null;
  }

  return branch;
}

/**
 * Creates a new branch for the active business.
 */
export async function createBranch(ctx: TenantContext, data: CreateBranchInput) {
  requirePermission(ctx, 'SETTINGS_MANAGE');
  await requireFeature(ctx, 'BRANCHES');
  await requireUsageLimit(ctx.businessId, 'maxBranches');

  if (!data.name || !data.name.trim()) {
    throw new Error('Branch name is required');
  }

  // If this is set as main branch, demote previous main branches
  if (data.isMainBranch) {
    await prisma.branch.updateMany({
      where: { businessId: ctx.businessId, isMainBranch: true },
      data: { isMainBranch: false },
    });
  }

  // If first branch, default to main branch
  const branchCount = await prisma.branch.count({
    where: { businessId: ctx.businessId },
  });
  const isMain = data.isMainBranch ?? branchCount === 0;

  const branch = await prisma.branch.create({
    data: {
      businessId: ctx.businessId,
      name: data.name.trim(),
      code: data.code?.trim() || null,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      country: data.country?.trim() || 'IN',
      postalCode: data.postalCode?.trim() || null,
      phone: data.phone?.trim() || null,
      timezone: data.timezone?.trim() || 'UTC',
      status: 'ACTIVE',
      isMainBranch: isMain,
    },
  });

  await createAuditLog(ctx, {
    action: 'BRANCH_CREATED',
    entityType: 'Branch',
    entityId: branch.id,
    newState: { name: branch.name, code: branch.code, isMainBranch: branch.isMainBranch },
  });

  return branch;
}

/**
 * Updates an existing branch with IDOR check and audit logging.
 */
export async function updateBranch(
  ctx: TenantContext,
  branchId: string,
  data: UpdateBranchInput
) {
  requirePermission(ctx, 'SETTINGS_MANAGE');

  const existing = await prisma.branch.findUnique({
    where: { id: branchId },
  });

  if (!existing || existing.businessId !== ctx.businessId) {
    throw new TenantAuthorizationError('Branch not found in this business');
  }

  // Branch-level isolation: restricted staff cannot modify other branches
  if (ctx.branchId && ctx.branchId !== branchId && !ctx.isOwner && !ctx.isSuperAdmin) {
    throw new TenantAuthorizationError('Access denied: Staff is restricted to their assigned branch');
  }

  if (data.isMainBranch && !existing.isMainBranch) {
    await prisma.branch.updateMany({
      where: { businessId: ctx.businessId, isMainBranch: true },
      data: { isMainBranch: false },
    });
  }

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.code !== undefined ? { code: data.code?.trim() || null } : {}),
      ...(data.address !== undefined ? { address: data.address?.trim() || null } : {}),
      ...(data.city !== undefined ? { city: data.city?.trim() || null } : {}),
      ...(data.state !== undefined ? { state: data.state?.trim() || null } : {}),
      ...(data.country !== undefined ? { country: data.country?.trim() || 'IN' } : {}),
      ...(data.postalCode !== undefined ? { postalCode: data.postalCode?.trim() || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone?.trim() || 'UTC' } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.isMainBranch !== undefined ? { isMainBranch: data.isMainBranch } : {}),
    },
  });

  const isDeactivation = data.status && data.status !== 'ACTIVE';

  await createAuditLog(ctx, {
    action: isDeactivation ? 'BRANCH_DEACTIVATED' : 'BRANCH_UPDATED',
    entityType: 'Branch',
    entityId: branchId,
    previousState: {
      name: existing.name,
      status: existing.status,
      isMainBranch: existing.isMainBranch,
    },
    newState: data as any,
  });

  return updated;
}

/**
 * Lists staff memberships for the active business.
 */
export async function getBusinessStaff(ctx: TenantContext) {
  requirePermission(ctx, 'STAFF_VIEW');

  return prisma.staffMembership.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          status: true,
        },
      },
      role: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Invites or adds a staff member to the active business.
 */
export async function inviteOrAddStaff(
  ctx: TenantContext,
  data: InviteStaffInput
) {
  requirePermission(ctx, 'STAFF_MANAGE');
  await requireFeature(ctx, 'STAFF');
  await requireUsageLimit(ctx.businessId, 'maxStaff');

  if (!data.email || !data.name || !data.roleId) {
    throw new Error('Email, Name, and Role are required');
  }

  const email = data.email.toLowerCase().trim();
  const name = data.name.trim();

  // Verify that the requested role exists and is not super admin
  const role = await prisma.role.findUnique({
    where: { id: data.roleId },
  });

  if (!role) {
    throw new Error('Invalid role specified');
  }

  if (role.name === 'SUPER_ADMIN') {
    throw new TenantAuthorizationError('Cannot assign Super Admin role in business context');
  }

  // If branchId is supplied, verify it belongs to this business
  if (data.branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
    });
    if (!branch || branch.businessId !== ctx.businessId) {
      throw new Error('Branch not found in this business');
    }
  }

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    // Generate secure temporary random password
    const tempPasswordHash = bcrypt.hashSync(`StaffPass-${Math.random().toString(36).substring(2, 10)}!`, 10);
    user = await prisma.user.create({
      data: {
        email,
        name,
        phone: data.phone?.trim() || null,
        passwordHash: tempPasswordHash,
        status: UserStatus.ACTIVE,
        isSuperAdmin: false,
      },
    });
  }

  // Check if already a member of this business
  const existingMembership = await prisma.staffMembership.findUnique({
    where: {
      userId_businessId: {
        userId: user.id,
        businessId: ctx.businessId,
      },
    },
  });

  if (existingMembership) {
    if (existingMembership.status === 'ACTIVE') {
      throw new Error(`User ${email} is already an active team member of this business`);
    }

    // Reactivate membership
    const updated = await prisma.staffMembership.update({
      where: { id: existingMembership.id },
      data: {
        status: 'ACTIVE',
        roleId: data.roleId,
        branchId: data.branchId || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, status: true } },
        role: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    await createAuditLog(ctx, {
      action: 'STAFF_ROLE_CHANGED',
      entityType: 'StaffMembership',
      entityId: updated.id,
      newState: { status: 'ACTIVE', role: role.name },
    });

    return updated;
  }

  // Create new membership
  const membership = await prisma.staffMembership.create({
    data: {
      userId: user.id,
      businessId: ctx.businessId,
      roleId: data.roleId,
      branchId: data.branchId || null,
      status: 'ACTIVE',
    },
    include: {
      user: { select: { id: true, name: true, email: true, status: true } },
      role: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  await createAuditLog(ctx, {
    action: 'STAFF_INVITED',
    entityType: 'StaffMembership',
    entityId: membership.id,
    newState: { userEmail: email, roleName: role.name },
  });

  return membership;
}

/**
 * Updates staff membership role, branch, or status with self-lockout defense.
 */
export async function updateStaffMembership(
  ctx: TenantContext,
  membershipId: string,
  data: UpdateStaffInput
) {
  requirePermission(ctx, 'STAFF_MANAGE');

  const existing = await prisma.staffMembership.findUnique({
    where: { id: membershipId },
    include: {
      role: true,
      user: true,
    },
  });

  if (!existing || existing.businessId !== ctx.businessId) {
    throw new TenantAuthorizationError('Staff membership not found in this business');
  }

  // Invariant: Self-lockout prevention — an owner cannot deactivate or demote themselves
  if (existing.userId === ctx.user.id && (data.status === 'DEACTIVATED' || data.status === 'SUSPENDED')) {
    throw new Error('Self-lockout prevention: You cannot deactivate your own business membership');
  }

  // Validate branch if supplied
  if (data.branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
    });
    if (!branch || branch.businessId !== ctx.businessId) {
      throw new Error('Branch not found in this business');
    }
  }

  // Validate role if changing
  if (data.roleId) {
    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) {
      throw new Error('Invalid role specified');
    }
    if (role.name === 'SUPER_ADMIN') {
      throw new TenantAuthorizationError('Cannot assign Super Admin role in business context');
    }
  }

  const updated = await prisma.staffMembership.update({
    where: { id: membershipId },
    data: {
      ...(data.roleId ? { roleId: data.roleId } : {}),
      ...(data.branchId !== undefined ? { branchId: data.branchId } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, status: true } },
      role: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  const isDeactivation = data.status && data.status !== 'ACTIVE';

  await createAuditLog(ctx, {
    action: isDeactivation ? 'STAFF_DEACTIVATED' : 'STAFF_ROLE_CHANGED',
    entityType: 'StaffMembership',
    entityId: membershipId,
    previousState: {
      role: existing.role.name,
      status: existing.status,
    },
    newState: {
      roleId: data.roleId || existing.roleId,
      status: data.status || existing.status,
    },
  });

  return updated;
}

/**
 * Retrieves the business branding configuration.
 */
export async function getBusinessBranding(ctx: TenantContext) {
  requirePermission(ctx, 'SETTINGS_VIEW');

  const business = await prisma.business.findUnique({
    where: { id: ctx.businessId },
    select: {
      id: true,
      name: true,
      category: true,
      themePreset: true,
      primaryColor: true,
      secondaryColor: true,
      logo: true,
      coverImage: true,
    },
  });

  if (!business) {
    throw new TenantAuthorizationError('Business tenant not found');
  }

  return business;
}

/**
 * Updates business branding and theme preset.
 */
export async function updateBusinessBranding(
  ctx: TenantContext,
  data: UpdateBrandingInput
) {
  requirePermission(ctx, 'SETTINGS_MANAGE');

  const ALLOWED_PRESETS = ['CAFE', 'RESTAURANT', 'SALON', 'GYM', 'GAMEZONE', 'RETAIL', 'OTHER'];
  if (data.themePreset && !ALLOWED_PRESETS.includes(data.themePreset.toUpperCase())) {
    throw new Error(`Invalid theme preset. Allowed: ${ALLOWED_PRESETS.join(', ')}`);
  }

  const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  if (data.primaryColor && !HEX_COLOR_REGEX.test(data.primaryColor)) {
    throw new Error('Invalid primaryColor. Must be a valid hex color code (e.g. #4F6BFF).');
  }
  if (data.secondaryColor && !HEX_COLOR_REGEX.test(data.secondaryColor)) {
    throw new Error('Invalid secondaryColor. Must be a valid hex color code (e.g. #111827).');
  }

  const previous = await prisma.business.findUnique({
    where: { id: ctx.businessId },
    select: {
      themePreset: true,
      primaryColor: true,
      secondaryColor: true,
    },
  });

  const updated = await prisma.business.update({
    where: { id: ctx.businessId },
    data: {
      ...(data.themePreset ? { themePreset: data.themePreset.toUpperCase() } : {}),
      ...(data.primaryColor ? { primaryColor: data.primaryColor } : {}),
      ...(data.secondaryColor ? { secondaryColor: data.secondaryColor } : {}),
      ...(data.logo !== undefined ? { logo: validateLogo(data.logo) } : {}),
      ...(data.coverImage !== undefined ? { coverImage: data.coverImage } : {}),
    },
    select: {
      id: true,
      name: true,
      themePreset: true,
      primaryColor: true,
      secondaryColor: true,
      logo: true,
      coverImage: true,
      updatedAt: true,
    },
  });

  await createAuditLog(ctx, {
    action: 'BRANDING_UPDATED',
    entityType: 'Business',
    entityId: ctx.businessId,
    previousState: previous as any,
    newState: data as any,
  });

  return updated;
}

/**
 * Lists predefined system roles available for assignment by business owners.
 */
export async function getBusinessRoles(_ctx: TenantContext) {
  return prisma.role.findMany({
    where: {
      name: { not: 'SUPER_ADMIN' },
    },
    select: {
      id: true,
      name: true,
      description: true,
      rolePermissions: {
        select: {
          permission: {
            select: {
              code: true,
              name: true,
              category: true,
            },
          },
        },
      },
    },
  });
}
