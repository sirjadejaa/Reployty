/**
 * REPLOYTY PHASE 21 — ADVANCED & DYNAMIC SEGMENTATION BUILDER
 * COMPREHENSIVE TEST SUITE
 * 
 * Tests:
 * 1. Segment CRUD & Controlled Status Transitions (DRAFT, ACTIVE, ARCHIVED)
 * 2. Strict Whitelist & Validation Security (Fields, Operators, Values, Nesting limit)
 * 3. Dynamic Rule Evaluation (AND/OR logic, Nested Groups, Behavioral & Loyalty metrics)
 * 4. Tag, Consent, Review, and Inactivity Conditions
 * 5. Server-side Preview, Count, and Paginated Members
 * 6. Multi-Tenant Isolation & Discovery Prevention (404 for cross-tenant access)
 * 7. Branch Isolation & Scoping
 * 8. RBAC Enforcement (Owner & Manager allowed, Staff forbidden 403, Unauth 401)
 * 9. Campaign Integration (Campaign targeting Dynamic Segment with consent gating)
 * 10. Deletion Safeguard (Prevents deleting segment in-use by campaigns)
 * 11. Audit Logging for all segment mutations
 */

import test from 'node:test';
import assert from 'node:assert';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
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

const RUN_ID = `p21_${Date.now().toString(36)}`;

