/**
 * Reployty Super Admin Platform Types
 * Source of truth for platform administration.
 */

export type SuperAdminRoute =
  | 'admin-overview'
  | 'admin-businesses'
  | 'admin-business-detail'
  | 'admin-users'
  | 'admin-staff'
  | 'admin-roles'
  | 'admin-audit-logs'
  | 'admin-analytics'
  | 'admin-plans'
  | 'admin-billing';

export type AdminRoute = SuperAdminRoute;

export interface PlatformMetrics {
  totalBusinesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  totalUsers: number;
  activeUsers: number;
  totalCustomers: number;
  totalLoyaltyCards: number;
  rewardsRedeemed: number;
}

export interface PlatformActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorEmail: string;
  businessName: string;
  businessSlug: string | null;
  createdAt: string;
}

export interface PlatformOverviewData {
  metrics: PlatformMetrics;
  recentActivity: PlatformActivityItem[];
}

export interface PlatformBusiness {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'ARCHIVED';
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  createdAt: string;
  ownerName: string;
  ownerEmail: string | null;
  branchesCount: number;
  staffCount: number;
  customersCount: number;
  programsCount: number;
}

export interface PlatformBusinessDetail extends PlatformBusiness {
  primaryColor: string;
  secondaryColor: string;
  branches: Array<{
    id: string;
    name: string;
    code: string | null;
    address: string | null;
    status: string;
    isMainBranch: boolean;
  }>;
  staff: Array<{
    id: string;
    user: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      avatarUrl: string | null;
      status: string;
    };
    role: string;
    status: string;
    createdAt: string;
  }>;
  rewardsCount: number;
  offersCount: number;
  loyaltyPrograms: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    rewardTitle: string;
    targetStamps: number | null;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorEmail: string;
    createdAt: string;
  }>;
}

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  isSuperAdmin: boolean;
  createdAt: string;
  memberships: Array<{
    businessId: string;
    businessName: string;
    businessSlug: string;
    role: string;
    status: string;
  }>;
}

export interface PlatformMembership {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessCategory: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface PlatformRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  membershipsCount: number;
  permissions: Array<{
    id: string;
    code: string;
    name: string;
    category: string;
    description: string | null;
  }>;
}

export interface PlatformAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorEmail: string | null;
  businessName: string;
  businessSlug: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  previousState: any;
  newState: any;
  createdAt: string;
}

export interface PlatformAnalyticsData {
  timeRange: string;
  aggregates: {
    newBusinesses: number;
    newUsers: number;
    newCustomers: number;
    loyaltyTransactions: number;
    rewardRedemptions: number;
  };
  categoryBreakdown: Array<{
    category: string;
    count: number;
  }>;
}
