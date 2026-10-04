/**
 * Reployty V2 — Phase 24 Win-back, Birthday & Inactivity Re-engagement Workflows
 * Retention Types, Configurations & Predefined Templates
 */

import { RetentionWorkflowType, RuleStatus, CustomerEventType } from '@prisma/client';
import { SegmentRuleDefinition } from './segment';

export { RetentionWorkflowType, RuleStatus, CustomerEventType };

/**
 * February 29 Leap-Year Policy:
 * In non-leap years (where Feb 29 does not exist on the calendar):
 * - FEB_28: The customer's birthday treat is celebrated on February 28 (recommended in retention loyalty)
 * - MAR_1: The customer's birthday treat is celebrated on March 1
 */
export type LeapYearFeb29Policy = 'FEB_28' | 'MAR_1';

/**
 * Configuration for Inactivity Re-engagement Workflows
 */
export interface InactivityWorkflowConfig {
  inactivityDays: number; // e.g. 14, 30, 45, 60
  includeNeverVisited?: boolean; // If true, customers who joined but never visited are also eligible based on joinedAt
  timezone?: string; // Business/branch IANA timezone, defaults to business timezone
  segmentId?: string | null; // Optional dynamic segment ID
  branchId?: string | null; // Branch-specific scope or null for all branches
  campaignId: string; // Target Phase 22 campaign ID
  cooldownDays?: number; // Minimum days between re-engagement touches
  maxExecutionsPerCustomer?: number | null; // Max executions per customer per lifetime or cycle
}

/**
 * Configuration for Win-Back Workflows
 */
export interface WinBackWorkflowConfig {
  winBackThresholdDays: number; // e.g. 60, 90, 120, 180
  timezone?: string;
  segmentId?: string | null;
  branchId?: string | null;
  campaignId: string;
  cooldownDays?: number;
  maxExecutionsPerCustomer?: number | null;
}

/**
 * Configuration for Birthday Workflows
 */
export interface BirthdayWorkflowConfig {
  daysBefore: number; // 0 = day of birthday, 1 = 1 day before, 7 = 1 week before, etc. (max 30)
  leapYearFeb29Policy?: LeapYearFeb29Policy; // Default 'FEB_28'
  timezone?: string;
  segmentId?: string | null;
  branchId?: string | null;
  campaignId: string;
  cooldownDays?: number;
  maxExecutionsPerCustomer?: number | null;
}

export type RetentionWorkflowConfig =
  | InactivityWorkflowConfig
  | WinBackWorkflowConfig
  | BirthdayWorkflowConfig;

/**
 * Predefined Retention Workflow Template Definition
 */
export interface RetentionWorkflowTemplate {
  id: string;
  name: string;
  description: string;
  workflowType: RetentionWorkflowType;
  defaultTriggerEvent: CustomerEventType;
  defaultConfig: {
    inactivityDays?: number;
    winBackThresholdDays?: number;
    daysBefore?: number;
    cooldownDays: number;
    maxExecutionsPerCustomer?: number | null;
    leapYearFeb29Policy?: LeapYearFeb29Policy;
  };
  conditionPreset?: SegmentRuleDefinition;
  recommendedChannel: 'WHATSAPP' | 'SMS' | 'EMAIL';
  suggestedCopy: string;
}

/**
 * Predefined Retention Templates
 */
