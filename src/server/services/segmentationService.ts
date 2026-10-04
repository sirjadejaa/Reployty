/**
 * Reployty V2 — Phase 21 Advanced & Dynamic Segmentation Builder
 * Segmentation Service & Rule Engine
 * 
 * Provides:
 * - Strict field and operator whitelisting
 * - Schema validation and nesting depth enforcement (max 3 levels)
 * - Safe server-side query compilation to Prisma CustomerWhereInput
 * - Multi-tenant isolation & branch scoping
 * - Live segment evaluation, count, preview, and paginated membership
 * - Audit logging and campaign integration safeguards
 */

import { prisma } from '../db/client';
import { TenantContext, PermissionDeniedError } from '../auth/tenantContext';
import { Prisma, CustomerStatus, SegmentStatus, SegmentType, ConsentChannel } from '@prisma/client';
import { createAuditLog } from './auditService';
import {
  SegmentField,
  SegmentOperator,
  SegmentLogic,
  SegmentCondition,
  SegmentConditionGroup,
  SegmentRuleDefinition,
  SegmentItem,
  SegmentPreviewResult,
  CreateSegmentDTO,
  UpdateSegmentDTO,
  SEGMENT_FIELDS,
  SEGMENT_OPERATORS,
} from '../../types/segment';

export { SEGMENT_FIELDS, SEGMENT_OPERATORS };

export class SegmentValidationError extends Error {
  code = 'SEGMENT_VALIDATION_ERROR';
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SegmentValidationError';
  }
}

export class SegmentNotFoundError extends Error {
  code = 'SEGMENT_NOT_FOUND';
  status = 404;
  constructor(message = 'Customer segment not found') {
    super(message);
    this.name = 'SegmentNotFoundError';
  }
}

export class SegmentInUseError extends Error {
  code = 'SEGMENT_IN_USE';
  status = 409;
  constructor(message = 'Cannot delete segment referenced by campaigns. Archive it instead.') {
    super(message);
    this.name = 'SegmentInUseError';
  }
}

// ============================================================================
// 1. Field Whitelist & Operator Mapping
// ============================================================================

type FieldType = 'numeric' | 'text' | 'date' | 'boolean' | 'enum' | 'tag' | 'branch';

interface FieldRuleMeta {
  type: FieldType;
  allowedOperators: SegmentOperator[];
}

const NUMERIC_OPERATORS: SegmentOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
];

const TEXT_OPERATORS: SegmentOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'STARTS_WITH',
  'equals',
  'not_equals',
  'contains',
];

const DATE_OPERATORS: SegmentOperator[] = [
  'BEFORE',
  'AFTER',
  'OLDER_THAN_DAYS',
  'WITHIN_LAST_DAYS',
  'BETWEEN',
  'within_days',
  'before_days',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
];

const BOOLEAN_OPERATORS: SegmentOperator[] = [
  'IS_TRUE',
  'IS_FALSE',
  'EQUALS',
  'equals',
];

const ENUM_OPERATORS: SegmentOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'equals',
  'not_equals',
];

const TAG_OPERATORS: SegmentOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'equals',
  'not_equals',
];

const FIELD_RULES: Record<SegmentField, FieldRuleMeta> = {
  // Profile
  name: { type: 'text', allowedOperators: TEXT_OPERATORS },
  phone: { type: 'text', allowedOperators: TEXT_OPERATORS },
  email: { type: 'text', allowedOperators: TEXT_OPERATORS },
  status: { type: 'enum', allowedOperators: ENUM_OPERATORS },
  birthday: { type: 'date', allowedOperators: DATE_OPERATORS },
  joinedAt: { type: 'date', allowedOperators: DATE_OPERATORS },
  customer_since: { type: 'date', allowedOperators: DATE_OPERATORS },

  // Behavioral & Activity
  visit_count: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  totalVisits: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  days_since_last_visit: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  last_visit_at: { type: 'date', allowedOperators: DATE_OPERATORS },
  lastVisitAt: { type: 'date', allowedOperators: DATE_OPERATORS },
  totalSpendMinor: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },

  // Loyalty
  current_stamp_balance: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  stampsBalance: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  points_balance: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  pointsBalance: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  has_completed_loyalty_card: { type: 'boolean', allowedOperators: BOOLEAN_OPERATORS },

  // Rewards & Offers
  reward_claim_count: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  reward_redemption_count: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  offer_redemption_count: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  last_reward_redeemed_at: { type: 'date', allowedOperators: DATE_OPERATORS },
  last_offer_redeemed_at: { type: 'date', allowedOperators: DATE_OPERATORS },

  // Reviews & Feedback
  review_count: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  average_rating: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },
  last_rating: { type: 'numeric', allowedOperators: NUMERIC_OPERATORS },

  // Consents
  marketing_consent: { type: 'boolean', allowedOperators: BOOLEAN_OPERATORS },
  whatsapp_consent: { type: 'boolean', allowedOperators: BOOLEAN_OPERATORS },
  sms_consent: { type: 'boolean', allowedOperators: BOOLEAN_OPERATORS },
  email_consent: { type: 'boolean', allowedOperators: BOOLEAN_OPERATORS },

  // Tags & Branch
  tagId: { type: 'tag', allowedOperators: TAG_OPERATORS },
  has_tag: { type: 'tag', allowedOperators: TAG_OPERATORS },
  does_not_have_tag: { type: 'tag', allowedOperators: TAG_OPERATORS },
  branchId: { type: 'branch', allowedOperators: ENUM_OPERATORS },
};

