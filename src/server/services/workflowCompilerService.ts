/**
 * Reployty V2 — Phase 27 Visual Drag-and-Drop Workflow Builder
 * Workflow Validation & Compiler Service
 * 
 * Compiles a visual DAG workflow definition into executable Phase 23 AutomationRule format.
 * Guarantees zero duplicate execution engines — Phase 23 remains authoritative.
 */

import { prisma } from '../db/client';
import { AutomationActionType } from '@prisma/client';
import { normalizeTriggerEvent } from '../../types/automation';
import { validateRuleDefinition } from './segmentationService';
import {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowValidationResult,
  WorkflowValidationError,
  CompiledAutomationConfig,
  WORKFLOW_LIMITS,
  WaitTimeUnit,
} from '../../types/workflow';


export class WorkflowCompilerError extends Error {
  code: string;
  errors: WorkflowValidationError[];
  constructor(message: string, errors: WorkflowValidationError[] = []) {
    super(message);
    this.name = 'WorkflowCompilerError';
    this.code = 'WORKFLOW_VALIDATION_ERROR';
    this.errors = errors;
  }
}

/**
 * Converts any time unit to minutes.
 */
export function convertToMinutes(duration: number, unit: WaitTimeUnit): number {
  switch (unit) {
    case 'MINUTES':
      return Math.round(duration);
    case 'HOURS':
      return Math.round(duration * 60);
    case 'DAYS':
      return Math.round(duration * 24 * 60);
    default:
      return Math.round(duration);
  }
}

/**
 * Validates a workflow definition graph for structural integrity, limits,
 * cycle avoidance, and tenant-scoped asset references.
 */
