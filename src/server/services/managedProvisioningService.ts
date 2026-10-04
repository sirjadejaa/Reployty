/**
 * Reployty Managed Business Provisioning & Client Onboarding Service
 *
 * Implements the managed SaaS onboarding lifecycle:
 * 1. Public client onboarding submission (creates BusinessOnboardingRequest in PENDING state)
 * 2. Super Admin application review, status transitions (UNDER_REVIEW, APPROVED, REJECTED)
 * 3. Atomic, transaction-safe business provisioning (creates Business, Branch, Owner User/Membership, QR Code, Invitation, AuditLog)
 * 4. Secure cryptographic one-time owner invitation verification & password setup
 * 5. Anti-duplicate safeguards and idempotency protection
 */

import crypto from 'crypto';
import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { createSystemAuditLog } from './auditService';
import { hashPassword, createSession } from '../auth/sessionService';
import {
  BusinessCategory,
  OnboardingRequestStatus,
  BusinessStatus,
  QRType,
  QRStatus,
} from '@prisma/client';

export class ProvisioningError extends Error {
  constructor(message: string, public code: string = 'PROVISIONING_ERROR', public status: number = 400) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

export interface ClientOnboardingInput {
  businessName: string;
  category?: string;
  businessCategory?: BusinessCategory;
  description?: string;
  businessDescription?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  country?: string;
  city: string;
  address: string;
  state?: string;
  postalCode?: string;
  website?: string;
  businessPhone?: string;
  numberOfBranches?: number;
  estimatedBranches?: number;
  logoUrl?: string;
  primaryColor?: string;
  themePreset?: string;
}


export interface OnboardingPaginationParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

// ============================================================================
// 1. PUBLIC CLIENT ONBOARDING SUBMISSION
// ============================================================================

export async function submitClientOnboarding(
  input: ClientOnboardingInput,
  meta?: { ipAddress?: string; userAgent?: string }
) {
  // 1. Validate required fields
  if (!input.businessName || typeof input.businessName !== 'string' || input.businessName.trim().length < 2) {
    throw new ProvisioningError('Business name must be at least 2 characters', 'INVALID_BUSINESS_NAME', 400);
  }

  if (!input.ownerName || typeof input.ownerName !== 'string' || input.ownerName.trim().length < 2) {
    throw new ProvisioningError('Owner name must be at least 2 characters', 'INVALID_OWNER_NAME', 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!input.ownerEmail || !emailRegex.test(input.ownerEmail.trim().toLowerCase())) {
    throw new ProvisioningError('A valid email address is required', 'INVALID_EMAIL', 400);
  }

  if (!input.ownerPhone || input.ownerPhone.trim().length < 7) {
    throw new ProvisioningError('A valid contact phone number is required', 'INVALID_PHONE', 400);
  }

  if (!input.city || input.city.trim().length < 1) {
    throw new ProvisioningError('City is required', 'INVALID_CITY', 400);
  }

  if (!input.address || input.address.trim().length < 2) {
    throw new ProvisioningError('Street address is required', 'INVALID_ADDRESS', 400);
  }

  // Validate category against enum
  const categoryRaw = input.businessCategory || (input as any).category;
  const validCategories = Object.values(BusinessCategory);
  if (!categoryRaw || !validCategories.includes(categoryRaw as BusinessCategory)) {
    throw new ProvisioningError(
      `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      'INVALID_CATEGORY',
      400
    );
  }
  const cleanCategory = categoryRaw as BusinessCategory;

  // Sanitize values
  const cleanEmail = input.ownerEmail.trim().toLowerCase();
  const cleanPhone = input.ownerPhone.trim();
  const cleanName = input.businessName.trim();
  const cleanOwnerName = input.ownerName.trim();

  // Create Onboarding Request record in PENDING state
  const request = await prisma.businessOnboardingRequest.create({
    data: {
      businessName: cleanName,
      businessCategory: cleanCategory,
      businessDescription: (input.businessDescription || input.description)?.trim() || null,
      ownerName: cleanOwnerName,
      ownerEmail: cleanEmail,
      ownerPhone: cleanPhone,
      country: input.country?.trim() || 'IN',
      city: input.city.trim(),
      address: input.address.trim(),
      state: input.state?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      website: input.website?.trim() || null,
      businessPhone: input.businessPhone?.trim() || null,
      estimatedBranches: Math.max(1, Number(input.estimatedBranches || input.numberOfBranches) || 1),
      logoUrl: input.logoUrl?.trim() || null,
      primaryColor: input.primaryColor?.trim() || '#4F6BFF',
      themePreset: input.themePreset?.trim() || 'modern',
      status: OnboardingRequestStatus.PENDING,
    },
  });


  // Record audit log
  await createSystemAuditLog({
    action: 'CLIENT_ONBOARDING_SUBMITTED',
    entityType: 'BusinessOnboardingRequest',
    entityId: request.id,
    newState: {
      businessName: request.businessName,
      ownerEmail: request.ownerEmail,
      status: request.status,
    },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  // Return public-safe confirmation response (never expose internal secrets or DB details)
  return {
    success: true,
    requestId: request.id,
    businessName: request.businessName,
    status: request.status,
    message: 'Thanks — your Reployty setup request has been received. Our team will review your information and prepare your business workspace.',
    createdAt: request.createdAt.toISOString(),
  };
}

// ============================================================================
// 2. SUPER ADMIN LISTING & MANAGEMENT
// ============================================================================

export async function listOnboardingRequests(params: OnboardingPaginationParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
  const skip = (page - 1) * pageSize;

  const where: any = {};

  if (params.status && params.status !== 'ALL') {
    where.status = params.status as OnboardingRequestStatus;
  }

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    where.OR = [
      { businessName: { contains: term, mode: 'insensitive' } },
      { ownerName: { contains: term, mode: 'insensitive' } },
      { ownerEmail: { contains: term, mode: 'insensitive' } },
      { city: { contains: term, mode: 'insensitive' } },
    ];
  }

  const [items, total, pendingCount, underReviewCount, approvedCount, rejectedCount, provisionedCount] =
    await Promise.all([
      prisma.businessOnboardingRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          reviewedBy: {
            select: { id: true, name: true, email: true },
          },
          provisionedBusiness: {
            select: { id: true, name: true, slug: true, status: true },
          },
          invitations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, expiresAt: true, usedAt: true, sentAt: true },
          },
        },
      }),
      prisma.businessOnboardingRequest.count({ where }),
      prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.PENDING } }),
      prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.UNDER_REVIEW } }),
      prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.APPROVED } }),
      prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.REJECTED } }),
      prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.PROVISIONED } }),
    ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      businessName: r.businessName,
      businessCategory: r.businessCategory,
      businessDescription: r.businessDescription,
      ownerName: r.ownerName,
      ownerEmail: r.ownerEmail,
      ownerPhone: r.ownerPhone,
      country: r.country,
      city: r.city,
      address: r.address,
      state: r.state,
      postalCode: r.postalCode,
      website: r.website,
      businessPhone: r.businessPhone,
      estimatedBranches: r.estimatedBranches,
      status: r.status,
      notes: r.notes,
      rejectionReason: r.rejectionReason,
      reviewedAt: r.reviewedAt?.toISOString() || null,
      reviewedBy: r.reviewedBy ? { id: r.reviewedBy.id, name: r.reviewedBy.name, email: r.reviewedBy.email } : null,
      provisionedAt: r.provisionedAt?.toISOString() || null,
      provisionedBusiness: r.provisionedBusiness || null,
      latestInvitation: r.invitations[0]
        ? {
            id: r.invitations[0].id,
            expiresAt: r.invitations[0].expiresAt.toISOString(),
            isUsed: !!r.invitations[0].usedAt,
            isExpired: r.invitations[0].expiresAt < new Date(),
          }
        : null,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
    counts: {
      total,
      pending: pendingCount,
      underReview: underReviewCount,
      approved: approvedCount,
      rejected: rejectedCount,
      provisioned: provisionedCount,
    },
  };
}

export async function getOnboardingRequestById(id: string) {
  const r = await prisma.businessOnboardingRequest.findUnique({
    where: { id },
    include: {
      reviewedBy: {
        select: { id: true, name: true, email: true },
      },
      provisionedBusiness: {
        include: {
          branches: { take: 5 },
          qrCodes: { where: { status: 'ACTIVE' }, take: 1 },
        },
      },
      invitations: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!r) {
    throw new ProvisioningError('Business onboarding request not found', 'NOT_FOUND', 404);
  }

  // Check if owner user already exists in the system
  const existingOwnerUser = await prisma.user.findUnique({
    where: { email: r.ownerEmail },
    select: { id: true, name: true, email: true, status: true },
  });

  // Check if business with same name/slug exists
  const baseSlug = generateBaseSlug(r.businessName);
  const potentialDuplicateBiz = await prisma.business.findFirst({
    where: {
      OR: [
        { name: { equals: r.businessName, mode: 'insensitive' } },
        { slug: { startsWith: baseSlug } },
      ],
    },
    select: { id: true, name: true, slug: true, status: true },
  });

  return {
    ...r,
    existingOwnerUser,
    potentialDuplicateBiz,
  };
}

export async function updateOnboardingRequestStatus(
  ctx: TenantContext,
  id: string,
  newStatus: OnboardingRequestStatus,
  options?: { notes?: string; rejectionReason?: string }
) {
  if (!ctx.isSuperAdmin) {
    throw new ProvisioningError('Super Admin authorization required', 'UNAUTHORIZED', 403);
  }

  const existing = await prisma.businessOnboardingRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new ProvisioningError('Onboarding request not found', 'NOT_FOUND', 404);
  }

  if (existing.status === OnboardingRequestStatus.PROVISIONED) {
    throw new ProvisioningError('Cannot modify status of an already provisioned request', 'ALREADY_PROVISIONED', 400);
  }

  const updated = await prisma.businessOnboardingRequest.update({
    where: { id },
    data: {
      status: newStatus,
      notes: options?.notes !== undefined ? options.notes : existing.notes,
      rejectionReason: options?.rejectionReason !== undefined ? options.rejectionReason : existing.rejectionReason,
      reviewedAt: new Date(),
      reviewedByUserId: ctx.user.id,
    },
  });

  await createSystemAuditLog({
    action: `ONBOARDING_REQUEST_${newStatus}`,
    entityType: 'BusinessOnboardingRequest',
    entityId: id,
    actorUserId: ctx.user.id,
    previousState: { status: existing.status },
    newState: { status: newStatus, notes: options?.notes, rejectionReason: options?.rejectionReason },
  });

  return updated;
}

// ============================================================================
// 3. ATOMIC BUSINESS PROVISIONING
// ============================================================================

function generateBaseSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40) || 'business';
}

export async function provisionBusinessFromRequest(
  ctx: TenantContext,
  requestId: string,
  options?: {
    customSlug?: string;
    branchName?: string;
    branchCode?: string;
    skipInvitationEmail?: boolean;
  }
) {
  if (!ctx.isSuperAdmin) {
    throw new ProvisioningError('Super Admin authorization required to provision businesses', 'UNAUTHORIZED', 403);
  }

  // 1. Fetch request with existing relationships
  const request = await prisma.businessOnboardingRequest.findUnique({
    where: { id: requestId },
    include: {
      provisionedBusiness: {
        include: {
          qrCodes: { where: { status: 'ACTIVE' }, take: 1 },
          branches: { take: 1 },
        },
      },
      invitations: {
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!request) {
    throw new ProvisioningError('Business onboarding request not found', 'NOT_FOUND', 404);
  }

  // 2. IDEMPOTENCY GUARD: If already provisioned, return existing record safely without duplicate mutation
  if (request.status === OnboardingRequestStatus.PROVISIONED && request.provisionedBusiness) {
    const existingBiz = request.provisionedBusiness;
    const existingQr = existingBiz.qrCodes[0];
    return {
      success: true,
      alreadyProvisioned: true,
      business: {
        id: existingBiz.id,
        name: existingBiz.name,
        slug: existingBiz.slug,
        status: existingBiz.status,
      },
      qrCode: existingQr
        ? {
            code: existingQr.code,
            destinationUrl: existingQr.destinationUrl,
          }
        : null,
      message: 'Business has already been provisioned.',
    };
  }

  // 3. Generate unique business slug
  const baseSlug = options?.customSlug ? generateBaseSlug(options.customSlug) : generateBaseSlug(request.businessName);
  let finalSlug = baseSlug;
  let counter = 1;

  while (await prisma.business.findUnique({ where: { slug: finalSlug } })) {
    finalSlug = `${baseSlug}-${counter++}`;
  }

  // 4. Find system default OWNER role
  const ownerRole = await prisma.role.findFirst({
    where: { name: 'OWNER', businessId: null },
  });

  if (!ownerRole) {
    throw new ProvisioningError('System OWNER role not found in database', 'SYSTEM_ROLE_MISSING', 500);
  }

  // 5. Generate secure cryptographic invitation token
  const rawInvitationToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawInvitationToken).digest('hex');
  const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // 6. Execute Atomic Transaction in PostgreSQL
  const result = await prisma.$transaction(async (tx) => {
    // A. Find or create Owner User
    let ownerUser = await tx.user.findUnique({
      where: { email: request.ownerEmail },
    });

    if (!ownerUser) {
      ownerUser = await tx.user.create({
        data: {
          email: request.ownerEmail,
          name: request.ownerName,
          phone: request.ownerPhone,
          status: 'ACTIVE',
          isSuperAdmin: false,
          passwordHash: '', // Password set via invitation
        },
      });
    }

    // B. Create Business
    const business = await tx.business.create({
      data: {
        name: request.businessName,
        slug: finalSlug,
        category: request.businessCategory,
        description: request.businessDescription,
        phone: request.businessPhone || request.ownerPhone,
        email: request.ownerEmail,
        website: request.website,
        address: request.address,
        city: request.city,
        state: request.state,
        country: request.country,
        postalCode: request.postalCode,
        primaryColor: request.primaryColor || '#4F6BFF',
        themePreset: request.themePreset || 'modern',
        status: BusinessStatus.ACTIVE,
        onboardingCompleted: false,
        onboardingStep: 1,
      },
    });

    // C. Create Main Branch
    const branchCode = options?.branchCode || 'MAIN-01';
    const mainBranch = await tx.branch.create({
      data: {
        businessId: business.id,
        name: options?.branchName || 'Main Branch',
        code: branchCode,
        isMainBranch: true,
        status: 'ACTIVE',
        address: request.address,
        city: request.city,
        state: request.state,
        country: request.country,
        postalCode: request.postalCode,
      },
    });

    // D. Create Owner StaffMembership
    const membership = await tx.staffMembership.create({
      data: {
        userId: ownerUser.id,
        businessId: business.id,
        branchId: mainBranch.id,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });

    // E. Create Customer Entry QR Code (Phase 6 compliant)
    const qrCodeValue = `QR-${business.slug.toUpperCase()}-01`;
    const qrCode = await tx.qRCode.create({
      data: {
        businessId: business.id,
        branchId: mainBranch.id,
        code: qrCodeValue,
        type: QRType.BUSINESS_STAND,
        destinationUrl: `/join/${business.slug}`,
        status: QRStatus.ACTIVE,
      },
    });

    // F. Create Owner Invitation
    const invitation = await tx.ownerInvitation.create({
      data: {
        businessId: business.id,
        userId: ownerUser.id,
        onboardingRequestId: request.id,
        tokenHash,
        expiresAt: invitationExpiresAt,
        createdByUserId: ctx.user.id,
      },
    });

    // G. Update Onboarding Request status to PROVISIONED
    const updatedRequest = await tx.businessOnboardingRequest.update({
      where: { id: request.id },
      data: {
        status: OnboardingRequestStatus.PROVISIONED,
        provisionedAt: new Date(),
        provisionedBusinessId: business.id,
        reviewedAt: new Date(),
        reviewedByUserId: ctx.user.id,
      },
    });

    // H. Create Audit Log
    await tx.auditLog.create({
      data: {
        businessId: business.id,
        actorUserId: ctx.user.id,
        action: 'BUSINESS_PROVISIONED',
        entityType: 'Business',
        entityId: business.id,
        newState: {
          businessName: business.name,
          slug: business.slug,
          ownerEmail: ownerUser.email,
          requestId: request.id,
          qrCode: qrCode.code,
        },
      },
    });

    return {
      business,
      mainBranch,
      ownerUser,
      membership,
      qrCode,
      invitation,
      updatedRequest,
    };
  });

  // Construct setup link for owner
  const setupUrl = `#setup-password?token=${rawInvitationToken}`;

  return {
    success: true,
    alreadyProvisioned: false,
    business: {
      id: result.business.id,
      name: result.business.name,
      slug: result.business.slug,
      status: result.business.status,
    },
    branch: {
      id: result.mainBranch.id,
      name: result.mainBranch.name,
      code: result.mainBranch.code,
    },
    owner: {
      id: result.ownerUser.id,
      name: result.ownerUser.name,
      email: result.ownerUser.email,
    },
    qrCode: {
      code: result.qrCode.code,
      destinationUrl: result.qrCode.destinationUrl,
    },
    invitation: {
      id: result.invitation.id,
      expiresAt: result.invitation.expiresAt.toISOString(),
      setupUrl,
      rawToken: rawInvitationToken,
    },
    message: `Business ${result.business.name} successfully provisioned.`,
  };
}

// ============================================================================
// 4. SECURE INVITATION VERIFICATION & PASSWORD SETUP
// ============================================================================

export async function verifyInvitationToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 16) {
    throw new ProvisioningError('Invalid invitation token format', 'INVALID_TOKEN', 400);
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

  const invitation = await prisma.ownerInvitation.findUnique({
    where: { tokenHash },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
          primaryColor: true,
          status: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
        },
      },
    },
  });