// ============================================================================
// 2. Strict Rule Validation Engine
// ============================================================================

export function normalizeOperator(op: string): SegmentOperator {
  return op as SegmentOperator;
}

export function normalizeLogic(logic?: string, matchType?: string): SegmentLogic {
  if (logic === 'OR' || matchType === 'ANY') return 'OR';
  return 'AND';
}

export function validateCondition(cond: any): SegmentCondition {
  if (!cond || typeof cond !== 'object') {
    throw new SegmentValidationError('Invalid condition: must be an object');
  }

  const field = cond.field as SegmentField;
  if (!field || !(field in FIELD_RULES)) {
    throw new SegmentValidationError(`Invalid segment field: "${String(field)}". Field is not whitelisted.`);
  }

  const operator = cond.operator as SegmentOperator;
  if (!operator || !SEGMENT_OPERATORS.includes(operator)) {
    throw new SegmentValidationError(`Invalid segment operator: "${String(operator)}". Operator is not whitelisted.`);
  }

  const meta = FIELD_RULES[field];
  if (!meta.allowedOperators.includes(operator)) {
    throw new SegmentValidationError(
      `Operator "${operator}" is not supported for field "${field}" (type: ${meta.type})`
    );
  }

  const value = cond.value;

  // Validate value types
  switch (meta.type) {
    case 'numeric': {
      if (value === undefined || value === null || isNaN(Number(value))) {
        throw new SegmentValidationError(`Field "${field}" requires a numeric value`);
      }
      const num = Number(value);
      if (['visit_count', 'totalVisits', 'days_since_last_visit', 'current_stamp_balance', 'stampsBalance', 'points_balance', 'pointsBalance', 'totalSpendMinor'].includes(field)) {
        if (num < 0) {
          throw new SegmentValidationError(`Field "${field}" value cannot be negative`);
        }
      }
      if (['average_rating', 'last_rating'].includes(field)) {
        if (num < 1 || num > 5) {
          throw new SegmentValidationError(`Field "${field}" rating must be between 1 and 5`);
        }
      }
      break;
    }

    case 'boolean': {
      if (operator !== 'IS_TRUE' && operator !== 'IS_FALSE') {
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          throw new SegmentValidationError(`Field "${field}" requires a boolean value`);
        }
      }
      break;
    }

    case 'date': {
      if (['within_days', 'before_days', 'OLDER_THAN_DAYS', 'WITHIN_LAST_DAYS'].includes(operator)) {
        if (value === undefined || value === null || isNaN(Number(value)) || Number(value) < 0) {
          throw new SegmentValidationError(`Field "${field}" with operator "${operator}" requires a non-negative number of days`);
        }
      } else if (operator === 'BETWEEN') {
        if (!Array.isArray(value) || value.length !== 2 || isNaN(new Date(value[0]).getTime()) || isNaN(new Date(value[1]).getTime())) {
          throw new SegmentValidationError(`Field "${field}" with BETWEEN operator requires an array of 2 valid date strings`);
        }
      } else {
        if (!value || isNaN(new Date(value).getTime())) {
          throw new SegmentValidationError(`Field "${field}" requires a valid date string`);
        }
      }
      break;
    }

    case 'text': {
      if (value === undefined || value === null || String(value).trim() === '') {
        throw new SegmentValidationError(`Field "${field}" requires a non-empty text string`);
      }
      break;
    }

    case 'enum': {
      if (field === 'status') {
        const validStatuses: CustomerStatus[] = ['ACTIVE', 'INACTIVE', 'BLOCKED'];
        if (Array.isArray(value)) {
          for (const item of value) {
            if (!validStatuses.includes(item)) {
              throw new SegmentValidationError(`Invalid customer status "${item}"`);
            }
          }
        } else if (!validStatuses.includes(value)) {
          throw new SegmentValidationError(`Invalid customer status "${value}"`);
        }
      }
      break;
    }

    case 'tag': {
      if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
        throw new SegmentValidationError(`Tag condition requires a tag ID`);
      }
      break;
    }

    case 'branch': {
      if (value === undefined || value === null) {
        throw new SegmentValidationError(`Branch condition requires a branch ID`);
      }
      break;
    }
  }

  return {
    field,
    operator,
    value,
  };
}