export async function validateWorkflowDefinition(
  businessId: string,
  definition: WorkflowDefinition,
  options: { requireExecutable?: boolean } = {}
): Promise<WorkflowValidationResult> {
  const errors: WorkflowValidationError[] = [];
  const warnings: string[] = [];

  if (!definition || typeof definition !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'INVALID_DEFINITION', message: 'Workflow definition must be an object' }],
      warnings: [],
    };
  }

  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition.edges) ? definition.edges : [];

  // 1. Limit Checks
  if (nodes.length > WORKFLOW_LIMITS.MAX_NODES) {
    errors.push({
      code: 'MAX_NODES_EXCEEDED',
      message: `Workflow exceeds maximum allowed node limit of ${WORKFLOW_LIMITS.MAX_NODES} (found ${nodes.length})`,
    });
  }

  if (edges.length > WORKFLOW_LIMITS.MAX_EDGES) {
    errors.push({
      code: 'MAX_EDGES_EXCEEDED',
      message: `Workflow exceeds maximum allowed edge limit of ${WORKFLOW_LIMITS.MAX_EDGES} (found ${edges.length})`,
    });
  }

  // 2. Node Map & Duplicate ID Check
  const nodeMap = new Map<string, WorkflowNode>();
  const duplicateNodeIds = new Set<string>();

  for (const node of nodes) {
    if (!node.id || typeof node.id !== 'string') {
      errors.push({ code: 'INVALID_NODE_ID', message: 'Node is missing a valid string ID' });
      continue;
    }
    if (nodeMap.has(node.id)) {
      duplicateNodeIds.add(node.id);
    } else {
      nodeMap.set(node.id, node);
    }
  }

  for (const dupId of duplicateNodeIds) {
    errors.push({
      nodeId: dupId,
      code: 'DUPLICATE_NODE_ID',
      message: `Duplicate node ID detected: [${dupId}]`,
    });
  }

  // 3. Trigger Node Count & Validation
  const triggerNodes = nodes.filter((n) => n.type === 'TRIGGER');
  if (triggerNodes.length === 0) {
    errors.push({
      code: 'MISSING_TRIGGER',
      message: 'Workflow must have exactly one TRIGGER node',
    });
  } else if (triggerNodes.length > 1) {
    errors.push({
      code: 'MULTIPLE_TRIGGERS',
      message: `Workflow can have only one TRIGGER node (found ${triggerNodes.length})`,
    });
  } else {
    const trigger = triggerNodes[0];
    const rawTrigger = (trigger.config as any)?.triggerEvent;
    if (!rawTrigger) {
      errors.push({
        nodeId: trigger.id,
        code: 'TRIGGER_EVENT_REQUIRED',
        message: 'TRIGGER node requires a triggerEvent configuration',
      });
    } else {
      try {
        normalizeTriggerEvent(rawTrigger);
      } catch (err: any) {
        errors.push({
          nodeId: trigger.id,
          code: 'UNSUPPORTED_TRIGGER',
          message: err.message || `Unsupported trigger event [${rawTrigger}]`,
        });
      }
    }
  }

  // 4. End Node Check (for executable workflows)
  const endNodes = nodes.filter((n) => n.type === 'END');
  if (options.requireExecutable && endNodes.length === 0) {
    errors.push({
      code: 'MISSING_END_NODE',
      message: 'Workflow must have at least one terminal END node to be executable',
    });
  }

  // 5. Edges Integrity & Adjacency Construction
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  const seenEdgeIds = new Set<string>();

  for (const edge of edges) {
    if (!edge.id) {
      errors.push({ code: 'INVALID_EDGE_ID', message: 'Edge is missing an ID' });
      continue;
    }
    if (seenEdgeIds.has(edge.id)) {
      errors.push({ edgeId: edge.id, code: 'DUPLICATE_EDGE_ID', message: `Duplicate edge ID: [${edge.id}]` });
    }
    seenEdgeIds.add(edge.id);

    if (!nodeMap.has(edge.source)) {
      errors.push({
        edgeId: edge.id,
        code: 'INVALID_EDGE_SOURCE',
        message: `Edge source [${edge.source}] does not exist in nodes`,
      });
      continue;
    }

    if (!nodeMap.has(edge.target)) {
      errors.push({
        edgeId: edge.id,
        code: 'INVALID_EDGE_TARGET',
        message: `Edge target [${edge.target}] does not exist in nodes`,
      });
      continue;
    }

    if (edge.source === edge.target) {
      errors.push({
        edgeId: edge.id,
        nodeId: edge.source,
        code: 'SELF_LOOP_DETECTED',
        message: `Node [${edge.source}] connects to itself (self-loops are forbidden)`,
      });
      continue;
    }

    adj.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // 6. Cycle Detection via DFS (Acyclic Graph Protection)
  const visited = new Set<string>();
  const recStack = new Set<string>();
  let hasCycle = false;

  function dfsCycle(nodeId: string, path: string[]) {
    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfsCycle(neighbor, [...path, neighbor]);
      } else if (recStack.has(neighbor)) {
        hasCycle = true;
        errors.push({
          nodeId,
          code: 'INVALID_CYCLE',
          message: `Cycle detected in workflow graph: ${[...path, neighbor].join(' -> ')}. Workflows must be acyclic.`,
        });
        return;
      }
    }

    recStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfsCycle(node.id, [node.id]);
      if (hasCycle) break;
    }
  }

  // 7. Reachability and Terminal Path Checks (if requireExecutable)
  if (options.requireExecutable && triggerNodes.length === 1 && !hasCycle) {
    const triggerId = triggerNodes[0].id;

    // Reachable from trigger
    const reachableFromTrigger = new Set<string>();
    const q = [triggerId];
    reachableFromTrigger.add(triggerId);

    while (q.length > 0) {
      const curr = q.shift()!;
      for (const next of adj.get(curr) || []) {
        if (!reachableFromTrigger.has(next)) {
          reachableFromTrigger.add(next);
          q.push(next);
        }
      }
    }

    for (const node of nodes) {
      if (!reachableFromTrigger.has(node.id)) {
        errors.push({
          nodeId: node.id,
          code: 'ORPHAN_NODE',
          message: `Node [${node.id}] (${node.type}) is not reachable from the TRIGGER node`,
        });
      }
    }

    // Terminal path: every non-END node must have outgoing edges reaching END
    for (const node of nodes) {
      if (node.type !== 'END') {
        const outgoing = adj.get(node.id) || [];
        if (outgoing.length === 0) {
          errors.push({
            nodeId: node.id,
            code: 'DEAD_END_NODE',
            message: `Node [${node.id}] (${node.type}) has no outgoing connection to an END or subsequent node`,
          });
        }
      }
    }
  }

  // 8. Node Configuration Specific Validation
  for (const node of nodes) {
    const config = node.config || {};

    if (node.type === 'WAIT') {
      const duration = Number(config.duration);
      const unit = config.unit as WaitTimeUnit;
      if (isNaN(duration) || duration <= 0) {
        errors.push({
          nodeId: node.id,
          code: 'INVALID_WAIT_DURATION',
          message: `WAIT node [${node.id}] requires a positive duration`,
        });
      } else if (!['MINUTES', 'HOURS', 'DAYS'].includes(unit)) {
        errors.push({
          nodeId: node.id,
          code: 'INVALID_WAIT_UNIT',
          message: `WAIT node [${node.id}] unit must be MINUTES, HOURS, or DAYS`,
        });
      } else {
        const minutes = convertToMinutes(duration, unit);
        if (minutes > WORKFLOW_LIMITS.MAX_WAIT_MINUTES) {
          errors.push({
            nodeId: node.id,
            code: 'WAIT_DURATION_EXCEEDED',
            message: `WAIT duration exceeds maximum limit of 90 days (${WORKFLOW_LIMITS.MAX_WAIT_MINUTES} mins)`,
          });
        }
      }
    } else if (node.type === 'ACTION') {
      const actionType = config.actionType || 'SEND_CAMPAIGN';
      if (actionType !== 'SEND_CAMPAIGN') {
        errors.push({
          nodeId: node.id,
          code: 'UNSUPPORTED_ACTION_TYPE',
          message: `ACTION node [${node.id}] has unsupported actionType [${actionType}]`,
        });
      }

      const campaignId = config.campaignId;
      if (options.requireExecutable && !campaignId) {
        errors.push({
          nodeId: node.id,
          code: 'CAMPAIGN_REQUIRED',
          message: `ACTION node [${node.id}] requires a selected campaign`,
        });
      } else if (campaignId) {
        // Tenant security check: campaign must exist in current business
        const campaign = await prisma.campaign.findFirst({
          where: { id: campaignId, businessId },
          select: { id: true, name: true, status: true },
        });

        if (!campaign) {
          errors.push({
            nodeId: node.id,
            code: 'CAMPAIGN_NOT_FOUND',
            message: `Selected campaign [${campaignId}] was not found in your business`,
          });
        } else if (campaign.status === 'CANCELLED' || campaign.status === 'COMPLETED') {
          warnings.push(`Campaign [${campaign.name}] is currently ${campaign.status.toLowerCase()}`);
        }
      }
    } else if (node.type === 'CONDITION') {

      // Validate Phase 21 condition schema
      if (config.ruleDefinition) {
        try {
          validateRuleDefinition(config.ruleDefinition);
        } catch (err: any) {
          errors.push({
            nodeId: node.id,
            code: 'INVALID_CONDITION_RULE',
            message: err.message || `Invalid condition rule in node [${node.id}]`,
          });
        }
      } else if (config.field) {
        try {
          validateRuleDefinition({
            logic: 'AND',
            conditions: [{ field: config.field, operator: config.operator || 'EQUALS', value: config.value }],
          });
        } catch (err: any) {
          errors.push({
            nodeId: node.id,
            code: 'INVALID_CONDITION_FIELD',
            message: err.message || `Invalid condition field [${config.field}] in node [${node.id}]`,
          });
        }
      }
    } else if (node.type === 'BRANCH') {
      const outgoingEdges = edges.filter((e) => e.source === node.id);
      if (options.requireExecutable) {
        if (outgoingEdges.length < 2) {
          errors.push({
            nodeId: node.id,
            code: 'BRANCH_DESTINATIONS_REQUIRED',
            message: `BRANCH node [${node.id}] requires at least 2 branches (YES and NO)`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Compiles a validated visual workflow definition into a structured format
 * compatible with the existing Phase 23 AutomationRule execution engine.
 */
export async function compileWorkflowDefinition(
  businessId: string,
  definition: WorkflowDefinition
): Promise<CompiledAutomationConfig> {
  const validation = await validateWorkflowDefinition(businessId, definition, { requireExecutable: true });
  if (!validation.valid) {
    throw new WorkflowCompilerError(
      `Workflow validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      validation.errors
    );
  }

  const nodes = definition.nodes;
  const triggerNode = nodes.find((n) => n.type === 'TRIGGER')!;
  const canonicalTrigger = normalizeTriggerEvent(triggerNode.config.triggerEvent!);

  // Trace paths from trigger to actions/ends
  const actionNodes = nodes.filter((n) => n.type === 'ACTION');
  const compiledPaths: CompiledAutomationConfig['paths'] = [];

  const combinedConditions: any[] = [];
  let resolvedCampaignId = '';
  let maxWaitMinutes = 0;
  let cooldownHours = 0;

  for (const actionNode of actionNodes) {
    const campaignId = (actionNode.config as any)?.campaignId || '';
    if (campaignId && !resolvedCampaignId) {
      resolvedCampaignId = campaignId;
      cooldownHours = (actionNode.config as any)?.cooldownHours || 0;
    }

    compiledPaths.push({
      pathId: `path_${actionNode.id}`,
      campaignId,
      waitMinutes: 0,
    });
  }

  // Collect conditions from all CONDITION nodes
  const conditionNodes = nodes.filter((n) => n.type === 'CONDITION');
  for (const cNode of conditionNodes) {
    const cConfig = cNode.config || {};
    if (cConfig.ruleDefinition?.conditions?.length) {
      combinedConditions.push(...cConfig.ruleDefinition.conditions);
    } else if (cConfig.field) {
      combinedConditions.push({
        field: cConfig.field,
        operator: cConfig.operator || 'EQUALS',
        value: cConfig.value,
      });
    }
  }

  // Collect wait durations from WAIT nodes
  const waitNodes = nodes.filter((n) => n.type === 'WAIT');
  for (const wNode of waitNodes) {
    const duration = Number(wNode.config?.duration || 0);
    const unit = (wNode.config?.unit || 'DAYS') as WaitTimeUnit;
    const mins = convertToMinutes(duration, unit);
    if (mins > maxWaitMinutes) {
      maxWaitMinutes = mins;
    }
  }

  const compiledConditionConfig = combinedConditions.length > 0
    ? {
        logic: 'AND',
        conditions: combinedConditions,
      }
    : {};

  return {
    triggerEvent: canonicalTrigger,
    conditionConfig: compiledConditionConfig,
    actionType: AutomationActionType.SEND_CAMPAIGN,
    actionConfig: {
      campaignId: resolvedCampaignId,
      cooldownHours,
      waitDurationMinutes: maxWaitMinutes,
    },
    cooldownMinutes: maxWaitMinutes > 0 ? maxWaitMinutes : (cooldownHours * 60),
    paths: compiledPaths,
  };
}
