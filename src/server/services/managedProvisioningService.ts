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

export interface StatusHistoryEntry {
  status: OnboardingRequestStatus;
  timestamp: string;
  actorUserId?: string | null;
  actorRole: 'APPLICANT' | 'SUPER_ADMIN' | 'SYSTEM';
  actorName?: string | null;
  actionTitle: string;
  notes?: string | null;
  message?: string | null;
}

export const ALLOWED_ADMIN_TRANSITIONS: Record<string, OnboardingRequestStatus[]> = {
  DRAFT: [OnboardingRequestStatus.CANCELLED],
  SUBMITTED: [
    OnboardingRequestStatus.UNDER_REVIEW,
    OnboardingRequestStatus.ADDITIONAL_INFO_REQUIRED,
    OnboardingRequestStatus.APPROVED,
    OnboardingRequestStatus.REJECTED,
    OnboardingRequestStatus.CANCELLED,
  ],
  PENDING: [
    OnboardingRequestStatus.UNDER_REVIEW,
    OnboardingRequestStatus.ADDITIONAL_INFO_REQUIRED,
    OnboardingRequestStatus.APPROVED,
    OnboardingRequestStatus.REJECTED,
    OnboardingRequestStatus.CANCELLED,
  ],
  UNDER_REVIEW: [
    OnboardingRequestStatus.ADDITIONAL_INFO_REQUIRED,
    OnboardingRequestStatus.APPROVED,
    OnboardingRequestStatus.REJECTED,
    OnboardingRequestStatus.CANCELLED,
  ],
  ADDITIONAL_INFO_REQUIRED: [
    OnboardingRequestStatus.UNDER_REVIEW,
    OnboardingRequestStatus.APPROVED,
    OnboardingRequestStatus.REJECTED,
    OnboardingRequestStatus.CANCELLED,
  ],
  APPROVED: [
    OnboardingRequestStatus.PROVISIONED,
    OnboardingRequestStatus.REJECTED,
  ],
  REJECTED: [
    OnboardingRequestStatus.UNDER_REVIEW,
  ],
  CANCELLED: [],
  PROVISIONED: [],
};

export const ALLOWED_APPLICANT_TRANSITIONS: Record<string, OnboardingRequestStatus[]> = {
  DRAFT: [OnboardingRequestStatus.SUBMITTED, OnboardingRequestStatus.CANCELLED],
  SUBMITTED: [OnboardingRequestStatus.CANCELLED],
  PENDING: [OnboardingRequestStatus.CANCELLED],
  UNDER_REVIEW: [OnboardingRequestStatus.CANCELLED],
  ADDITIONAL_INFO_REQUIRED: [OnboardingRequestStatus.SUBMITTED, OnboardingRequestStatus.CANCELLED],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
  PROVISIONED: [],
};

export async function generateUniqueApplicationNumber(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const candidate = `APP-${randomNum}`;
    const exists = await prisma.businessOnboardingRequest.findUnique({
      where: { applicationNumber: candidate },
    });
    if (!exists) return candidate;
  }
  return `APP-${Date.now().toString().slice(-6)}`;
}

// ============================================================================
// 1. PUBLIC CLIENT ONBOARDING SUBMISSION & DRAFT MANAGEMENT
// ============================================================================