export function validateRuleDefinition(ruleDef: any, depth = 1): SegmentRuleDefinition {
  if (depth > 3) {
    throw new SegmentValidationError('Nesting depth exceeds maximum allowed limit of 3 levels');
  }

  if (!ruleDef || typeof ruleDef !== 'object') {
    throw new SegmentValidationError('Invalid segment rule definition: must be an object');
  }

  const logic = normalizeLogic(ruleDef.logic, ruleDef.matchType);
  const validatedConditions: SegmentCondition[] = [];
  const validatedGroups: SegmentConditionGroup[] = [];

  const rawConditions = Array.isArray(ruleDef.conditions) ? ruleDef.conditions : [];
  for (const c of rawConditions) {
    validatedConditions.push(validateCondition(c));
  }

  const rawGroups = Array.isArray(ruleDef.groups) ? ruleDef.groups : [];
  for (const g of rawGroups) {
    const validatedSubGroup = validateRuleDefinition(g, depth + 1);
    validatedGroups.push({
      logic: validatedSubGroup.logic || 'AND',
      conditions: validatedSubGroup.conditions,
      groups: validatedSubGroup.groups,
    });
  }

  // Support legacy flat rule definition: e.g. { minVisits: 5, status: ['ACTIVE'] }
  if (rawConditions.length === 0 && rawGroups.length === 0) {
    if (ruleDef.minVisits !== undefined) {
      validatedConditions.push({
        field: 'totalVisits',
        operator: 'GREATER_THAN_OR_EQUAL',
        value: Number(ruleDef.minVisits),
      });
    }
    if (ruleDef.status !== undefined) {
      const statusVal = Array.isArray(ruleDef.status) ? ruleDef.status[0] : ruleDef.status;
      validatedConditions.push({
        field: 'status',
        operator: 'EQUALS',
        value: statusVal,
      });
    }
    if (ruleDef.minSpendMinor !== undefined) {
      validatedConditions.push({
        field: 'totalSpendMinor',
        operator: 'GREATER_THAN_OR_EQUAL',
        value: Number(ruleDef.minSpendMinor),
      });
    }
  }

  if (validatedConditions.length === 0 && validatedGroups.length === 0) {
    throw new SegmentValidationError('Rule definition must contain at least one condition or group');
  }

  return {
    logic,
    matchType: logic === 'OR' ? 'ANY' : 'ALL',
    conditions: validatedConditions,
    groups: validatedGroups.length > 0 ? validatedGroups : undefined,
  };
}

// ============================================================================
// 3. Query Compiler (translates rules to Prisma CustomerWhereInput)
// ============================================================================

