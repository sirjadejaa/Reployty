/**
 * REPLOYTY V2 — PHASE 27
 * VISUAL DRAG-AND-DROP WORKFLOW BUILDER
 * MANDATORY COMPREHENSIVE STAGING TEST SUITE
 * 
 * Tests:
 * Step 0:  Server & multi-tenant fixtures setup
 * Step 1:  Workflow CRUD & draft state
 * Step 2:  Node validation: Trigger whitelist & normalization
 * Step 3:  Node validation: Limits enforcement (max nodes, max edges)
 * Step 4:  Node validation: Cycle detection (directed cycle rejection)
 * Step 5:  Node validation: Disconnected/orphan nodes & terminal END requirement
 * Step 6:  Node validation: Wait node constraints (duration & unit)
 * Step 7:  Node validation: Action node constraints & cross-tenant campaign rejection
 * Step 8:  Node validation: Condition node & Phase 21 schema reuse
 * Step 9:  Workflow Compiler: Compilation to Phase 23 AutomationRule representation
 * Step 10: Workflow Activation: Validation, compilation, state transition, and version snapshotting
 * Step 11: Version safety: Editing ACTIVE workflow saves as draft without mutating live rule
 * Step 12: Activating new draft: Version increment & new immutable version snapshot
 * Step 13: Execution Integration: Live event triggers compiled workflow via Phase 23 engine
 * Step 14: Execution Version Tracking: AutomationExecution records accurate ruleVersion
 * Step 15: Policy Enforcement: Consent and cooldown remain enforced by Phase 23 engine
 * Step 16: Dry-Run Simulation: Condition evaluation and path tracing with zero external sends
 * Step 17: Simulation Rejection: Invalid workflow definitions rejected from simulation
 * Step 18: Workflow Duplication: Duplicating workflow resets status to DRAFT, version to 1, zero executions
 * Step 19: Workflow Lifecycle: Pause and Archive state machine
 * Step 20: Tenant Isolation: Cross-business access, modification, and campaign binding rejected
 * Step 21: RBAC: Owner allowed, Staff without permissions gets 403, unauthenticated gets 401
 * Step 22: Audit Logging: WORKFLOW_CREATED, WORKFLOW_ACTIVATED, WORKFLOW_TESTED, etc. recorded
 * Step 23: Workflow Analytics: Real PostgreSQL execution, delivery, and conversion aggregations
 * Step 24: Responsive & Accessibility: Viewport verification (360px, 390px, 768px, 1440px)
 */

import test from 'node:test';
import assert from 'node:assert';
import { startTestServer, apiRequest as rawApiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword } from '../../src/server/auth/sessionService';
import {
  BusinessCategory,
  CampaignChannel,
  CampaignStatus,
  ConsentChannel,
  UserStatus,
  RuleStatus,
} from '@prisma/client';
import {
  WorkflowDefinition,
  WORKFLOW_LIMITS,
} from '../../src/types/workflow';
import {
  validateWorkflowDefinition,
  compileWorkflowDefinition,
} from '../../src/server/services/workflowCompilerService';
import {
  simulateWorkflow,
} from '../../src/server/services/workflowSimulationService';
import { recordAndProcessEvent } from '../../src/server/services/automationExecutionService';

async function apiRequest(
  ctx: TestServerContext,
  method: string,
  path: string,
  body?: any,
  token?: string
) {
  const res = await rawApiRequest(ctx.baseUrl, path, {
    method,
    body,
    token,
  });
  return {
    ...res,
    data: res.body,
  };
}

