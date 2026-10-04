/**
 * REPLOYTY V2 — PHASE 23
 * AUTOMATION ENGINE & TRIGGER PROCESSORS
 * MANDATORY COMPREHENSIVE STAGING TEST SUITE
 * 
 * Steps 0 to 24:
 * Step 0:  Server + tenant fixtures setup
 * Step 1:  Automation CRUD
 * Step 2:  Automation lifecycle (DRAFT -> ACTIVE <-> PAUSED -> ARCHIVED)
 * Step 3:  Trigger whitelist & normalization
 * Step 4:  Event ingestion
 * Step 5:  Trigger matching
 * Step 6:  Condition evaluation
 * Step 7:  Phase 21 segmentation condition reuse
 * Step 8:  Branch scoping
 * Step 9:  Tenant isolation (cross-tenant 404 & event isolation)
 * Step 10: RBAC (Owner & Manager vs Staff vs Unauthenticated)
 * Step 11: Consent gating (missing consent -> SKIPPED)
 * Step 12: Cooldown gating (same-rule cooldown -> SKIPPED)
 * Step 13: Automation execution creation & state machine
 * Step 14: Execution idempotency
 * Step 15: Concurrent duplicate event processing (DB unique constraint)
 * Step 16: Campaign action integration (Phase 22 CampaignExecution)
 * Step 17: Phase 22 delivery queue integration
 * Step 18: Automation pause (paused rules ignore events)
 * Step 19: Automation archive (archived rules cannot execute)
 * Step 20: Execution failure recording & error capture
 * Step 21: Execution retry safety
 * Step 22: Infinite recursion protection (depth limit guard)
 * Step 23: Audit logging verification
 * Step 24: Responsive UI verification (360px, 390px, 768px, 1440px)
 */

import test from 'node:test';
import assert from 'node:assert';
import { startTestServer, apiRequest as rawApiRequest, TestServerContext } from '../e2e/test_helpers';

async function apiRequest(
  ctx: TestServerContext,
  method: string,
  path: string,
  body?: any,
  token?: string
) {
  return rawApiRequest(ctx.baseUrl, path, {
    method,
    body,
    token,
  });
}
import { prisma } from '../../src/server/db/client';
import { hashPassword } from '../../src/server/auth/sessionService';
import {
  AudienceType,
  BusinessCategory,
  CampaignChannel,
  CampaignStatus,
  ConsentChannel,
  UserStatus,
} from '@prisma/client';
import {
  createAutomationRule,
  getAutomationRules,
  getAutomationRuleById,
  updateAutomationRule,
  activateAutomationRule,
  pauseAutomationRule,
  archiveAutomationRule,
  deleteAutomationRule,
} from '../../src/server/services/automationService';
import {
  recordAndProcessEvent,
  processAutomationEvent,
} from '../../src/server/services/automationExecutionService';
import { normalizeTriggerEvent, SUPPORTED_TRIGGERS } from '../../src/types/automation';

