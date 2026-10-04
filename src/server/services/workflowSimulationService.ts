/**
 * Reployty V2 — Phase 27 Visual Drag-and-Drop Workflow Builder
 * Workflow Simulation Service
 * 
 * Safely tests visual workflows against customer data fixtures.
 * CRITICAL SAFETY: Never dispatches messages to external messaging providers or adds items to delivery queue.
 */

import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { compileRuleDefinition } from './segmentationService';
import { validateWorkflowDefinition } from './workflowCompilerService';
import { mapCampaignChannelToConsent } from './campaignAudienceService';
import { normalizeTriggerEvent, CustomerEventType } from '../../types/automation';
import {
  WorkflowDefinition,
  WorkflowSimulationResult,
  WorkflowSimulationStep,
  WorkflowNode,
} from '../../types/workflow';

export async function simulateWorkflow(
  ctx: TenantContext,
  definition: WorkflowDefinition,
  params: {
    customerId?: string;
    eventType?: CustomerEventType | string;
    metadata?: Record<string, any>;
  } = {}
): Promise<WorkflowSimulationResult> {
  const businessId = ctx.businessId;

  // 1. Validate structure first
  const validation = await validateWorkflowDefinition(businessId, definition, { requireExecutable: true });
  if (!validation.valid) {
    return {
      success: false,
      steps: validation.errors.map((e) => ({
        nodeId: e.nodeId || 'unknown',
        nodeType: 'TRIGGER',
        status: 'FAILED',
        title: 'Validation Error',
        details: e.message,
        timestamp: new Date().toISOString(),
      })),
      pathTaken: [],
      waitDurationMinutes: 0,
      wouldDispatch: false,
      summary: `Workflow validation failed: ${validation.errors[0]?.message}`,
    };
  }

  // 2. Resolve target simulation customer
  let customer: any = null;
  if (params.customerId) {
    customer = await prisma.customer.findFirst({
      where: { id: params.customerId, businessId },
      include: { consents: true },
    });
  }

  if (!customer) {
    // Pick the most recent customer for testing
    customer = await prisma.customer.findFirst({
      where: { businessId },
      include: { consents: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!customer) {
    return {
      success: false,
      steps: [
        {
          nodeId: 'init',
          nodeType: 'TRIGGER',
          status: 'FAILED',
          title: 'Simulation Error',
          details: 'No customer found in business for simulation test',
          timestamp: new Date().toISOString(),
        },
      ],
      pathTaken: [],
      waitDurationMinutes: 0,
      wouldDispatch: false,
      summary: 'No customer available in business to evaluate simulation',
    };
  }

  const nodes = definition.nodes;
  const edges = definition.edges;
  const nodeMap = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]));

  const triggerNode = nodes.find((n) => n.type === 'TRIGGER')!;
  const rawTrigger = (triggerNode.config as any)?.triggerEvent;
  const triggerEvent = normalizeTriggerEvent(rawTrigger);

  const steps: WorkflowSimulationStep[] = [];
  const pathTaken: string[] = [triggerNode.id];
  let waitDurationMinutes = 0;
  let wouldDispatch = false;
  let targetCampaignId: string | undefined;
  let targetCampaignName: string | undefined;

  // Step 1: Trigger match
  steps.push({
    nodeId: triggerNode.id,
    nodeType: 'TRIGGER',
    status: 'MATCHED',
    title: 'Trigger Evaluated',
    details: `Trigger [${triggerEvent}] matched simulation event for customer ${customer.name || customer.phone}`,
    timestamp: new Date().toISOString(),
  });

  // Graph Traversal
  let currentNodeId = triggerNode.id;
  let maxHops = 30; // Safety guard against infinite traversal

  while (maxHops-- > 0) {
    const currentNode = nodeMap.get(currentNodeId);
    if (!currentNode || currentNode.type === 'END') {
      if (currentNode && currentNode.type === 'END') {
        steps.push({
          nodeId: currentNode.id,
          nodeType: 'END',
          status: 'TERMINATED',
          title: 'Workflow End',
          details: 'Terminal node reached. Workflow execution finished successfully.',
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    const outgoingEdges = edges.filter((e) => e.source === currentNodeId);
    if (outgoingEdges.length === 0) {
      break;
    }

    // Branch / Condition Evaluation
    if (currentNode.type === 'CONDITION' || currentNode.type === 'BRANCH') {
      const config = currentNode.config || {};
      let satisfies = true;

      let conditionConfig: any = null;
      if (config.ruleDefinition?.conditions?.length) {
        conditionConfig = config.ruleDefinition;
      } else if (config.field) {
        conditionConfig = {
          logic: 'AND',
          conditions: [
            {
              field: config.field,
              operator: config.operator || 'EQUALS',
              value: config.value,
            },
          ],
        };
      }

      if (conditionConfig) {
        try {
          const conditionWhere = compileRuleDefinition(conditionConfig, businessId, null);
          const match = await prisma.customer.findFirst({
            where: {
              AND: [{ id: customer.id }, conditionWhere],
            },
            select: { id: true },
          });
          satisfies = Boolean(match);
        } catch {
          satisfies = false;
        }
      }

      const branchChoice = satisfies ? 'YES' : 'NO';

      steps.push({
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        status: satisfies ? 'PASSED' : 'FAILED',
        title: `Condition Evaluated: ${satisfies ? 'TRUE' : 'FALSE'}`,
        details: `Customer ${customer.name} ${satisfies ? 'met' : 'did not meet'} condition criteria. Following ${branchChoice} branch.`,
        timestamp: new Date().toISOString(),
        outputHandle: branchChoice,
      });

      // Find matching edge for YES / NO
      let nextEdge = outgoingEdges.find(
        (e) => (e.sourceHandle || e.label || '').toUpperCase() === branchChoice
      );

      // Fallback: if not explicitly tagged, index 0 is YES, index 1 is NO
      if (!nextEdge) {
        nextEdge = satisfies ? outgoingEdges[0] : (outgoingEdges[1] || outgoingEdges[0]);
      }

      if (nextEdge && nodeMap.has(nextEdge.target)) {
        currentNodeId = nextEdge.target;
        pathTaken.push(currentNodeId);
      } else {
        break;
      }
      continue;
    }

    // Single Outgoing Edge Processing (WAIT, ACTION, etc.)
    const nextEdge = outgoingEdges[0];
    const nextNode = nodeMap.get(nextEdge.target);
    if (!nextNode) break;

    currentNodeId = nextNode.id;
    pathTaken.push(currentNodeId);

    if (nextNode.type === 'WAIT') {
      const duration = Number(nextNode.config?.duration || 0);
      const unit = nextNode.config?.unit || 'DAYS';
      let mins = duration;
      if (unit === 'HOURS') mins = duration * 60;
      if (unit === 'DAYS') mins = duration * 24 * 60;
      waitDurationMinutes += mins;

      steps.push({
        nodeId: nextNode.id,
        nodeType: 'WAIT',
        status: 'SCHEDULED',
        title: 'Wait Scheduled',
        details: `Execution delayed by ${duration} ${unit} (${mins} minutes)`,
        timestamp: new Date().toISOString(),
      });
    } else if (nextNode.type === 'ACTION') {
      const campaignId = (nextNode.config as any)?.campaignId;
      if (campaignId) {
        targetCampaignId = campaignId;
        const campaign = await prisma.campaign.findFirst({
          where: { id: campaignId, businessId },
        });

        if (campaign) {
          targetCampaignName = campaign.name;
          const consentChannel = mapCampaignChannelToConsent(campaign.channel);
          const hasConsent = customer.consents?.some(
            (c: any) => c.channel === consentChannel && c.granted
          );

          if (!hasConsent) {
            steps.push({
              nodeId: nextNode.id,
              nodeType: 'ACTION',
              status: 'SKIPPED',
              title: 'Action Suppressed: No Consent',
              details: `Customer has not granted consent for ${consentChannel}. In real execution, message would be suppressed.`,
              timestamp: new Date().toISOString(),
            });
          } else {
            wouldDispatch = true;
            steps.push({
              nodeId: nextNode.id,
              nodeType: 'ACTION',
              status: 'EXECUTED',
              title: `Action: Send Campaign [${campaign.name}]`,
              details: `Customer is eligible. Would dispatch via ${campaign.channel}. (Safe simulation: zero real messages sent)`,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    }
  }

  const summary = wouldDispatch
    ? `Simulation completed: Would send campaign "${targetCampaignName || targetCampaignId}" after ${waitDurationMinutes} mins delay.`
    : 'Simulation completed: Workflow ended without sending a campaign for this customer fixture.';

  return {
    success: true,
    steps,
    pathTaken,
    targetCampaignId,
    targetCampaignName,
    waitDurationMinutes,
    wouldDispatch,
    summary,
    evaluatedCustomer: {
      id: customer.id,
      name: customer.name || 'Unnamed Customer',
      phone: customer.phone,
    },
  };
}
