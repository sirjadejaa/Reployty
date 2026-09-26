import { prisma } from '../db/client';
import { CustomerSessionContext } from './customerAuthService';
import { ConsentChannel, CustomerEventType } from '@prisma/client';

export class CustomerPwaError extends Error {
  constructor(message: string, public code: string = 'CUSTOMER_PWA_ERROR') {
    super(message);
    this.name = 'CustomerPwaError';
  }
}

/**
 * Resolves a public QR code or business slug into sanitized, public-safe business and branch context.
 * Zero database secrets, staff info, or customer data is exposed.
 */
export async function resolvePublicQr(identifier: string) {
  if (!identifier) {
    throw new CustomerPwaError('Invalid QR identifier', 'INVALID_QR');
  }

  const cleanId = identifier.trim();

  // 1. Try resolving by QRCode.code
  const qrRecord = await prisma.qRCode.findUnique({
    where: { code: cleanId },
    include: {
      business: {
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
          phone: true,
          email: true,
          address: true,
          city: true,
          status: true,
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          status: true,
        },
      },
    },
  });

  if (qrRecord) {
    if (qrRecord.status !== 'ACTIVE' || qrRecord.business.status !== 'ACTIVE') {
      throw new CustomerPwaError('This business or QR code is currently inactive', 'QR_INACTIVE');
    }

    // Increment scan count asynchronously
    prisma.qRCode
      .update({
        where: { id: qrRecord.id },
        data: { scanCount: { increment: 1 } },
      })
      .catch(() => {});

    return {
      qrCode: {
        code: qrRecord.code,
        type: qrRecord.type,
      },
      business: {
        id: qrRecord.business.id,
        name: qrRecord.business.name,
        slug: qrRecord.business.slug,
        category: qrRecord.business.category,
        description: qrRecord.business.description,
        logo: qrRecord.business.logo,
        coverImage: qrRecord.business.coverImage,
        primaryColor: qrRecord.business.primaryColor,
        secondaryColor: qrRecord.business.secondaryColor,
        themePreset: qrRecord.business.themePreset,
        phone: qrRecord.business.phone,
        email: qrRecord.business.email,
        address: qrRecord.business.address,
        city: qrRecord.business.city,
      },
      branch: qrRecord.branch && qrRecord.branch.status === 'ACTIVE'
        ? {
            id: qrRecord.branch.id,
            name: qrRecord.branch.name,
            code: qrRecord.branch.code,
            address: qrRecord.branch.address,
          }
        : null,
    };
  }

  // 2. Fallback: try resolving by Business.slug directly
  const business = await prisma.business.findUnique({
    where: { slug: cleanId },
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
      phone: true,
      email: true,
      address: true,
      city: true,
      status: true,
      branches: {
        where: { isMainBranch: true, status: 'ACTIVE' },
        take: 1,
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
        },
      },
    },
  });

  if (!business) {
    throw new CustomerPwaError('QR code or business not found', 'QR_NOT_FOUND');
  }

  if (business.status !== 'ACTIVE') {
    throw new CustomerPwaError('This business is currently unavailable', 'BUSINESS_UNAVAILABLE');
  }

  const mainBranch = business.branches.length > 0 ? business.branches[0] : null;

  return {
    qrCode: null,
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      category: business.category,
      description: business.description,
      logo: business.logo,
      coverImage: business.coverImage,
      primaryColor: business.primaryColor,
      secondaryColor: business.secondaryColor,
      themePreset: business.themePreset,
      phone: business.phone,
      email: business.email,
      address: business.address,
      city: business.city,
    },
    branch: mainBranch,
  };
}

/**
 * Retrieves the full authenticated customer profile and context.
 */
