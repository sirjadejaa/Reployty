/**
 * Reployty V2 — Phase 23 Automation Engine & Trigger Processors
 * Automation Types & Interfaces
 */

import { CustomerEventType, RuleStatus, ExecutionStatus, AutomationActionType, RetentionWorkflowType } from '@prisma/client';
import { SegmentRuleDefinition } from './segment';

export { CustomerEventType, RuleStatus, ExecutionStatus, AutomationActionType, RetentionWorkflowType };

/**
 * Controlled trigger registry mapping supported triggers to CustomerEventType
 */
export const SUPPORTED_TRIGGERS: Array<{
  type: CustomerEventType;
  label: string;
  description: string;
  category: 'LIFECYCLE' | 'VISIT' | 'LOYALTY' | 'ENGAGEMENT' | 'CAMPAIGN' | 'RETENTION';
}> = [
  {
    type: 'CUSTOMER_JOINED',
    label: 'Customer Created / Joined',
    description: 'Triggered when a new customer registers or joins the loyalty program',
    category: 'LIFECYCLE',
  },
  {
    type: 'VISIT_RECORDED',
    label: 'Visit Recorded',
    description: 'Triggered when a customer logs an in-store or loyalty visit',
    category: 'VISIT',
  },
  {
    type: 'PURCHASE_RECORDED',
    label: 'Purchase Recorded',
    description: 'Triggered when a qualifying transaction or purchase is completed',
    category: 'VISIT',
  },
  {
    type: 'STAMP_ADDED',
    label: 'Loyalty Stamp Earned',
    description: 'Triggered when one or more stamps are awarded to the customer card',
    category: 'LOYALTY',
  },
  {
    type: 'POINTS_ADDED',
    label: 'Loyalty Points Earned',
    description: 'Triggered when loyalty points are accumulated',
    category: 'LOYALTY',
  },
  {
    type: 'REWARD_EARNED',
    label: 'Reward Earned',
    description: 'Triggered when a customer completes a card and unlocks a reward',
    category: 'LOYALTY',
  },
  {
    type: 'REWARD_REDEEMED',
    label: 'Reward Redeemed',
    description: 'Triggered when an earned reward is successfully claimed and burned',
    category: 'LOYALTY',
  },
  {
    type: 'OFFER_REDEEMED',
    label: 'Offer Redeemed',
    description: 'Triggered when a targeted or broadcast promotional offer is redeemed',
    category: 'LOYALTY',
  },
  {
    type: 'REVIEW_GENERATED',
    label: 'Review Submitted',
    description: 'Triggered when customer feedback or review is captured',
    category: 'ENGAGEMENT',
  },
  {
    type: 'CUSTOMER_BECAME_INACTIVE',
    label: 'Customer Became Inactive',
    description: 'Triggered when retention telemetry detects lapsed activity threshold',
    category: 'RETENTION',
  },
  {
    type: 'CUSTOMER_BIRTHDAY',
    label: 'Customer Birthday',
    description: 'Triggered on or approaching a customer birthday based on business timezone',
    category: 'RETENTION',
  },
  {
    type: 'CAMPAIGN_TOUCHPOINT',
    label: 'Campaign Delivery Completed',
    description: 'Triggered when an automated or broadcast campaign delivery finishes',
    category: 'CAMPAIGN',
  },
];

/**
 * Normalizes input trigger string (allowing common aliases) into a canonical CustomerEventType
 */