  if (!invitation) {
    throw new ProvisioningError('Invitation link is invalid or has expired', 'INVALID_INVITATION', 404);
  }

  if (invitation.usedAt) {
    throw new ProvisioningError('This invitation has already been used. Please log in with your password.', 'INVITATION_ALREADY_USED', 400);
  }

  if (invitation.expiresAt < new Date()) {
    throw new ProvisioningError('This invitation link has expired. Please contact Reployty support for a new link.', 'INVITATION_EXPIRED', 400);
  }

  if (invitation.business.status !== 'ACTIVE' || invitation.user.status !== 'ACTIVE') {
    throw new ProvisioningError('The business workspace is not currently active.', 'WORKSPACE_INACTIVE', 400);
  }

  return {
    valid: true,
    businessId: invitation.business.id,
    businessName: invitation.business.name,
    businessSlug: invitation.business.slug,
    businessCategory: invitation.business.category,
    primaryColor: invitation.business.primaryColor,
    ownerEmail: invitation.user.email,
    ownerName: invitation.user.name,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function completeInvitationSetup(
  rawToken: string,
  newPassword: string,
  meta?: { ipAddress?: string; userAgent?: string }
) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new ProvisioningError('Invitation token is required', 'MISSING_TOKEN', 400);
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new ProvisioningError('Password must be at least 8 characters long', 'WEAK_PASSWORD', 400);
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

  // Verify and complete in atomic transaction
  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.ownerInvitation.findUnique({
      where: { tokenHash },
      include: {
        business: true,
        user: true,
      },
    });

    if (!invitation) {
      throw new ProvisioningError('Invitation link is invalid', 'INVALID_INVITATION', 404);
    }

    if (invitation.usedAt) {
      throw new ProvisioningError('Invitation has already been used', 'INVITATION_ALREADY_USED', 400);
    }

    if (invitation.expiresAt < new Date()) {
      throw new ProvisioningError('Invitation has expired', 'INVITATION_EXPIRED', 400);
    }

    // Hash password securely with bcrypt
    const passwordHash = await hashPassword(newPassword);

    // Update User password and ensure ACTIVE
    const updatedUser = await tx.user.update({
      where: { id: invitation.userId },
      data: {
        passwordHash,
        status: 'ACTIVE',
      },
    });

    // Mark invitation as used
    await tx.ownerInvitation.update({
      where: { id: invitation.id },
      data: {
        usedAt: new Date(),
      },
    });

    // Record audit log
    await tx.auditLog.create({
      data: {
        businessId: invitation.businessId,
        actorUserId: updatedUser.id,
        action: 'OWNER_INVITATION_COMPLETED',
        entityType: 'User',
        entityId: updatedUser.id,
        newState: { email: updatedUser.email, passwordSet: true },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    });

    return {
      userId: updatedUser.id,
      businessId: invitation.businessId,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        isSuperAdmin: updatedUser.isSuperAdmin,
      },
      business: {
        id: invitation.business.id,
        name: invitation.business.name,
        slug: invitation.business.slug,
      },
    };
  });

  // Create active session so the owner is logged in seamlessly
  const session = await createSession(
    result.userId,
    result.businessId,
    meta?.ipAddress,
    meta?.userAgent
  );

  return {
    success: true,
    sessionToken: session.sessionToken,
    user: result.user,
    business: result.business,
    message: 'Password successfully set. Your business workspace is ready.',
  };
}
