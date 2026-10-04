/**
 * Reployty V2 — Phase 21 Advanced & Dynamic Segmentation Builder
 * Segment Domain & Rule Types
 */

export type SegmentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type SegmentType = 'DYNAMIC' | 'STATIC';
export type SegmentLogic = 'AND' | 'OR';

// Server-side & Client Whitelist of Fields
export const SEGMENT_FIELDS = [
  // Profile
  'name',
  'phone',
  'email',
  'status',
  'birthday',
  'joinedAt',
  'customer_since',

  // Behavioral & Activity
  'visit_count',
  'totalVisits',
  'days_since_last_visit',
  'last_visit_at',
  'lastVisitAt',
  'totalSpendMinor',

  // Loyalty
  'current_stamp_balance',
  'stampsBalance',
  'points_balance',
  'pointsBalance',
  'has_completed_loyalty_card',

  // Rewards & Offers
  'reward_claim_count',
  'reward_redemption_count',
  'offer_redemption_count',
  'last_reward_redeemed_at',
  'last_offer_redeemed_at',

  // Reviews & Feedback
  'review_count',
  'average_rating',
  'last_rating',

  // Consents
  'marketing_consent',
  'whatsapp_consent',
  'sms_consent',
  'email_consent',

  // Tags & Branch
  'tagId',
  'has_tag',
  'does_not_have_tag',
  'branchId',
] as const;

export type SegmentField = (typeof SEGMENT_FIELDS)[number];

// Server-side & Client Whitelist of Operators
export const SEGMENT_OPERATORS = [
  // Numeric
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',

  // Text
  'CONTAINS',
  'STARTS_WITH',

  // Boolean
  'IS_TRUE',
  'IS_FALSE',

  // Dates
  'BEFORE',
  'AFTER',
  'OLDER_THAN_DAYS',
  'WITHIN_LAST_DAYS',
  'BETWEEN',

  // Set / Membership
  'IN',
  'NOT_IN',

  // Lowercase aliases for backward compatibility
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'within_days',
  'before_days',
  'contains',
] as const;

export type SegmentOperator = (typeof SEGMENT_OPERATORS)[number];

export interface SegmentCondition {
  field: SegmentField;
  operator: SegmentOperator;
  value?: any;
}

export interface SegmentConditionGroup {
  logic: SegmentLogic;
  conditions?: SegmentCondition[];
  groups?: SegmentConditionGroup[];
}

export interface SegmentRuleDefinition {
  logic?: SegmentLogic;
  matchType?: 'ALL' | 'ANY';
  conditions?: SegmentCondition[];
  groups?: SegmentConditionGroup[];
}

export interface SegmentItem {
  id: string;
  businessId: string;
  branchId?: string | null;
  name: string;
  description?: string | null;
  type?: SegmentType;
  status: SegmentStatus;
  ruleDefinition: SegmentRuleDefinition;
  customerCount: number;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentPreviewResult {
  matchingCount: number;
  sampleCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    totalVisits: number;
    lastVisitAt: string | null;
    status: string;
  }>;
}

export interface CreateSegmentDTO {
  name: string;
  description?: string | null;
  branchId?: string | null;
  type?: SegmentType;
  status?: SegmentStatus;
  ruleDefinition: SegmentRuleDefinition;
}

export interface UpdateSegmentDTO {
  name?: string;
  description?: string | null;
  branchId?: string | null;
  status?: SegmentStatus;
  ruleDefinition?: SegmentRuleDefinition;
}