export function compileSingleCondition(cond: SegmentCondition): Prisma.CustomerWhereInput {
  const { field, operator, value } = cond;
  const now = new Date();

  switch (field) {
    // ----------------------------------------------------
    // Profile text fields
    // ----------------------------------------------------
    case 'name':
    case 'phone':
    case 'email': {
      const strVal = String(value).trim();
      if (operator === 'EQUALS' || operator === 'equals') return { [field]: { equals: strVal, mode: 'insensitive' } };
      if (operator === 'NOT_EQUALS' || operator === 'not_equals') return { [field]: { not: { equals: strVal, mode: 'insensitive' } } };
      if (operator === 'CONTAINS' || operator === 'contains') return { [field]: { contains: strVal, mode: 'insensitive' } };
      if (operator === 'STARTS_WITH') return { [field]: { startsWith: strVal, mode: 'insensitive' } };
      break;
    }

    case 'status': {
      if (Array.isArray(value)) {
        if (operator === 'IN') return { status: { in: value as CustomerStatus[] } };
        if (operator === 'NOT_IN') return { status: { notIn: value as CustomerStatus[] } };
      }
      const statusVal = String(value) as CustomerStatus;
      if (operator === 'EQUALS' || operator === 'equals') return { status: statusVal };
      if (operator === 'NOT_EQUALS' || operator === 'not_equals') return { status: { not: statusVal } };
      break;
    }

    // ----------------------------------------------------
    // Profile & Behavioral dates
    // ----------------------------------------------------
    case 'birthday':
    case 'joinedAt':
    case 'customer_since':
    case 'last_visit_at':
    case 'lastVisitAt': {
      const targetColumn = field === 'customer_since' ? 'joinedAt' : field === 'last_visit_at' ? 'lastVisitAt' : field;
      if (operator === 'within_days' || operator === 'WITHIN_LAST_DAYS') {
        const days = Number(value);
        const cutoff = new Date(now.getTime() - days * 86400000);
        return { [targetColumn]: { gte: cutoff } };
      }
      if (operator === 'before_days' || operator === 'OLDER_THAN_DAYS') {
        const days = Number(value);
        const cutoff = new Date(now.getTime() - days * 86400000);
        return { [targetColumn]: { lt: cutoff } };
      }
      if (operator === 'BEFORE') {
        return { [targetColumn]: { lt: new Date(value) } };
      }
      if (operator === 'AFTER') {
        return { [targetColumn]: { gt: new Date(value) } };
      }
      if (operator === 'BETWEEN' && Array.isArray(value)) {
        return { [targetColumn]: { gte: new Date(value[0]), lte: new Date(value[1]) } };
      }
      if (operator === 'greater_than' || operator === 'GREATER_THAN') {
        return { [targetColumn]: { gt: new Date(value) } };
      }
      if (operator === 'greater_than_or_equal' || operator === 'GREATER_THAN_OR_EQUAL') {
        return { [targetColumn]: { gte: new Date(value) } };
      }
      if (operator === 'less_than' || operator === 'LESS_THAN') {
        return { [targetColumn]: { lt: new Date(value) } };
      }
      if (operator === 'less_than_or_equal' || operator === 'LESS_THAN_OR_EQUAL') {
        return { [targetColumn]: { lte: new Date(value) } };
      }
      break;
    }

    // ----------------------------------------------------
    // Days since last visit
    // ----------------------------------------------------
    case 'days_since_last_visit': {
      const days = Number(value);
      const cutoff = new Date(now.getTime() - days * 86400000);
      if (operator === 'GREATER_THAN' || operator === 'greater_than') {
        return { OR: [{ lastVisitAt: { lt: cutoff } }, { lastVisitAt: null }] };
      }
      if (operator === 'GREATER_THAN_OR_EQUAL' || operator === 'greater_than_or_equal' || operator === 'OLDER_THAN_DAYS') {
        return { OR: [{ lastVisitAt: { lte: cutoff } }, { lastVisitAt: null }] };
      }
      if (operator === 'LESS_THAN' || operator === 'less_than') {
        return { lastVisitAt: { gt: cutoff } };
      }
      if (operator === 'LESS_THAN_OR_EQUAL' || operator === 'less_than_or_equal' || operator === 'WITHIN_LAST_DAYS') {
        return { lastVisitAt: { gte: cutoff } };
      }
      break;
    }

    // ----------------------------------------------------
    // Numeric Customer columns
    // ----------------------------------------------------
    case 'visit_count':
    case 'totalVisits':
    case 'totalSpendMinor':
    case 'current_stamp_balance':
    case 'stampsBalance':
    case 'points_balance':
    case 'pointsBalance': {
      const targetColumn = field === 'visit_count' ? 'totalVisits' : field === 'current_stamp_balance' ? 'stampsBalance' : field === 'points_balance' ? 'pointsBalance' : field;
      const numVal = Number(value);
      if (operator === 'EQUALS' || operator === 'equals') return { [targetColumn]: numVal };
      if (operator === 'NOT_EQUALS' || operator === 'not_equals') return { [targetColumn]: { not: numVal } };
      if (operator === 'GREATER_THAN' || operator === 'greater_than') return { [targetColumn]: { gt: numVal } };
      if (operator === 'GREATER_THAN_OR_EQUAL' || operator === 'greater_than_or_equal') return { [targetColumn]: { gte: numVal } };
      if (operator === 'LESS_THAN' || operator === 'less_than') return { [targetColumn]: { lt: numVal } };
      if (operator === 'LESS_THAN_OR_EQUAL' || operator === 'less_than_or_equal') return { [targetColumn]: { lte: numVal } };
      break;
    }

    // ----------------------------------------------------
    // Loyalty relations
    // ----------------------------------------------------
    case 'has_completed_loyalty_card': {
      const isTrue = operator === 'IS_TRUE' || value === true || value === 'true';
      if (isTrue) {
        return { loyaltyCards: { some: { status: 'COMPLETED' } } };
      } else {
        return { loyaltyCards: { none: { status: 'COMPLETED' } } };
      }
    }

    // ----------------------------------------------------
    // Reward / Offer relations
    // ----------------------------------------------------
    case 'reward_claim_count':
    case 'reward_redemption_count': {
      const numVal = Number(value);
      if (numVal <= 0 && (operator === 'EQUALS' || operator === 'equals')) {
        return { rewardRedemptions: { none: { status: 'REDEEMED' } } };
      }
      return { rewardRedemptions: { some: { status: 'REDEEMED' } } };
    }

    case 'offer_redemption_count': {
      const numVal = Number(value);
      if (numVal <= 0 && (operator === 'EQUALS' || operator === 'equals')) {
        return { offerRedemptions: { none: {} } };
      }
      return { offerRedemptions: { some: {} } };
    }

    case 'last_reward_redeemed_at': {
      if (operator === 'within_days' || operator === 'WITHIN_LAST_DAYS') {
        const days = Number(value);
        const cutoff = new Date(now.getTime() - days * 86400000);
        return { rewardRedemptions: { some: { redeemedAt: { gte: cutoff } } } };
      }
      if (operator === 'before_days' || operator === 'OLDER_THAN_DAYS') {
        const days = Number(value);
        const cutoff = new Date(now.getTime() - days * 86400000);
        return { rewardRedemptions: { some: { redeemedAt: { lt: cutoff } } } };
      }
      break;
    }

    case 'last_offer_redeemed_at': {
      if (operator === 'within_days' || operator === 'WITHIN_LAST_DAYS') {
        const days = Number(value);
        const cutoff = new Date(now.getTime() - days * 86400000);
        return { offerRedemptions: { some: { redeemedAt: { gte: cutoff } } } };
      }
      break;
    }

    // ----------------------------------------------------
    // Reviews & Feedback relations
    // ----------------------------------------------------
    case 'review_count': {
      const numVal = Number(value);
      if (numVal <= 0 && (operator === 'EQUALS' || operator === 'equals')) {
        return { reviewFeedbacks: { none: {} } };
      }
      return { reviewFeedbacks: { some: {} } };
    }

    case 'average_rating':
    case 'last_rating': {
      const rating = Number(value);
      if (operator === 'GREATER_THAN' || operator === 'greater_than') {
        return { reviewFeedbacks: { some: { rating: { gt: rating } } } };
      }
      if (operator === 'GREATER_THAN_OR_EQUAL' || operator === 'greater_than_or_equal') {
        return { reviewFeedbacks: { some: { rating: { gte: rating } } } };
      }
      if (operator === 'LESS_THAN' || operator === 'less_than') {
        return { reviewFeedbacks: { some: { rating: { lt: rating } } } };
      }
      if (operator === 'LESS_THAN_OR_EQUAL' || operator === 'less_than_or_equal') {
        return { reviewFeedbacks: { some: { rating: { lte: rating } } } };
      }
      if (operator === 'EQUALS' || operator === 'equals') {
        return { reviewFeedbacks: { some: { rating } } };
      }
      break;
    }

    // ----------------------------------------------------
    // Consents
    // ----------------------------------------------------
    case 'marketing_consent': {
      const isTrue = operator === 'IS_TRUE' || value === true || value === 'true';
      return { marketingConsent: isTrue };
    }

    case 'whatsapp_consent':
    case 'sms_consent':
    case 'email_consent': {
      const channelMap: Record<string, ConsentChannel> = {
        whatsapp_consent: ConsentChannel.WHATSAPP,
        sms_consent: ConsentChannel.SMS,
        email_consent: ConsentChannel.EMAIL,
      };
      const channel = channelMap[field];
      const isTrue = operator === 'IS_TRUE' || value === true || value === 'true';
      if (isTrue) {
        return { consents: { some: { channel, granted: true, revokedAt: null } } };
      } else {
        return { consents: { none: { channel, granted: true, revokedAt: null } } };
      }
    }

    // ----------------------------------------------------
    // Tags
    // ----------------------------------------------------
    case 'tagId':
    case 'has_tag': {
      if (Array.isArray(value)) {
        return { tags: { some: { tagId: { in: value } } } };
      }
      const tagId = String(value);
      if (operator === 'NOT_EQUALS' || operator === 'not_equals') {
        return { tags: { none: { tagId } } };
      }
      return { tags: { some: { tagId } } };
    }

    case 'does_not_have_tag': {
      const tagId = String(value);
      return { tags: { none: { tagId } } };
    }

    // ----------------------------------------------------
    // Branch
    // ----------------------------------------------------
    case 'branchId': {
      if (Array.isArray(value)) {
        return { branchId: { in: value } };
      }
      const branchId = String(value);
      if (operator === 'NOT_EQUALS' || operator === 'not_equals') {
        return { branchId: { not: branchId } };
      }
      return { branchId };
    }
  }

  return {};
}

