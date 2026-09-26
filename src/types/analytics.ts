export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | '90d'
  | 'this_month'
  | 'prev_month'
  | 'this_year'
  | 'custom';

export interface DateRangeInterval {
  start: string; // ISO string
  end: string;   // ISO string
  label: string;
}

export interface MetricComparison {
  current: number;
  previous: number;
  delta: number;
  percentChange: number | null; // null if previous is 0 and current is 0
}

export interface ChartDataPoint {
  date: string;
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface AnalyticsOverview {
  dateRange: {
    current: DateRangeInterval;
    previous: DateRangeInterval;
    compareEnabled: boolean;
  };
  metrics: {
    totalCustomers: MetricComparison;
    newCustomers: MetricComparison;
    activeCustomers: MetricComparison;
    returningCustomers: MetricComparison;
    totalVisits: MetricComparison;
    stampsIssued: MetricComparison;
    pointsIssued: MetricComparison;
    rewardsRedeemed: MetricComparison;
    offersRedeemed: MetricComparison;
    averageRating: MetricComparison;
  };
  trends: {
    customerGrowth: ChartDataPoint[];
    visitsTimeline: ChartDataPoint[];
    loyaltyActivity: ChartDataPoint[];
  };
}

export interface CustomerAnalytics {
  totalCustomers: number;
  statusDistribution: {
    active: number;
    inactive: number;
    vip: number;
    atRisk: number;
    blocked: number;
  };
  growthTrend: ChartDataPoint[];
  acquisitionMix: {
    newCustomers: number;
    returningCustomers: number;
    newPct: number;
    returningPct: number;
  };
}

export interface RetentionAnalytics {
  returningCustomerRate: number; // Percentage: (customers with >1 visit) / (customers with >=1 visit) * 100
  repeatVisitRate: number;       // Percentage: (repeat visits) / (total visits) * 100
  totalCustomersWithVisits: number;
  singleVisitCustomers: number;
  multiVisitCustomers: number;
  reactivatedCustomers: number; // Customers who made a visit after 30+ days of inactivity
  atRiskCustomerCount: number;
  inactiveCustomerCount: number;
  definitions: {
    activeCustomer: string;
    returningCustomer: string;
    repeatVisit: string;
    newCustomer: string;
    reactivatedCustomer: string;
    returningCustomerRate: string;
    repeatVisitRate: string;
  };
}

export interface LoyaltyAnalytics {
  activeMembers: number;
  stampsIssued: number;
  pointsIssued: number;
  rewardsClaimed: number;
  rewardsRedeemed: number;
  rewardRedemptionRate: number; // Percentage: (redeemed / claimed) * 100
  trends: {
    stampsOverTime: ChartDataPoint[];
    pointsOverTime: ChartDataPoint[];
  };
}

export interface TopRewardItem {
  id: string;
  title: string;
  claimedCount: number;
  redeemedCount: number;
  redemptionRate: number;
}

export interface RewardsAnalytics {
  totalRewards: number;
  totalClaimed: number;
  totalRedeemed: number;
  overallRedemptionRate: number;
  topRewards: TopRewardItem[];
  branchDistribution: Array<{
    branchId: string;
    branchName: string;
    redemptions: number;
  }>;
}

export interface TopOfferItem {
  id: string;
  title: string;
  type: string;
  discountValue: number;
  redemptionCount: number;
}

export interface OffersAnalytics {
  activeOffersCount: number;
  totalRedemptions: number;
  topOffers: TopOfferItem[];
  redemptionsOverTime: ChartDataPoint[];
  branchDistribution: Array<{
    branchId: string;
    branchName: string;
    redemptions: number;
  }>;
}

export interface ReviewAnalytics {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  sentimentCounts: {
    positive: number;
    neutral: number;
    negative: number;
  };
  googleTargetCount: number;
  privateFeedbackCount: number;
  aiResponseCoverage: number; // Percentage of reviews that have AI response drafts
  reviewsOverTime: ChartDataPoint[];
}

export interface BranchPerformanceItem {
  branchId: string;
  branchName: string;
  customerCount: number;
  visitCount: number;
  stampsIssued: number;
  pointsIssued: number;
  rewardRedemptions: number;
  offerRedemptions: number;
  averageRating: number;
}

export interface BranchAnalytics {
  branches: BranchPerformanceItem[];
}

export interface AnalyticsQueryInput {
  preset?: DateRangePreset;
  startDate?: string;
  endDate?: string;
  branchId?: string;
  compare?: boolean;
}

export type ExportType = 'overview' | 'customers' | 'activity' | 'loyalty' | 'offers' | 'reviews';