export async function getCustomerProfile(ctx: CustomerSessionContext) {
  const [customer, consents, recentEvents] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: ctx.customerId },
      select: {
        id: true,
        businessId: true,
        branchId: true,
        name: true,
        phone: true,
        email: true,
        birthday: true,
        status: true,
        marketingConsent: true,
        totalVisits: true,
        stampsBalance: true,
        pointsBalance: true,
        joinedAt: true,
        lastVisitAt: true,
      },
    }),
    prisma.customerConsent.findMany({
      where: { customerId: ctx.customerId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customerEvent.findMany({
      where: { customerId: ctx.customerId, businessId: ctx.businessId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  if (!customer) {
    throw new CustomerPwaError('Customer profile not found', 'CUSTOMER_NOT_FOUND');
  }

  return {
    customer,
    consents,
    recentEvents,
    business: ctx.business,
    loyaltyState: {
      status: 'PHASE_7_COMING_SOON',
      message: 'Digital stamps and reward redemptions will unlock here in Phase 7.',
      previewStamps: customer.stampsBalance,
      previewPoints: customer.pointsBalance,
    },
  };
}

export interface UpdateCustomerProfileInput {
  name?: string;
  email?: string;
  birthday?: string | Date;
}

/**
 * Updates customer personal information.
 * Enforces strict ownership: only updates ctx.customerId in ctx.businessId.
 */
export async function updateCustomerProfile(ctx: CustomerSessionContext, input: UpdateCustomerProfileInput) {
  const updateData: Record<string, unknown> = {};

  if (input.name !== undefined) {
    updateData.name = input.name.trim() || 'Valued Regular';
  }
  if (input.email !== undefined) {
    updateData.email = input.email ? input.email.trim().toLowerCase() : null;
  }
  if (input.birthday !== undefined) {
    updateData.birthday = input.birthday ? new Date(input.birthday) : null;
  }

  const updated = await prisma.customer.update({
    where: {
      id: ctx.customerId,
      businessId: ctx.businessId,
    },
    data: updateData,
  });

  // Record timeline event
  await prisma.customerEvent.create({
    data: {
      businessId: ctx.businessId,
      customerId: ctx.customerId,
      type: CustomerEventType.PURCHASE_RECORDED, // Using existing event enum for profile activity or custom
      metadata: {
        action: 'PROFILE_UPDATED',
        updatedFields: Object.keys(updateData),
      },
    },
  });

  return updated;
}

export interface UpdateCustomerConsentInput {
  channel: ConsentChannel;
  granted: boolean;
}

/**
 * Updates or creates customer consent record.
 */
export async function updateCustomerConsent(ctx: CustomerSessionContext, input: UpdateCustomerConsentInput) {
  const existing = await prisma.customerConsent.findFirst({
    where: {
      customerId: ctx.customerId,
      channel: input.channel,
    },
  });

  let consentRecord;
  if (existing) {
    consentRecord = await prisma.customerConsent.update({
      where: { id: existing.id },
      data: {
        granted: input.granted,
        revokedAt: input.granted ? null : new Date(),
        updatedAt: new Date(),
      },
    });
  } else {
    consentRecord = await prisma.customerConsent.create({
      data: {
        customerId: ctx.customerId,
        channel: input.channel,
        granted: input.granted,
        source: 'PWA_SETTINGS',
        version: '1.0',
        revokedAt: input.granted ? null : new Date(),
      },
    });
  }

  // If channel is MARKETING, sync customer.marketingConsent
  if (input.channel === ConsentChannel.MARKETING) {
    await prisma.customer.update({
      where: { id: ctx.customerId },
      data: { marketingConsent: input.granted },
    });
  }

  // Record audit trail event
  await prisma.customerEvent.create({
    data: {
      businessId: ctx.businessId,
      customerId: ctx.customerId,
      type: CustomerEventType.PURCHASE_RECORDED,
      metadata: {
        action: 'CONSENT_UPDATED',
        channel: input.channel,
        granted: input.granted,
        timestamp: new Date().toISOString(),
      },
    },
  });

  return consentRecord;
}

/**
 * Retrieves customer timeline activity.
 */
export async function getCustomerActivity(ctx: CustomerSessionContext) {
  const events = await prisma.customerEvent.findMany({
    where: {
      customerId: ctx.customerId,
      businessId: ctx.businessId,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return events;
}