export function compileRuleDefinition(
  ruleDef: SegmentRuleDefinition,
  businessId: string,
  scopedBranchId?: string | null
): Prisma.CustomerWhereInput {
  const rootClauses: Prisma.CustomerWhereInput[] = [{ businessId }];

  if (scopedBranchId) {
    rootClauses.push({ branchId: scopedBranchId });
  }

  function compileGroup(group: SegmentRuleDefinition | SegmentConditionGroup): Prisma.CustomerWhereInput {
    const subClauses: Prisma.CustomerWhereInput[] = [];

    if (group.conditions && group.conditions.length > 0) {
      for (const cond of group.conditions) {
        const clause = compileSingleCondition(cond);
        if (Object.keys(clause).length > 0) {
          subClauses.push(clause);
        }
      }
    }

    if (group.groups && group.groups.length > 0) {
      for (const subGroup of group.groups) {
        const nestedClause = compileGroup(subGroup);
        if (Object.keys(nestedClause).length > 0) {
          subClauses.push(nestedClause);
        }
      }
    }

    if (subClauses.length === 0) return {};

    const logic = normalizeLogic(group.logic, (group as any).matchType);
    if (logic === 'OR') {
      return { OR: subClauses };
    } else {
      return { AND: subClauses };
    }
  }

  const compiled = compileGroup(ruleDef);
  if (Object.keys(compiled).length > 0) {
    rootClauses.push(compiled);
  }

  return { AND: rootClauses };
}