export async function submitClientOnboarding(
  input: ClientOnboardingInput & { applicantUserId?: string },
  meta?: { ipAddress?: string; userAgent?: string; userId?: string }
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
  const appNumber = await generateUniqueApplicationNumber();
  const applicantUserId = input.applicantUserId || meta?.userId || null;
  const now = new Date();

  const initialHistoryEntry: StatusHistoryEntry = {
    status: OnboardingRequestStatus.PENDING,
    timestamp: now.toISOString(),
    actorUserId: applicantUserId,
    actorRole: 'APPLICANT',
    actorName: cleanOwnerName,
    actionTitle: 'Application Submitted',
    notes: 'Application received and queued for review.',
  };

  // Create Onboarding Request record in PENDING state (preserves existing system convention)
  const request = await prisma.businessOnboardingRequest.create({
    data: {
      applicationNumber: appNumber,
      applicantUserId,
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
      submittedAt: now,
      statusHistory: [initialHistoryEntry as any],
    },
  });

  // Record audit log
  await createSystemAuditLog({
    action: 'APPLICATION_SUBMITTED',
    entityType: 'BusinessOnboardingRequest',
    entityId: request.id,
    newState: {
      applicationNumber: request.applicationNumber,
      businessName: request.businessName,
      ownerEmail: request.ownerEmail,
      status: request.status,
    },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  return {
    success: true,
    requestId: request.id,
    applicationNumber: request.applicationNumber!,
    businessName: request.businessName,
    status: request.status,
    message: 'Thanks — your Reployty setup request has been received. Our team will review your information and prepare your business workspace.',
    createdAt: request.createdAt.toISOString(),
  };
}

export async function saveDraftApplication(
  userId: string,
  input: Partial<ClientOnboardingInput> & { id?: string },
  meta?: { ipAddress?: string; userAgent?: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ProvisioningError('User not found', 'USER_NOT_FOUND', 404);
  }

  // Update existing draft
  if (input.id) {
    const existing = await prisma.businessOnboardingRequest.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw new ProvisioningError('Draft application not found', 'NOT_FOUND', 404);
    }
    if (existing.applicantUserId !== userId && existing.ownerEmail !== user.email) {
      throw new ProvisioningError('You do not have permission to modify this application', 'FORBIDDEN', 403);
    }
    if (existing.status !== OnboardingRequestStatus.DRAFT) {
      throw new ProvisioningError('Only draft applications can be edited via draft save', 'NOT_DRAFT', 400);
    }

    const updated = await prisma.businessOnboardingRequest.update({
      where: { id: input.id },
      data: {
        businessName: input.businessName?.trim() || existing.businessName,
        businessCategory: input.businessCategory || existing.businessCategory,
        businessDescription: input.businessDescription !== undefined ? input.businessDescription?.trim() || null : existing.businessDescription,
        ownerName: input.ownerName?.trim() || existing.ownerName,
        ownerEmail: input.ownerEmail?.trim().toLowerCase() || existing.ownerEmail,
        ownerPhone: input.ownerPhone?.trim() || existing.ownerPhone,
        country: input.country?.trim() || existing.country,
        city: input.city?.trim() || existing.city,
        address: input.address?.trim() || existing.address,
        state: input.state !== undefined ? input.state?.trim() || null : existing.state,
        postalCode: input.postalCode !== undefined ? input.postalCode?.trim() || null : existing.postalCode,
        website: input.website !== undefined ? input.website?.trim() || null : existing.website,
        businessPhone: input.businessPhone !== undefined ? input.businessPhone?.trim() || null : existing.businessPhone,
        estimatedBranches: input.estimatedBranches ? Math.max(1, Number(input.estimatedBranches)) : existing.estimatedBranches,
        primaryColor: input.primaryColor || existing.primaryColor,
        themePreset: input.themePreset || existing.themePreset,
      },
    });

    return updated;
  }

  // Create new draft
  const appNumber = await generateUniqueApplicationNumber();
  const now = new Date();
  const historyEntry: StatusHistoryEntry = {
    status: OnboardingRequestStatus.DRAFT,
    timestamp: now.toISOString(),
    actorUserId: userId,
    actorRole: 'APPLICANT',
    actorName: user.name,
    actionTitle: 'Application Draft Saved',
    notes: 'Draft started by applicant.',
  };

  const draft = await prisma.businessOnboardingRequest.create({
    data: {
      applicationNumber: appNumber,
      applicantUserId: userId,
      businessName: input.businessName?.trim() || 'Untitled Business',
      businessCategory: input.businessCategory || BusinessCategory.CAFE,
      businessDescription: input.businessDescription?.trim() || null,
      ownerName: input.ownerName?.trim() || user.name,
      ownerEmail: input.ownerEmail?.trim().toLowerCase() || user.email,
      ownerPhone: input.ownerPhone?.trim() || user.phone || '',
      country: input.country?.trim() || 'IN',
      city: input.city?.trim() || '',
      address: input.address?.trim() || '',
      state: input.state?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      website: input.website?.trim() || null,
      businessPhone: input.businessPhone?.trim() || null,
      estimatedBranches: input.estimatedBranches ? Math.max(1, Number(input.estimatedBranches)) : 1,
      primaryColor: input.primaryColor || '#4F6BFF',
      themePreset: input.themePreset || 'modern',
      status: OnboardingRequestStatus.DRAFT,
      statusHistory: [historyEntry as any],
    },
  });

  await createSystemAuditLog({
    action: 'APPLICATION_DRAFT_SAVED',
    entityType: 'BusinessOnboardingRequest',
    entityId: draft.id,
    newState: {
      applicationNumber: draft.applicationNumber,
      businessName: draft.businessName,
      status: draft.status,
    },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  return draft;
}

export async function submitDraftApplication(
  id: string,
  userId: string,
  input?: Partial<ClientOnboardingInput>
) {
  const existing = await prisma.businessOnboardingRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new ProvisioningError('Application not found', 'NOT_FOUND', 404);
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (existing.applicantUserId !== userId && existing.ownerEmail !== user?.email) {
    throw new ProvisioningError('Unauthorized to submit this application', 'FORBIDDEN', 403);
  }
  if (existing.status !== OnboardingRequestStatus.DRAFT) {
    throw new ProvisioningError(`Application cannot be submitted from status '${existing.status}'`, 'INVALID_STATUS', 400);
  }

  const bizName = input?.businessName?.trim() || existing.businessName;
  const ownerName = input?.ownerName?.trim() || existing.ownerName;
  const ownerEmail = input?.ownerEmail?.trim().toLowerCase() || existing.ownerEmail;
  const ownerPhone = input?.ownerPhone?.trim() || existing.ownerPhone;
  const city = input?.city?.trim() || existing.city;
  const address = input?.address?.trim() || existing.address;

  if (!bizName || bizName.length < 2) throw new ProvisioningError('Business name is required', 'INVALID_BUSINESS_NAME', 400);
  if (!ownerName || ownerName.length < 2) throw new ProvisioningError('Owner name is required', 'INVALID_OWNER_NAME', 400);
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new ProvisioningError('Valid owner email is required', 'INVALID_EMAIL', 400);
  if (!ownerPhone || ownerPhone.length < 7) throw new ProvisioningError('Valid phone number is required', 'INVALID_PHONE', 400);
  if (!city) throw new ProvisioningError('City is required', 'INVALID_CITY', 400);
  if (!address) throw new ProvisioningError('Address is required', 'INVALID_ADDRESS', 400);

  const now = new Date();
  const currentHistory = Array.isArray(existing.statusHistory) ? (existing.statusHistory as any[]) : [];
  const nextHistory: StatusHistoryEntry[] = [
    ...currentHistory,
    {
      status: OnboardingRequestStatus.SUBMITTED,
      timestamp: now.toISOString(),
      actorUserId: userId,
      actorRole: 'APPLICANT',
      actorName: ownerName,
      actionTitle: 'Application Submitted',
      notes: 'Draft finalized and submitted for review.',
    },
  ];

  const updated = await prisma.businessOnboardingRequest.update({
    where: { id },
    data: {
      businessName: bizName,
      ownerName,
      ownerEmail,
      ownerPhone,
      city,
      address,
      status: OnboardingRequestStatus.SUBMITTED,
      submittedAt: now,
      statusHistory: nextHistory as any,
    },
  });

  await createSystemAuditLog({
    action: 'APPLICATION_SUBMITTED',
    entityType: 'BusinessOnboardingRequest',
    entityId: id,
    actorUserId: userId,
    newState: { status: updated.status, applicationNumber: updated.applicationNumber },
  });

  return updated;
}

export async function submitApplicantAdditionalInfo(
  id: string,
  authContext: { userId?: string; email?: string; applicationNumber?: string },
  responseText: string,
  updatedFields?: Partial<ClientOnboardingInput>
) {
  if (!responseText || typeof responseText !== 'string' || responseText.trim().length < 2) {
    throw new ProvisioningError('Please provide the requested information in detail', 'INVALID_INPUT', 400);
  }

  const existing = await prisma.businessOnboardingRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new ProvisioningError('Application not found', 'NOT_FOUND', 404);
  }

  const isOwner =
    (authContext.userId && existing.applicantUserId === authContext.userId) ||
    (authContext.email && existing.ownerEmail.toLowerCase() === authContext.email.toLowerCase()) ||
    (authContext.applicationNumber && existing.applicationNumber === authContext.applicationNumber);

  if (!isOwner) {
    throw new ProvisioningError('Unauthorized to update this application', 'FORBIDDEN', 403);
  }

  if (existing.status !== OnboardingRequestStatus.ADDITIONAL_INFO_REQUIRED) {
    throw new ProvisioningError(
      `Cannot submit additional information when application status is '${existing.status}'`,
      'INVALID_STATUS',
      400
    );
  }

  const now = new Date();
  const currentHistory = Array.isArray(existing.statusHistory) ? (existing.statusHistory as any[]) : [];
  const nextHistory: StatusHistoryEntry[] = [
    ...currentHistory,
    {
      status: OnboardingRequestStatus.SUBMITTED,
      timestamp: now.toISOString(),
      actorUserId: authContext.userId || null,
      actorRole: 'APPLICANT',
      actorName: existing.ownerName,
      actionTitle: 'Additional Information Provided',
      message: responseText.trim(),
      notes: 'Applicant responded with requested details.',
    },
  ];

  const updated = await prisma.businessOnboardingRequest.update({
    where: { id },
    data: {
      status: OnboardingRequestStatus.SUBMITTED,
      additionalInfoSubmitted: responseText.trim(),
      additionalInfoSubmittedAt: now,
      statusHistory: nextHistory as any,
      ...(updatedFields?.website ? { website: updatedFields.website.trim() } : {}),
      ...(updatedFields?.businessPhone ? { businessPhone: updatedFields.businessPhone.trim() } : {}),
      ...(updatedFields?.address ? { address: updatedFields.address.trim() } : {}),
      ...(updatedFields?.city ? { city: updatedFields.city.trim() } : {}),
    },
  });

  await createSystemAuditLog({
    action: 'APPLICATION_ADDITIONAL_INFO_SUBMITTED',
    entityType: 'BusinessOnboardingRequest',
    entityId: id,
    actorUserId: authContext.userId || undefined,
    newState: {
      status: updated.status,
      additionalInfoSubmitted: updated.additionalInfoSubmitted,
    },
  });

  return updated;
}

export async function cancelApplication(
  id: string,
  authContext: { userId?: string; email?: string; isSuperAdmin?: boolean },
  reason?: string
) {
  const existing = await prisma.businessOnboardingRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new ProvisioningError('Application not found', 'NOT_FOUND', 404);
  }

  const isApplicantOwner =
    (authContext.userId && existing.applicantUserId === authContext.userId) ||
    (authContext.email && existing.ownerEmail.toLowerCase() === authContext.email.toLowerCase());

  if (!isApplicantOwner && !authContext.isSuperAdmin) {
    throw new ProvisioningError('Unauthorized to cancel this application', 'FORBIDDEN', 403);
  }

  if (existing.status === OnboardingRequestStatus.PROVISIONED) {
    throw new ProvisioningError('Cannot cancel an already provisioned business workspace', 'ALREADY_PROVISIONED', 400);
  }
  if (existing.status === OnboardingRequestStatus.CANCELLED) {
    throw new ProvisioningError('Application is already cancelled', 'ALREADY_CANCELLED', 400);
  }

  const now = new Date();
  const currentHistory = Array.isArray(existing.statusHistory) ? (existing.statusHistory as any[]) : [];
  const nextHistory: StatusHistoryEntry[] = [
    ...currentHistory,
    {
      status: OnboardingRequestStatus.CANCELLED,
      timestamp: now.toISOString(),
      actorUserId: authContext.userId || null,
      actorRole: authContext.isSuperAdmin ? 'SUPER_ADMIN' : 'APPLICANT',
      actorName: authContext.isSuperAdmin ? 'Super Admin' : existing.ownerName,
      actionTitle: 'Application Cancelled',
      notes: reason || 'Application withdrawn.',
    },
  ];

  const updated = await prisma.businessOnboardingRequest.update({
    where: { id },
    data: {
      status: OnboardingRequestStatus.CANCELLED,
      statusHistory: nextHistory as any,
    },
  });

  await createSystemAuditLog({
    action: 'APPLICATION_CANCELLED',
    entityType: 'BusinessOnboardingRequest',
    entityId: id,
    actorUserId: authContext.userId || undefined,
    previousState: { status: existing.status },
    newState: { status: OnboardingRequestStatus.CANCELLED, reason },
  });

  return updated;
}

export async function trackApplicationPublic(applicationNumber: string, email: string) {
  if (!applicationNumber || !email) {
    throw new ProvisioningError('Application number and email are required', 'MISSING_INPUT', 400);
  }

  const cleanAppNum = applicationNumber.trim().toUpperCase().replace(/^#/, '');
  const cleanEmail = email.trim().toLowerCase();

  const req = await prisma.businessOnboardingRequest.findFirst({
    where: {
      applicationNumber: cleanAppNum,
      ownerEmail: cleanEmail,
    },
    include: {
      provisionedBusiness: {
        select: { id: true, name: true, slug: true, status: true },
      },
    },
  });

  if (!req) {
    throw new ProvisioningError('No application found with the provided reference number and email', 'NOT_FOUND', 404);
  }

  return {
    id: req.id,
    applicationNumber: req.applicationNumber,
    businessName: req.businessName,
    businessCategory: req.businessCategory,
    status: req.status,
    submittedAt: req.submittedAt?.toISOString() || req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
    additionalInfoRequested: req.additionalInfoRequested,
    additionalInfoSubmitted: req.additionalInfoSubmitted,
    additionalInfoSubmittedAt: req.additionalInfoSubmittedAt?.toISOString() || null,
    rejectionReason: req.rejectionReason,
    notes: req.notes,
    statusHistory: Array.isArray(req.statusHistory) ? req.statusHistory : [],
    provisionedBusiness: req.provisionedBusiness,
    ownerName: req.ownerName,
    ownerEmail: req.ownerEmail,
    city: req.city,
    country: req.country,
  };
}

export async function getApplicantApplicationById(
  id: string,
  auth: { userId: string; email: string; isSuperAdmin?: boolean }
) {
  const req = await prisma.businessOnboardingRequest.findUnique({
    where: { id },
    include: {
      provisionedBusiness: {
        select: { id: true, name: true, slug: true, status: true },
      },
    },
  });

  if (!req) {
    throw new ProvisioningError('Application not found', 'NOT_FOUND', 404);
  }

  const isOwner =
    req.applicantUserId === auth.userId ||
    req.ownerEmail.toLowerCase() === auth.email.toLowerCase();

  if (!isOwner && !auth.isSuperAdmin) {
    throw new ProvisioningError('Unauthorized to view this application', 'FORBIDDEN', 403);
  }

  return {
    ...req,
    statusHistory: Array.isArray(req.statusHistory) ? req.statusHistory : [],
  };
}

export async function getApplicantApplications(userId: string, email: string) {
  const reqs = await prisma.businessOnboardingRequest.findMany({
    where: {
      OR: [
        { applicantUserId: userId },
        { ownerEmail: email.toLowerCase() },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      provisionedBusiness: {
        select: { id: true, name: true, slug: true, status: true },
      },
    },
  });

  return reqs.map((r) => ({
    ...r,
    statusHistory: Array.isArray(r.statusHistory) ? r.statusHistory : [],
  }));
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
    if (params.status === 'SUBMITTED') {
      where.OR = [
        { status: OnboardingRequestStatus.SUBMITTED },
        { status: OnboardingRequestStatus.PENDING },
      ];
    } else {
      where.status = params.status as OnboardingRequestStatus;
    }
  }

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    const searchConditions: any[] = [
      { businessName: { contains: term, mode: 'insensitive' } },
      { ownerName: { contains: term, mode: 'insensitive' } },
      { ownerEmail: { contains: term, mode: 'insensitive' } },
      { city: { contains: term, mode: 'insensitive' } },
      { applicationNumber: { contains: term, mode: 'insensitive' } },
    ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchConditions }];
      delete where.OR;
    } else {
      where.OR = searchConditions;
    }
  }

  const [
    items,
    total,
    draftCount,
    submittedCount,
    pendingCount,
    underReviewCount,
    additionalInfoCount,
    approvedCount,
    rejectedCount,
    cancelledCount,
    provisionedCount,
  ] = await Promise.all([
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
    prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.DRAFT } }),
    prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.SUBMITTED } }),
    prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.PENDING } }),
    prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.UNDER_REVIEW } }),
    prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.ADDITIONAL_INFO_REQUIRED } }),
    prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.APPROVED } }),
    prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.REJECTED } }),
    prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.CANCELLED } }),
    prisma.businessOnboardingRequest.count({ where: { status: OnboardingRequestStatus.PROVISIONED } }),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      applicationNumber: r.applicationNumber,
      applicantUserId: r.applicantUserId,
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
      additionalInfoRequested: r.additionalInfoRequested,
      additionalInfoSubmitted: r.additionalInfoSubmitted,
      additionalInfoSubmittedAt: r.additionalInfoSubmittedAt?.toISOString() || null,
      statusHistory: Array.isArray(r.statusHistory) ? r.statusHistory : [],
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
      submittedAt: r.submittedAt?.toISOString() || r.createdAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
    counts: {
      total,
      draft: draftCount,
      submitted: submittedCount + pendingCount,
      underReview: underReviewCount,
      additionalInfoRequired: additionalInfoCount,
      approved: approvedCount,
      rejected: rejectedCount,
      cancelled: cancelledCount,
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
    statusHistory: Array.isArray(r.statusHistory) ? r.statusHistory : [],
    existingOwnerUser,
    potentialDuplicateBiz,
  };
}

