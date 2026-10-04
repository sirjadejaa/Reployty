/**
 * Reployty V2 — Phase 20 Retention Architecture
 * Campaign & Retention Types
 */

export type CampaignStatus = 
  | 'DRAFT'
  | 'SCHEDULED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SENDING'
  | 'SENT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type CampaignType = 'ONE_TIME' | 'AUTOMATED' | 'TRIGGERED';

export type CampaignChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'IN_APP';

export type AudienceType = 'ALL_CUSTOMERS' | 'SAVED_SEGMENT' | 'DYNAMIC_SEGMENT' | 'SPECIFIC_CUSTOMER';

export type CampaignActionType = 
  | 'SEND_MESSAGE'
  | 'SEND_OFFER'
  | 'SEND_REWARD_REMINDER'
  | 'ADD_TAG'
  | 'REMOVE_TAG'
  | 'CREATE_TASK';

export interface CampaignItem {
  id: string;
  businessId: string;
  branchId?: string | null;
  name: string;
  description?: string | null;
  type: CampaignType;
  audienceType: AudienceType;
  segmentId?: string | null;
  offerId?: string | null;
  actionType: CampaignActionType;
  channel: CampaignChannel;
  messageTemplate: string;
  scheduledAt?: string | null;
  timezone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  lastRunAt?: string | null;
  status: CampaignStatus;
  totalAudience: number;
  createdAt: string;
  updatedAt: string;
  branch?: { id: string; name: string; code?: string | null } | null;
  segment?: { id: string; name: string } | null;
  offer?: { id: string; title: string; type: string } | null;
  _count?: {
    deliveries: number;
  };
}

export interface CampaignDeliveryItem {
  id: string;
  campaignId: string;
  customerId: string;
  channel: CampaignChannel;
  status: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  failedReason?: string | null;
  createdAt: string;
  customer?: {
    id: string;
    name: string;
    phone: string;
  };
}

export interface CampaignDetailItem extends CampaignItem {
  deliveries?: CampaignDeliveryItem[];
  statusSummary?: Record<string, number>;
  createdBy?: { id: string; name: string; email: string } | null;
}