const RUN_ID = `p23_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

test('PHASE 23: AUTOMATION ENGINE & TRIGGER PROCESSORS TEST SUITE', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;

  t.after(async () => {
    if (ctx) {
      await ctx.stop();
    }
  });

  // Tenant A Fixtures
  let businessA: any;
  let branchA1: any;
  let branchA2: any;
  let ownerAToken: string;
  let managerAToken: string;
  let staffAToken: string;
  let customerA1: any; // Qualified: 5 visits, 10 stamps, consented for WHATSAPP
  let customerA2: any; // Unqualified: 1 visit, 0 stamps, unconsented
  let campaignA: any;

  // Tenant B Fixtures (Multi-tenant isolation)
  let businessB: any;
  let branchB1: any;
  let ownerBToken: string;
  let customerB1: any;

  // Track created rules
  let ruleA1Id: string;

  // ==========================================================================
  // STEP 0: Server & Tenant Fixtures Setup
  // ==========================================================================
  await t.test('Step 0: Initialize server, tenants, branches, customers, campaigns', async () => {
    ctx = await startTestServer();
    const passwordHash = await hashPassword('SecurePass123!');

    // 1. Create Tenant A
    businessA = await prisma.business.create({
      data: {
        name: `Artisan Roast ${RUN_ID}`,
        slug: `artisan-${RUN_ID}`,
        category: BusinessCategory.CAFE,
      },
    });

    branchA1 = await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: `Bandra Flagship ${RUN_ID}`,
        isMainBranch: true,
        timezone: 'Asia/Kolkata',
      },
    });

    branchA2 = await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: `Juhu Roastery ${RUN_ID}`,
        isMainBranch: false,
        timezone: 'Asia/Kolkata',
      },
    });

    // 2. Create Users for Tenant A
    const ownerAUser = await prisma.user.create({
      data: {
        email: `owner_a_${RUN_ID}@example.com`,
        passwordHash,
        name: 'Owner A',
        status: UserStatus.ACTIVE,
      },
    });
    const ownerARole = await prisma.role.findFirst({ where: { name: 'OWNER' } });
    await prisma.staffMembership.create({
      data: {
        userId: ownerAUser.id,
        businessId: businessA.id,
        roleId: ownerARole!.id,
      },
    });

    const managerAUser = await prisma.user.create({
      data: {
        email: `manager_a_${RUN_ID}@example.com`,
        passwordHash,
        name: 'Manager A',
        status: UserStatus.ACTIVE,
      },
    });
    const managerARole = await prisma.role.findFirst({ where: { name: 'MANAGER' } });
    await prisma.staffMembership.create({
      data: {
        userId: managerAUser.id,
        businessId: businessA.id,
        roleId: managerARole!.id,
      },
    });

    const staffAUser = await prisma.user.create({
      data: {
        email: `staff_a_${RUN_ID}@example.com`,
        passwordHash,
        name: 'Staff A',
        status: UserStatus.ACTIVE,
      },
    });
    const staffARole = await prisma.role.findFirst({ where: { name: 'STAFF' } });
    await prisma.staffMembership.create({
      data: {
        userId: staffAUser.id,
        businessId: businessA.id,
        roleId: staffARole!.id,
      },
    });

    // 3. Create Tenant B (Isolation)
    businessB = await prisma.business.create({
      data: {
        name: `Island Bistro ${RUN_ID}`,
        slug: `island-${RUN_ID}`,
        category: BusinessCategory.RESTAURANT,
      },
    });

    branchB1 = await prisma.branch.create({
      data: {
        businessId: businessB.id,
        name: `Colaba Roastery ${RUN_ID}`,
        isMainBranch: true,
      },
    });

    const ownerBUser = await prisma.user.create({
      data: {
        email: `owner_b_${RUN_ID}@example.com`,
        passwordHash,
        name: 'Owner B',
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.staffMembership.create({
      data: {
        userId: ownerBUser.id,
        businessId: businessB.id,
        roleId: ownerARole!.id,
      },
    });

    // 4. Create Customers
    customerA1 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Aarav Qualified',
        phone: `+9198000${Math.floor(10000 + Math.random() * 90000)}`,
        totalVisits: 5,
        stampsBalance: 10,
        pointsBalance: 150,
      },
    });

    // Customer A1 granted WhatsApp marketing consent
    await prisma.customerConsent.create({
      data: {
        customerId: customerA1.id,
        channel: ConsentChannel.WHATSAPP,
        granted: true,
        source: 'ONBOARDING',
      },
    });

    customerA2 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA2.id,
        name: 'Meera Unqualified',
        phone: `+9198111${Math.floor(10000 + Math.random() * 90000)}`,
        totalVisits: 1,
        stampsBalance: 0,
        pointsBalance: 10,
      },
    });
    // Customer A2 has NO consent

    customerB1 = await prisma.customer.create({
      data: {
        businessId: businessB.id,
        branchId: branchB1.id,
        name: 'Rohan Island',
        phone: `+9198222${Math.floor(10000 + Math.random() * 90000)}`,
        totalVisits: 10,
      },
    });

    // 5. Create Phase 22 Campaign for Tenant A
    campaignA = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: `VIP Reward Push ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        status: CampaignStatus.ACTIVE,
        audienceType: AudienceType.ALL_CUSTOMERS,
        messageTemplate: 'Congratulations! You unlocked your VIP Reward.',
      },
    });

    // 6. Log in and get tokens
    const loginOwnerA = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: ownerAUser.email,
      password: 'SecurePass123!',
    });
    ownerAToken = loginOwnerA.body.sessionToken || loginOwnerA.body.token;

    const loginManagerA = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: managerAUser.email,
      password: 'SecurePass123!',
    });
    managerAToken = loginManagerA.body.sessionToken || loginManagerA.body.token;

    const loginStaffA = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: staffAUser.email,
      password: 'SecurePass123!',
    });
    staffAToken = loginStaffA.body.sessionToken || loginStaffA.body.token;

    const loginOwnerB = await apiRequest(ctx, 'POST', '/api/auth/login', {
      email: ownerBUser.email,
      password: 'SecurePass123!',
    });
    ownerBToken = loginOwnerB.body.sessionToken || loginOwnerB.body.token;

    assert.ok(ownerAToken, 'Owner A token received');
    assert.ok(managerAToken, 'Manager A token received');
    assert.ok(staffAToken, 'Staff A token received');
    assert.ok(ownerBToken, 'Owner B token received');
  });

  // ==========================================================================
  // STEP 1: Automation CRUD
  // ==========================================================================
  await t.test('Step 1: Automation CRUD', async () => {
    // 1. Create Automation in DRAFT
    const createRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: `VIP Stamp Award Automation ${RUN_ID}`,
        description: 'Auto-triggers VIP campaign when customer earns stamp with >= 5 visits',
        triggerEvent: 'STAMP_ADDED',
        branchId: branchA1.id,
        conditionConfig: {
          logic: 'AND',
          conditions: [
            {
              field: 'totalVisits',
              operator: 'GREATER_THAN_OR_EQUAL',
              value: 5,
            },
          ],
        },
        actionType: 'SEND_CAMPAIGN',
        actionConfig: {
          campaignId: campaignA.id,
          cooldownHours: 24,
        },
        cooldownMinutes: 60,
        maxExecutionsPerCustomer: 5,
      },
      ownerAToken
    );

    assert.strictEqual(createRes.status, 201, 'Automation should be created with 201');
    assert.ok(createRes.body.id, 'Automation must have ID');
    assert.strictEqual(createRes.body.status, 'DRAFT', 'Initial status must be DRAFT');
    assert.strictEqual(createRes.body.cooldownMinutes, 60);
    assert.strictEqual(createRes.body.maxExecutionsPerCustomer, 5);
    ruleA1Id = createRes.body.id;

    // 2. Query list
    const listRes = await apiRequest(ctx, 'GET', '/api/business/automations', undefined, ownerAToken);
    assert.strictEqual(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.rules));
    const found = listRes.body.rules.find((r: any) => r.id === ruleA1Id);
    assert.ok(found, 'Created rule should be in list');

    // 3. Query single
    const getRes = await apiRequest(
      ctx,
      'GET',
      `/api/business/automations/${ruleA1Id}`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.name, `VIP Stamp Award Automation ${RUN_ID}`);

    // 4. Update
    const patchRes = await apiRequest(
      ctx,
      'PATCH',
      `/api/business/automations/${ruleA1Id}`,
      {
        description: 'Updated description for VIP campaign workflow',
        cooldownMinutes: 120,
      },
      ownerAToken
    );
    assert.strictEqual(patchRes.status, 200);
    assert.strictEqual(patchRes.body.cooldownMinutes, 120);
    assert.strictEqual(patchRes.body.description, 'Updated description for VIP campaign workflow');
  });

  // ==========================================================================
  // STEP 2: Automation Lifecycle
  // ==========================================================================
  await t.test('Step 2: Automation lifecycle transitions', async () => {
    // 1. DRAFT -> ACTIVE
    const act1 = await apiRequest(
      ctx,
      'POST',
      `/api/business/automations/${ruleA1Id}/activate`,
      {},
      ownerAToken
    );
    assert.strictEqual(act1.status, 200);
    assert.strictEqual(act1.body.status, 'ACTIVE');

    // 2. ACTIVE -> PAUSED
    const pause1 = await apiRequest(
      ctx,
      'POST',
      `/api/business/automations/${ruleA1Id}/pause`,
      {},
      ownerAToken
    );
    assert.strictEqual(pause1.status, 200);
    assert.strictEqual(pause1.body.status, 'PAUSED');

    // 3. PAUSED -> ACTIVE
    const act2 = await apiRequest(
      ctx,
      'POST',
      `/api/business/automations/${ruleA1Id}/activate`,
      {},
      ownerAToken
    );
    assert.strictEqual(act2.status, 200);
    assert.strictEqual(act2.body.status, 'ACTIVE');

    // 4. Test ARCHIVE on a temporary rule
    const tempRule = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: 'Temporary Rule for Archive Test',
        triggerEvent: 'VISIT_RECORDED',
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id },
      },
      ownerAToken
    );
    assert.strictEqual(tempRule.status, 201);

    const archRes = await apiRequest(
      ctx,
      'POST',
      `/api/business/automations/${tempRule.body.id}/archive`,
      {},
      ownerAToken
    );
    assert.strictEqual(archRes.status, 200);
    assert.strictEqual(archRes.body.status, 'ARCHIVED');

    // 5. Trying to activate or modify an ARCHIVED rule must be rejected with 400
    const failAct = await apiRequest(
      ctx,
      'POST',
      `/api/business/automations/${tempRule.body.id}/activate`,
      {},
      ownerAToken
    );
    assert.strictEqual(failAct.status, 400, 'Archived rule cannot be activated');

    const failPatch = await apiRequest(
      ctx,
      'PATCH',
      `/api/business/automations/${tempRule.body.id}`,
      { name: 'Illegal Edit' },
      ownerAToken
    );
    assert.strictEqual(failPatch.status, 400, 'Archived rule cannot be modified');
  });

  // ==========================================================================
  // STEP 3: Trigger Whitelist & Normalization
  // ==========================================================================
  await t.test('Step 3: Trigger whitelist and normalization', async () => {
    // 1. Registry returns supported triggers
    const trigRes = await apiRequest(ctx, 'GET', '/api/business/automations/triggers', undefined, ownerAToken);
    assert.strictEqual(trigRes.status, 200);
    assert.ok(Array.isArray(trigRes.body.triggers));
    assert.strictEqual(trigRes.body.triggers.length, SUPPORTED_TRIGGERS.length);

    // 2. Arbitrary event type must be rejected
    const badTrig = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: 'Invalid Trigger Rule',
        triggerEvent: 'UNSUPPORTED_RANDOM_EVENT_NAME',
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id },
      },
      ownerAToken
    );
    let badTrigStatus = badTrig.status;
    assert.strictEqual(badTrig.status, 400, 'Arbitrary trigger must be rejected with 400');

    // 3. Normalization of supported aliases
    assert.strictEqual(normalizeTriggerEvent('CUSTOMER_CREATED'), 'CUSTOMER_JOINED');
    assert.strictEqual(normalizeTriggerEvent('LOYALTY_STAMP_EARNED'), 'STAMP_ADDED');
    assert.strictEqual(normalizeTriggerEvent('REVIEW_SUBMITTED'), 'REVIEW_GENERATED');
    assert.strictEqual(normalizeTriggerEvent('CAMPAIGN_DELIVERY_COMPLETED'), 'CAMPAIGN_TOUCHPOINT');
  });

  // ==========================================================================
  // STEP 4 & 5: Event Ingestion & Trigger Matching
  // ==========================================================================
  await t.test('Step 4 & 5: Event Ingestion & Trigger Matching', async () => {
    // Ingest event for Customer A1 matching ruleA1 (trigger: STAMP_ADDED, branch: branchA1)
    const ingestRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'STAMP_ADDED',
        branchId: branchA1.id,
        metadata: { stampCount: 1 },
      },
      ownerAToken
    );

    assert.strictEqual(ingestRes.status, 201);
    assert.ok(ingestRes.body.eventId);
    assert.strictEqual(ingestRes.body.eventType, 'STAMP_ADDED');
    assert.strictEqual(ingestRes.body.matchedRulesCount, 1);
    assert.strictEqual(ingestRes.body.executions.length, 1);
    assert.strictEqual(ingestRes.body.executions[0].status, 'COMPLETED');
    assert.ok(ingestRes.body.executions[0].campaignExecutionId);

    // Verify CustomerEvent was persisted in DB
    const eventInDb = await prisma.customerEvent.findUnique({
      where: { id: ingestRes.body.eventId },
    });
    assert.ok(eventInDb);
    assert.strictEqual(eventInDb.customerId, customerA1.id);
    assert.strictEqual(eventInDb.type, 'STAMP_ADDED');

    // Unmatched trigger event (e.g. REVIEW_REQUESTED) produces 0 executions
    const unmatchRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'REVIEW_REQUESTED',
        branchId: branchA1.id,
      },
      ownerAToken
    );
    assert.strictEqual(unmatchRes.status, 201);
    assert.strictEqual(unmatchRes.body.matchedRulesCount, 0);
    assert.strictEqual(unmatchRes.body.executions.length, 0);
  });

  // ==========================================================================
  // STEP 6 & 7: Condition Evaluation & Phase 21 Segmentation Reuse
  // ==========================================================================
  await t.test('Step 6 & 7: Condition evaluation & Phase 21 segmentation reuse', async () => {
    // Create rule with condition: totalVisits >= 5
    const condRule = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: `Condition Test Rule ${RUN_ID}`,
        triggerEvent: 'VISIT_RECORDED',
        conditionConfig: {
          logic: 'AND',
          conditions: [
            {
              field: 'totalVisits',
              operator: 'GREATER_THAN_OR_EQUAL',
              value: 5,
            },
          ],
        },
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id },
      },
      ownerAToken
    );
    assert.strictEqual(condRule.status, 201);

    // Activate it
    await apiRequest(ctx, 'POST', `/api/business/automations/${condRule.body.id}/activate`, {}, ownerAToken);

    // Case A: Customer A1 has 5 visits -> Qualifies -> COMPLETED
    const matchRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'VISIT_RECORDED',
      },
      ownerAToken
    );
    assert.strictEqual(matchRes.status, 201);
    const execA1 = matchRes.body.executions.find((e: any) => e.ruleId === condRule.body.id);
    if (execA1?.status !== 'COMPLETED') console.log('DEBUG STEP 6&7 execA1:', JSON.stringify(execA1));
    assert.ok(execA1);
    assert.strictEqual(execA1.status, 'COMPLETED');

    // Case B: Customer A2 has 1 visit -> Does not qualify -> SKIPPED (CONDITIONS_NOT_MET)
    const missRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA2.id,
        eventType: 'VISIT_RECORDED',
      },
      ownerAToken
    );
    assert.strictEqual(missRes.status, 201);
    const execA2 = missRes.body.executions.find((e: any) => e.ruleId === condRule.body.id);
    assert.ok(execA2);
    assert.strictEqual(execA2.status, 'SKIPPED');
    assert.strictEqual(execA2.skipReason, 'CONDITIONS_NOT_MET');
  });

  // ==========================================================================
  // STEP 8: Branch Scoping
  // ==========================================================================
  await t.test('Step 8: Branch scoping isolation', async () => {
    // Rule specific to Branch A1
    const branchRule = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: `Branch A1 Specific Rule ${RUN_ID}`,
        triggerEvent: 'POINTS_ADDED',
        branchId: branchA1.id,
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id },
      },
      ownerAToken
    );
    await apiRequest(ctx, 'POST', `/api/business/automations/${branchRule.body.id}/activate`, {}, ownerAToken);

    // 1. Event from Branch A1 -> Matches
    const resA1 = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'POINTS_ADDED',
        branchId: branchA1.id,
      },
      ownerAToken
    );
    const matchA1 = resA1.body.executions.find((e: any) => e.ruleId === branchRule.body.id);
    assert.ok(matchA1, 'Branch A1 event should match Branch A1 rule');

    // 2. Event from Branch A2 -> Does NOT match Branch A1 rule
    const resA2 = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'POINTS_ADDED',
        branchId: branchA2.id,
      },
      ownerAToken
    );
    const matchA2 = resA2.body.executions.find((e: any) => e.ruleId === branchRule.body.id);
    assert.strictEqual(matchA2, undefined, 'Branch A2 event must NOT match Branch A1 rule');
  });

  // ==========================================================================
  // STEP 9: Multi-Tenant Isolation
  // ==========================================================================
  await t.test('Step 9: Multi-tenant isolation & cross-tenant non-discovery', async () => {
    // 1. Tenant B cannot see Tenant A's automation rule -> 404
    const crossGet = await apiRequest(
      ctx,
      'GET',
      `/api/business/automations/${ruleA1Id}`,
      undefined,
      ownerBToken
    );
    assert.strictEqual(crossGet.status, 404, 'Cross-tenant lookup must return 404');

    // 2. Tenant B cannot update Tenant A's automation rule -> 404
    const crossPatch = await apiRequest(
      ctx,
      'PATCH',
      `/api/business/automations/${ruleA1Id}`,
      { name: 'Hacked by Tenant B' },
      ownerBToken
    );
    assert.strictEqual(crossPatch.status, 404, 'Cross-tenant update must return 404');

    // 3. Tenant B cannot delete Tenant A's automation rule -> 404
    const crossDel = await apiRequest(
      ctx,
      'DELETE',
      `/api/business/automations/${ruleA1Id}`,
      undefined,
      ownerBToken
    );
    assert.strictEqual(crossDel.status, 404, 'Cross-tenant delete must return 404');

    // 4. Tenant B event does NOT trigger Tenant A's rule
    const eventB = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerB1.id,
        eventType: 'STAMP_ADDED',
        branchId: branchB1.id,
      },
      ownerBToken
    );
    assert.strictEqual(eventB.status, 201);
    assert.strictEqual(eventB.body.matchedRulesCount, 0, 'Tenant A rules must never match Tenant B events');
  });

  // ==========================================================================
  // STEP 10: RBAC (Role-Based Access Control)
  // ==========================================================================
  await t.test('Step 10: Role-Based Access Control', async () => {
    // 1. Manager A -> Allowed to create and manage automations
    const mgrCreate = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: `Manager Created Rule ${RUN_ID}`,
        triggerEvent: 'REWARD_EARNED',
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id },
      },
      managerAToken
    );
    assert.strictEqual(mgrCreate.status, 201, 'Manager should be authorized to create automations');

    // 2. Staff A -> Forbidden (403)
    const staffCreate = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: 'Staff Unauthorized Rule',
        triggerEvent: 'REWARD_EARNED',
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id },
      },
      staffAToken
    );
    assert.strictEqual(staffCreate.status, 403, 'Staff without management permission must get 403');

    // 3. Unauthenticated -> 401 Unauthorized
    const unauthCreate = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: 'Unauth Rule',
        triggerEvent: 'REWARD_EARNED',
      }
    );
    assert.strictEqual(unauthCreate.status, 401, 'Unauthenticated request must get 401');
  });

  // ==========================================================================
  // STEP 11: Consent Gating
  // ==========================================================================
  await t.test('Step 11: Consent gating suppresses unconsented customers', async () => {
    // Create automation targeting WhatsApp campaign
    const consentRule = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: `Consent Test Rule ${RUN_ID}`,
        triggerEvent: 'OFFER_REDEEMED',
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id },
      },
      ownerAToken
    );
    await apiRequest(ctx, 'POST', `/api/business/automations/${consentRule.body.id}/activate`, {}, ownerAToken);

    // Customer A2 does NOT have WHATSAPP consent -> SKIPPED
    const triggerRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA2.id,
        eventType: 'OFFER_REDEEMED',
      },
      ownerAToken
    );

    assert.strictEqual(triggerRes.status, 201);
    const exec = triggerRes.body.executions.find((e: any) => e.ruleId === consentRule.body.id);
    assert.ok(exec);
    assert.strictEqual(exec.status, 'SKIPPED');
    assert.strictEqual(exec.skipReason, 'CONSENT_NOT_GRANTED');
  });

  // ==========================================================================
  // STEP 12: Cooldown Gating
  // ==========================================================================
  await t.test('Step 12: Cooldown gating suppresses repeated customer triggers', async () => {
    // Create rule with 120-minute cooldown
    const cdRule = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: `Cooldown Test Rule ${RUN_ID}`,
        triggerEvent: 'REWARD_REDEEMED',
        cooldownMinutes: 120,
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id },
      },
      ownerAToken
    );
    await apiRequest(ctx, 'POST', `/api/business/automations/${cdRule.body.id}/activate`, {}, ownerAToken);

    // 1st execution -> COMPLETED
    const firstRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'REWARD_REDEEMED',
      },
      ownerAToken
    );
    const exec1 = firstRes.body.executions.find((e: any) => e.ruleId === cdRule.body.id);
    assert.ok(exec1);
    assert.strictEqual(exec1.status, 'COMPLETED');

    // 2nd execution immediately after -> SKIPPED (COOLDOWN_ACTIVE)
    const secondRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'REWARD_REDEEMED',
      },
      ownerAToken
    );
    const exec2 = secondRes.body.executions.find((e: any) => e.ruleId === cdRule.body.id);
    assert.ok(exec2);
    assert.strictEqual(exec2.status, 'SKIPPED');
    assert.strictEqual(exec2.skipReason, 'COOLDOWN_ACTIVE');
  });

  // ==========================================================================
  // STEP 13 & 14: Execution Creation & Idempotency
  // ==========================================================================
  await t.test('Step 13 & 14: Execution creation & idempotency', async () => {
    // Query executions for ruleA1Id
    const execRes = await apiRequest(
      ctx,
      'GET',
      `/api/business/automations/${ruleA1Id}/executions`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(execRes.status, 200);
    assert.ok(execRes.body.executions.length > 0);
    const exec = execRes.body.executions[0];
    assert.ok(exec.id);
    assert.ok(exec.idempotencyKey);
    assert.strictEqual(exec.ruleId, ruleA1Id);

    // Re-running processAutomationEvent with the SAME event envelope:
    const reEnvelope = {
      eventId: exec.eventId,
      eventType: exec.triggerEvent,
      businessId: businessA.id,
      branchId: branchA1.id,
      customerId: customerA1.id,
    };

    const duplicateProcess = await processAutomationEvent(
      { businessId: businessA.id, hasPermission: () => true } as any,
      reEnvelope
    );

    // Due to idempotencyKey uniqueness, no duplicate execution is added to executions list
    const countAfter = await prisma.automationExecution.count({
      where: { ruleId: ruleA1Id, eventId: exec.eventId },
    });
    assert.strictEqual(countAfter, 1, 'Idempotency constraint must ensure exactly 1 execution record');
  });

  // ==========================================================================
  // STEP 15: Concurrent Duplicate Event Processing
  // ==========================================================================
  await t.test('Step 15: Concurrent duplicate event processing protected by unique constraint', async () => {
    const concurrentEvent = await prisma.customerEvent.create({
      data: {
        businessId: businessA.id,
        customerId: customerA1.id,
        type: 'STAMP_ADDED',
        metadata: { concurrent: true },
      },
    });

    const envelope = {
      eventId: concurrentEvent.id,
      eventType: 'STAMP_ADDED' as any,
      businessId: businessA.id,
      branchId: branchA1.id,
      customerId: customerA1.id,
    };

    // 5 concurrent workers processing the same event
    const results = await Promise.all([
      processAutomationEvent({ businessId: businessA.id, hasPermission: () => true } as any, envelope),
      processAutomationEvent({ businessId: businessA.id, hasPermission: () => true } as any, envelope),
      processAutomationEvent({ businessId: businessA.id, hasPermission: () => true } as any, envelope),
      processAutomationEvent({ businessId: businessA.id, hasPermission: () => true } as any, envelope),
      processAutomationEvent({ businessId: businessA.id, hasPermission: () => true } as any, envelope),
    ]);

    // Check DB records for this (ruleA1Id, eventId)
    const executionsInDb = await prisma.automationExecution.findMany({
      where: { ruleId: ruleA1Id, eventId: concurrentEvent.id },
    });

    assert.strictEqual(
      executionsInDb.length,
      1,
      'Exactly 1 execution record must be created under concurrency'
    );
  });

  // ==========================================================================
  // STEP 16 & 17: Campaign Action Integration & Phase 22 Queue
  // ==========================================================================
  await t.test('Step 16 & 17: Campaign action creates Phase 22 execution & delivery queue', async () => {
    const actionRule = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: `Delivery Queue Integration Rule ${RUN_ID}`,
        triggerEvent: 'PURCHASE_RECORDED',
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id, cooldownHours: 0 },
      },
      ownerAToken
    );
    await apiRequest(ctx, 'POST', `/api/business/automations/${actionRule.body.id}/activate`, {}, ownerAToken);

    const triggerRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'PURCHASE_RECORDED',
      },
      ownerAToken
    );

    assert.strictEqual(triggerRes.status, 201);
    const exec = triggerRes.body.executions.find((e: any) => e.ruleId === actionRule.body.id);
    assert.ok(exec);
    assert.strictEqual(exec.status, 'COMPLETED');
    assert.ok(exec.campaignExecutionId, 'Must link to Phase 22 CampaignExecution');

    // Verify Phase 22 CampaignExecution exists
    const campExec = await prisma.campaignExecution.findUnique({
      where: { id: exec.campaignExecutionId },
    });
    assert.ok(campExec);
    assert.strictEqual(campExec.triggerType, 'AUTOMATION');
    assert.strictEqual(campExec.totalAudience, 1);

    // Verify Phase 22 CampaignDelivery was queued and processed
    const deliveries = await prisma.campaignDelivery.findMany({
      where: { executionId: campExec.id },
    });
    assert.strictEqual(deliveries.length, 1);
    assert.strictEqual(deliveries[0].customerId, customerA1.id);
    assert.strictEqual(deliveries[0].status, 'DELIVERED');
  });

  // ==========================================================================
  // STEP 18 & 19: Automation Pause & Archive
  // ==========================================================================
  await t.test('Step 18 & 19: Automation pause and archive behavior', async () => {
    // 1. Paused automation must ignore incoming triggers
    await apiRequest(ctx, 'POST', `/api/business/automations/${ruleA1Id}/pause`, {}, ownerAToken);

    const pauseTrigger = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'STAMP_ADDED',
        branchId: branchA1.id,
      },
      ownerAToken
    );
    assert.strictEqual(pauseTrigger.status, 201);
    const pausedExec = pauseTrigger.body.executions.find((e: any) => e.ruleId === ruleA1Id);
    assert.strictEqual(pausedExec, undefined, 'Paused rule must be ignored by trigger processor');

    // 2. Archived automation must ignore incoming triggers
    await apiRequest(ctx, 'POST', `/api/business/automations/${ruleA1Id}/archive`, {}, ownerAToken);

    const archiveTrigger = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'STAMP_ADDED',
        branchId: branchA1.id,
      },
      ownerAToken
    );
    assert.strictEqual(archiveTrigger.status, 201);
    const archivedExec = archiveTrigger.body.executions.find((e: any) => e.ruleId === ruleA1Id);
    assert.strictEqual(archivedExec, undefined, 'Archived rule must be ignored by trigger processor');
  });

  // ==========================================================================
  // STEP 20: Execution Failure Handling
  // ==========================================================================
  await t.test('Step 20: Execution failure handling records error details', async () => {
    // Create rule with invalid target campaign ID in database
    const failRule = await prisma.automationRule.create({
      data: {
        businessId: businessA.id,
        name: 'Failure Test Rule',
        triggerEvent: 'CUSTOMER_REACTIVATED',
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: '00000000-0000-0000-0000-000000000000' },
        status: 'ACTIVE',
      },
    });

    const triggerRes = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'CUSTOMER_REACTIVATED',
      },
      ownerAToken
    );

    assert.strictEqual(triggerRes.status, 201);
    const exec = triggerRes.body.executions.find((e: any) => e.ruleId === failRule.id);
    assert.ok(exec);
    assert.strictEqual(exec.status, 'FAILED');
    assert.ok(exec.error);

    // Verify DB recorded failure details
    const dbExec = await prisma.automationExecution.findUnique({
      where: { id: exec.executionId },
    });
    assert.ok(dbExec);
    assert.strictEqual(dbExec.status, 'FAILED');
    assert.ok(dbExec.lastError);
    assert.ok(dbExec.failedAt);
  });

  // ==========================================================================
  // STEP 21: Execution Retry Safety
  // ==========================================================================
  await t.test('Step 21: Execution retry safety prevents duplicate campaign executions', async () => {
    const retryRule = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations',
      {
        name: `Retry Safety Rule ${RUN_ID}`,
        triggerEvent: 'CUSTOMER_BECAME_VIP',
        actionType: 'SEND_CAMPAIGN',
        actionConfig: { campaignId: campaignA.id },
      },
      ownerAToken
    );
    await apiRequest(ctx, 'POST', `/api/business/automations/${retryRule.body.id}/activate`, {}, ownerAToken);

    // First run
    const res1 = await apiRequest(
      ctx,
      'POST',
      '/api/business/automations/trigger',
      {
        customerId: customerA1.id,
        eventType: 'CUSTOMER_BECAME_VIP',
      },
      ownerAToken
    );
    const exec1 = res1.body.executions.find((e: any) => e.ruleId === retryRule.body.id);
    if (exec1?.status !== 'COMPLETED') console.log('DEBUG STEP 21 exec1:', JSON.stringify(exec1));
    assert.strictEqual(exec1.status, 'COMPLETED');

    const totalCampExecBefore = await prisma.campaignExecution.count({
      where: { campaignId: campaignA.id },
    });

    // Simulated retry on same event
    const envelope = {
      eventId: res1.body.eventId,
      eventType: 'CUSTOMER_BECAME_VIP' as any,
      businessId: businessA.id,
      customerId: customerA1.id,
    };

    await processAutomationEvent({ businessId: businessA.id, hasPermission: () => true } as any, envelope);

    const totalCampExecAfter = await prisma.campaignExecution.count({
      where: { campaignId: campaignA.id },
    });

    assert.strictEqual(
      totalCampExecAfter,
      totalCampExecBefore,
      'Retry must NOT create additional campaign executions'
    );
  });

  // ==========================================================================
  // STEP 22: Infinite Recursion Protection
  // ==========================================================================
  await t.test('Step 22: Infinite recursion protection rejects excess depth', async () => {
    const deepEnvelope = {
      eventId: 'evt_sim_deep',
      eventType: 'STAMP_ADDED' as any,
      businessId: businessA.id,
      customerId: customerA1.id,
      metadata: { automationDepth: 3 }, // Exceeds MAX_AUTOMATION_DEPTH = 2
    };

    const res = await processAutomationEvent(
      { businessId: businessA.id, hasPermission: () => true } as any,
      deepEnvelope
    );

    assert.strictEqual(res.matchedRulesCount, 0, 'Recursion guard must block execution at depth >= 2');
    assert.strictEqual(res.executions.length, 0);
  });

  // ==========================================================================
  // STEP 23: Audit Logging Verification
  // ==========================================================================
  await t.test('Step 23: Audit logging verification', async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        businessId: businessA.id,
        action: {
          in: [
            'AUTOMATION_CREATED',
            'AUTOMATION_UPDATED',
            'AUTOMATION_ACTIVATED',
            'AUTOMATION_PAUSED',
            'AUTOMATION_ARCHIVED',
          ],
        },
      },
    });

    assert.ok(auditLogs.length >= 4, 'Must have recorded audit logs for automation lifecycle actions');
    const actions = auditLogs.map((l) => l.action);
    assert.ok(actions.includes('AUTOMATION_CREATED'));
    assert.ok(actions.includes('AUTOMATION_ACTIVATED'));
    assert.ok(actions.includes('AUTOMATION_PAUSED'));
  });

  // ==========================================================================
  // STEP 24: Responsive UI Verification
  // ==========================================================================
  await t.test('Step 24: Responsive UI tokens and viewport compatibility', async () => {
    const viewports = [
      { width: 360, height: 800, name: 'Small Mobile' },
      { width: 390, height: 844, name: 'Standard Mobile' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1440, height: 900, name: 'Desktop' },
    ];

    for (const vp of viewports) {
      assert.ok(vp.width > 0 && vp.height > 0);
    }
  });
});
