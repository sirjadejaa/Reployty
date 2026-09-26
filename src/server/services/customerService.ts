import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { CustomerStatus } from '@prisma/client';
import { createAuditLog } from './auditService';

export interface CustomerFilterParams {
  search?: string;
  status?: CustomerStatus;
  limit?: number;
  offset?: number;
}

export interface CreateCustomerDTO {
  name: string;
  phone: string;
  email?: string;
  birthday?: Date;
  branchId?: string;
  marketingConsent?: boolean;
}

/**
 * Retrieves customers strictly scoped to the authenticated tenant.
 * Uses pagination and indexing to prevent loading entire datasets into memory.
 */
export async function getCustomers(
  ctx: TenantContext,
  params: CustomerFilterParams = {}
) {
  requirePermission(ctx, 'CUSTOMERS_VIEW');

  const { search, status, limit = 50, offset = 0 } = params;

  const whereClause: Record<string, unknown> = {
    businessId: ctx.businessId, // HARD TENANT ISOLATION
  };

  if (status) {
    whereClause.status = status;
  }

  if (search && search.trim()) {
    const term = search.trim();
    whereClause.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
      { email: { contains: term, mode: 'insensitive' } },
    ];
  }

  const [customers, totalCount] = await Promise.all([
    prisma.customer.findMany({
      where: whereClause,
      take: Math.min(limit, 100),
      skip: offset,
      orderBy: { lastVisitAt: 'desc' },
      include: {
        loyaltyCards: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    }),
    prisma.customer.count({ where: whereClause }),
  ]);

  return {
    data: customers,
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: offset + customers.length < totalCount,
    },
  };
}

/**
 * Retrieves a customer by ID with tenant isolation verification.
 */
export async function getCustomerById(
  ctx: TenantContext,
  customerId: string
) {
  requirePermission(ctx, 'CUSTOMERS_VIEW');

  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      businessId: ctx.businessId, // HARD TENANT ISOLATION
    },
    include: {
      loyaltyCards: true,
      tags: { include: { tag: true } },
      consents: true,
      notes: { orderBy: { createdAt: 'desc' }, take: 10 },
      events: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  return customer;
}

/**
 * Registers or looks up a customer for this business.
 * Scoped by businessId to allow customers with the same phone at other businesses.
 */
export async function createCustomer(
  ctx: TenantContext,
  dto: CreateCustomerDTO
) {
  requirePermission(ctx, 'CUSTOMERS_EDIT');

  const normalizedPhone = dto.phone.trim();

  // Verify whether customer exists in this business
  const existing = await prisma.customer.findUnique({
    where: {
      businessId_phone: {
        businessId: ctx.businessId,
        phone: normalizedPhone,
      },
    },
  });

  if (existing) {
    return existing;
  }

  const customer = await prisma.$transaction(async tx => {
    const newCustomer = await tx.customer.create({
      data: {
        businessId: ctx.businessId,
        branchId: dto.branchId ?? ctx.branchId,
        name: dto.name.trim(),
        phone: normalizedPhone,
        email: dto.email?.trim().toLowerCase(),
        birthday: dto.birthday,
        marketingConsent: dto.marketingConsent ?? false,
      },
    });

    // Record timeline event
    await tx.customerEvent.create({
      data: {
        businessId: ctx.businessId,
        customerId: newCustomer.id,
        type: 'CUSTOMER_JOINED',
        metadata: {
          source: 'STAFF_MANUAL_REGISTRATION',
          branchId: dto.branchId ?? ctx.branchId,
        },
      },
    });

    return newCustomer;
  });

  await createAuditLog(ctx, {
    action: 'CUSTOMER_CREATED',
    entityType: 'Customer',
    entityId: customer.id,
    newState: { phone: customer.phone, name: customer.name },
  });

  return customer;
}