export async function updateOnboardingRequestStatus(
  ctx: TenantContext,
  id: string,
  newStatus: OnboardingRequestStatus,
  options?: { notes?: string; rejectionReason?: string; additionalInfoRequested?: string }
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

  // Check valid transition
  const allowed = ALLOWED_ADMIN_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new ProvisioningError(
      `Invalid status transition from '${existing.status}' to '${newStatus}'. Allowed transitions: ${allowed.join(', ') || 'none'}`,
      'INVALID_STATUS_TRANSITION',
      400
    );
  }

  if (newStatus === OnboardingRequestStatus.REJECTED && !options?.rejectionReason?.trim()) {
    throw new ProvisioningError('An explanation is required when declining an application', 'REASON_REQUIRED', 400);
  }

  if (newStatus === OnboardingRequestStatus.ADDITIONAL_INFO_REQUIRED && !options?.additionalInfoRequested?.trim() && !options?.notes?.trim()) {
    throw new ProvisioningError('Please specify what additional information is required from the applicant', 'INFO_REQUEST_REQUIRED', 400);
  }

  const now = new Date();
  const currentHistory = Array.isArray(existing.statusHistory) ? (existing.statusHistory as any[]) : [];
  const actionTitleMap: Record<OnboardingRequestStatus, string> = {
    DRAFT: 'Application Drafted',
    SUBMITTED: 'Application Submitted',
    PENDING: 'Application Received',
    UNDER_REVIEW: 'Under Review',
    ADDITIONAL_INFO_REQUIRED: 'Additional Information Requested',
    APPROVED: 'Application Approved',
    REJECTED: 'Application Declined',
    CANCELLED: 'Application Cancelled',
    PROVISIONED: 'Workspace Provisioned & Active',
  };

  const message =
    newStatus === OnboardingRequestStatus.REJECTED
      ? options?.rejectionReason
      : newStatus === OnboardingRequestStatus.ADDITIONAL_INFO_REQUIRED
      ? options?.additionalInfoRequested || options?.notes
      : options?.notes;

  const nextHistory: StatusHistoryEntry[] = [
    ...currentHistory,
    {
      status: newStatus,
      timestamp: now.toISOString(),
      actorUserId: ctx.user.id,
      actorRole: 'SUPER_ADMIN',
      actorName: ctx.user.name,
      actionTitle: actionTitleMap[newStatus] || `Status Changed to ${newStatus}`,
      notes: options?.notes || null,
      message: message || null,
    },
  ];

  const updated = await prisma.businessOnboardingRequest.update({
    where: { id },
    data: {
      status: newStatus,
      notes: options?.notes !== undefined ? options.notes : existing.notes,
      rejectionReason:
        newStatus === OnboardingRequestStatus.REJECTED
          ? options?.rejectionReason?.trim()
          : existing.rejectionReason,
      additionalInfoRequested:
        newStatus === OnboardingRequestStatus.ADDITIONAL_INFO_REQUIRED
          ? (options?.additionalInfoRequested || options?.notes)?.trim()
          : existing.additionalInfoRequested,
      reviewedAt: now,
      reviewedByUserId: ctx.user.id,
      statusHistory: nextHistory as any,
    },
  });

  await createSystemAuditLog({
    action: `APPLICATION_${newStatus}`,
    entityType: 'BusinessOnboardingRequest',
    entityId: id,
    actorUserId: ctx.user.id,
    previousState: { status: existing.status },
    newState: {
      status: newStatus,
      notes: options?.notes,
      rejectionReason: options?.rejectionReason,
      additionalInfoRequested: options?.additionalInfoRequested,
    },
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
    const prevHistory = Array.isArray(request.statusHistory) ? (request.statusHistory as any[]) : [];
    const provHistory: StatusHistoryEntry[] = [
      ...prevHistory,
      {
        status: OnboardingRequestStatus.PROVISIONED,
        timestamp: new Date().toISOString(),
        actorUserId: ctx.user.id,
        actorRole: 'SUPER_ADMIN',
        actorName: ctx.user.name,
        actionTitle: 'Workspace Provisioned & Active',
        notes: 'Business workspace, owner membership, and standee generated.',
      },
    ];

    const updatedRequest = await tx.businessOnboardingRequest.update({
      where: { id: request.id },
      data: {
        status: OnboardingRequestStatus.PROVISIONED,
        provisionedAt: new Date(),
        provisionedBusinessId: business.id,
        reviewedAt: new Date(),
        reviewedByUserId: ctx.user.id,
        statusHistory: provHistory as any,
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