// ============================================================================
// 4. Authorization Helpers
// ============================================================================

export function checkSegmentViewAuth(ctx: TenantContext): void {
  const hasView = ctx.hasPermission('SEGMENTS_VIEW') || ctx.hasPermission('CUSTOMERS_VIEW');
  if (!hasView) {
    throw new PermissionDeniedError('SEGMENTS_VIEW');
  }
}

export function checkSegmentManageAuth(ctx: TenantContext): void {
  // Operational Staff is strictly denied from managing segments
  if (ctx.roleName === 'STAFF') {
    throw new PermissionDeniedError('SEGMENTS_MANAGE');
  }
  const hasManage = ctx.hasPermission('SEGMENTS_MANAGE') || ctx.hasPermission('CUSTOMERS_EDIT');
  if (!hasManage) {
    throw new PermissionDeniedError('SEGMENTS_MANAGE');
  }
}

// ============================================================================
// 5. Segment CRUD & Evaluation Functions
// ============================================================================

/**
 * Creates a new customer segment.
 */
export async function createSegment(
  ctx: TenantContext,
  dto: CreateSegmentDTO
): Promise<SegmentItem> {
  checkSegmentManageAuth(ctx);

  const trimmedName = (dto.name || '').trim();
  if (!trimmedName) {
    throw new SegmentValidationError('Segment name is required and cannot be empty');
  }

  if (dto.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: dto.branchId, businessId: ctx.businessId },
    });
    if (!branch) {
      throw new SegmentValidationError(`Branch [${dto.branchId}] not found in business [${ctx.businessId}]`);
    }
  }

  const validatedRules = validateRuleDefinition(dto.ruleDefinition);
  const status = dto.status || 'ACTIVE';
  const type = dto.type || 'DYNAMIC';

  const segment = await prisma.customerSegment.create({
    data: {
      businessId: ctx.businessId,
      branchId: dto.branchId || null,
      name: trimmedName,
      description: dto.description ? dto.description.trim() : null,
      type,
      status,
      ruleDefinition: validatedRules as unknown as Prisma.InputJsonValue,
      createdById: ctx.user.id,
    },
  });

  // Calculate live matching count
  const where = compileRuleDefinition(validatedRules, ctx.businessId, segment.branchId);
  const customerCount = await prisma.customer.count({ where });

  await createAuditLog(ctx, {
    action: 'SEGMENT_CREATED',
    entityType: 'CustomerSegment',
    entityId: segment.id,
    newState: {
      name: segment.name,
      status: segment.status,
      type: segment.type,
      branchId: segment.branchId,
      ruleDefinition: validatedRules,
    } as unknown as Prisma.InputJsonValue,
  });

  return {
    id: segment.id,
    businessId: segment.businessId,
    branchId: segment.branchId,
    name: segment.name,
    description: segment.description,
    type: segment.type as SegmentType,
    status: segment.status as SegmentStatus,
    ruleDefinition: validatedRules,
    customerCount,
    createdById: segment.createdById,
    createdAt: segment.createdAt.toISOString(),
    updatedAt: segment.updatedAt.toISOString(),
  };
}

/**
 * Updates an existing customer segment.
 */