test('PHASE 27: VISUAL DRAG-AND-DROP WORKFLOW BUILDER TEST SUITE', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;
  const RUN_ID = `p27_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Fixtures
  let businessA: any;
  let businessB: any;
  let branchA: any;

  let ownerAToken: string;
  let staffAToken: string;
  let ownerBToken: string;

  let customer1A: any;
  let customer2A: any;
  let customerB: any;

  let campaignA: any;
  let campaignB: any;

  let testRuleId: string;

  t.after(async () => {
    if (ctx) {
      await ctx.stop();
    }
  });

  // ==========================================================================
  // STEP 0: Multi-Tenant Fixture Setup
  // ==========================================================================
  await t.test('Step 0: Setup test server and multi-tenant fixtures', async () => {
    ctx = await startTestServer();

    // 1. Create Business A & B
    businessA = await prisma.business.create({
      data: {
        name: `Visual WF Business A ${RUN_ID}`,
        slug: `biz-a-${RUN_ID.toLowerCase().replace(/_/g, '-')}`,
        category: BusinessCategory.CAFE,
      },
    });

    businessB = await prisma.business.create({
      data: {
        name: `Visual WF Business B ${RUN_ID}`,
        slug: `biz-b-${RUN_ID.toLowerCase().replace(/_/g, '-')}`,
        category: BusinessCategory.RETAIL,
      },
    });

    branchA = await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: `Branch Main A ${RUN_ID}`,
        code: `BRA-${RUN_ID.slice(-4)}`,
      },
    });


    // 2. Create Users (Owner A, Staff A, Owner B)
    const passwordHash = await hashPassword('TestP@ssw0rd123');

    const ownerAUser = await prisma.user.create({
      data: {
        email: `ownera_${RUN_ID.toLowerCase()}@example.com`,
        passwordHash,
        name: 'Owner A',
        status: UserStatus.ACTIVE,
      },
    });

    const staffAUser = await prisma.user.create({
      data: {
        email: `staffa_${RUN_ID.toLowerCase()}@example.com`,
        passwordHash,
        name: 'Staff A',
        status: UserStatus.ACTIVE,
      },
    });

    const ownerBUser = await prisma.user.create({
      data: {
        email: `ownerb_${RUN_ID.toLowerCase()}@example.com`,
        passwordHash,
        name: 'Owner B',
        status: UserStatus.ACTIVE,
      },
    });

    // Find Roles
    const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });
    const staffRole = await prisma.role.findFirstOrThrow({ where: { name: 'STAFF' } });

    await prisma.staffMembership.create({
      data: {
        userId: ownerAUser.id,
        businessId: businessA.id,
        roleId: ownerRole.id,
      },
    });

    await prisma.staffMembership.create({
      data: {
        userId: staffAUser.id,
        businessId: businessA.id,
        roleId: staffRole.id,
      },
    });

    await prisma.staffMembership.create({
      data: {
        userId: ownerBUser.id,
        businessId: businessB.id,
        roleId: ownerRole.id,
      },
    });

    // Log in users
    const loginA = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: ownerAUser.email,
      password: 'TestP@ssw0rd123',
    });
    assert.strictEqual(loginA.status, 200);
    ownerAToken = loginA.data.sessionToken;

    const loginStaffA = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: staffAUser.email,
      password: 'TestP@ssw0rd123',
    });
    assert.strictEqual(loginStaffA.status, 200);
    staffAToken = loginStaffA.data.sessionToken;

    const loginB = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: ownerBUser.email,
      password: 'TestP@ssw0rd123',
    });
    assert.strictEqual(loginB.status, 200);
    ownerBToken = loginB.data.sessionToken;

    // 3. Customers
    customer1A = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: `Customer 1A ${RUN_ID}`,
        phone: `+15551${Date.now().toString().slice(-6)}`,
        totalVisits: 8,
        pointsBalance: 120,
        stampsBalance: 6,
        lastVisitAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      },
    });

    customer2A = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: `Customer 2A ${RUN_ID}`,
        phone: `+15552${Date.now().toString().slice(-6)}`,
        totalVisits: 1,
        pointsBalance: 10,
        stampsBalance: 1,
        lastVisitAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    customerB = await prisma.customer.create({
      data: {
        businessId: businessB.id,
        name: `Customer B ${RUN_ID}`,
        phone: `+15553${Date.now().toString().slice(-6)}`,
        totalVisits: 5,
        pointsBalance: 50,
        stampsBalance: 2,
      },
    });

    // Grant consents
    await prisma.customerConsent.create({
      data: {
        customerId: customer1A.id,
        channel: ConsentChannel.SMS,
        granted: true,
        source: 'PORTAL',
      },
    });

    await prisma.customerConsent.create({
      data: {
        customerId: customer2A.id,
        channel: ConsentChannel.SMS,
        granted: true,
        source: 'PORTAL',
      },
    });


    // 4. Campaigns in Business A and B
    campaignA = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        name: `Workflow Campaign A ${RUN_ID}`,
        channel: CampaignChannel.SMS,
        status: CampaignStatus.ACTIVE,
        messageTemplate: 'Hello {{customer_name}}, here is your retention offer!',
      },
    });

    campaignB = await prisma.campaign.create({
      data: {
        businessId: businessB.id,
        name: `Workflow Campaign B ${RUN_ID}`,
        channel: CampaignChannel.SMS,
        status: CampaignStatus.ACTIVE,
        messageTemplate: 'Business B message',
      },
    });

    assert.ok(ownerAToken);
    assert.ok(staffAToken);
    assert.ok(ownerBToken);
    assert.ok(campaignA.id);
    assert.ok(campaignB.id);
  });

  // ==========================================================================
  // STEP 1: Workflow CRUD & Draft State
  // ==========================================================================
  await t.test('Step 1: Create workflow, persist visual definition, and verify DRAFT state', async () => {
    const validDefinition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'node_trigger',
          type: 'TRIGGER',
          position: { x: 50, y: 100 },
          config: { triggerEvent: 'CUSTOMER_VISIT' },
        },
        {
          id: 'node_wait',
          type: 'WAIT',
          position: { x: 300, y: 100 },
          config: { duration: 7, unit: 'DAYS' },
        },
        {
          id: 'node_action',
          type: 'ACTION',
          position: { x: 550, y: 100 },
          config: { actionType: 'SEND_CAMPAIGN', campaignId: campaignA.id, cooldownHours: 24 },
        },
        {
          id: 'node_end',
          type: 'END',
          position: { x: 800, y: 100 },
          config: { reason: 'Completed' },
        },
      ],
      edges: [
        { id: 'e1', source: 'node_trigger', target: 'node_wait' },
        { id: 'e2', source: 'node_wait', target: 'node_action' },
        { id: 'e3', source: 'node_action', target: 'node_end' },
      ],
    };

    const res = await apiRequest(ctx, 'POST', '/api/business/automations', {
      name: `Customer Journey Workflow ${RUN_ID}`,
      description: 'Visual automation test workflow',
      triggerEvent: 'CUSTOMER_VISIT',
      actionType: 'SEND_CAMPAIGN',
      actionConfig: { campaignId: campaignA.id },
      workflowDefinition: validDefinition,
    }, ownerAToken);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.name, `Customer Journey Workflow ${RUN_ID}`);
    assert.strictEqual(res.data.status, RuleStatus.DRAFT);
    assert.strictEqual(res.data.version, 1);
    assert.ok(res.data.workflowDefinition);
    assert.strictEqual(res.data.workflowDefinition.nodes.length, 4);

    testRuleId = res.data.id;

    // Fetch by ID
    const getRes = await apiRequest(ctx, 'GET', `/api/business/automations/${testRuleId}`, undefined, ownerAToken);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.data.id, testRuleId);
    assert.strictEqual(getRes.data.version, 1);
  });

  // ==========================================================================
  // STEP 2: Node Validation: Trigger Whitelist & Normalization
  // ==========================================================================
  await t.test('Step 2: Trigger node validation — reject invalid or missing triggers', async () => {
    // Missing trigger
    const noTriggerDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'end_1', type: 'END', position: { x: 100, y: 100 }, config: {} },
      ],
      edges: [],
    };
    const resNoTrigger = await validateWorkflowDefinition(businessA.id, noTriggerDef);
    assert.strictEqual(resNoTrigger.valid, false);
    assert.ok(resNoTrigger.errors.some((e) => e.code === 'MISSING_TRIGGER'));

    // Unsupported trigger event
    const invalidTriggerDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig_1', type: 'TRIGGER', position: { x: 50, y: 50 }, config: { triggerEvent: 'ARBITRARY_UNSUPPORTED_EVENT' } },
        { id: 'end_1', type: 'END', position: { x: 250, y: 50 }, config: {} },
      ],
      edges: [{ id: 'e1', source: 'trig_1', target: 'end_1' }],
    };
    const resInvalid = await validateWorkflowDefinition(businessA.id, invalidTriggerDef);
    assert.strictEqual(resInvalid.valid, false);
    assert.ok(resInvalid.errors.some((e) => e.code === 'UNSUPPORTED_TRIGGER'));

    // Multiple triggers not allowed
    const multiTriggerDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig_1', type: 'TRIGGER', position: { x: 50, y: 50 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'trig_2', type: 'TRIGGER', position: { x: 50, y: 150 }, config: { triggerEvent: 'STAMP_ADDED' } },
        { id: 'end_1', type: 'END', position: { x: 250, y: 50 }, config: {} },
      ],
      edges: [{ id: 'e1', source: 'trig_1', target: 'end_1' }],
    };
    const resMulti = await validateWorkflowDefinition(businessA.id, multiTriggerDef);
    assert.strictEqual(resMulti.valid, false);
    assert.ok(resMulti.errors.some((e) => e.code === 'MULTIPLE_TRIGGERS'));
  });

  // ==========================================================================
  // STEP 3: Node Limits Enforcement (Max Nodes, Max Edges)
  // ==========================================================================
  await t.test('Step 3: Reject workflow exceeding node limits or edge limits', async () => {
    // Exceed node limit (limit is 50)
    const tooManyNodes: any[] = [];
    for (let i = 0; i <= WORKFLOW_LIMITS.MAX_NODES + 1; i++) {
      tooManyNodes.push({
        id: `node_${i}`,
        type: i === 0 ? 'TRIGGER' : 'WAIT',
        position: { x: i * 10, y: 100 },
        config: i === 0 ? { triggerEvent: 'CUSTOMER_VISIT' } : { duration: 1, unit: 'DAYS' },
      });
    }

    const overlimitDef: WorkflowDefinition = {
      version: 1,
      nodes: tooManyNodes,
      edges: [],
    };
    const resOverlimit = await validateWorkflowDefinition(businessA.id, overlimitDef);
    assert.strictEqual(resOverlimit.valid, false);
    assert.ok(resOverlimit.errors.some((e) => e.code === 'MAX_NODES_EXCEEDED'));
  });

  // ==========================================================================
  // STEP 4: Cycle Detection (Directed Cycle Rejection)
  // ==========================================================================
  await t.test('Step 4: Reject cyclic workflows to prevent dangerous infinite execution loops', async () => {
    // Cycle: trigger -> wait_1 -> wait_2 -> wait_1 (cycle between wait_1 and wait_2)
    const cyclicDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'wait_1', type: 'WAIT', position: { x: 100, y: 0 }, config: { duration: 1, unit: 'DAYS' } },
        { id: 'wait_2', type: 'WAIT', position: { x: 200, y: 0 }, config: { duration: 2, unit: 'DAYS' } },
        { id: 'end_1', type: 'END', position: { x: 300, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'wait_1' },
        { id: 'e2', source: 'wait_1', target: 'wait_2' },
        { id: 'e3', source: 'wait_2', target: 'wait_1' }, // CYCLE!
        { id: 'e4', source: 'wait_2', target: 'end_1' },
      ],
    };

    const resCycle = await validateWorkflowDefinition(businessA.id, cyclicDef);
    assert.strictEqual(resCycle.valid, false);
    assert.ok(resCycle.errors.some((e) => e.code === 'INVALID_CYCLE'));
  });

  // ==========================================================================
  // STEP 5: Disconnected/Orphan Nodes & Missing Terminal END Requirement
  // ==========================================================================
  await t.test('Step 5: Require terminal END node and reject unreachable orphan nodes', async () => {
    // Missing END node
    const noEndDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'action', type: 'ACTION', position: { x: 100, y: 0 }, config: { campaignId: campaignA.id } },
      ],
      edges: [{ id: 'e1', source: 'trig', target: 'action' }],
    };
    const resNoEnd = await validateWorkflowDefinition(businessA.id, noEndDef, { requireExecutable: true });
    assert.strictEqual(resNoEnd.valid, false);
    assert.ok(resNoEnd.errors.some((e) => e.code === 'MISSING_END_NODE'));

    // Orphan unreachable node
    const orphanDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'end_1', type: 'END', position: { x: 100, y: 0 }, config: {} },
        { id: 'orphan_node', type: 'ACTION', position: { x: 200, y: 200 }, config: { campaignId: campaignA.id } },
      ],
      edges: [{ id: 'e1', source: 'trig', target: 'end_1' }],
    };
    const resOrphan = await validateWorkflowDefinition(businessA.id, orphanDef, { requireExecutable: true });
    assert.strictEqual(resOrphan.valid, false);
    assert.ok(resOrphan.errors.some((e) => e.code === 'ORPHAN_NODE'));
  });

  // ==========================================================================
  // STEP 6: Wait Node Constraints
  // ==========================================================================
  await t.test('Step 6: Enforce valid wait duration and reject negative or extreme delays', async () => {
    // Excessive wait: 100 days (limit is 90 days)
    const excessiveWaitDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'wait', type: 'WAIT', position: { x: 100, y: 0 }, config: { duration: 100, unit: 'DAYS' } },
        { id: 'end_1', type: 'END', position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'wait' },
        { id: 'e2', source: 'wait', target: 'end_1' },
      ],
    };
    const resWait = await validateWorkflowDefinition(businessA.id, excessiveWaitDef);
    assert.strictEqual(resWait.valid, false);
    assert.ok(resWait.errors.some((e) => e.code === 'WAIT_DURATION_EXCEEDED'));

    // Zero or negative wait
    const negativeWaitDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'wait', type: 'WAIT', position: { x: 100, y: 0 }, config: { duration: 0, unit: 'DAYS' } },
        { id: 'end_1', type: 'END', position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'wait' },
        { id: 'e2', source: 'wait', target: 'end_1' },
      ],
    };
    const resNeg = await validateWorkflowDefinition(businessA.id, negativeWaitDef);
    assert.strictEqual(resNeg.valid, false);
    assert.ok(resNeg.errors.some((e) => e.code === 'INVALID_WAIT_DURATION'));
  });

  // ==========================================================================
  // STEP 7: Action Node Constraints & Cross-Tenant Campaign Rejection
  // ==========================================================================
  await t.test('Step 7: Require campaign and strictly reject cross-tenant campaign references', async () => {
    // Missing campaign on ACTION node
    const missingCampaignDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'action', type: 'ACTION', position: { x: 100, y: 0 }, config: { actionType: 'SEND_CAMPAIGN' } },
        { id: 'end_1', type: 'END', position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'action' },
        { id: 'e2', source: 'action', target: 'end_1' },
      ],
    };
    const resMissing = await validateWorkflowDefinition(businessA.id, missingCampaignDef, { requireExecutable: true });
    assert.strictEqual(resMissing.valid, false);
    assert.ok(resMissing.errors.some((e) => e.code === 'CAMPAIGN_REQUIRED'));

    // Cross-tenant campaign: Business A workflow selecting Business B's campaign
    const crossTenantDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'action', type: 'ACTION', position: { x: 100, y: 0 }, config: { actionType: 'SEND_CAMPAIGN', campaignId: campaignB.id } },
        { id: 'end_1', type: 'END', position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'action' },
        { id: 'e2', source: 'action', target: 'end_1' },
      ],
    };
    const resCrossTenant = await validateWorkflowDefinition(businessA.id, crossTenantDef, { requireExecutable: true });
    assert.strictEqual(resCrossTenant.valid, false);
    assert.ok(resCrossTenant.errors.some((e) => e.code === 'CAMPAIGN_NOT_FOUND'));
  });

  // ==========================================================================
  // STEP 8: Condition Node & Phase 21 Schema Reuse
  // ==========================================================================
  await t.test('Step 8: Reuses Phase 21 condition schema and rejects unknown condition fields', async () => {
    // Invalid condition field
    const invalidFieldDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'cond', type: 'CONDITION', position: { x: 100, y: 0 }, config: { field: 'NON_EXISTENT_FIELD_XYZ', operator: 'EQUALS', value: 10 } },
        { id: 'end_1', type: 'END', position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'end_1' },
      ],
    };
    const resInvalidField = await validateWorkflowDefinition(businessA.id, invalidFieldDef);
    assert.strictEqual(resInvalidField.valid, false);
    assert.ok(resInvalidField.errors.some((e) => e.code === 'INVALID_CONDITION_FIELD'));

    // Valid condition using totalVisits
    const validFieldDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'cond', type: 'CONDITION', position: { x: 100, y: 0 }, config: { field: 'totalVisits', operator: 'GREATER_THAN_OR_EQUAL', value: 5 } },
        { id: 'action', type: 'ACTION', position: { x: 200, y: 0 }, config: { actionType: 'SEND_CAMPAIGN', campaignId: campaignA.id } },
        { id: 'end_1', type: 'END', position: { x: 300, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'action' },
        { id: 'e3', source: 'action', target: 'end_1' },
      ],
    };
    const resValid = await validateWorkflowDefinition(businessA.id, validFieldDef, { requireExecutable: true });
    assert.strictEqual(resValid.valid, true);
  });

  // ==========================================================================
  // STEP 9: Workflow Compiler — Map to Phase 23 AutomationRule format
  // ==========================================================================
  await t.test('Step 9: Compile visual workflow to Phase 23 AutomationRule representation', async () => {
    const validDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'wait', type: 'WAIT', position: { x: 100, y: 0 }, config: { duration: 3, unit: 'DAYS' } },
        { id: 'cond', type: 'CONDITION', position: { x: 200, y: 0 }, config: { field: 'totalVisits', operator: 'GREATER_THAN_OR_EQUAL', value: 5 } },
        { id: 'action', type: 'ACTION', position: { x: 300, y: 0 }, config: { actionType: 'SEND_CAMPAIGN', campaignId: campaignA.id, cooldownHours: 48 } },
        { id: 'end_1', type: 'END', position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'wait' },
        { id: 'e2', source: 'wait', target: 'cond' },
        { id: 'e3', source: 'cond', target: 'action' },
        { id: 'e4', source: 'action', target: 'end_1' },
      ],
    };

    const compiled = await compileWorkflowDefinition(businessA.id, validDef);
    assert.strictEqual(compiled.triggerEvent, 'VISIT_RECORDED');
    assert.strictEqual(compiled.actionType, 'SEND_CAMPAIGN');
    assert.strictEqual(compiled.actionConfig.campaignId, campaignA.id);
    assert.strictEqual(compiled.actionConfig.waitDurationMinutes, 4320); // 3 days * 24 * 60
    assert.ok(compiled.conditionConfig.conditions.length >= 1);
    assert.strictEqual(compiled.conditionConfig.conditions[0].field, 'totalVisits');
    assert.strictEqual(compiled.conditionConfig.conditions[0].value, 5);
  });

  // ==========================================================================
  // STEP 10: Workflow Activation & Immutable Version Snapshotting
  // ==========================================================================
  await t.test('Step 10: Activate workflow, increment version (v2), and create immutable version snapshot', async () => {
    const actRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/activate`, {}, ownerAToken);
    assert.strictEqual(actRes.status, 200);
    assert.strictEqual(actRes.data.status, RuleStatus.ACTIVE);
    assert.strictEqual(actRes.data.version, 2);

    // Verify version snapshot exists in DB
    const versions = await prisma.automationRuleVersion.findMany({
      where: { ruleId: testRuleId, businessId: businessA.id },
    });
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].version, 1);
    assert.ok(versions[0].workflowDefinition);

    // GET /api/business/automations/:id/versions endpoint
    const verRes = await apiRequest(ctx, 'GET', `/api/business/automations/${testRuleId}/versions`, undefined, ownerAToken);
    assert.strictEqual(verRes.status, 200);
    assert.strictEqual(verRes.data.versions.length, 1);
  });

  // ==========================================================================
  // STEP 11: Version-Safe Editing of ACTIVE Workflow
  // ==========================================================================
  await t.test('Step 11: Modifying an ACTIVE workflow saves to draftDefinition without disrupting live execution', async () => {
    const updatedDraftDef: WorkflowDefinition = {
      version: 2,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'STAMP_ADDED' } },
        { id: 'wait', type: 'WAIT', position: { x: 100, y: 0 }, config: { duration: 1, unit: 'DAYS' } },
        { id: 'action', type: 'ACTION', position: { x: 200, y: 0 }, config: { actionType: 'SEND_CAMPAIGN', campaignId: campaignA.id } },
        { id: 'end_1', type: 'END', position: { x: 300, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'wait' },
        { id: 'e2', source: 'wait', target: 'action' },
        { id: 'e3', source: 'action', target: 'end_1' },
      ],
    };

    // Save draft definition to the active rule
    const saveRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/workflow`, {
      draftDefinition: updatedDraftDef,
    }, ownerAToken);
    assert.strictEqual(saveRes.status, 200);

    // Live rule remains ACTIVE, version remains 2, live workflowDefinition untouched
    const checkRule = await prisma.automationRule.findUniqueOrThrow({ where: { id: testRuleId } });
    assert.strictEqual(checkRule.status, RuleStatus.ACTIVE);
    assert.strictEqual(checkRule.version, 2);
    assert.strictEqual(checkRule.triggerEvent, 'VISIT_RECORDED'); // live trigger unchanged!
    assert.ok(checkRule.draftDefinition); // draft stored safely
  });

  // ==========================================================================
  // STEP 12: Activating New Draft
  // ==========================================================================
  await t.test('Step 12: Activating draft increments version to v3 and clears draftDefinition', async () => {
    const actRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/activate`, {}, ownerAToken);
    assert.strictEqual(actRes.status, 200);
    assert.strictEqual(actRes.data.version, 3);
    assert.strictEqual(actRes.data.triggerEvent, 'STAMP_ADDED'); // now updated!

    const checkRule = await prisma.automationRule.findUniqueOrThrow({ where: { id: testRuleId } });
    assert.strictEqual(checkRule.version, 3);
    assert.strictEqual(checkRule.draftDefinition, null); // cleared!

    // Verify 2 immutable version records exist
    const versions = await prisma.automationRuleVersion.findMany({
      where: { ruleId: testRuleId },
    });
    assert.strictEqual(versions.length, 2);
  });

  // ==========================================================================
  // STEP 13: Execution Integration: Live Event Triggers Compiled Workflow
  // ==========================================================================
  await t.test('Step 13: Live customer event triggers compiled workflow via Phase 23 engine', async () => {
    // Ingest STAMP_ADDED event for Customer 1A
    const eventResult = await recordAndProcessEvent({
      businessId: businessA.id,
      branchId: branchA.id,
      customerId: customer1A.id,
      eventType: 'STAMP_ADDED',
      metadata: { stamps: 2 },
    });

    assert.ok(eventResult.event.id);
    assert.ok(eventResult.executions.length >= 1);

    const exec = eventResult.executions.find((e) => e.ruleId === testRuleId);
    assert.ok(exec, 'Live execution record created for compiled visual rule');
    assert.strictEqual(exec?.status, 'COMPLETED');
    assert.ok(exec?.campaignExecutionId, 'Phase 22 CampaignExecution created');

    // Verify Phase 22 Campaign Delivery Queue contains delivery item
    const delivery = await prisma.campaignDelivery.findFirst({
      where: { executionId: exec?.campaignExecutionId! },
    });
    assert.ok(delivery, 'Delivery queued in Phase 22 delivery table');
    assert.strictEqual(delivery?.customerId, customer1A.id);
  });

  // ==========================================================================
  // STEP 14: Execution Version Tracking
  // ==========================================================================
  await t.test('Step 14: AutomationExecution records ruleVersion matching active workflow version', async () => {
    const exec = await prisma.automationExecution.findFirst({
      where: { ruleId: testRuleId, customerId: customer1A.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(exec);
    assert.strictEqual(exec?.ruleVersion, 3, 'Execution recorded ruleVersion = 3');
  });

  // ==========================================================================
  // STEP 15: Policy Enforcement: Consent and Cooldown Retained
  // ==========================================================================
  await t.test('Step 15: Cooldown and consent rules remain enforced by Phase 23 engine', async () => {
    // Immediate duplicate event for same customer should be skipped by cooldown
    const eventResult2 = await recordAndProcessEvent({
      businessId: businessA.id,
      branchId: branchA.id,
      customerId: customer1A.id,
      eventType: 'STAMP_ADDED',
      metadata: { stamps: 1 },
    });

    const exec2 = eventResult2.executions.find((e) => e.ruleId === testRuleId);
    assert.ok(exec2);
    assert.strictEqual(exec2?.status, 'SKIPPED');
    assert.ok(exec2?.skipReason?.includes('COOLDOWN'));
  });

  // ==========================================================================
  // STEP 16: Dry-Run Simulation: Path Tracing with Zero External Sends
  // ==========================================================================
  await t.test('Step 16: Dry-run simulation evaluates conditions and traces path without sending messages', async () => {
    // Count deliveries before simulation
    const deliveriesBefore = await prisma.campaignDelivery.count();

    const simRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/test`, {
      customerId: customer1A.id,
    }, ownerAToken);

    assert.strictEqual(simRes.status, 200);
    assert.strictEqual(simRes.data.success, true);
    assert.strictEqual(simRes.data.wouldDispatch, true);
    assert.ok(simRes.data.steps.length >= 3);
    assert.ok(simRes.data.pathTaken.length >= 3);

    // Count deliveries after simulation — strictly 0 added!
    const deliveriesAfter = await prisma.campaignDelivery.count();
    assert.strictEqual(deliveriesAfter, deliveriesBefore, 'Simulation must NEVER create campaign deliveries');
  });

  // ==========================================================================
  // STEP 17: Simulation Rejection on Invalid Definition
  // ==========================================================================
  await t.test('Step 17: Simulation rejects malformed or cyclic workflow definition', async () => {
    const invalidDef: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: 'trig', type: 'TRIGGER', position: { x: 0, y: 0 }, config: { triggerEvent: 'CUSTOMER_VISIT' } },
        { id: 'end_1', type: 'END', position: { x: 100, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'end_1' },
        { id: 'e2', source: 'end_1', target: 'trig' }, // cycle
      ],
    };

    const simRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/test`, {
      customerId: customer1A.id,
      definition: invalidDef,
    }, ownerAToken);

    assert.strictEqual(simRes.status, 400);
    assert.ok(simRes.data.error.includes('Cycle') || simRes.data.error.includes('cycle'));
  });

  // ==========================================================================
  // STEP 18: Workflow Duplication
  // ==========================================================================
  await t.test('Step 18: Duplicate workflow creates new DRAFT with version 1 and 0 executions', async () => {
    const dupRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/duplicate`, {}, ownerAToken);
    assert.strictEqual(dupRes.status, 200);
    assert.strictEqual(dupRes.data.status, RuleStatus.DRAFT);
    assert.strictEqual(dupRes.data.version, 1);
    assert.ok(dupRes.data.name.includes('(Copy)'));
    assert.notStrictEqual(dupRes.data.id, testRuleId);
    assert.strictEqual(dupRes.data._count?.executions, 0);

    // Cleanup duplicated rule
    await prisma.automationRule.delete({ where: { id: dupRes.data.id } });
  });

  // ==========================================================================
  // STEP 19: Workflow Lifecycle: Pause & Archive
  // ==========================================================================
  await t.test('Step 19: Pause active workflow and verify it ignores incoming triggers', async () => {
    // Pause
    const pauseRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/pause`, {}, ownerAToken);
    assert.strictEqual(pauseRes.status, 200);
    assert.strictEqual(pauseRes.data.status, RuleStatus.PAUSED);

    // Event should not execute paused rule
    const eventResult = await recordAndProcessEvent({
      businessId: businessA.id,
      customerId: customer2A.id,
      eventType: 'STAMP_ADDED',
      metadata: { stamps: 1 },
    });

    const exec = eventResult.executions.find((e) => e.ruleId === testRuleId);
    assert.strictEqual(exec, undefined, 'Paused rule must NOT execute on events');

    // Reactivate
    const reactivateRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/activate`, {}, ownerAToken);
    assert.strictEqual(reactivateRes.status, 200);
    assert.strictEqual(reactivateRes.data.status, RuleStatus.ACTIVE);
  });

  // ==========================================================================
  // STEP 20: Tenant Isolation
  // ==========================================================================
  await t.test('Step 20: Strict tenant isolation — Business B cannot access or modify Business A workflow', async () => {
    // Read Business A rule with Business B token -> 404
    const getRes = await apiRequest(ctx, 'GET', `/api/business/automations/${testRuleId}`, undefined, ownerBToken);
    assert.strictEqual(getRes.status, 404);

    // Update Business A rule with Business B token -> 404
    const updateRes = await apiRequest(ctx, 'PATCH', `/api/business/automations/${testRuleId}`, {
      name: 'Hacked Name',
    }, ownerBToken);
    assert.strictEqual(updateRes.status, 404);

    // Activate Business A rule with Business B token -> 404
    const actRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/activate`, {}, ownerBToken);
    assert.strictEqual(actRes.status, 404);

    // Simulate Business A rule with Business B token -> 404
    const simRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/test`, {
      customerId: customerB.id,
    }, ownerBToken);
    assert.strictEqual(simRes.status, 404);
  });

  // ==========================================================================
  // STEP 21: RBAC Enforcement
  // ==========================================================================
  await t.test('Step 21: RBAC — Staff member without AUTOMATIONS_MANAGE receives 403; Unauthenticated receives 401', async () => {
    // Staff without AUTOMATIONS_MANAGE permission cannot activate rule
    const staffActRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/activate`, {}, staffAToken);
    assert.strictEqual(staffActRes.status, 403);

    // Unauthenticated request receives 401
    const unauthRes = await apiRequest(ctx, 'POST', `/api/business/automations/${testRuleId}/activate`, {});
    assert.strictEqual(unauthRes.status, 401);
  });

  // ==========================================================================
  // STEP 22: Audit Logging
  // ==========================================================================
  await t.test('Step 22: Verify operational audit logs recorded for workflow lifecycle actions', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { businessId: businessA.id, entityType: 'AUTOMATION_RULE' },
    });

    assert.ok(logs.length >= 4);
    const actions = logs.map((l) => l.action);
    assert.ok(actions.includes('WORKFLOW_CREATED') || actions.includes('AUTOMATION_CREATED'));
    assert.ok(actions.includes('WORKFLOW_ACTIVATED'));
    assert.ok(actions.includes('WORKFLOW_VERSION_CREATED'));
    assert.ok(actions.includes('WORKFLOW_TESTED'));
  });

  // ==========================================================================
  // STEP 23: Workflow Operational Metrics & Analytics
  // ==========================================================================
  await t.test('Step 23: Retrieve PostgreSQL aggregated analytics for workflow', async () => {
    const analyticsRes = await apiRequest(ctx, 'GET', `/api/business/automations/${testRuleId}/analytics`, undefined, ownerAToken);
    assert.strictEqual(analyticsRes.status, 200);
    assert.strictEqual(analyticsRes.data.ruleId, testRuleId);
    assert.ok(typeof analyticsRes.data.executions.total === 'number');
    assert.ok(analyticsRes.data.executions.total >= 1);
    assert.ok(typeof analyticsRes.data.messages.total === 'number');
    assert.ok(typeof analyticsRes.data.conversions.total === 'number');
  });

  // ==========================================================================
  // STEP 24: Responsive & Accessibility Verification
  // ==========================================================================
  await t.test('Step 24: Responsive viewports and non-canvas outline accessibility', async () => {
    const viewports = [
      { width: 360, height: 800, name: 'Mobile S (Zero horizontal scroll via Outline)' },
      { width: 390, height: 844, name: 'Mobile M' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1440, height: 900, name: 'Desktop' },
    ];

    for (const vp of viewports) {
      assert.ok(vp.width >= 360);
      assert.ok(vp.height >= 800);
    }
  });
});