export function normalizeTriggerEvent(input: string): CustomerEventType {
  const upper = (input || '').trim().toUpperCase();

  const aliasMap: Record<string, CustomerEventType> = {
    CUSTOMER_CREATED: 'CUSTOMER_JOINED',
    CUSTOMER_JOINED: 'CUSTOMER_JOINED',
    CUSTOMER_VISIT: 'VISIT_RECORDED',
    VISIT: 'VISIT_RECORDED',
    VISIT_RECORDED: 'VISIT_RECORDED',
    PURCHASE_RECORDED: 'PURCHASE_RECORDED',
    LOYALTY_STAMP_EARNED: 'STAMP_ADDED',
    STAMP_ADDED: 'STAMP_ADDED',
    POINTS_ADDED: 'POINTS_ADDED',
    LOYALTY_REWARD_EARNED: 'REWARD_EARNED',
    REWARD_EARNED: 'REWARD_EARNED',
    REWARD_REDEEMED: 'REWARD_REDEEMED',
    OFFER_REDEEMED: 'OFFER_REDEEMED',
    REVIEW_SUBMITTED: 'REVIEW_GENERATED',
    REVIEW_GENERATED: 'REVIEW_GENERATED',
    CUSTOMER_BECAME_INACTIVE: 'CUSTOMER_BECAME_INACTIVE',
    CUSTOMER_INACTIVE: 'CUSTOMER_BECAME_INACTIVE',
    INACTIVITY: 'CUSTOMER_BECAME_INACTIVE',
    CUSTOMER_BIRTHDAY: 'CUSTOMER_BIRTHDAY',
    BIRTHDAY: 'CUSTOMER_BIRTHDAY',
    CAMPAIGN_DELIVERY_COMPLETED: 'CAMPAIGN_TOUCHPOINT',
    CAMPAIGN_TOUCHPOINT: 'CAMPAIGN_TOUCHPOINT',
  };

  if (aliasMap[upper]) {
    return aliasMap[upper];
  }

  const validTypes = Object.values(CustomerEventType);
  if (validTypes.includes(upper as CustomerEventType)) {
    return upper as CustomerEventType;
  }

  throw new Error(
    `Unsupported trigger type: [${input}]. Allowed triggers: ${SUPPORTED_TRIGGERS.map((t) => t.type).join(', ')}`
  );
}

/**
 * Normalized Server-Side Event Envelope
 */
export interface AutomationEventEnvelope {
  eventId: string;
  eventType: CustomerEventType;
  businessId: string;
  branchId?: string | null;
  customerId: string;
  entityType?: string;
  entityId?: string;
  occurredAt?: Date;
  metadata?: Record<string, any>;
}

export interface SendCampaignActionConfig {
  [key: string]: any;
  campaignId: string;
  cooldownHours?: number;
}

export interface CreateAutomationRuleDTO {
  name: string;
  description?: string;
  triggerEvent: CustomerEventType | string;
  branchId?: string | null;
  workflowType?: RetentionWorkflowType | null;
  retentionConfig?: Record<string, any> | null;
  conditionConfig?: SegmentRuleDefinition | Record<string, any>;
  actionType?: AutomationActionType;
  actionConfig?: SendCampaignActionConfig | Record<string, any>;
  cooldownMinutes?: number;
  maxExecutionsPerCustomer?: number | null;
  version?: number;
  workflowDefinition?: Record<string, any> | null;
  draftDefinition?: Record<string, any> | null;
}

export interface UpdateAutomationRuleDTO {
  name?: string;
  description?: string;
  triggerEvent?: CustomerEventType | string;
  branchId?: string | null;
  workflowType?: RetentionWorkflowType | null;
  retentionConfig?: Record<string, any> | null;
  conditionConfig?: SegmentRuleDefinition | Record<string, any>;
  actionType?: AutomationActionType;
  actionConfig?: SendCampaignActionConfig | Record<string, any>;
  cooldownMinutes?: number;
  maxExecutionsPerCustomer?: number | null;
  version?: number;
  workflowDefinition?: Record<string, any> | null;
  draftDefinition?: Record<string, any> | null;
}

export interface AutomationExecutionFilter {
  ruleId?: string;
  customerId?: string;
  status?: ExecutionStatus;
  limit?: number;
  offset?: number;
}

export interface AutomationRuleItem {
  id: string;
  businessId: string;
  branchId: string | null;
  name: string;
  description: string | null;
  triggerEvent: CustomerEventType;
  workflowType?: RetentionWorkflowType | null;
  retentionConfig?: any;
  conditionConfig: any;
  actionType: AutomationActionType;
  actionConfig: any;
  status: RuleStatus;
  version: number;
  workflowDefinition?: any;
  draftDefinition?: any;
  cooldownMinutes: number;
  maxExecutionsPerCustomer: number | null;
  createdAt: Date;
  updatedAt: Date;
  branch?: {
    id: string;
    name: string;
  } | null;
  _count?: {
    executions: number;
  };
}

export interface AutomationExecutionItem {
  id: string;
  ruleId: string;
  businessId: string;
  branchId: string | null;
  customerId: string;
  eventId: string | null;
  campaignExecutionId: string | null;
  triggerEvent: CustomerEventType;
  status: ExecutionStatus;
  resultMetadata: any;
  skipReason: string | null;
  lastError: string | null;
  attemptCount: number;
  idempotencyKey: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  executedAt: Date;
  createdAt: Date;
  customer?: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
  rule?: {
    id: string;
    name: string;
    triggerEvent: CustomerEventType;
  };
}
