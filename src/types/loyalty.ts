export type StatusType = 
  | 'active'
  | 'inactive'
  | 'pending'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'available'
  | 'redeemed'
  | 'vip'
  | 'at-risk';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatarInitials: string;
  stampsCollected: number;
  totalStampsNeeded: number;
  pointsBalance: number;
  tier: 'Standard' | 'Silver' | 'Gold' | 'VIP';
  status: StatusType;
  lastVisit: string;
  totalVisits: number;
}

export interface MetricItem {
  id: string;
  label: string;
  value: string | number;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  timeframe: string;
}

export type AdminRoute = 
  | 'dashboard'
  | 'onboarding'
  | 'customers'
  | 'business-customers'
  | 'loyalty'
  | 'rewards'
  | 'offers'
  | 'menu'
  | 'reviews'
  | 'campaigns'
  | 'analytics'
  | 'branches'
  | 'staff'
  | 'billing'
  | 'settings'
  | 'settings-business'
  | 'settings-branches'
  | 'settings-staff'
  | 'settings-branding'
  | 'design-system'
  | 'customer-preview';

export interface LoyaltyProgramConfig {
  id: string;
  businessId: string;
  name: string;
  type: 'STAMP' | 'POINTS' | 'MILESTONE' | 'PRODUCT_REWARD';
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'ARCHIVED';
  targetStamps: number | null;
  pointsPerCurrencyMinor: number | null;
  rewardTitle: string;
  rulesConfig?: any;
  createdAt: string;
  updatedAt: string;
  _count?: {
    cards: number;
  };
}

export interface LoyaltyCardData {
  id: string;
  businessId: string;
  customerId: string;
  programId: string;
  stampsCollected: number;
  totalStampsNeeded: number;
  pointsBalance: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  issuedAt: string;
  completedAt: string | null;
}

export interface LoyaltyTransactionItem {
  id: string;
  businessId: string;
  branchId: string | null;
  customerId: string;
  cardId: string | null;
  type: 'STAMP_ADDED' | 'STAMP_REMOVED' | 'POINTS_EARNED' | 'POINTS_REVERSED' | 'MILESTONE_REACHED' | 'ADJUSTMENT' | 'STAMP_REDEEMED' | 'POINTS_REDEEMED';
  deltaStamps: number;
  deltaPoints: number;
  idempotencyKey?: string | null;
  metadata?: any;
  createdByUserId?: string | null;
  createdAt: string;
  customer?: {
    id: string;
    name: string;
    phone: string;
  };
  branch?: {
    id: string;
    name: string;
    code: string | null;
  };
}

export interface LoyaltyCustomerLookup {
  id: string;
  name: string;
  phone: string;
  totalVisits: number;
  stampsBalance: number;
  pointsBalance: number;
  lastVisitAt: string | null;
  card: {
    id: string;
    stampsCollected: number;
    totalStampsNeeded: number;
    pointsBalance: number;
    status: string;
  } | null;
  activeProgramType: 'STAMP' | 'POINTS';
  targetStamps: number;
}

export interface RewardItem {
  id: string;
  businessId: string;
  branchId: string | null;
  programId: string | null;
  title: string;
  description: string | null;
  stampsRequired: number | null;
  pointsRequired: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'ARCHIVED';
  expiryDays: number | null;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  createdAt: string;
  updatedAt: string;
  branch?: { id: string; name: string; code: string | null } | null;
  program?: { id: string; name: string; type: string } | null;
  _count?: { redemptions: number };
}

export interface RewardRedemptionItem {
  id: string;
  businessId: string;
  branchId: string | null;
  rewardId: string;
  customerId: string;
  loyaltyCardId: string | null;
  redeemedByUserId: string | null;
  redemptionCode: string;
  status: 'AVAILABLE' | 'CLAIMED' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';
  stampsConsumed: number | null;
  pointsConsumed: number | null;
  idempotencyKey: string | null;
  claimedAt: string;
  redeemedAt: string | null;
  expiresAt: string | null;
  reward?: {
    id: string;
    title: string;
    description?: string | null;
    stampsRequired: number | null;
    pointsRequired: number | null;
  };
  customer?: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
  };
  branch?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
  redeemedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface CustomerRewardEvaluation {
  id: string;
  title: string;
  description: string | null;
  stampsRequired: number | null;
  pointsRequired: number | null;
  expiryDays: number | null;
  branchName: string | null;
  programTitle: string | null;
  isEligible: boolean;
  stampsNeeded: number;
  pointsNeeded: number;
  progressPct: number;
  claimedCount: number;
  usageLimitPerCustomer: number | null;
  usageLimitTotal: number | null;
  ineligibilityReasons: string[];
}

export interface CustomerTagItem {
  id: string;
  businessId: string;
  name: string;
  color: string;
  createdAt: string;
  _count?: {
    assignments: number;
  };
}

export interface CustomerNoteItem {
  id: string;
  customerId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CustomerTimelineItem {
  id: string;
  source: 'EVENT' | 'LOYALTY' | 'REDEMPTION';
  type: string;
  title: string;
  description: string | null;
  timestamp: string;
  badgeColor?: string;
  badgeLabel?: string;
  metadata?: Record<string, any> | null;
  actor?: string | null;
}

export interface SegmentCondition {
  field: 'joinedAt' | 'lastVisitAt' | 'totalVisits' | 'pointsBalance' | 'stampsBalance' | 'totalSpendMinor' | 'status' | 'branchId' | 'tagId';
  operator: 'equals' | 'not_equals' | 'greater_than' | 'greater_than_or_equal' | 'less_than' | 'less_than_or_equal' | 'within_days' | 'before_days' | 'contains';
  value: any;
}

export interface SegmentRuleDefinition {
  conditions: SegmentCondition[];
  matchType?: 'ALL' | 'ANY';
}

export interface CustomerSegmentItem {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  ruleDefinition: SegmentRuleDefinition;
  status: 'ACTIVE' | 'ARCHIVED';
  customerCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Customer360Detail {
  customer: {
    id: string;
    businessId: string;
    branchId: string | null;
    name: string;
    phone: string;
    email: string | null;
    birthday: string | null;
    joinedAt: string;
    lastVisitAt: string | null;
    status: string;
    marketingConsent: boolean;
    totalVisits: number;
    totalSpendMinor: number;
    stampsBalance: number;
    pointsBalance: number;
    branch?: { id: string; name: string; code: string | null } | null;
  };
  loyalty: {
    activeCard: {
      id: string;
      programId: string;
      stampsCollected: number;
      totalStampsNeeded: number;
      pointsBalance: number;
      status: string;
      program?: { id: string; name: string; type: string; rewardTitle: string };
    } | null;
    lifetimeStampsEarned: number;
    lifetimePointsEarned: number;
  };
  rewardsSummary: {
    totalClaimed: number;
    totalRedeemed: number;
    activeVouchers: Array<{
      id: string;
      redemptionCode: string;
      claimedAt: string;
      expiresAt: string | null;
      reward: { id: string; title: string };
    }>;
  };
  tags: Array<{
    id: string;
    name: string;
    color: string;
    assignedAt: string;
  }>;
  notes: CustomerNoteItem[];
  consents: Array<{
    channel: string;
    granted: boolean;
    version: string;
    grantedAt: string;
  }>;
}