test('PHASE 21: ADVANCED & DYNAMIC SEGMENTATION BUILDER TEST SUITE', { concurrency: 1 }, async (t) => {
  let ctx: TestServerContext;

  // Tenants
  let businessA: any;
  let branchA1: any;
  let branchA2: any;
  let ownerAToken: string;
  let managerAToken: string;
  let staffAToken: string;

  let businessB: any;
  let branchB1: any;
  let ownerBToken: string;

  // Customers & Tags
  let tagVipA: any;
  let tagRegularA: any;
  let customerA1: any; // VIP, frequent, consented
  let customerA2: any; // Regular, low visits, no consent
  let customerA3: any; // Inactive, high visits, 2-star review
  let customerB1: any; // Business B customer

  // Created segment IDs
  let draftSegmentId: string;
  let dynamicSegmentId: string;
  let branchSegmentId: string;
  let campaignLinkedSegmentId: string;

  // Setup server and test fixtures
  await t.test('Step 0: Initialize test server & tenant fixtures', async () => {
    ctx = await startTestServer();

    // Roles and plans lookup
    const ownerRole = await prisma.role.findFirstOrThrow({ where: { name: 'OWNER' } });
    const managerRole = await prisma.role.findFirstOrThrow({ where: { name: 'MANAGER' } });
    const staffRole = await prisma.role.findFirstOrThrow({ where: { name: 'STAFF' } });
    const growthPlan = await prisma.plan.findFirstOrThrow({ where: { slug: 'growth' } });

    // 1. Create Business A
    businessA = await prisma.business.create({
      data: {
        name: `Phase 21 Roastery ${RUN_ID}`,
        category: BusinessCategory.CAFE,
        slug: `p21-roastery-${RUN_ID}`,
        status: 'ACTIVE',
        subscription: {
          create: {
            planId: growthPlan.id,
            status: 'ACTIVE',
            billingInterval: 'MONTHLY',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
          },
        },
        branches: {
          create: [
            { name: 'Bandra Flagship', code: `BF_${RUN_ID}`, isMainBranch: true, status: 'ACTIVE' },
            { name: 'Colaba Roastery', code: `CR_${RUN_ID}`, isMainBranch: false, status: 'ACTIVE' },
          ],
        },
      },
      include: { branches: true },
    });
    branchA1 = businessA.branches[0];
    branchA2 = businessA.branches[1];

    // 2. Create Business B (Isolation Tenant)
    businessB = await prisma.business.create({
      data: {
        name: `Phase 21 Island Bistro ${RUN_ID}`,
        category: BusinessCategory.RESTAURANT,
        slug: `p21-bistro-${RUN_ID}`,
        status: 'ACTIVE',
        subscription: {
          create: {
            planId: growthPlan.id,
            status: 'ACTIVE',
            billingInterval: 'MONTHLY',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
          },
        },
        branches: {
          create: [{ name: 'Harbor Outlet', code: `HO_${RUN_ID}`, isMainBranch: true, status: 'ACTIVE' }],
        },
      },
      include: { branches: true },
    });
    branchB1 = businessB.branches[0];

    // 3. Create Users & Staff memberships
    const pwdHash = await hashPassword('Password123!');

    // Business A Owner
    const ownerA = await prisma.user.create({
      data: {
        email: `p21_owner_a_${RUN_ID}@example.com`,
        name: 'Segment Owner A',
        passwordHash: pwdHash,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.staffMembership.create({
      data: {
        userId: ownerA.id,
        businessId: businessA.id,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });

    // Business A Manager
    const managerA = await prisma.user.create({
      data: {
        email: `p21_manager_a_${RUN_ID}@example.com`,
        name: 'Segment Manager A',
        passwordHash: pwdHash,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.staffMembership.create({
      data: {
        userId: managerA.id,
        businessId: businessA.id,
        roleId: managerRole.id,
        status: 'ACTIVE',
      },
    });

    // Business A Staff
    const staffA = await prisma.user.create({
      data: {
        email: `p21_staff_a_${RUN_ID}@example.com`,
        name: 'Segment Staff A',
        passwordHash: pwdHash,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.staffMembership.create({
      data: {
        userId: staffA.id,
        businessId: businessA.id,
        branchId: branchA1.id,
        roleId: staffRole.id,
        status: 'ACTIVE',
      },
    });

    // Business B Owner
    const ownerB = await prisma.user.create({
      data: {
        email: `p21_owner_b_${RUN_ID}@example.com`,
        name: 'Segment Owner B',
        passwordHash: pwdHash,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.staffMembership.create({
      data: {
        userId: ownerB.id,
        businessId: businessB.id,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });

    // 4. Authenticate and get tokens
    const loginA = await apiRequest(ctx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: ownerA.email, password: 'Password123!' },
    });
    ownerAToken = loginA.body.sessionToken || loginA.body.token;

    const loginMgrA = await apiRequest(ctx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: managerA.email, password: 'Password123!' },
    });
    managerAToken = loginMgrA.body.sessionToken || loginMgrA.body.token;

    const loginStaffA = await apiRequest(ctx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: staffA.email, password: 'Password123!' },
    });
    staffAToken = loginStaffA.body.sessionToken || loginStaffA.body.token;

    const loginB = await apiRequest(ctx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: ownerB.email, password: 'Password123!' },
    });
    ownerBToken = loginB.body.sessionToken || loginB.body.token;

    // 5. Create Tags
    tagVipA = await prisma.customerTag.create({
      data: { businessId: businessA.id, name: 'VIP Gold', color: '#D97706' },
    });
    tagRegularA = await prisma.customerTag.create({
      data: { businessId: businessA.id, name: 'Regular', color: '#2563EB' },
    });

    // 5b. Create Loyalty Program & Reward in Business A
    const loyaltyProgramA = await prisma.loyaltyProgram.create({
      data: {
        businessId: businessA.id,
        name: 'Coffee Stamp Card',
        type: 'STAMP',
        targetStamps: 10,
        rewardTitle: 'Free Coffee',
        status: 'ACTIVE',
      },
    });

    const rewardA = await prisma.reward.create({
      data: {
        businessId: businessA.id,
        programId: loyaltyProgramA.id,
        title: 'Free Artisan Coffee',
        stampsRequired: 10,
        status: 'ACTIVE',
      },
    });

    // 6. Create realistic customers in Business A
    // Customer A1: Highly active, VIP, WhatsApp consented, Completed loyalty card, Reward redemptions
    customerA1 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Aarav Sen',
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `aarav_${RUN_ID}@example.com`,
        totalVisits: 8,
        totalSpendMinor: 250000, // ₹2,500
        stampsBalance: 8,
        pointsBalance: 120,
        lastVisitAt: new Date(Date.now() - 2 * 86400000), // 2 days ago
        marketingConsent: true,
        tags: { create: [{ tagId: tagVipA.id }] },
        consents: {
          create: [{ channel: ConsentChannel.WHATSAPP, granted: true, source: 'PWA' }],
        },
        loyaltyCards: {
          create: [
            {
              businessId: businessA.id,
              program: { connect: { id: loyaltyProgramA.id } },
              status: 'COMPLETED',
              stampsCollected: 10,
              totalStampsNeeded: 10,
              completedAt: new Date(),
            },
          ],
        },
        rewardRedemptions: {
          create: [
            {
              businessId: businessA.id,
              rewardId: rewardA.id,
              branchId: branchA1.id,
              status: 'REDEEMED',
              redemptionCode: `RED_${RUN_ID}_1`,
              redeemedAt: new Date(),
            },
          ],
        },
      },
    });

    // Customer A2: Low visits, Regular, no consent, branch A2
    customerA2 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA2.id,
        name: 'Meera Nair',
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `meera_${RUN_ID}@example.com`,
        totalVisits: 2,
        totalSpendMinor: 40000, // ₹400
        stampsBalance: 2,
        pointsBalance: 20,
        lastVisitAt: new Date(Date.now() - 5 * 86400000), // 5 days ago
        marketingConsent: false,
        tags: { create: [{ tagId: tagRegularA.id }] },
      },
    });

    // Customer A3: Inactive for 45 days, 12 visits, 2-star review
    customerA3 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        branchId: branchA1.id,
        name: 'Rohan Sharma',
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `rohan_${RUN_ID}@example.com`,
        totalVisits: 12,
        totalSpendMinor: 450000, // ₹4,500
        stampsBalance: 4,
        pointsBalance: 200,
        lastVisitAt: new Date(Date.now() - 45 * 86400000), // 45 days ago (inactive)
        marketingConsent: false,
        consents: {
          create: [{ channel: ConsentChannel.SMS, granted: true, source: 'COUNTER' }],
        },
        reviewFeedbacks: {
          create: [{ businessId: businessA.id, rating: 2, feedbackText: 'Service was slow' }],
        },
      },
    });

    // Customer B1: In Business B
    customerB1 = await prisma.customer.create({
      data: {
        businessId: businessB.id,
        branchId: branchB1.id,
        name: 'Island Guest',
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `island_${RUN_ID}@example.com`,
        totalVisits: 10,
        totalSpendMinor: 300000,
      },
    });

    assert.ok(ownerAToken, 'Owner A token obtained');
    assert.ok(ownerBToken, 'Owner B token obtained');
  });

  // 1. Strict Whitelist & Validation Security
  await t.test('Step 1: Strict field, operator, value and nesting validation', async () => {
    // 1. Rejects non-whitelisted field
    const badFieldRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Bad Field Segment',
        ruleDefinition: {
          logic: 'AND',
          conditions: [{ field: 'passwordHash', operator: 'EQUALS', value: 'secret' }],
        },
      },
    });
    assert.strictEqual(badFieldRes.status, 400, 'Rejects non-whitelisted field');
    assert.ok(badFieldRes.body.error.includes('Field is not whitelisted'));

    // 2. Rejects non-whitelisted operator
    const badOpRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Bad Op Segment',
        ruleDefinition: {
          logic: 'AND',
          conditions: [{ field: 'totalVisits', operator: 'DROP_TABLE', value: 5 }],
        },
      },
    });
    assert.strictEqual(badOpRes.status, 400, 'Rejects non-whitelisted operator');
    assert.ok(badOpRes.body.error.includes('Operator is not whitelisted'));

    // 3. Rejects mismatched field-to-operator pairing
    const mismatchRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Mismatch Segment',
        ruleDefinition: {
          logic: 'AND',
          conditions: [{ field: 'visit_count', operator: 'CONTAINS', value: 'high' }],
        },
      },
    });
    assert.strictEqual(mismatchRes.status, 400, 'Rejects text operator on numeric field');

    // 4. Rejects negative numbers for visits
    const negVisitRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Negative Visits',
        ruleDefinition: {
          logic: 'AND',
          conditions: [{ field: 'visit_count', operator: 'GREATER_THAN', value: -5 }],
        },
      },
    });
    assert.strictEqual(negVisitRes.status, 400, 'Rejects negative visit count');

    // 5. Rejects empty rule definition
    const emptyRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Empty Segment',
        ruleDefinition: { logic: 'AND', conditions: [] },
      },
    });
    assert.strictEqual(emptyRes.status, 400, 'Rejects empty rule definition');

    // 6. Rejects nesting depth > 3 levels
    const deepNestRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Too Deep Segment',
        ruleDefinition: {
          logic: 'AND',
          groups: [
            {
              logic: 'OR',
              groups: [
                {
                  logic: 'AND',
                  groups: [
                    {
                      logic: 'OR',
                      conditions: [{ field: 'visit_count', operator: 'GREATER_THAN', value: 3 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    assert.strictEqual(deepNestRes.status, 400, 'Rejects nesting depth > 3 levels');
    assert.ok(deepNestRes.body.error.includes('Nesting depth exceeds maximum allowed limit'));
  });

  // 2. Segment CRUD & Status Transitions
  await t.test('Step 2: Segment CRUD & Lifecycle (Draft -> Active -> Archived)', async () => {
    // 1. Create in DRAFT status
    const createDraft = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Draft Inactive Win-Back',
        description: 'Target customers inactive > 30 days',
        status: 'DRAFT',
        ruleDefinition: {
          logic: 'AND',
          conditions: [
            { field: 'days_since_last_visit', operator: 'GREATER_THAN_OR_EQUAL', value: 30 },
          ],
        },
      },
    });
    assert.strictEqual(createDraft.status, 201, 'Draft segment created');
    assert.strictEqual(createDraft.body.status, 'DRAFT');
    assert.strictEqual(createDraft.body.type, 'DYNAMIC');
    draftSegmentId = createDraft.body.id;

    // 2. Read segment by ID
    const getRes = await apiRequest(ctx.baseUrl, `/api/business/segments/${draftSegmentId}`, {
      token: ownerAToken,
    });
    assert.strictEqual(getRes.status, 200, 'Segment retrieved');
    assert.strictEqual(getRes.body.id, draftSegmentId);
    assert.strictEqual(getRes.body.customerCount, 1, 'Correctly matched 1 inactive customer (Rohan)');

    // 3. Update segment & Activate
    const updateRes = await apiRequest(ctx.baseUrl, `/api/business/segments/${draftSegmentId}`, {
      method: 'PATCH',
      token: ownerAToken,
      body: {
        name: 'Active Inactive Win-Back',
        status: 'ACTIVE',
      },
    });
    assert.strictEqual(updateRes.status, 200, 'Segment updated');
    assert.strictEqual(updateRes.body.name, 'Active Inactive Win-Back');
    assert.strictEqual(updateRes.body.status, 'ACTIVE');

    // 4. Archive segment
    const archiveRes = await apiRequest(ctx.baseUrl, `/api/business/segments/${draftSegmentId}/archive`, {
      method: 'POST',
      token: ownerAToken,
    });
    assert.strictEqual(archiveRes.status, 200, 'Segment archived');
    assert.strictEqual(archiveRes.body.status, 'ARCHIVED');

    // 5. Delete archived unreferenced segment
    const delRes = await apiRequest(ctx.baseUrl, `/api/business/segments/${draftSegmentId}`, {
      method: 'DELETE',
      token: ownerAToken,
    });
    assert.strictEqual(delRes.status, 200, 'Unreferenced segment deleted');
  });

  // 3. Dynamic Rule Evaluation & Complex Querying
  await t.test('Step 3: Dynamic Evaluation (AND, OR, Nested Groups, Behavioral & Loyalty)', async () => {
    // 1. VIP Frequent Diners: visit_count >= 5 AND current_stamp_balance >= 5
    const vipFrequentRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'VIP Frequent Coffee Lovers',
        status: 'ACTIVE',
        ruleDefinition: {
          logic: 'AND',
          conditions: [
            { field: 'visit_count', operator: 'GREATER_THAN_OR_EQUAL', value: 5 },
            { field: 'current_stamp_balance', operator: 'GREATER_THAN_OR_EQUAL', value: 5 },
          ],
        },
      },
    });
    assert.strictEqual(vipFrequentRes.status, 201);
    assert.strictEqual(vipFrequentRes.body.customerCount, 1, 'Only Aarav matches (visits >= 5 AND stamps >= 5)');
    dynamicSegmentId = vipFrequentRes.body.id;

    // 2. OR Logic: visit_count >= 10 OR points_balance >= 150
    const orRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'High Spenders or Inactive VIPs',
        status: 'ACTIVE',
        ruleDefinition: {
          logic: 'OR',
          conditions: [
            { field: 'visit_count', operator: 'GREATER_THAN_OR_EQUAL', value: 10 },
            { field: 'points_balance', operator: 'GREATER_THAN_OR_EQUAL', value: 150 },
          ],
        },
      },
    });
    assert.strictEqual(orRes.status, 201);
    assert.strictEqual(orRes.body.customerCount, 1, 'Only Rohan matches OR condition');

    // 3. Nested Group: (visit_count >= 5 OR reward_redemption_count >= 1) AND whatsapp_consent = true
    const nestedRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Engaged WhatsApp Members',
        status: 'ACTIVE',
        ruleDefinition: {
          logic: 'AND',
          groups: [
            {
              logic: 'OR',
              conditions: [
                { field: 'visit_count', operator: 'GREATER_THAN_OR_EQUAL', value: 5 },
                { field: 'reward_redemption_count', operator: 'GREATER_THAN_OR_EQUAL', value: 1 },
              ],
            },
            {
              logic: 'AND',
              conditions: [
                { field: 'whatsapp_consent', operator: 'IS_TRUE' },
              ],
            },
          ],
        },
      },
    });
    assert.strictEqual(nestedRes.status, 201);
    assert.strictEqual(nestedRes.body.customerCount, 1, 'Aarav matches nested group with WhatsApp consent');

    // 4. Tag condition: has_tag = tagVipA.id
    const tagRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'VIP Tagged Members',
        status: 'ACTIVE',
        ruleDefinition: {
          logic: 'AND',
          conditions: [
            { field: 'has_tag', operator: 'EQUALS', value: tagVipA.id },
          ],
        },
      },
    });
    assert.strictEqual(tagRes.status, 201);
    assert.strictEqual(tagRes.body.customerCount, 1, 'Matches only VIP tagged customer');

    // 5. Review rating condition: average_rating <= 3 (At-risk customers)
    const reviewRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'At Risk - Low Rating Feedback',
        status: 'ACTIVE',
        ruleDefinition: {
          logic: 'AND',
          conditions: [
            { field: 'average_rating', operator: 'LESS_THAN_OR_EQUAL', value: 3 },
          ],
        },
      },
    });
    assert.strictEqual(reviewRes.status, 201);
    assert.strictEqual(reviewRes.body.customerCount, 1, 'Matches Rohan who gave 2-star rating');
  });

  // 4. Preview, Count & Paginated Members API
  await t.test('Step 4: Live Preview, Count, and Paginated Members API', async () => {
    // 1. Live Preview without saving
    const previewRes = await apiRequest(ctx.baseUrl, '/api/business/segments/preview', {
      method: 'POST',
      token: ownerAToken,
      body: {
        ruleDefinition: {
          logic: 'AND',
          conditions: [
            { field: 'visit_count', operator: 'GREATER_THAN_OR_EQUAL', value: 1 },
          ],
        },
      },
    });
    assert.strictEqual(previewRes.status, 200, 'Preview succeeded');
    assert.strictEqual(previewRes.body.matchingCount, 3, 'Matches all 3 active Business A customers');
    assert.ok(Array.isArray(previewRes.body.sampleCustomers), 'Returns sample customers');
    assert.strictEqual(previewRes.body.sampleCustomers.length, 3);
    assert.ok(!previewRes.body.sampleCustomers[0].passwordHash, 'PII/Secrets never leaked in preview');

    // 2. Live Count for saved segment
    const countRes = await apiRequest(ctx.baseUrl, `/api/business/segments/${dynamicSegmentId}/count`, {
      token: ownerAToken,
    });
    assert.strictEqual(countRes.status, 200, 'Count retrieved');
    assert.strictEqual(countRes.body.count, 1);

    // 3. Paginated Members
    const membersRes = await apiRequest(ctx.baseUrl, `/api/business/segments/${dynamicSegmentId}/members?page=1&limit=10`, {
      token: ownerAToken,
    });
    assert.strictEqual(membersRes.status, 200, 'Members list retrieved');
    assert.strictEqual(membersRes.body.pagination.total, 1);
    assert.strictEqual(membersRes.body.customers[0].name, 'Aarav Sen');
    assert.ok(Array.isArray(membersRes.body.data), 'Backward-compatible data array present');
  });

  // 5. Branch Isolation & Branch-Scoped Segments
  await t.test('Step 5: Branch Scoping & Branch Isolation', async () => {
    // Create segment scoped to Branch A1
    const branchRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Bandra Flagship Only Segment',
        branchId: branchA1.id,
        status: 'ACTIVE',
        ruleDefinition: {
          logic: 'AND',
          conditions: [{ field: 'visit_count', operator: 'GREATER_THAN_OR_EQUAL', value: 1 }],
        },
      },
    });
    assert.strictEqual(branchRes.status, 201);
    assert.strictEqual(branchRes.body.branchId, branchA1.id);
    assert.strictEqual(branchRes.body.customerCount, 2, 'Matches 2 customers in Branch A1 (excludes Branch A2)');
    branchSegmentId = branchRes.body.id;

    // Staff at Branch A1 cannot create or assign segment to foreign branch (Branch B or invalid)
    const foreignBranchRes = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Foreign Branch Segment',
        branchId: branchB1.id,
        ruleDefinition: { logic: 'AND', conditions: [{ field: 'visit_count', operator: 'GREATER_THAN', value: 1 }] },
      },
    });
    assert.strictEqual(foreignBranchRes.status, 400, 'Foreign branch ID rejected');
  });

  // 6. Multi-Tenant Isolation (Discovery Prevention)
  await t.test('Step 6: Multi-Tenant Isolation & Discovery Prevention (404)', async () => {
    // 1. Business B cannot get Business A segment -> 404
    const crossGet = await apiRequest(ctx.baseUrl, `/api/business/segments/${dynamicSegmentId}`, {
      token: ownerBToken,
    });
    assert.strictEqual(crossGet.status, 404, 'Cross-tenant segment access blocked with 404');

    // 2. Business B cannot update Business A segment -> 404
    const crossUpdate = await apiRequest(ctx.baseUrl, `/api/business/segments/${dynamicSegmentId}`, {
      method: 'PATCH',
      token: ownerBToken,
      body: { name: 'Hacked Segment' },
    });
    assert.strictEqual(crossUpdate.status, 404, 'Cross-tenant segment update blocked with 404');

    // 3. Business B cannot delete Business A segment -> 404
    const crossDelete = await apiRequest(ctx.baseUrl, `/api/business/segments/${dynamicSegmentId}`, {
      method: 'DELETE',
      token: ownerBToken,
    });
    assert.strictEqual(crossDelete.status, 404, 'Cross-tenant segment delete blocked with 404');

    // 4. Business B list segments never includes Business A segments
    const bList = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      token: ownerBToken,
    });
    assert.strictEqual(bList.status, 200);
    const hasASegment = bList.body.some((s: any) => s.id === dynamicSegmentId);
    assert.strictEqual(hasASegment, false, 'Tenant B list contains zero Tenant A segments');

    // 5. Business B preview never evaluates Business A customers
    const bPreview = await apiRequest(ctx.baseUrl, '/api/business/segments/preview', {
      method: 'POST',
      token: ownerBToken,
      body: {
        ruleDefinition: { logic: 'AND', conditions: [{ field: 'visit_count', operator: 'GREATER_THAN_OR_EQUAL', value: 1 }] },
      },
    });
    assert.strictEqual(bPreview.status, 200);
    assert.strictEqual(bPreview.body.matchingCount, 1, 'Matches only 1 customer in Business B');
    assert.strictEqual(bPreview.body.sampleCustomers[0].name, 'Island Guest');
  });

  // 7. RBAC Enforcement
  await t.test('Step 7: RBAC Enforcement (Owner & Manager allowed, Staff forbidden 403, Unauth 401)', async () => {
    // 1. Manager can create & view segments
    const mgrCreate = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: managerAToken,
      body: {
        name: 'Manager Created Segment',
        status: 'ACTIVE',
        ruleDefinition: { logic: 'AND', conditions: [{ field: 'totalVisits', operator: 'GREATER_THAN', value: 2 }] },
      },
    });
    assert.strictEqual(mgrCreate.status, 201, 'Manager successfully created segment');

    // 2. Staff cannot create segments -> 403
    const staffCreate = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: staffAToken,
      body: {
        name: 'Staff Illicit Segment',
        ruleDefinition: { logic: 'AND', conditions: [{ field: 'totalVisits', operator: 'GREATER_THAN', value: 1 }] },
      },
    });
    assert.strictEqual(staffCreate.status, 403, 'Staff forbidden from creating segment (403)');
    assert.strictEqual(staffCreate.body.code, 'FORBIDDEN_PERMISSION');

    // 3. Staff cannot delete segments -> 403
    const staffDelete = await apiRequest(ctx.baseUrl, `/api/business/segments/${mgrCreate.body.id}`, {
      method: 'DELETE',
      token: staffAToken,
    });
    assert.strictEqual(staffDelete.status, 403, 'Staff forbidden from deleting segment (403)');

    // 4. Unauthenticated request -> 401
    const unauthRes = await apiRequest(ctx.baseUrl, '/api/business/segments');
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request rejected with 401');
  });

  // 8. Integration with Phase 20 Campaign Engine & Deletion Safeguard
  await t.test('Step 8: Phase 20 Campaign Integration & Deletion Safeguard', async () => {
    // 1. Create a segment to link to a campaign
    const linkedSeg = await apiRequest(ctx.baseUrl, '/api/business/segments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Campaign Target Segment',
        status: 'ACTIVE',
        ruleDefinition: {
          logic: 'AND',
          conditions: [{ field: 'visit_count', operator: 'GREATER_THAN_OR_EQUAL', value: 1 }],
        },
      },
    });
    assert.strictEqual(linkedSeg.status, 201);
    campaignLinkedSegmentId = linkedSeg.body.id;

    // 2. Create Phase 20 Campaign targeting this segment
    const campaignRes = await apiRequest(ctx.baseUrl, '/api/business/campaigns', {
      method: 'POST',
      token: ownerAToken,
      body: {
        name: 'Segment Win-Back Campaign',
        type: 'ONE_TIME',
        status: 'ACTIVE',
        channel: 'WHATSAPP',
        audienceType: AudienceType.SAVED_SEGMENT,
        segmentId: campaignLinkedSegmentId,
        messageTemplate: 'Hi {{name}}, we have a special gift for you!',
      },
    });
    assert.strictEqual(campaignRes.status, 201, 'Campaign linked to segment created');
    const campaignId = campaignRes.body.id;

    // 3. Execute campaign simulation
    // The segment matches all 3 customers, BUT only Aarav has WhatsApp consent!
    const execRes = await apiRequest(ctx.baseUrl, `/api/business/campaigns/${campaignId}/simulate-run`, {
      method: 'POST',
      token: ownerAToken,
    });
    assert.strictEqual(execRes.status, 200, 'Campaign simulated run succeeded');
    assert.strictEqual(execRes.body.totalAudience, 3, 'Evaluated all 3 segment customers dynamically');
    assert.strictEqual(execRes.body.eligibleCount, 1, 'Only Aarav eligible due to WhatsApp consent');
    assert.strictEqual(execRes.body.suppressedConsentCount, 2, '2 non-consenting customers suppressed');

    // 4. Attempt to delete segment that is in-use by a campaign -> Rejected with 409
    const delBlockedRes = await apiRequest(ctx.baseUrl, `/api/business/segments/${campaignLinkedSegmentId}`, {
      method: 'DELETE',
      token: ownerAToken,
    });
    assert.strictEqual(delBlockedRes.status, 409, 'Deletion blocked for segment in-use by campaign');
    assert.strictEqual(delBlockedRes.body.code, 'SEGMENT_IN_USE');
  });

  // 9. Audit Logging Verification
  await t.test('Step 9: Audit Logging Records All Configuration Mutations', async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        businessId: businessA.id,
        entityType: 'CustomerSegment',
      },
      orderBy: { createdAt: 'desc' },
    });

    assert.ok(auditLogs.length >= 4, 'Audit logs recorded for segment actions');
    const actions = auditLogs.map(l => l.action);
    assert.ok(actions.includes('SEGMENT_CREATED'), 'Audit log contains SEGMENT_CREATED');
    assert.ok(actions.includes('SEGMENT_UPDATED') || actions.includes('SEGMENT_ACTIVATED'), 'Audit log contains status update');
    assert.ok(actions.includes('SEGMENT_ARCHIVED'), 'Audit log contains SEGMENT_ARCHIVED');
    assert.ok(actions.includes('SEGMENT_DELETED'), 'Audit log contains SEGMENT_DELETED');

    for (const log of auditLogs) {
      const stateStr = JSON.stringify(log.newState || {});
      assert.ok(!stateStr.includes('passwordHash'), 'Zero password leakage in audit');
      assert.ok(!stateStr.includes('secret'), 'Zero secret leakage in audit');
    }
  });

  // Teardown
  t.after(async () => {
    if (ctx && typeof ctx.stop === 'function') {
      await ctx.stop();
    }
  });
});