export const RETENTION_TEMPLATES: RetentionWorkflowTemplate[] = [
  {
    id: 'template_inactivity_30d',
    name: '30-Day Lapsed Inactivity Check-in',
    description: 'Automatically engage customers who haven\'t visited in 30 days with a friendly reminder.',
    workflowType: 'INACTIVITY',
    defaultTriggerEvent: 'CUSTOMER_BECAME_INACTIVE',
    defaultConfig: {
      inactivityDays: 30,
      cooldownDays: 14,
      maxExecutionsPerCustomer: 3,
    },
    recommendedChannel: 'WHATSAPP',
    suggestedCopy: 'Hi {{customer.name}}, we haven\'t seen you at {{business.name}} lately! We have special perks waiting for you.',
  },
  {
    id: 'template_inactivity_60d',
    name: '60-Day Warm Re-engagement',
    description: 'Reach out to customers inactive for 60 days with a special comeback incentive.',
    workflowType: 'INACTIVITY',
    defaultTriggerEvent: 'CUSTOMER_BECAME_INACTIVE',
    defaultConfig: {
      inactivityDays: 60,
      cooldownDays: 30,
      maxExecutionsPerCustomer: 2,
    },
    recommendedChannel: 'WHATSAPP',
    suggestedCopy: 'We miss you, {{customer.name}}! Drop by {{business.name}} this week and enjoy a special treat on us.',
  },
  {
    id: 'template_winback_90d',
    name: '90-Day VIP Win-back Campaign',
    description: 'High-value recovery workflow for customers inactive for 90+ days with an exclusive offer.',
    workflowType: 'WIN_BACK',
    defaultTriggerEvent: 'CUSTOMER_BECAME_INACTIVE',
    defaultConfig: {
      winBackThresholdDays: 90,
      cooldownDays: 45,
      maxExecutionsPerCustomer: 1,
    },
    recommendedChannel: 'WHATSAPP',
    suggestedCopy: 'It\'s been a while, {{customer.name}}! Here is an exclusive offer to welcome you back to {{business.name}}.',
  },
  {
    id: 'template_birthday_sameday',
    name: 'Birthday Day-of Celebration Treat',
    description: 'Delight customers on their birthday with a personalized reward and greeting.',
    workflowType: 'BIRTHDAY',
    defaultTriggerEvent: 'CUSTOMER_BIRTHDAY',
    defaultConfig: {
      daysBefore: 0,
      cooldownDays: 330,
      maxExecutionsPerCustomer: 1,
      leapYearFeb29Policy: 'FEB_28',
    },
    recommendedChannel: 'WHATSAPP',
    suggestedCopy: 'Happy Birthday {{customer.name}}! 🎂 Celebrate your special day at {{business.name}} with a gift on us.',
  },
  {
    id: 'template_birthday_early_7d',
    name: '7-Day Early Birthday Invitation',
    description: 'Invite customers 7 days ahead of their birthday to book or plan their celebration.',
    workflowType: 'BIRTHDAY',
    defaultTriggerEvent: 'CUSTOMER_BIRTHDAY',
    defaultConfig: {
      daysBefore: 7,
      cooldownDays: 330,
      maxExecutionsPerCustomer: 1,
      leapYearFeb29Policy: 'FEB_28',
    },
    recommendedChannel: 'WHATSAPP',
    suggestedCopy: 'Your birthday is next week, {{customer.name}}! Plan your celebration with us at {{business.name}}.',
  },
];

/**
 * DTO for Creating a Retention Workflow
 */
export interface CreateRetentionWorkflowDTO {
  name: string;
  description?: string;
  workflowType: RetentionWorkflowType;
  branchId?: string | null;
  campaignId: string;
  config: RetentionWorkflowConfig;
  conditionConfig?: SegmentRuleDefinition | Record<string, any>;
  cooldownDays?: number;
  maxExecutionsPerCustomer?: number | null;
}

/**
 * DTO for Updating a Retention Workflow
 */
export interface UpdateRetentionWorkflowDTO {
  name?: string;
  description?: string;
  branchId?: string | null;
  campaignId?: string;
  config?: Partial<RetentionWorkflowConfig>;
  conditionConfig?: SegmentRuleDefinition | Record<string, any>;
  cooldownDays?: number;
  maxExecutionsPerCustomer?: number | null;
}

/**
 * Retention Workflow Preview Request & Response
 */
export interface RetentionPreviewParams {
  workflowType: RetentionWorkflowType;
  inactivityDays?: number;
  winBackThresholdDays?: number;
  daysBefore?: number;
  includeNeverVisited?: boolean;
  branchId?: string | null;
  segmentId?: string | null;
  campaignId?: string | null;
  leapYearFeb29Policy?: LeapYearFeb29Policy;
}

export interface RetentionPreviewSampleCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  lastVisitAt: string | null;
  daysInactive?: number;
  birthday?: string | null;
  nextBirthdayFormatted?: string;
  branchId: string | null;
  branchName?: string;
  marketingConsent: boolean;
}

export interface RetentionPreviewResult {
  workflowType: RetentionWorkflowType;
  totalEligibleCount: number;
  consentedCount: number;
  unconsentedCount: number;
  sampleCustomers: RetentionPreviewSampleCustomer[];
  summary: {
    thresholdDays?: number;
    daysBefore?: number;
    timezone: string;
    evaluatedAt: string;
    branchScope: string;
  };
}

/**
 * Safe Simulation Trace
 */
export interface RetentionSimulationParams {
  ruleId: string;
  customerId?: string; // Optional: evaluate against specific real customer
  mockCustomer?: {
    name?: string;
    phone?: string;
    lastVisitAt?: string;
    birthday?: string;
    marketingConsent?: boolean;
  };
}

export interface RetentionSimulationTraceStep {
  name: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  detail: string;
  metadata?: Record<string, any>;
}

export interface RetentionSimulationResult {
  ruleId: string;
  workflowType: RetentionWorkflowType;
  evaluatedCustomer: {
    id: string;
    name: string;
    phone: string;
    lastVisitAt: string | null;
    birthday: string | null;
  };
  overallEligible: boolean;
  actionTaken: 'WOULD_QUEUE_DELIVERY' | 'WOULD_SKIP';
  skipReason?: string | null;
  steps: RetentionSimulationTraceStep[];
  idempotencyKeyCalculated: string;
}