export async function updateSegment(
  ctx: TenantContext,
  segmentId: string,
  dto: UpdateSegmentDTO
): Promise<SegmentItem> {
  checkSegmentManageAuth(ctx);

  const existing = await prisma.customerSegment.findFirst({
    where: { id: segmentId, businessId: ctx.businessId },
  });

  if (!existing) {
    throw new SegmentNotFoundError();
  }

  const updateData: Prisma.CustomerSegmentUpdateInput = {};

  if (dto.name !== undefined) {
    const trimmed = dto.name.trim();
    if (!trimmed) throw new SegmentValidationError('Segment name cannot be empty');
    updateData.name = trimmed;
  }

  if (dto.description !== undefined) {
    updateData.description = dto.description ? dto.description.trim() : null;
  }

  if (dto.branchId !== undefined) {
    if (dto.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: dto.branchId, businessId: ctx.businessId },
      });
      if (!branch) {
        throw new SegmentValidationError(`Branch [${dto.branchId}] not found in business [${ctx.businessId}]`);
      }
      updateData.branch = { connect: { id: dto.branchId } };
    } else {
      updateData.branch = { disconnect: true };
    }
  }

  if (dto.status !== undefined) {
    updateData.status = dto.status;
  }

  let finalRules = existing.ruleDefinition as unknown as SegmentRuleDefinition;
  if (dto.ruleDefinition !== undefined) {
    finalRules = validateRuleDefinition(dto.ruleDefinition);
    updateData.ruleDefinition = finalRules as unknown as Prisma.InputJsonValue;
  }

  const updated = await prisma.customerSegment.update({
    where: { id: segmentId },
    data: updateData,
  });

  const where = compileRuleDefinition(finalRules, ctx.businessId, updated.branchId);
  const customerCount = await prisma.customer.count({ where });

  const auditAction =
    dto.status === 'ARCHIVED'
      ? 'SEGMENT_ARCHIVED'
      : dto.status === 'ACTIVE' && existing.status !== 'ACTIVE'
      ? 'SEGMENT_ACTIVATED'
      : 'SEGMENT_UPDATED';

  await createAuditLog(ctx, {
    action: auditAction,
    entityType: 'CustomerSegment',
    entityId: updated.id,
    previousState: { name: existing.name, status: existing.status },
    newState: { name: updated.name, status: updated.status },
  });

  return {
    id: updated.id,
    businessId: updated.businessId,
    branchId: updated.branchId,
    name: updated.name,
    description: updated.description,
    type: updated.type as SegmentType,
    status: updated.status as SegmentStatus,
    ruleDefinition: finalRules,
    customerCount,
    createdById: updated.createdById,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

/**
 * Retrieves a segment by ID within tenant boundary.
 */
export async function getSegmentById(
  ctx: TenantContext,
  segmentId: string
): Promise<SegmentItem> {
  checkSegmentViewAuth(ctx);

  const segment = await prisma.customerSegment.findFirst({
    where: { id: segmentId, businessId: ctx.businessId },
  });

  if (!segment) {
    throw new SegmentNotFoundError();
  }

  const validatedRules = validateRuleDefinition(segment.ruleDefinition);
  const where = compileRuleDefinition(validatedRules, ctx.businessId, segment.branchId);
  const customerCount = await prisma.customer.count({ where });

  return {
    id: segment.id,
    businessId: segment.businessId,
    branchId: segment.branchId,
    name: segment.name,
    description: segment.description,
    type: segment.type as SegmentType,
    status: segment.status as SegmentStatus,
    ruleDefinition: validatedRules,
    customerCount,
    createdById: segment.createdById,
    createdAt: segment.createdAt.toISOString(),
    updatedAt: segment.updatedAt.toISOString(),
  };
}

/**
 * Lists customer segments for a business with optional status filter.
 */
export async function getBusinessSegments(
  ctx: TenantContext,
  options: { status?: SegmentStatus; branchId?: string } = {}
): Promise<SegmentItem[]> {
  checkSegmentViewAuth(ctx);

  const where: Prisma.CustomerSegmentWhereInput = {
    businessId: ctx.businessId,
  };

  if (options.status) {
    where.status = options.status;
  }

  if (options.branchId) {
    where.branchId = options.branchId;
  }

  const segments = await prisma.customerSegment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const result: SegmentItem[] = [];

  for (const seg of segments) {
    let customerCount = 0;
    let validatedRules: SegmentRuleDefinition;
    try {
      validatedRules = validateRuleDefinition(seg.ruleDefinition);
      const queryWhere = compileRuleDefinition(validatedRules, ctx.businessId, seg.branchId);
      customerCount = await prisma.customer.count({ where: queryWhere });
    } catch {
      validatedRules = seg.ruleDefinition as unknown as SegmentRuleDefinition;
    }

    result.push({
      id: seg.id,
      businessId: seg.businessId,
      branchId: seg.branchId,
      name: seg.name,
      description: seg.description,
      type: seg.type as SegmentType,
      status: seg.status as SegmentStatus,
      ruleDefinition: validatedRules,
      customerCount,
      createdById: seg.createdById,
      createdAt: seg.createdAt.toISOString(),
      updatedAt: seg.updatedAt.toISOString(),
    });
  }

  return result;
}

/**
 * Archives a customer segment.
 */
export async function archiveSegment(
  ctx: TenantContext,
  segmentId: string
): Promise<SegmentItem> {
  return updateSegment(ctx, segmentId, { status: 'ARCHIVED' });
}

/**
 * Deletes a customer segment.
 * Strictly prevents deletion if referenced by historical campaigns.
 */
export async function deleteSegment(
  ctx: TenantContext,
  segmentId: string
): Promise<{ success: boolean }> {
  checkSegmentManageAuth(ctx);

  const existing = await prisma.customerSegment.findFirst({
    where: { id: segmentId, businessId: ctx.businessId },
  });

  if (!existing) {
    throw new SegmentNotFoundError();
  }

  const campaignCount = await prisma.campaign.count({
    where: { segmentId, businessId: ctx.businessId },
  });

  if (campaignCount > 0) {
    throw new SegmentInUseError(`Cannot delete segment referenced by ${campaignCount} campaign(s). Archive it instead.`);
  }

  await prisma.customerSegment.delete({
    where: { id: segmentId },
  });

  await createAuditLog(ctx, {
    action: 'SEGMENT_DELETED',
    entityType: 'CustomerSegment',
    entityId: segmentId,
    previousState: { name: existing.name },
  });

  return { success: true };
}

/**
 * Previews unsaved or saved rules to get live match count and sample customers.
 */
export async function previewSegmentRules(
  ctx: TenantContext,
  ruleDefinition: any,
  branchId?: string | null
): Promise<SegmentPreviewResult> {
  checkSegmentViewAuth(ctx);

  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, businessId: ctx.businessId },
    });
    if (!branch) {
      throw new SegmentValidationError(`Branch [${branchId}] not found in business [${ctx.businessId}]`);
    }
  }

  const validatedRules = validateRuleDefinition(ruleDefinition);
  const where = compileRuleDefinition(validatedRules, ctx.businessId, branchId);

  const matchingCount = await prisma.customer.count({ where });

  const sampleCustomers = await prisma.customer.findMany({
    where,
    take: 10,
    orderBy: { lastVisitAt: 'desc' },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      totalVisits: true,
      lastVisitAt: true,
      status: true,
    },
  });

  return {
    matchingCount,
    sampleCustomers: sampleCustomers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      totalVisits: c.totalVisits,
      lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
      status: c.status,
    })),
  };
}

