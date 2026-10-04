/**
 * Reployty V2 — Phase 27 Visual Drag-and-Drop Workflow Builder
 * Workflow Types & Schema Definitions
 */

import { CustomerEventType, AutomationActionType } from '@prisma/client';
import { SegmentRuleDefinition } from './segment';

export type WorkflowNodeType =
  | 'TRIGGER'
  | 'CONDITION'
  | 'WAIT'
  | 'ACTION'
  | 'BRANCH'
  | 'END';

export type WaitTimeUnit = 'MINUTES' | 'HOURS' | 'DAYS';

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface TriggerNodeConfig {
  triggerEvent: CustomerEventType | string;
  label?: string;
  description?: string;
}

export interface ConditionNodeConfig {
  field?: string;
  operator?: string;
  value?: any;
  ruleDefinition?: SegmentRuleDefinition;
  description?: string;
}

export interface WaitNodeConfig {
  duration: number;
  unit: WaitTimeUnit;
  description?: string;
}

export interface ActionNodeConfig {
  actionType: AutomationActionType | 'SEND_CAMPAIGN';
  campaignId?: string;
  campaignName?: string;
  cooldownHours?: number;
  description?: string;
}

export interface BranchNodeConfig {
  conditionNodeId?: string;
  description?: string;
}

export interface EndNodeConfig {
  reason?: string;
  description?: string;
}

export interface WorkflowNodeConfig {
  triggerEvent?: CustomerEventType | string;
  field?: string;
  operator?: string;
  value?: any;
  ruleDefinition?: SegmentRuleDefinition;
  duration?: number;
  unit?: WaitTimeUnit;
  actionType?: AutomationActionType | 'SEND_CAMPAIGN';
  campaignId?: string;
  campaignName?: string;
  cooldownHours?: number;
  conditionNodeId?: string;
  reason?: string;
  label?: string;
  description?: string;
  [key: string]: any;
}


export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config: WorkflowNodeConfig;
  label?: string;
  customName?: string;
}

export type EdgeHandleType = 'YES' | 'NO' | 'default' | 'source' | 'target';

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

export interface WorkflowViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkflowDefinition {
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: WorkflowViewport;
}

export interface WorkflowValidationError {
  nodeId?: string;
  edgeId?: string;
  code: string;
  message: string;
  field?: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationError[];
  warnings: string[];
}

export interface CompiledAutomationConfig {
  name?: string;
  triggerEvent: CustomerEventType;
  conditionConfig: SegmentRuleDefinition | Record<string, any>;
  actionType: AutomationActionType;
  actionConfig: {
    campaignId: string;
    cooldownHours?: number;
    waitDurationMinutes?: number;
    [key: string]: any;
  };
  cooldownMinutes: number;
  paths: Array<{
    pathId: string;
    conditionConfig?: any;
    waitMinutes?: number;
    campaignId: string;
  }>;
}

export type SimulationStepStatus =
  | 'MATCHED'
  | 'PASSED'
  | 'FAILED'
  | 'SCHEDULED'
  | 'EXECUTED'
  | 'SKIPPED'
  | 'TERMINATED';

export interface WorkflowSimulationStep {
  nodeId: string;
  nodeType: WorkflowNodeType;
  status: SimulationStepStatus;
  title: string;
  details: string;
  timestamp: string;
  outputHandle?: string;
}

export interface WorkflowSimulationResult {
  success: boolean;
  steps: WorkflowSimulationStep[];
  pathTaken: string[];
  targetCampaignId?: string;
  targetCampaignName?: string;
  waitDurationMinutes: number;
  wouldDispatch: boolean;
  summary: string;
  evaluatedCustomer?: {
    id: string;
    name: string;
    phone: string;
  };
}

export interface WorkflowVersionItem {
  id: string;
  ruleId: string;
  businessId: string;
  version: number;
  name: string;
  triggerEvent: CustomerEventType;
  workflowDefinition: WorkflowDefinition | null;
  conditionConfig: any;
  actionConfig: any;
  createdAt: string;
}

export const WORKFLOW_LIMITS = {
  MAX_NODES: 50,
  MAX_EDGES: 75,
  MAX_BRANCH_DEPTH: 5,
  MAX_WAIT_MINUTES: 129600, // 90 days
} as const;
