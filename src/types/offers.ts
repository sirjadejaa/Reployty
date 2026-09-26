export type OfferType =
  | 'PERCENTAGE_DISCOUNT'
  | 'FIXED_DISCOUNT'
  | 'FREE_PRODUCT'
  | 'FREE_SERVICE'
  | 'BUY_X_GET_Y'
  | 'BIRTHDAY'
  | 'COMEBACK'
  | 'VIP'
  | 'MILESTONE';

export type OfferStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'DRAFT';

export type RedemptionStatus = 'CLAIMED' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';

export interface OfferEligibilityConfig {
  branchId?: string | null;
  targetAudience?: 'ALL' | 'NEW_CUSTOMERS' | 'EXISTING_CUSTOMERS' | 'VIP';
  segmentId?: string | null;
  tagId?: string | null;
  terms?: string | null;
}

export interface OfferItem {
  id: string;
  businessId: string;
  title: string;
  description: string | null;
  type: OfferType;
  discountValue: number;
  minPurchaseMinor: number | null;
  maxDiscountMinor: number | null;
  startDate: string | Date;
  endDate: string | Date | null;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  status: OfferStatus;
  eligibilityConfig: OfferEligibilityConfig | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  redemptionsCount?: number;
  effectiveStatus?: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE' | 'DRAFT';
  branchName?: string | null;
}

export interface CreateOfferInput {
  title: string;
  description?: string | null;
  type?: OfferType;
  discountValue?: number;
  minPurchaseMinor?: number | null;
  maxDiscountMinor?: number | null;
  startDate?: string | Date;
  endDate?: string | Date | null;
  usageLimitTotal?: number | null;
  usageLimitPerCustomer?: number | null;
  status?: OfferStatus;
  eligibilityConfig?: OfferEligibilityConfig | null;
}

export interface UpdateOfferInput {
  title?: string;
  description?: string | null;
  type?: OfferType;
  discountValue?: number;
  minPurchaseMinor?: number | null;
  maxDiscountMinor?: number | null;
  startDate?: string | Date;
  endDate?: string | Date | null;
  usageLimitTotal?: number | null;
  usageLimitPerCustomer?: number | null;
  status?: OfferStatus;
  eligibilityConfig?: OfferEligibilityConfig | null;
}

export interface RedeemOfferInput {
  offerId: string;
  customerId: string;
  branchId?: string | null;
  idempotencyKey?: string;
}

export interface OfferRedemptionItem {
  id: string;
  businessId: string;
  branchId: string | null;
  branchName?: string | null;
  offerId: string;
  offerTitle?: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  redeemedByUserId: string | null;
  redeemedByStaffName?: string | null;
  status: RedemptionStatus;
  redemptionCode: string | null;
  idempotencyKey: string | null;
  redeemedAt: string | Date;
  createdAt: string | Date;
}

export interface CustomerOfferItem {
  id: string;
  title: string;
  description: string | null;
  type: OfferType;
  discountValue: number;
  minPurchaseMinor: number | null;
  maxDiscountMinor: number | null;
  startDate: string | Date;
  endDate: string | Date | null;
  branchName: string | null;
  terms: string | null;
  isEligible: boolean;
  ineligibilityReason?: string | null;
  remainingPersonalUsage?: number | null;
}
