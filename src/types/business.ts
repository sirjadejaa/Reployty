export interface BusinessProfile {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  logo: string | null;
  coverImage: string | null;
  primaryColor: string;
  secondaryColor: string;
  themePreset: string;
  timezone: string;
  currency: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  website: string | null;
  googleReviewUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  whatsappNumber: string | null;
  status: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    branches: number;
    staff: number;
    customers: number;
  };
}

export interface BranchItem {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  isMainBranch: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    staff: number;
    customers: number;
    transactions: number;
  };
}

export interface StaffMemberItem {
  id: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DEACTIVATED';
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    status: string;
  };
  role: {
    id: string;
    name: string;
    description: string | null;
  };
  branch: {
    id: string;
    name: string;
  } | null;
}

export interface BusinessRole {
  id: string;
  name: string;
  description: string | null;
  rolePermissions: Array<{
    permission: {
      code: string;
      name: string;
      category: string;
    };
  }>;
}

export interface BrandingConfig {
  id: string;
  name: string;
  category: string;
  themePreset: string;
  primaryColor: string;
  secondaryColor: string;
  logo: string | null;
  coverImage: string | null;
}

export interface OnboardingStatus {
  isCompleted: boolean;
  currentStep: number;
  completedStepsCount: number;
  totalSteps: number;
  checklist: {
    businessInfo: boolean;
    category: boolean;
    branchSetup: boolean;
    branding: boolean;
    staffSetup: boolean;
    loyaltySetup: boolean;
  };
}

export interface BusinessDashboardData {
  business: {
    id: string;
    name: string;
    slug: string;
    category: string;
    logo?: string | null;
    themePreset: string;
    onboardingCompleted: boolean;
    onboardingStep: number;
    phone: string | null;
    address: string | null;
  };
  metrics: {
    totalCustomers: number;
    activeBranches: number;
    staffMembers: number;
    loyaltyPrograms: number;
  };
  onboarding: OnboardingStatus;
  loyaltyProgram?: {
    id: string;
    name: string;
    type: 'STAMP' | 'POINTS';
    targetStamps: number | null;
    pointsPerCurrencyMinor?: number | null;
    rewardTitle: string;

    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
    activeCardsCount: number;
    qrCode?: {
      code: string;
      destinationUrl: string;
      scanCount: number;
    } | null;
  } | null;
  recentActivity: Array<{

    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    actor: {
      id: string;
      name: string;
      email: string;
    } | null;
  }>;
}
