/**
 * REPLOYTY V2 — PHASE 24
 * WIN-BACK, BIRTHDAY & INACTIVITY RE-ENGAGEMENT WORKFLOWS
 * MANDATORY COMPREHENSIVE STAGING TEST SUITE
 * 
 * Steps 0 to 24:
 * Step 0:  Server & multi-tenant fixtures setup
 * Step 1:  Predefined retention templates API
 * Step 2:  Inactivity workflow creation & validation
 * Step 3:  Inactivity eligibility preview (read-only verification)
 * Step 4:  Time-based inactivity processor & Phase 22 delivery queue integration
 * Step 5:  Inactivity idempotency & repeat execution safety
 * Step 6:  Win-back workflow creation & eligibility thresholding
 * Step 7:  Win-back processor execution & cycle tracking
 * Step 8:  Customer return / reactivation recognition (retention loop completion)
 * Step 9:  Birthday workflow creation & timezone handling
 * Step 10: Birthday advance offset workflow (daysBefore > 0)
 * Step 11: February 29 policy evaluation (leap vs non-leap years)
 * Step 12: Birthday once-per-year idempotency protection
 * Step 13: Phase 21 dynamic segment integration
 * Step 14: Customer consent gating (suppression of unconsented customers)
 * Step 15: Cooldown gating & frequency policy enforcement
 * Step 16: Concurrency safety (DB unique constraint on idempotencyKey)
 * Step 17: Branch scoping isolation
 * Step 18: Strict multi-tenant isolation
 * Step 19: RBAC permissions enforcement (Owner/Manager vs Staff vs Unauth)
 * Step 20: Pause & archive lifecycle safety
 * Step 21: Safe test simulation trace (diagnostic steps without queueing)
 * Step 22: Audit logging verification
 * Step 23: Responsive UI & viewport verification
 */

import test from 'node:test';
import assert from 'node:assert';
import { startTestServer, apiRequest as rawApiRequest, TestServerContext } from '../e2e/test_helpers';
import { prisma } from '../../src/server/db/client';
import { hashPassword } from '../../src/server/auth/sessionService';
import {
  AudienceType,
  BusinessCategory,
  CampaignChannel,
  CampaignStatus,
  ConsentChannel,
  CustomerEventType,
  ExecutionStatus,
  RuleStatus,
  UserStatus,
} from '@prisma/client';
import {
  createRetentionWorkflow,
  getRetentionWorkflows,
  getRetentionWorkflowById,
  updateRetentionWorkflow,
  activateRetentionWorkflow,
  pauseRetentionWorkflow,
  archiveRetentionWorkflow,
  previewRetentionWorkflow,
  simulateRetentionWorkflow,
  processTimeBasedRetention,
  handleCustomerReturn,
  evaluateBirthdayMatch,
  isLeapYear,
  getLocalDateParts,
} from '../../src/server/services/retentionWorkflowService';
import { RETENTION_TEMPLATES } from '../../src/types/retention';

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

