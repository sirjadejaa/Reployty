import crypto from 'crypto';
import { prisma } from '../db/client';
import { requireUsageLimit } from './entitlementService';
import { ConsentChannel, CustomerEventType, CustomerStatus } from '@prisma/client';

const CUSTOMER_SESSION_EXPIRY_DAYS = 30;

export class CustomerAuthError extends Error {
  constructor(message: string, public code: string = 'CUSTOMER_AUTH_ERROR') {
    super(message);
    this.name = 'CustomerAuthError';
  }
}

export interface CustomerSessionContext {
  sessionToken: string;
  customerId: string;
  businessId: string;
  customer: {
    id: string;
    businessId: string;
    branchId: string | null;
    name: string;
    phone: string;
    email: string | null;
    birthday: Date | null;
    status: CustomerStatus;
    marketingConsent: boolean;
    totalVisits: number;
    stampsBalance: number;
    pointsBalance: number;
    joinedAt: Date;
    lastVisitAt: Date | null;
  };
  business: {
    id: string;
    name: string;
    slug: string;
    category: string;
    themePreset: string;
    primaryColor: string;
    logo: string | null;
  };
}

/**
 * Creates a server-persisted, cryptographically secure customer session.
 */
export async function createCustomerSession(
  customerId: string,
  businessId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.customerSession.create({
    data: {
      sessionToken,
      customerId,
      businessId,
      expiresAt,
      ipAddress,
      userAgent,
    },
    include: {
      customer: true,
      business: true,
    },
  });

  return session;
}

/**
 * Validates an active customer session token.
 * Ensures the session is not revoked, has not expired, and both customer and business are ACTIVE.
 */
export async function validateCustomerSession(sessionToken: string): Promise<CustomerSessionContext | null> {
  if (!sessionToken) return null;

  const session = await prisma.customerSession.findUnique({
    where: { sessionToken },
    include: {
      customer: {
        include: {
          consents: true,
        },
      },
      business: true,
    },
  });

  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.customer.status !== 'ACTIVE') return null;
  if (session.business.status !== 'ACTIVE') return null;

  return {
    sessionToken: session.sessionToken,
    customerId: session.customerId,
    businessId: session.businessId,
    customer: {
      id: session.customer.id,
      businessId: session.customer.businessId,
      branchId: session.customer.branchId,
      name: session.customer.name,
      phone: session.customer.phone,
      email: session.customer.email,
      birthday: session.customer.birthday,
      status: session.customer.status,
      marketingConsent: session.customer.marketingConsent,
      totalVisits: session.customer.totalVisits,
      stampsBalance: session.customer.stampsBalance,
      pointsBalance: session.customer.pointsBalance,
      joinedAt: session.customer.joinedAt,
      lastVisitAt: session.customer.lastVisitAt,
    },
    business: {
      id: session.business.id,
      name: session.business.name,
      slug: session.business.slug,
      category: session.business.category,
      themePreset: session.business.themePreset,
      primaryColor: session.business.primaryColor,
      logo: session.business.logo,
    },
  };
}

/**
 * Revokes an active customer session.
 */
export async function revokeCustomerSession(sessionToken: string) {
  return prisma.customerSession.updateMany({
    where: { sessionToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export interface CustomerRegistrationData {
  name?: string;
  email?: string;
  birthday?: Date;
  marketingConsent?: boolean;
  branchId?: string;
  source?: string;
}

/**
 * Concurrency-safe lookup or creation of a customer record.
 * Uses database unique constraint @@unique([businessId, phone]).
 */
export async function findOrCreateCustomer(
  businessId: string,
  normalizedPhone: string,
  data: CustomerRegistrationData = {}
) {
  // Execute in a transaction to prevent race conditions
  return prisma.$transaction(async tx => {
    // 1. Look up existing customer in this business
    let customer = await tx.customer.findUnique({
      where: {
        businessId_phone: {
          businessId,
          phone: normalizedPhone,
        },
      },
    });

    const isNew = !customer;

    if (!customer) {
      // Check customer usage limit
      await requireUsageLimit(businessId, 'maxCustomers');

      // 2. Create customer
      customer = await tx.customer.create({
        data: {
          businessId,
          branchId: data.branchId || null,
          name: data.name?.trim() || 'New Regular',
          phone: normalizedPhone,
          email: data.email?.trim().toLowerCase() || null,
          birthday: data.birthday || null,
          marketingConsent: data.marketingConsent ?? false,
          status: CustomerStatus.ACTIVE,
          totalVisits: 1,
          lastVisitAt: new Date(),
        },
      });

      // Record CUSTOMER_JOINED timeline event
      await tx.customerEvent.create({
        data: {
          businessId,
          customerId: customer.id,
          type: CustomerEventType.CUSTOMER_JOINED,
          metadata: {
            source: data.source || 'PWA_QR_SCAN',
            phone: normalizedPhone,
            branchId: data.branchId || null,
          },
        },
      });

      // Record initial required consent
      await tx.customerConsent.create({
        data: {
          customerId: customer.id,
          channel: ConsentChannel.NOTIFICATIONS,
          granted: true,
          source: data.source || 'PWA_TERMS_PRIVACY',
          version: '1.0',
        },
      });

      // Record optional marketing consent if granted
      if (data.marketingConsent) {
        await tx.customerConsent.create({
          data: {
            customerId: customer.id,
            channel: ConsentChannel.MARKETING,
            granted: true,
            source: data.source || 'PWA_MARKETING_OPT_IN',
            version: '1.0',
          },
        });
      }
    } else {
      // Returning customer: update last visit and visit count
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          lastVisitAt: new Date(),
          totalVisits: { increment: 1 },
          // If name was provided and existing was default placeholder, update name
          name: data.name?.trim() && customer.name === 'New Regular' ? data.name.trim() : customer.name,
        },
      });

      // Record CUSTOMER_LOGIN event
      await tx.customerEvent.create({
        data: {
          businessId,
          customerId: customer.id,
          type: CustomerEventType.CUSTOMER_REACTIVATED,
          metadata: {
            source: data.source || 'PWA_QR_LOGIN',
          },
        },
      });
    }

    return { customer, isNew };
  });
}
