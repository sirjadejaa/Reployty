export interface PublicBusinessContext {
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
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  googleReviewUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
}

export interface PublicBranchContext {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
}

export interface PublicQrResolution {
  qrCode: {
    code: string;
    type: string;
  } | null;
  business: PublicBusinessContext;
  branch: PublicBranchContext | null;
}

export interface CustomerProfile {
  id: string;
  businessId: string;
  branchId: string | null;
  name: string;
  phone: string;
  email: string | null;
  birthday: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'VIP' | 'AT_RISK' | 'BLOCKED';
  marketingConsent: boolean;
  totalVisits: number;
  stampsBalance: number;
  pointsBalance: number;
  joinedAt: string;
  lastVisitAt: string | null;
}

export interface CustomerConsentItem {
  id: string;
  channel: 'MARKETING' | 'WHATSAPP' | 'SMS' | 'EMAIL' | 'NOTIFICATIONS';
  granted: boolean;
  version: string;
  grantedAt: string;
  revokedAt: string | null;
}

export interface CustomerActivityItem {
  id: string;
  type: string;
  metadata?: any;
  createdAt: string;
}

export interface CustomerLoyaltyProgram {
  id: string;
  name: string;
  type: 'STAMP' | 'POINTS' | 'MILESTONE' | 'PRODUCT_REWARD';
  targetStamps: number | null;
  pointsPerCurrencyMinor: number | null;
  rewardTitle: string;
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'ARCHIVED';
}

export interface CustomerLoyaltyCard {
  id: string;
  stampsCollected: number;
  totalStampsNeeded: number;
  pointsBalance: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  issuedAt: string;
}

export interface CustomerLoyaltyProgress {
  currentStamps: number;
  targetStamps: number;
  stampsRemaining: number;
  isComplete: boolean;
  currentPoints: number;
  pointsConversionLabel: string | null;
}

export interface CustomerLoyaltyState {
  status: string;
  hasActiveProgram: boolean;
  program: CustomerLoyaltyProgram | null;
  business?: {
    id: string;
    name: string;
    category?: string | null;
    themePreset?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    logo?: string | null;
    currency?: string;
  } | null;
  customer?: {
    id: string;
    name: string | null;
    phone: string;
    branch?: { id: string; name: string } | null;
    joinedAt?: string | Date;
  } | null;
  card: CustomerLoyaltyCard | null;
  progress: CustomerLoyaltyProgress | null;
  recentTransactions?: Array<{
    id: string;
    type: string;
    deltaStamps: number;
    deltaPoints: number;
    createdAt: string;
    branch?: { name: string };
  }>;
  message?: string;
  previewStamps?: number;
  previewPoints?: number;
}

export interface CustomerClaimedRedemption {
  id: string;
  redemptionCode: string;
  status: 'AVAILABLE' | 'CLAIMED' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';
  displayStatus: string;
  isExpired: boolean;
  stampsConsumed: number | null;
  pointsConsumed: number | null;
  claimedAt: string;
  redeemedAt: string | null;
  expiresAt: string | null;
  reward: {
    id: string;
    title: string;
    description: string | null;
    stampsRequired: number | null;
    pointsRequired: number | null;
  };
  branch?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
}