/**
 * Returns the matching customer count for a saved segment.
 */
export async function getSegmentCount(
  ctx: TenantContext,
  segmentId: string
): Promise<{ count: number }> {
  checkSegmentViewAuth(ctx);

  const segment = await prisma.customerSegment.findFirst({
    where: { id: segmentId, businessId: ctx.businessId },
  });

  if (!segment) {
    throw new SegmentNotFoundError();
  }

  const validatedRules = validateRuleDefinition(segment.ruleDefinition);
  const where = compileRuleDefinition(validatedRules, ctx.businessId, segment.branchId);
  const count = await prisma.customer.count({ where });

  return { count };
}

/**
 * Retrieves paginated customers matching a saved segment.
 */
export async function getSegmentMembers(
  ctx: TenantContext,
  segmentId: string,
  params: { page?: number; limit?: number } = {}
) {
  checkSegmentViewAuth(ctx);

  const segment = await prisma.customerSegment.findFirst({
    where: { id: segmentId, businessId: ctx.businessId },
  });

  if (!segment) {
    throw new SegmentNotFoundError();
  }

  const page = Math.max(1, params.page || 1);
  const limit = Math.min(Math.max(1, params.limit || 25), 100);
  const skip = (page - 1) * limit;

  const validatedRules = validateRuleDefinition(segment.ruleDefinition);
  const where = compileRuleDefinition(validatedRules, ctx.businessId, segment.branchId);

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { lastVisitAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        totalVisits: true,
        totalSpendMinor: true,
        stampsBalance: true,
        pointsBalance: true,
        lastVisitAt: true,
        joinedAt: true,
        branchId: true,
      },
    }),
  ]);

  const formattedCustomers = customers.map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    status: c.status,
    totalVisits: c.totalVisits,
    totalSpendMinor: c.totalSpendMinor,
    stampsBalance: c.stampsBalance,
    pointsBalance: c.pointsBalance,
    lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
    joinedAt: c.joinedAt.toISOString(),
    branchId: c.branchId,
  }));

  return {
    segment: {
      id: segment.id,
      name: segment.name,
      status: segment.status,
    },
    data: formattedCustomers,
    customers: formattedCustomers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + customers.length < total,
    },
  };
}
