/**
 * Reployty V2 — Phase 20 Retention Architecture
 * Campaign Audience Service
 * 
 * Provides tenant-isolated customer resolution, audience abstraction,
 * branch scoping, and consent-gated eligibility filtering.
 */

import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { AudienceType, CampaignChannel, ConsentChannel, Prisma } from '@prisma/client';
import { validateRuleDefinition, compileRuleDefinition } from './segmentationService';

export interface AudienceResolutionParams {
  audienceType: AudienceType;
  segmentId?: string | null;
  branchId?: string | null;
  channel: CampaignChannel;
  specificCustomerIds?: string[];
  audienceFilter?: Record<string, any> | null;
}

export interface ResolvedAudienceResult {
  totalAudienceCount: number;
  consentedCustomerCount: number;
  eligibleCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    branchId: string | null;
  }>;
  suppressedConsentCount: number;
}

export class AudienceResolutionError extends Error {
  code = 'AUDIENCE_RESOLUTION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'AudienceResolutionError';
  }
}

/**
 * Maps CampaignChannel to corresponding ConsentChannel.
 */
export function mapCampaignChannelToConsent(channel: CampaignChannel): ConsentChannel {
  switch (channel) {
    case CampaignChannel.WHATSAPP:
      return ConsentChannel.WHATSAPP;
    case CampaignChannel.SMS:
      return ConsentChannel.SMS;
    case CampaignChannel.EMAIL:
      return ConsentChannel.EMAIL;
    case CampaignChannel.IN_APP:
      return ConsentChannel.NOTIFICATIONS;
    default:
      return ConsentChannel.MARKETING;
  }
}

/**
 * Resolves eligible customers for a campaign within a strict tenant boundary.
 * Strictly filters out any customer who has not explicitly granted channel or marketing consent.
 */
export async function resolveCampaignAudience(
  ctx: TenantContext,
  params: AudienceResolutionParams
): Promise<ResolvedAudienceResult> {
  const businessId = ctx.businessId;

  // 1. Validate branch scoping if branchId provided
  if (params.branchId) {
    const branch = await prisma.branch.findFirst({
      where: {
        id: params.branchId,
        businessId,
      },
    });
    if (!branch) {
      throw new AudienceResolutionError(`Branch [${params.branchId}] not found in business [${businessId}]`);
    }
  }

  // Base customer query scoped strictly to this tenant
  const baseWhere: Prisma.CustomerWhereInput = {
    businessId,
    status: { not: 'BLOCKED' },
  };

  if (params.branchId) {
    baseWhere.branchId = params.branchId;
  }

  // 2. Audience Abstraction Filtering
  switch (params.audienceType) {
    case AudienceType.ALL_CUSTOMERS:
      // All active customers in business/branch
      break;

    case AudienceType.SPECIFIC_CUSTOMER:
      if (!params.specificCustomerIds || params.specificCustomerIds.length === 0) {
        throw new AudienceResolutionError('specificCustomerIds required when audienceType is SPECIFIC_CUSTOMER');
      }
      baseWhere.id = { in: params.specificCustomerIds };
      break;

    case AudienceType.SAVED_SEGMENT: {
      if (!params.segmentId) {
        throw new AudienceResolutionError('segmentId required when audienceType is SAVED_SEGMENT');
      }
      const segment = await prisma.customerSegment.findFirst({
        where: {
          id: params.segmentId,
          businessId,
          status: 'ACTIVE',
        },
      });
      if (!segment) {
        throw new AudienceResolutionError(`Customer segment [${params.segmentId}] not found in business [${businessId}]`);
      }
      if (segment.branchId && params.branchId && segment.branchId !== params.branchId) {
        throw new AudienceResolutionError(`Segment branch [${segment.branchId}] does not match campaign branch [${params.branchId}]`);
      }
      const segmentWhere = compileRuleDefinition(
        validateRuleDefinition(segment.ruleDefinition),
        businessId,
        params.branchId || segment.branchId
      );
      baseWhere.AND = [
        ...(Array.isArray(baseWhere.AND) ? baseWhere.AND : baseWhere.AND ? [baseWhere.AND] : []),
        segmentWhere,
      ];
      break;
    }

    case AudienceType.DYNAMIC_SEGMENT: {
      if (params.audienceFilter) {
        try {
          const validated = validateRuleDefinition(params.audienceFilter);
          const filterWhere = compileRuleDefinition(validated, businessId, params.branchId);
          baseWhere.AND = [
            ...(Array.isArray(baseWhere.AND) ? baseWhere.AND : baseWhere.AND ? [baseWhere.AND] : []),
            filterWhere,
          ];
        } catch {
          const filter = params.audienceFilter;
          if (filter.status) baseWhere.status = filter.status;
          if (filter.minVisits !== undefined) baseWhere.totalVisits = { gte: Number(filter.minVisits) };
          if (filter.minSpendMinor !== undefined) baseWhere.totalSpendMinor = { gte: Number(filter.minSpendMinor) };
        }
      }
      break;
    }

    default:
      break;
  }

  // Fetch candidate customers within tenant
  const candidates = await prisma.customer.findMany({
    where: baseWhere,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      branchId: true,
      marketingConsent: true,
      consents: {
        where: {
          channel: mapCampaignChannelToConsent(params.channel),
          granted: true,
          revokedAt: null,
        },
        select: {
          id: true,
          granted: true,
        },
      },
    },
  });

  const totalAudienceCount = candidates.length;

  // 3. Consent Gating:
  // Customer must either have explicit channel consent record OR explicit marketingConsent=true for the business
  const eligibleCustomers: ResolvedAudienceResult['eligibleCustomers'] = [];
  let suppressedConsentCount = 0;

  for (const c of candidates) {
    const hasChannelConsent = c.consents.length > 0;
    const hasGeneralMarketingConsent = c.marketingConsent === true;

    if (hasChannelConsent || hasGeneralMarketingConsent) {
      eligibleCustomers.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        branchId: c.branchId,
      });
    } else {
      suppressedConsentCount++;
    }
  }

  return {
    totalAudienceCount,
    consentedCustomerCount: eligibleCustomers.length,
    eligibleCustomers,
    suppressedConsentCount,
  };
}