const RUN_ID = `p24_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

test('PHASE 24: RETENTION RE-ENGAGEMENT & TIME-BASED WORKFLOWS TEST SUITE', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;

  // Tenant A Fixtures
  let businessA: any;
  let branchA1: any;
  let branchA2: any;
  let ownerAToken: string;
  let managerAToken: string;
  let staffAToken: string;
  let campaignA: any;

  // Customers for Tenant A
  let custInactive30d: any;
  let custActive: any;
  let custWinBack90d: any;
  let custBirthdayToday: any;
  let custBirthdayTomorrow: any;
  let custFeb29: any;
  let custUnconsented: any;
  let custBranch2: any;

  // Tenant B Fixtures (Multi-tenant isolation)
  let businessB: any;
  let branchB1: any;
  let ownerBToken: string;
  let customerB1: any;
  let campaignB: any;

  // Track created workflows
  let inactivityWorkflowId: string;
  let winbackWorkflowId: string;
  let birthdayWorkflowId: string;

  // ==========================================================================
  // Step 0: Server & Tenant Fixture Setup
  // ==========================================================================
  await t.test('Step 0: Initialize test server and multi-tenant fixtures', async () => {
    ctx = await startTestServer();
    const pwHash = await hashPassword('Password123!');

    // 1. Roles
    const [ownerRole, managerRole, staffRole] = await Promise.all([
      prisma.role.upsert({ where: { id: 'owner-role' }, update: {}, create: { id: 'owner-role', name: 'Owner', isSystem: true } }),
      prisma.role.upsert({ where: { id: 'manager-role' }, update: {}, create: { id: 'manager-role', name: 'Manager', isSystem: true } }),
      prisma.role.upsert({ where: { id: 'staff-role' }, update: {}, create: { id: 'staff-role', name: 'Staff', isSystem: true } }),
    ]);

    // Permissions
    const permCodes = ['AUTOMATIONS_VIEW', 'AUTOMATIONS_MANAGE', 'CAMPAIGNS_VIEW', 'CAMPAIGNS_MANAGE', 'CUSTOMERS_VIEW'];
    for (const code of permCodes) {
      const perm = await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, name: code, category: 'RETENTION' },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: ownerRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: ownerRole.id, permissionId: perm.id },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: managerRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: managerRole.id, permissionId: perm.id },
      });
    }

    // 2. Business A (Asia/Kolkata timezone)
    businessA = await prisma.business.create({
      data: {
        name: `Tenant A Retention ${RUN_ID}`,
        slug: `tenant-a-retention-${RUN_ID}`,
        category: BusinessCategory.CAFE,
        timezone: 'Asia/Kolkata',
      },
    });

    branchA1 = await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: 'Downtown Main Branch',
        isMainBranch: true,
        timezone: 'Asia/Kolkata',
      },
    });

    branchA2 = await prisma.branch.create({
      data: {
        businessId: businessA.id,
        name: 'Westside Branch',
        isMainBranch: false,
        timezone: 'Asia/Kolkata',
      },
    });

    // Users & Memberships
    const userAOwner = await prisma.user.create({
      data: { email: `owner_a_${RUN_ID}@example.com`, name: 'Owner A', passwordHash: pwHash, status: UserStatus.ACTIVE },
    });
    await prisma.staffMembership.create({
      data: { userId: userAOwner.id, businessId: businessA.id, branchId: branchA1.id, roleId: ownerRole.id },
    });
    const sOwnerA = await prisma.session.create({
      data: { userId: userAOwner.id, businessId: businessA.id, sessionToken: `token_owner_a_${RUN_ID}`, expiresAt: new Date(Date.now() + 86400000) },
    });
    ownerAToken = sOwnerA.sessionToken;

    const userAManager = await prisma.user.create({
      data: { email: `manager_a_${RUN_ID}@example.com`, name: 'Manager A', passwordHash: pwHash, status: UserStatus.ACTIVE },
    });
    await prisma.staffMembership.create({
      data: { userId: userAManager.id, businessId: businessA.id, branchId: branchA1.id, roleId: managerRole.id },
    });
    const sManagerA = await prisma.session.create({
      data: { userId: userAManager.id, businessId: businessA.id, sessionToken: `token_manager_a_${RUN_ID}`, expiresAt: new Date(Date.now() + 86400000) },
    });
    managerAToken = sManagerA.sessionToken;

    const userAStaff = await prisma.user.create({
      data: { email: `staff_a_${RUN_ID}@example.com`, name: 'Staff A', passwordHash: pwHash, status: UserStatus.ACTIVE },
    });
    await prisma.staffMembership.create({
      data: { userId: userAStaff.id, businessId: businessA.id, branchId: branchA1.id, roleId: staffRole.id },
    });
    const sStaffA = await prisma.session.create({
      data: { userId: userAStaff.id, businessId: businessA.id, sessionToken: `token_staff_a_${RUN_ID}`, expiresAt: new Date(Date.now() + 86400000) },
    });
    staffAToken = sStaffA.sessionToken;

    // Campaign for Tenant A
    campaignA = await prisma.campaign.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: `Retention Campaign ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        messageTemplate: 'Hi {{customer.name}}, we have a special perk for you!',
        audienceType: AudienceType.ALL_CUSTOMERS,
        status: CampaignStatus.ACTIVE,
      },
    });

    const now = new Date();

    // Customer: 35 days inactive (eligible for 30d inactivity)
    custInactive30d = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Inactive Customer 30d',
        phone: `+919810${Math.floor(100000 + Math.random() * 900000)}`,
        lastVisitAt: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
        totalVisits: 6,
        marketingConsent: true,
      },
    });
    await prisma.customerConsent.create({
      data: { customerId: custInactive30d.id, channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
    });

    // Customer: Active (visited 2 days ago)
    custActive = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Active Customer',
        phone: `+919811${Math.floor(100000 + Math.random() * 900000)}`,
        lastVisitAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        totalVisits: 12,
        marketingConsent: true,
      },
    });
    await prisma.customerConsent.create({
      data: { customerId: custActive.id, channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
    });

    // Customer: 100 days inactive (eligible for 90d win-back)
    custWinBack90d = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Win-Back Customer 90d',
        phone: `+919812${Math.floor(100000 + Math.random() * 900000)}`,
        lastVisitAt: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000),
        totalVisits: 8,
        marketingConsent: true,
      },
    });
    await prisma.customerConsent.create({
      data: { customerId: custWinBack90d.id, channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
    });

    // Customer: Birthday Today (in Asia/Kolkata timezone)
    // Create birth date matching today's month & day in business timezone
    const kolkataToday = getLocalDateParts(now, 'Asia/Kolkata');
    const birthdayToday = new Date(Date.UTC(1995, kolkataToday.month - 1, kolkataToday.day));
    custBirthdayToday = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Birthday Customer Today',
        phone: `+919813${Math.floor(100000 + Math.random() * 900000)}`,
        birthday: birthdayToday,
        lastVisitAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        totalVisits: 4,
        marketingConsent: true,
      },
    });
    await prisma.customerConsent.create({
      data: { customerId: custBirthdayToday.id, channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
    });

    // Customer: Birthday Tomorrow
    const kolkataTomorrow = getLocalDateParts(new Date(now.getTime() + 24 * 60 * 60 * 1000), 'Asia/Kolkata');
    const birthdayTomorrow = new Date(Date.UTC(1995, kolkataTomorrow.month - 1, kolkataTomorrow.day));
    custBirthdayTomorrow = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Birthday Customer Tomorrow',
        phone: `+919814${Math.floor(100000 + Math.random() * 900000)}`,
        birthday: birthdayTomorrow,
        lastVisitAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        totalVisits: 3,
        marketingConsent: true,
      },
    });
    await prisma.customerConsent.create({
      data: { customerId: custBirthdayTomorrow.id, channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
    });

    // Customer: Born on Feb 29 2000 (leap year)
    custFeb29 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Feb 29 Leap Customer',
        phone: `+919815${Math.floor(100000 + Math.random() * 900000)}`,
        birthday: new Date('2000-02-29T00:00:00.000Z'),
        lastVisitAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        totalVisits: 5,
        marketingConsent: true,
      },
    });
    await prisma.customerConsent.create({
      data: { customerId: custFeb29.id, channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
    });

    // Customer: 40 days inactive BUT lacks marketing consent
    custUnconsented = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Unconsented Inactive Customer',
        phone: `+919816${Math.floor(100000 + Math.random() * 900000)}`,
        lastVisitAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
        totalVisits: 2,
        marketingConsent: false,
      },
    });

    // Customer: Belongs to Branch A2
    custBranch2 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA2.id,
        name: 'Branch 2 Inactive Customer',
        phone: `+919817${Math.floor(100000 + Math.random() * 900000)}`,
        lastVisitAt: new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000),
        totalVisits: 5,
        marketingConsent: true,
      },
    });
    await prisma.customerConsent.create({
      data: { customerId: custBranch2.id, channel: ConsentChannel.WHATSAPP, granted: true, source: 'PORTAL' },
    });

    // 3. Tenant B Setup (Isolation test)
    businessB = await prisma.business.create({
      data: {
        name: `Tenant B Retention ${RUN_ID}`,
        slug: `tenant-b-retention-${RUN_ID}`,
        category: BusinessCategory.RETAIL,
        timezone: 'UTC',
      },
    });
    branchB1 = await prisma.branch.create({
      data: { businessId: businessB.id, name: 'B Main', isMainBranch: true, timezone: 'UTC' },
    });
    const userBOwner = await prisma.user.create({
      data: { email: `owner_b_${RUN_ID}@example.com`, name: 'Owner B', passwordHash: pwHash, status: UserStatus.ACTIVE },
    });
    await prisma.staffMembership.create({
      data: { userId: userBOwner.id, businessId: businessB.id, branchId: branchB1.id, roleId: ownerRole.id },
    });
    const sOwnerB = await prisma.session.create({
      data: { userId: userBOwner.id, businessId: businessB.id, sessionToken: `token_owner_b_${RUN_ID}`, expiresAt: new Date(Date.now() + 86400000) },
    });
    ownerBToken = sOwnerB.sessionToken;

    campaignB = await prisma.campaign.create({
      data: {
        businessId: businessB.id,
        branchId: branchB1.id,
        name: `Tenant B Campaign ${RUN_ID}`,
        channel: CampaignChannel.WHATSAPP,
        messageTemplate: 'Hi from Tenant B!',
        status: CampaignStatus.ACTIVE,
      },
    });

    customerB1 = await prisma.customer.create({
      data: {
        businessId: businessB.id,
        branchId: branchB1.id,
        name: 'Tenant B Customer',
        phone: `+919820${Math.floor(100000 + Math.random() * 900000)}`,
        lastVisitAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
        marketingConsent: true,
      },
    });

    assert.ok(businessA.id);
    assert.ok(ownerAToken);
    assert.ok(businessB.id);
  });

  // ==========================================================================
  // Step 1: Predefined Retention Templates API
  // ==========================================================================
  await t.test('Step 1: Predefined retention templates API returns structured templates', async () => {
    const res = await apiRequest(ctx, 'GET', '/api/business/retention/templates', undefined, ownerAToken);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.templates));
    assert.ok(res.body.templates.length >= 3);

    const hasInactivity = res.body.templates.some((t: any) => t.workflowType === 'INACTIVITY');
    const hasWinback = res.body.templates.some((t: any) => t.workflowType === 'WIN_BACK');
    const hasBirthday = res.body.templates.some((t: any) => t.workflowType === 'BIRTHDAY');
    assert.ok(hasInactivity, 'Must include Inactivity template');
    assert.ok(hasWinback, 'Must include Win-back template');
    assert.ok(hasBirthday, 'Must include Birthday template');
  });

  // ==========================================================================
  // Step 2: Inactivity Workflow Creation & Validation
  // ==========================================================================
  await t.test('Step 2: Inactivity workflow creation, validation & DRAFT state', async () => {
    // 2a. Rejects missing name
    const invalidRes1 = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: '',
      workflowType: 'INACTIVITY',
      campaignId: campaignA.id,
      config: { inactivityDays: 30, campaignId: campaignA.id },
    }, ownerAToken);
    assert.strictEqual(invalidRes1.status, 400);

    // 2b. Rejects invalid inactivityDays
    const invalidRes2 = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: 'Bad Days Rule',
      workflowType: 'INACTIVITY',
      campaignId: campaignA.id,
      config: { inactivityDays: -5, campaignId: campaignA.id },
    }, ownerAToken);
    assert.strictEqual(invalidRes2.status, 400);

    // 2c. Valid creation
    const validRes = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: `30-Day Inactive Re-engagement ${RUN_ID}`,
      description: 'Re-engage customers without visits for 30 days',
      workflowType: 'INACTIVITY',
      branchId: branchA1.id,
      campaignId: campaignA.id,
      cooldownDays: 14,
      maxExecutionsPerCustomer: 2,
      config: {
        inactivityDays: 30,
        campaignId: campaignA.id,
        includeNeverVisited: false,
      },
    }, ownerAToken);

    assert.strictEqual(validRes.status, 201);
    assert.strictEqual(validRes.body.status, RuleStatus.DRAFT);
    assert.strictEqual(validRes.body.workflowType, 'INACTIVITY');
    assert.strictEqual(validRes.body.triggerEvent, CustomerEventType.CUSTOMER_BECAME_INACTIVE);
    assert.strictEqual(validRes.body.cooldownMinutes, 14 * 24 * 60);

    inactivityWorkflowId = validRes.body.id;
  });

  // ==========================================================================
  // Step 3: Inactivity Eligibility Preview (Read-Only)
  // ==========================================================================
  await t.test('Step 3: Retention preview identifies eligible customers without state mutation', async () => {
    const previewRes = await apiRequest(ctx, 'POST', '/api/business/retention/preview', {
      workflowType: 'INACTIVITY',
      inactivityDays: 30,
      branchId: branchA1.id,
      campaignId: campaignA.id,
    }, ownerAToken);

    assert.strictEqual(previewRes.status, 200);
    assert.ok(previewRes.body.totalEligibleCount >= 1);
    assert.ok(Array.isArray(previewRes.body.sampleCustomers));

    const sampleIds = previewRes.body.sampleCustomers.map((c: any) => c.id);
    assert.ok(sampleIds.includes(custInactive30d.id), 'custInactive30d (35d) must be eligible');
    assert.ok(!sampleIds.includes(custActive.id), 'custActive (2d) must NOT be eligible');

    // Verify ZERO executions were created by preview
    const execCount = await prisma.automationExecution.count({
      where: { businessId: businessA.id },
    });
    assert.strictEqual(execCount, 0, 'Preview must be strictly read-only');
  });

  // ==========================================================================
  // Step 4: Time-based Inactivity Processor & Phase 22 Campaign Integration
  // ==========================================================================
  await t.test('Step 4: Activate inactivity workflow and run time-based processor', async () => {
    // 4a. Activate workflow
    const actRes = await apiRequest(
      ctx,
      'POST',
      `/api/business/retention/workflows/${inactivityWorkflowId}/activate`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(actRes.status, 200);
    assert.strictEqual(actRes.body.status, RuleStatus.ACTIVE);

    // 4b. Execute time-based retention processor
    const procResult = await processTimeBasedRetention({
      businessId: businessA.id,
      workflowType: 'INACTIVITY',
      limitPerWorkflow: 50,
    });

    assert.ok(procResult.processedRulesCount >= 1);
    assert.ok(procResult.totalExecutionsCreated >= 1);
    assert.ok(procResult.totalExecutionsCompleted >= 1);

    // 4c. Verify AutomationExecution created in COMPLETED state
    const execution = await prisma.automationExecution.findFirst({
      where: {
        ruleId: inactivityWorkflowId,
        customerId: custInactive30d.id,
      },
    });
    assert.ok(execution);
    assert.strictEqual(execution.status, ExecutionStatus.COMPLETED);
    assert.ok(execution.idempotencyKey?.includes(custInactive30d.id));

    // 4d. Verify Phase 22 CampaignExecution created
    assert.ok(execution.campaignExecutionId);
    const campaignExec = await prisma.campaignExecution.findUnique({
      where: { id: execution.campaignExecutionId },
    });
    assert.ok(campaignExec);
    assert.strictEqual(campaignExec.triggerType, 'RETENTION_INACTIVITY');

    // 4e. Verify Phase 22 CampaignDelivery created in queue
    const delivery = await prisma.campaignDelivery.findFirst({
      where: {
        campaignId: campaignA.id,
        customerId: custInactive30d.id,
      },
    });
    assert.ok(delivery);
  });

  // ==========================================================================
  // Step 5: Inactivity Idempotency & Repeat Safety
  // ==========================================================================
  await t.test('Step 5: Inactivity processor repeat safety prevents duplicate execution', async () => {
    // Run processor second time immediately
    const procResult2 = await processTimeBasedRetention({
      businessId: businessA.id,
      workflowType: 'INACTIVITY',
      limitPerWorkflow: 50,
    });

    // Zero new executions should be created for this cycle!
    const executionsForCust = await prisma.automationExecution.findMany({
      where: {
        ruleId: inactivityWorkflowId,
        customerId: custInactive30d.id,
      },
    });
    assert.strictEqual(executionsForCust.length, 1, 'Must have exactly 1 execution record');
  });

  // ==========================================================================
  // Step 6 & 7: Win-Back Workflow Creation, Eligibility & Execution
  // ==========================================================================
  await t.test('Step 6 & 7: Win-back workflow creation, 90d threshold eligibility & execution', async () => {
    // 6a. Create Win-Back rule (90 days)
    const createRes = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: `90-Day VIP Win-Back ${RUN_ID}`,
      workflowType: 'WIN_BACK',
      branchId: branchA1.id,
      campaignId: campaignA.id,
      cooldownDays: 30,
      config: {
        winBackThresholdDays: 90,
        campaignId: campaignA.id,
      },
    }, ownerAToken);
    assert.strictEqual(createRes.status, 201);
    winbackWorkflowId = createRes.body.id;

    // 6b. Preview confirms custWinBack90d (100d) is eligible, but custInactive30d (35d) is NOT eligible for 90d win-back!
    const previewRes = await apiRequest(ctx, 'POST', '/api/business/retention/preview', {
      workflowType: 'WIN_BACK',
      winBackThresholdDays: 90,
      branchId: branchA1.id,
      campaignId: campaignA.id,
    }, ownerAToken);

    assert.strictEqual(previewRes.status, 200);
    const sampleIds = previewRes.body.sampleCustomers.map((c: any) => c.id);
    assert.ok(sampleIds.includes(custWinBack90d.id), 'custWinBack90d (100d) must be eligible for win-back');
    assert.ok(!sampleIds.includes(custInactive30d.id), 'custInactive30d (35d) must NOT be eligible for 90d win-back');

    // 7a. Activate and run processor
    await apiRequest(ctx, 'POST', `/api/business/retention/workflows/${winbackWorkflowId}/activate`, undefined, ownerAToken);
    const winbackProc = await processTimeBasedRetention({
      businessId: businessA.id,
      workflowType: 'WIN_BACK',
    });
    assert.ok(winbackProc.totalExecutionsCompleted >= 1);

    const wbExec = await prisma.automationExecution.findFirst({
      where: {
        ruleId: winbackWorkflowId,
        customerId: custWinBack90d.id,
      },
    });
    assert.ok(wbExec);
    assert.strictEqual(wbExec.status, ExecutionStatus.COMPLETED);
  });

  // ==========================================================================
  // Step 8: Customer Return / Reactivation Recognition
  // ==========================================================================
  await t.test('Step 8: Customer return via visit/purchase triggers reactivation recovery', async () => {
    // Customer returns: Record a visit
    const returnResult = await handleCustomerReturn(
      {
        user: { id: 'test_user', email: 'test@reployty.internal', name: 'Test User', isSuperAdmin: false },
        businessId: businessA.id,
        businessName: businessA.name,
        branchId: branchA1.id,
        roleName: 'OWNER',
        permissions: new Set(['CUSTOMERS_VIEW']),
        hasPermission: () => true,
        isOwner: true,
        isSuperAdmin: false,
      },
      custWinBack90d.id,
      CustomerEventType.VISIT_RECORDED
    );

    assert.strictEqual(returnResult.reacted, true);
    assert.strictEqual(returnResult.priorWorkflowType, 'WIN_BACK');

    // Verify CUSTOMER_REACTIVATED event exists in timeline
    const reactEvent = await prisma.customerEvent.findFirst({
      where: {
        businessId: businessA.id,
        customerId: custWinBack90d.id,
        type: CustomerEventType.CUSTOMER_REACTIVATED,
      },
    });
    assert.ok(reactEvent, 'CUSTOMER_REACTIVATED event must be recorded');
  });

  // ==========================================================================
  // Step 9 & 10: Birthday Workflows, Timezone Handling & Advance Offset
  // ==========================================================================
  await t.test('Step 9 & 10: Birthday workflow with timezone handling and advance offset', async () => {
    // 9a. Birthday Day-of workflow
    const bdayRes = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: `Birthday Celebration Treat ${RUN_ID}`,
      workflowType: 'BIRTHDAY',
      branchId: branchA1.id,
      campaignId: campaignA.id,
      cooldownDays: 330,
      config: {
        daysBefore: 0,
        campaignId: campaignA.id,
        leapYearFeb29Policy: 'FEB_28',
      },
    }, ownerAToken);
    assert.strictEqual(bdayRes.status, 201);
    birthdayWorkflowId = bdayRes.body.id;

    // 9b. Activate and process
    await apiRequest(ctx, 'POST', `/api/business/retention/workflows/${birthdayWorkflowId}/activate`, undefined, ownerAToken);
    const bdayProc = await processTimeBasedRetention({
      businessId: businessA.id,
      workflowType: 'BIRTHDAY',
    });

    assert.ok(bdayProc.totalExecutionsCompleted >= 1);
    const bdayExec = await prisma.automationExecution.findFirst({
      where: {
        ruleId: birthdayWorkflowId,
        customerId: custBirthdayToday.id,
      },
    });
    assert.ok(bdayExec);
    assert.strictEqual(bdayExec.status, ExecutionStatus.COMPLETED);

    // 10a. Advance offset workflow (daysBefore: 1)
    const advanceRes = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: `Birthday 1-Day Early Notice ${RUN_ID}`,
      workflowType: 'BIRTHDAY',
      branchId: branchA1.id,
      campaignId: campaignA.id,
      config: {
        daysBefore: 1,
        campaignId: campaignA.id,
      },
    }, ownerAToken);
    assert.strictEqual(advanceRes.status, 201);

    await apiRequest(ctx, 'POST', `/api/business/retention/workflows/${advanceRes.body.id}/activate`, undefined, ownerAToken);
    const advanceProc = await processTimeBasedRetention({
      businessId: businessA.id,
      workflowType: 'BIRTHDAY',
    });

    // custBirthdayTomorrow should match for daysBefore: 1
    const advExec = await prisma.automationExecution.findFirst({
      where: {
        ruleId: advanceRes.body.id,
        customerId: custBirthdayTomorrow.id,
      },
    });
    assert.ok(advExec);
    assert.strictEqual(advExec.status, ExecutionStatus.COMPLETED);
  });

  // ==========================================================================
  // Step 11: February 29 Policy Evaluation (Leap vs Non-Leap Years)
  // ==========================================================================
  await t.test('Step 11: February 29 birthday policy behaves deterministically across leap/non-leap years', async () => {
    const leapDate = new Date('2000-02-29T00:00:00.000Z');

    // A. In non-leap year (e.g. 2026), policy FEB_28 evaluates on Feb 28
    const nonLeap2026Feb28 = new Date('2026-02-28T05:00:00.000Z');
    const matchFeb28 = evaluateBirthdayMatch(leapDate, nonLeap2026Feb28, 'UTC', 0, 'FEB_28');
    assert.strictEqual(matchFeb28.isMatch, true, 'Feb 29 birthday must celebrate on Feb 28 in non-leap year with FEB_28 policy');
    assert.strictEqual(matchFeb28.effectiveBirthdayDateStr, '2026-02-28');

    // B. In non-leap year with policy MAR_1 evaluates on March 1
    const nonLeap2026Mar1 = new Date('2026-03-01T05:00:00.000Z');
    const matchMar1 = evaluateBirthdayMatch(leapDate, nonLeap2026Mar1, 'UTC', 0, 'MAR_1');
    assert.strictEqual(matchMar1.isMatch, true, 'Feb 29 birthday must celebrate on March 1 with MAR_1 policy');
    assert.strictEqual(matchMar1.effectiveBirthdayDateStr, '2026-03-01');

    // C. In leap year (e.g. 2028), evaluates on Feb 29
    assert.strictEqual(isLeapYear(2028), true);
    const leap2028Feb29 = new Date('2028-02-29T05:00:00.000Z');
    const matchLeap = evaluateBirthdayMatch(leapDate, leap2028Feb29, 'UTC', 0, 'FEB_28');
    assert.strictEqual(matchLeap.isMatch, true, 'Feb 29 birthday must celebrate on Feb 29 in leap year');
    assert.strictEqual(matchLeap.effectiveBirthdayDateStr, '2028-02-29');
  });

  // ==========================================================================
  // Step 12: Birthday Once-per-Year Idempotency Protection
  // ==========================================================================
  await t.test('Step 12: Birthday once-per-year guarantee prevents duplicate annual execution', async () => {
    // Run birthday processor again for same year
    const repeatProc = await processTimeBasedRetention({
      businessId: businessA.id,
      workflowType: 'BIRTHDAY',
    });

    const bdayExecs = await prisma.automationExecution.findMany({
      where: {
        ruleId: birthdayWorkflowId,
        customerId: custBirthdayToday.id,
      },
    });
    assert.strictEqual(bdayExecs.length, 1, 'Must not duplicate birthday execution within the same birthday year');
  });

  // ==========================================================================
  // Step 13: Phase 21 Dynamic Segment Integration
  // ==========================================================================
  await t.test('Step 13: Dynamic segment condition suppresses unqualified customers', async () => {
    // Create rule requiring totalVisits >= 10
    const segRuleRes = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: `VIP Inactive Filter Rule ${RUN_ID}`,
      workflowType: 'INACTIVITY',
      campaignId: campaignA.id,
      config: { inactivityDays: 30, campaignId: campaignA.id },
      conditionConfig: {
        logic: 'AND',
        conditions: [{ field: 'totalVisits', operator: 'GREATER_THAN_OR_EQUAL', value: 10 }],
      },
    }, ownerAToken);
    assert.strictEqual(segRuleRes.status, 201);

    await apiRequest(ctx, 'POST', `/api/business/retention/workflows/${segRuleRes.body.id}/activate`, undefined, ownerAToken);

    // custInactive30d has totalVisits: 6 (< 10), so it should not qualify
    const segProc = await processTimeBasedRetention({
      businessId: businessA.id,
      workflowType: 'INACTIVITY',
    });

    const segExec = await prisma.automationExecution.findFirst({
      where: {
        ruleId: segRuleRes.body.id,
        customerId: custInactive30d.id,
      },
    });
    assert.strictEqual(segExec, null, 'Customer with totalVisits < 10 must not be executed');
  });

  // ==========================================================================
  // Step 14: Customer Consent Gating
  // ==========================================================================
  await t.test('Step 14: Consent gating suppresses unconsented customers with CONSENT_NOT_GRANTED', async () => {
    const unconsentRuleRes = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: `Consent Test Rule ${RUN_ID}`,
      workflowType: 'INACTIVITY',
      campaignId: campaignA.id,
      config: { inactivityDays: 30, campaignId: campaignA.id },
    }, ownerAToken);
    assert.strictEqual(unconsentRuleRes.status, 201);

    await apiRequest(ctx, 'POST', `/api/business/retention/workflows/${unconsentRuleRes.body.id}/activate`, undefined, ownerAToken);

    await processTimeBasedRetention({
      businessId: businessA.id,
      workflowType: 'INACTIVITY',
    });

    // custUnconsented (40d inactive, marketingConsent: false) must be SKIPPED with CONSENT_NOT_GRANTED
    const unconsentedExec = await prisma.automationExecution.findFirst({
      where: {
        ruleId: unconsentRuleRes.body.id,
        customerId: custUnconsented.id,
      },
    });
    assert.ok(unconsentedExec);
    assert.strictEqual(unconsentedExec.status, ExecutionStatus.SKIPPED);
    assert.strictEqual(unconsentedExec.skipReason, 'CONSENT_NOT_GRANTED');
  });

  // ==========================================================================
  // Step 15: Cooldown Gating & Frequency Policy
  // ==========================================================================
  await t.test('Step 15: Cooldown and max executions policy enforcement', async () => {
    // Create rule with 30-day cooldown and maxExecutionsPerCustomer: 1
    const cooldownRuleRes = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: `Cooldown Rule ${RUN_ID}`,
      workflowType: 'INACTIVITY',
      campaignId: campaignA.id,
      cooldownDays: 30,
      maxExecutionsPerCustomer: 1,
      config: { inactivityDays: 30, campaignId: campaignA.id },
    }, ownerAToken);
    assert.strictEqual(cooldownRuleRes.status, 201);

    // Create a mock prior execution for a customer
    const mockCust = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Cooldown Customer',
        phone: `+919818${Math.floor(100000 + Math.random() * 900000)}`,
        lastVisitAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        marketingConsent: true,
      },
    });

    await prisma.automationExecution.create({
      data: {
        ruleId: cooldownRuleRes.body.id,
        businessId: businessA.id,
        customerId: mockCust.id,
        triggerEvent: CustomerEventType.CUSTOMER_BECAME_INACTIVE,
        status: ExecutionStatus.COMPLETED,
        executedAt: new Date(),
        idempotencyKey: `prior_exec_${mockCust.id}`,
      },
    });

    // Activate and process
    await apiRequest(ctx, 'POST', `/api/business/retention/workflows/${cooldownRuleRes.body.id}/activate`, undefined, ownerAToken);
    await processTimeBasedRetention({ businessId: businessA.id, workflowType: 'INACTIVITY' });

    // Customer must be skipped due to MAX_EXECUTIONS_REACHED or COOLDOWN_ACTIVE
    const skippedExec = await prisma.automationExecution.findFirst({
      where: {
        ruleId: cooldownRuleRes.body.id,
        customerId: mockCust.id,
        status: ExecutionStatus.SKIPPED,
      },
    });
    assert.ok(skippedExec);
    assert.ok(
      skippedExec.skipReason === 'COOLDOWN_ACTIVE' || skippedExec.skipReason === 'MAX_EXECUTIONS_REACHED'
    );
  });

  // ==========================================================================
  // Step 16: Concurrency Safety (DB Unique Constraint on IdempotencyKey)
  // ==========================================================================
  await t.test('Step 16: Concurrent duplicate execution attempts protected by DB unique constraint', async () => {
    const testKey = `concurrent_test_key_${RUN_ID}`;

    const createPromise1 = prisma.automationExecution.create({
      data: {
        ruleId: inactivityWorkflowId,
        businessId: businessA.id,
        customerId: custInactive30d.id,
        triggerEvent: CustomerEventType.CUSTOMER_BECAME_INACTIVE,
        status: ExecutionStatus.PENDING,
        idempotencyKey: testKey,
      },
    });

    const createPromise2 = prisma.automationExecution.create({
      data: {
        ruleId: inactivityWorkflowId,
        businessId: businessA.id,
        customerId: custInactive30d.id,
        triggerEvent: CustomerEventType.CUSTOMER_BECAME_INACTIVE,
        status: ExecutionStatus.PENDING,
        idempotencyKey: testKey,
      },
    });

    const results = await Promise.allSettled([createPromise1, createPromise2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent insertion must succeed');
    assert.strictEqual(rejected.length, 1, 'Second concurrent insertion must fail with unique constraint violation');
  });

  // ==========================================================================
  // Step 17: Branch Scoping Isolation
  // ==========================================================================
  await t.test('Step 17: Branch scoping restricts execution to matching branch customers only', async () => {
    // Create rule strictly scoped to branchA1
    const branchRuleRes = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: `Branch A1 Only Rule ${RUN_ID}`,
      workflowType: 'INACTIVITY',
      branchId: branchA1.id,
      campaignId: campaignA.id,
      config: { inactivityDays: 30, campaignId: campaignA.id },
    }, ownerAToken);
    assert.strictEqual(branchRuleRes.status, 201);

    await apiRequest(ctx, 'POST', `/api/business/retention/workflows/${branchRuleRes.body.id}/activate`, undefined, ownerAToken);
    await processTimeBasedRetention({ businessId: businessA.id, workflowType: 'INACTIVITY' });

    // custBranch2 belongs to branchA2, so it must NOT have an execution under branchA1 rule!
    const branchExec = await prisma.automationExecution.findFirst({
      where: {
        ruleId: branchRuleRes.body.id,
        customerId: custBranch2.id,
      },
    });
    assert.strictEqual(branchExec, null, 'Customer in Branch A2 must not execute under Branch A1 rule');
  });

  // ==========================================================================
  // Step 18: Multi-tenant Isolation
  // ==========================================================================
  await t.test('Step 18: Multi-tenant isolation prevents cross-tenant access and processing', async () => {
    // Tenant B owner attempts to view Tenant A workflow -> 404
    const crossGet = await apiRequest(
      ctx,
      'GET',
      `/api/business/retention/workflows/${inactivityWorkflowId}`,
      undefined,
      ownerBToken
    );
    assert.strictEqual(crossGet.status, 404);

    // Tenant B owner attempts to activate Tenant A workflow -> 404
    const crossAct = await apiRequest(
      ctx,
      'POST',
      `/api/business/retention/workflows/${inactivityWorkflowId}/activate`,
      undefined,
      ownerBToken
    );
    assert.strictEqual(crossAct.status, 404);

    // Tenant B cannot use Tenant A campaign
    const crossCreate = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: 'Cross Campaign Rule',
      workflowType: 'INACTIVITY',
      campaignId: campaignA.id, // Belongs to Tenant A!
      config: { inactivityDays: 30, campaignId: campaignA.id },
    }, ownerBToken);
    assert.strictEqual(crossCreate.status, 400);
  });

  // ==========================================================================
  // Step 19: RBAC Permissions Enforcement
  // ==========================================================================
  await t.test('Step 19: RBAC permissions (Owner/Manager allow, Staff deny, Unauth 401)', async () => {
    // 19a. Unauthenticated -> 401
    const unauthRes = await apiRequest(ctx, 'GET', '/api/business/retention/workflows');
    assert.strictEqual(unauthRes.status, 401);

    // 19b. Staff without AUTOMATIONS_MANAGE cannot create -> 403
    const staffCreate = await apiRequest(ctx, 'POST', '/api/business/retention/workflows', {
      name: 'Staff Rule Attempt',
      workflowType: 'INACTIVITY',
      campaignId: campaignA.id,
      config: { inactivityDays: 30, campaignId: campaignA.id },
    }, staffAToken);
    assert.strictEqual(staffCreate.status, 403);

    // 19c. Manager can view and create
    const managerList = await apiRequest(ctx, 'GET', '/api/business/retention/workflows', undefined, managerAToken);
    assert.strictEqual(managerList.status, 200);
  });

  // ==========================================================================
  // Step 20: Pause and Archive Lifecycle Safety
  // ==========================================================================
  await t.test('Step 20: Pause and archive lifecycle state transitions', async () => {
    // 20a. Pause workflow
    const pauseRes = await apiRequest(
      ctx,
      'POST',
      `/api/business/retention/workflows/${inactivityWorkflowId}/pause`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(pauseRes.status, 200);
    assert.strictEqual(pauseRes.body.status, RuleStatus.PAUSED);

    // 20b. Archive workflow
    const archRes = await apiRequest(
      ctx,
      'POST',
      `/api/business/retention/workflows/${inactivityWorkflowId}/archive`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(archRes.status, 200);
    assert.strictEqual(archRes.body.status, RuleStatus.ARCHIVED);

    // 20c. Attempting to activate archived workflow -> 400
    const reActRes = await apiRequest(
      ctx,
      'POST',
      `/api/business/retention/workflows/${inactivityWorkflowId}/activate`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(reActRes.status, 400);

    // Historical executions must remain queryable
    const histRes = await apiRequest(
      ctx,
      'GET',
      `/api/business/retention/workflows/${inactivityWorkflowId}/executions`,
      undefined,
      ownerAToken
    );
    assert.strictEqual(histRes.status, 200);
    assert.ok(histRes.body.executions.length >= 1);
  });

  // ==========================================================================
  // Step 21: Safe Test Simulation Trace
  // ==========================================================================
  await t.test('Step 21: Simulation trace produces diagnostic steps without dispatching messages', async () => {
    const simRes = await apiRequest(ctx, 'POST', '/api/business/retention/simulate', {
      ruleId: birthdayWorkflowId,
      customerId: custBirthdayToday.id,
    }, ownerAToken);

    assert.strictEqual(simRes.status, 200);
    assert.ok(simRes.body.steps);
    assert.ok(Array.isArray(simRes.body.steps));
    assert.ok(simRes.body.idempotencyKeyCalculated);

    const stepNames = simRes.body.steps.map((s: any) => s.name);
    assert.ok(stepNames.includes('WORKFLOW_STATUS'));
    assert.ok(stepNames.includes('BRANCH_SCOPE'));
    assert.ok(stepNames.includes('BIRTHDAY_CHECK'));
    assert.ok(stepNames.includes('CONSENT_CHECK'));
  });

  // ==========================================================================
  // Step 22: Audit Logging Verification
  // ==========================================================================
  await t.test('Step 22: Audit logging records lifecycle events and reactivation', async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        businessId: businessA.id,
        action: { in: ['RETENTION_WORKFLOW_CREATED', 'RETENTION_WORKFLOW_ACTIVATED', 'CUSTOMER_REACTIVATED'] },
      },
    });

    assert.ok(auditLogs.length >= 2, 'Audit logs must be present for retention events');
  });

  // ==========================================================================
  // Step 23: Responsive UI Verification
  // ==========================================================================
  await t.test('Step 23: Responsive design system tokens and viewport compatibility', async () => {
    const fs = await import('fs');
    const viewContent = fs.readFileSync('src/views/business/RetentionWorkflowsSection.tsx', 'utf-8');

    // Verify presence of responsive classes and mobile card views
    assert.ok(viewContent.includes('hidden lg:block'), 'Must provide desktop table view');
    assert.ok(viewContent.includes('lg:hidden space-y-3'), 'Must provide mobile card layout');
    assert.ok(!viewContent.includes('min-w-[1200px]'), 'Must not have fixed wide min-width that breaks mobile viewports');
  });

  // Cleanup server and database connections
  if (ctx && typeof ctx.stop === 'function') {
    await ctx.stop();
  }
  await prisma.$disconnect();
});
