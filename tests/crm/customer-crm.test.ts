import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import {
  getBusinessCustomers,
  getCustomer360,
  updateCustomerProfile,
  getCustomerTimeline,
  getCustomerNotes,
  createCustomerNote,
  updateCustomerNote,
  deleteCustomerNote,
  getBusinessTags,
  createBusinessTag,
  updateBusinessTag,
  deleteBusinessTag,
  assignCustomerTag,
  removeCustomerTag,
  getBusinessSegments,
  createBusinessSegment,
  updateBusinessSegment,
  deleteBusinessSegment,
  getSegmentCustomers,
  validateSegmentRuleDefinition,
} from '../../src/server/services/crmService';
import { createCustomer } from '../../src/server/services/customerService';

const BASE_URL = 'http://localhost:3000';

let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
    testPassed++;
  } else {
    console.error(`  ✗ FAIL: ${name} ${detail ? `(${detail})` : ''}`);
    testFailed++;
  }
}

async function request(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; headers: Headers; data: any; cookie?: string }> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  let data: any = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  const setCookie = res.headers.get('set-cookie') || undefined;
  return { status: res.status, headers: res.headers, data, cookie: setCookie };
}

async function runCRMTestSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 9: PRODUCTION CUSTOMER CRM & SEGMENTATION TEST SUITE');
  console.log('==================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // Setup Context: Retrieve seeded businesses and staff
    // -------------------------------------------------------------------------
    const cafe = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
      include: { branches: true, loyaltyPrograms: true },
    });
    if (!cafe) throw new Error('Seeded cafe not found');

    const salon = await prisma.business.findUnique({
      where: { slug: 'luxe-glow-beauty' },
      include: { branches: true },
    });
    if (!salon) throw new Error('Seeded salon not found');

    const cafeBranch = cafe.branches[0];
    const salonBranch = salon.branches[0];

    const cafeOwner = await prisma.user.findUnique({
      where: { email: 'marcus@reployty.com' },
    });
    if (!cafeOwner) throw new Error('Seeded cafe owner not found');

    const cafeOwnerCtx = await getTenantContext(cafeOwner.id, cafe.id);
    const salonOwnerCtx = await getTenantContext(cafeOwner.id, salon.id);

    // Clean up test customers for clean run
    const testPhoneA = '+15550001111';
    const testPhoneB = '+15550002222';
    const testPhoneC = '+15550003333';
    const salonPhone = '+15559998888';

    await prisma.customer.deleteMany({
      where: {
        businessId: cafe.id,
        phone: { in: [testPhoneA, testPhoneB, testPhoneC] },
      },
    });

    await prisma.customer.deleteMany({
      where: {
        businessId: salon.id,
        phone: salonPhone,
      },
    });

    // Create 3 test customers in Cafe
    const custA = await createCustomer(cafeOwnerCtx, {
      name: 'Alice Wonder',
      phone: testPhoneA,
      email: 'alice@example.com',
      branchId: cafeBranch.id,
      marketingConsent: true,
    });

    const custB = await createCustomer(cafeOwnerCtx, {
      name: 'Bob Builder',
      phone: testPhoneB,
      email: 'bob@example.com',
      branchId: cafeBranch.id,
      marketingConsent: false,
    });

    const custC = await createCustomer(cafeOwnerCtx, {
      name: 'Charlie Chaplin',
      phone: testPhoneC,
      email: 'charlie@example.com',
      branchId: cafeBranch.id,
      marketingConsent: true,
    });

    // Create customer in Salon for cross-tenant IDOR tests
    const salonCust = await createCustomer(salonOwnerCtx, {
      name: 'Diana Prince',
      phone: salonPhone,
      email: 'diana@example.com',
      branchId: salonBranch.id,
      marketingConsent: true,
    });

    // Seed balances & visits for segmentation and sorting tests
    await prisma.customer.update({
      where: { id: custA.id },
      data: {
        totalVisits: 15,
        totalSpendMinor: 15000, // ₹150.00
        stampsBalance: 8,
        pointsBalance: 120,
        lastVisitAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      },
    });

    await prisma.customer.update({
      where: { id: custB.id },
      data: {
        totalVisits: 3,
        totalSpendMinor: 2500, // ₹25.00
        stampsBalance: 2,
        pointsBalance: 20,
        lastVisitAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
      },
    });

    await prisma.customer.update({
      where: { id: custC.id },
      data: {
        totalVisits: 28,
        totalSpendMinor: 35000, // ₹350.00
        stampsBalance: 14,
        pointsBalance: 450,
        lastVisitAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      },
    });

    // =========================================================================
    // SECTION 1: Customer Directory & Search / Filter / Sort / Pagination
    // =========================================================================
    console.log('[1] Customer Directory Search, Filtering, Sorting & Pagination:');

    // 1. Full directory listing
    const listAll = await getBusinessCustomers(cafeOwnerCtx);
    assert(Array.isArray(listAll.data), 'Returns data array for directory');
    assert(listAll.pagination.total >= 3, 'Reports total count >= 3');
    assert(listAll.pagination.page === 1, 'Default page is 1');
    assert(listAll.pagination.limit === 25, 'Default limit is 25');

    // 2. Search by name (case-insensitive substring)
    const searchByName = await getBusinessCustomers(cafeOwnerCtx, { search: 'alice' });
    assert(searchByName.data.length === 1, 'Search finds exactly 1 customer for "alice"');
    assert(searchByName.data[0].name === 'Alice Wonder', 'Matched correct customer name');

    // 3. Search by phone
    const searchByPhone = await getBusinessCustomers(cafeOwnerCtx, { search: '0002222' });
    assert(searchByPhone.data.length === 1, 'Search by phone matches Bob Builder');
    assert(searchByPhone.data[0].phone === testPhoneB, 'Matched correct phone number');

    // 4. Search by email
    const searchByEmail = await getBusinessCustomers(cafeOwnerCtx, { search: 'charlie@example' });
    assert(searchByEmail.data.length === 1, 'Search by email matches Charlie Chaplin');

    // 5. Filter by branch
    const filterBranch = await getBusinessCustomers(cafeOwnerCtx, { branchId: cafeBranch.id });
    assert(filterBranch.data.length >= 3, 'Filter by valid branch returns branch customers');

    // 6. Sorting: by totalSpendMinor desc
    const sortSpendDesc = await getBusinessCustomers(cafeOwnerCtx, {
      sortBy: 'totalSpendMinor',
      sortOrder: 'desc',
    });
    const testCustsBySpend = sortSpendDesc.data.filter(c => [custA.id, custB.id, custC.id].includes(c.id));
    assert(testCustsBySpend[0].id === custC.id, 'Top spender among test customers is Charlie Chaplin (₹350)');
    assert(testCustsBySpend[0].totalSpendMinor === 35000, 'Top spend amount is 35000');
    assert(testCustsBySpend[2].id === custB.id, 'Lowest spender among test customers is Bob Builder (₹25)');

    // 7. Sorting: by totalVisits asc
    const sortVisitsAsc = await getBusinessCustomers(cafeOwnerCtx, {
      sortBy: 'totalVisits',
      sortOrder: 'asc',
    });
    const testCustsByVisits = sortVisitsAsc.data.filter(c => [custA.id, custB.id, custC.id].includes(c.id));
    assert(testCustsByVisits[0].id === custB.id, 'Lowest visits among test customers is Bob Builder (3 visits)');
    assert(testCustsByVisits[2].id === custC.id, 'Highest visits among test customers is Charlie Chaplin (28 visits)');

    // 8. Pagination limit & offset
    const pageLimit = await getBusinessCustomers(cafeOwnerCtx, { limit: 2, page: 1 });
    assert(pageLimit.data.length === 2, 'Respects pagination limit of 2');
    assert(pageLimit.pagination.hasMore === true, 'hasMore is true when additional records exist');

    // =========================================================================
    // SECTION 2: Customer 360 Profile & Updating
    // =========================================================================
    console.log('\n[2] Customer 360 Profile & Server-Authoritative Updates:');

    const profile360 = await getCustomer360(cafeOwnerCtx, custA.id);
    assert(profile360.customer.id === custA.id, 'Returns Customer 360 for requested customer');
    assert(profile360.customer.name === 'Alice Wonder', 'Returns customer name');
    assert(profile360.customer.phone === testPhoneA, 'Returns customer phone');
    assert(profile360.customer.totalVisits === 15, 'Returns accurate total visits (15)');
    assert(profile360.customer.totalSpendMinor === 15000, 'Returns accurate total spend minor (15000)');
    assert(profile360.customer.stampsBalance === 8, 'Returns accurate stamps balance (8)');
    assert(profile360.customer.pointsBalance === 120, 'Returns accurate points balance (120)');
    assert(Array.isArray(profile360.tags), 'Returns tags array in 360');
    assert(Array.isArray(profile360.notes), 'Returns notes array in 360');
    assert(profile360.rewardsSummary.totalClaimed >= 0, 'Returns rewards claimed summary');

    // Update customer profile
    const updatedProfile = await updateCustomerProfile(cafeOwnerCtx, custA.id, {
      name: 'Alice Wonder-Smith',
      email: 'alice.smith@example.com',
      birthday: '1995-06-15',
    });
    assert(updatedProfile.name === 'Alice Wonder-Smith', 'Updates customer name');
    assert(updatedProfile.email === 'alice.smith@example.com', 'Updates customer email');
    assert(updatedProfile.phone === testPhoneA, 'Phone number remains immutable on profile update');

    // Verify audit log emitted for update
    const updateAudit = await prisma.auditLog.findFirst({
      where: {
        businessId: cafe.id,
        action: 'CUSTOMER_UPDATED',
        entityId: custA.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(updateAudit !== null, 'Emits AUDIT_LOG for CUSTOMER_UPDATED');

    // =========================================================================
    // SECTION 3: Customer Notes Engine (CRUD + Audit)
    // =========================================================================
    console.log('\n[3] Staff Notes Engine (CRUD & Audit Logs):');

    // 1. Create note
    const note1 = await createCustomerNote(
      cafeOwnerCtx,
      custA.id,
      'Prefers oat milk flat white with extra shot. Highly loyal regular.'
    );
    assert(note1.id !== undefined, 'Creates note with unique ID');
    assert(note1.authorId === cafeOwner.id, 'Attributed note to authenticated staff member');
    assert(note1.author?.name === cafeOwner.name, 'Includes author profile in response');

    // Verify audit log for note created
    const noteCreateAudit = await prisma.auditLog.findFirst({
      where: {
        businessId: cafe.id,
        action: 'CUSTOMER_NOTE_CREATED',
        entityId: note1.id,
      },
    });
    assert(noteCreateAudit !== null, 'Emits AUDIT_LOG for CUSTOMER_NOTE_CREATED');

    // 2. List notes
    const notesList = await getCustomerNotes(cafeOwnerCtx, custA.id);
    assert(notesList.length >= 1, 'Lists notes for customer');
    assert(notesList[0].content.includes('oat milk'), 'Retrieved note content matches created content');

    // 3. Update note
    const updatedNote = await updateCustomerNote(
      cafeOwnerCtx,
      custA.id,
      note1.id,
      'Updated: Now prefers almond milk flat white.'
    );
    assert(updatedNote.content === 'Updated: Now prefers almond milk flat white.', 'Updates note content');

    // 4. Validation: rejects empty note
    let rejectedEmptyNote = false;
    try {
      await createCustomerNote(cafeOwnerCtx, custA.id, '   ');
    } catch (err: any) {
      rejectedEmptyNote = true;
    }
    assert(rejectedEmptyNote, 'Validation: Rejects note with empty or whitespace-only content');

    // 5. Delete note
    const delResult = await deleteCustomerNote(cafeOwnerCtx, custA.id, note1.id);
    assert(delResult.success === true, 'Deletes note successfully');
    const notesAfterDel = await getCustomerNotes(cafeOwnerCtx, custA.id);
    assert(notesAfterDel.find(n => n.id === note1.id) === undefined, 'Deleted note no longer in list');

    // =========================================================================
    // SECTION 4: Customer Tags Catalogue & Assignments
    // =========================================================================
    console.log('\n[4] Customer Tags Catalogue & Tag Assignments:');

    // Clean up test tags and segments across test businesses
    await prisma.customerTag.deleteMany({
      where: {
        name: { in: ['VIP Gold', 'Coffee Connoisseur', 'Weekend Regular', 'HTTP Test Tag'] },
      },
    });
    await prisma.customerSegment.deleteMany({
      where: {
        name: { in: ['VIP Tagged Members', 'Lapsed Customers (30+ Days)', 'HTTP Test Segment', 'Diagnostic Segment'] },
      },
    });

    // 1. Create tags
    const tagVip = await createBusinessTag(cafeOwnerCtx, {
      name: 'VIP Gold',
      color: '#F59E0B',
    });
    assert(tagVip.name === 'VIP Gold', 'Creates business tag');
    assert(tagVip.color === '#F59E0B', 'Assigns custom hex color to tag');

    const tagCoffee = await createBusinessTag(cafeOwnerCtx, {
      name: 'Coffee Connoisseur',
      color: '#8B5CF6',
    });

    // 2. Uniqueness validation: Duplicate tag name in same business rejected
    let rejectedDupTag = false;
    try {
      await createBusinessTag(cafeOwnerCtx, { name: 'VIP Gold' });
    } catch (err: any) {
      rejectedDupTag = err.code === 'TAG_ALREADY_EXISTS' || err.status === 409;
    }
    assert(rejectedDupTag, 'Uniqueness: Rejects duplicate tag name within the same business');

    // 3. Multi-tenant tag uniqueness: Salon can create tag with same name
    const salonTag = await createBusinessTag(salonOwnerCtx, {
      name: 'VIP Gold',
      color: '#EC4899',
    });
    assert(salonTag.businessId === salon.id, 'Same tag name allowed in different business tenant');

    // 4. Assign tag to customer
    const assignResult = await assignCustomerTag(cafeOwnerCtx, custA.id, tagVip.id);
    assert(assignResult.success === true, 'Assigns tag to customer');
    assert(assignResult.tag.name === 'VIP Gold', 'Returns assigned tag info');

    await assignCustomerTag(cafeOwnerCtx, custA.id, tagCoffee.id);

    // 5. Verify tags visible in Customer 360
    const profileWithTags = await getCustomer360(cafeOwnerCtx, custA.id);
    assert(profileWithTags.tags.length === 2, 'Customer 360 shows 2 assigned tags');
    assert(profileWithTags.tags.some(t => t.name === 'VIP Gold'), 'Contains VIP Gold tag');

    // 6. Filter customer directory by tagId
    const directoryByTag = await getBusinessCustomers(cafeOwnerCtx, { tagId: tagVip.id });
    assert(directoryByTag.data.length === 1, 'Directory filtered by tagId returns 1 customer');
    assert(directoryByTag.data[0].id === custA.id, 'Matched Alice Wonder with VIP tag');

    // 7. Remove tag from customer
    const removeResult = await removeCustomerTag(cafeOwnerCtx, custA.id, tagCoffee.id);
    assert(removeResult.success === true, 'Removes tag from customer');
    const profileAfterTagRemove = await getCustomer360(cafeOwnerCtx, custA.id);
    assert(profileAfterTagRemove.tags.length === 1, 'Tags count decreased to 1 after removal');

    // =========================================================================
    // SECTION 5: Unified Activity Timeline
    // =========================================================================
    console.log('\n[5] Unified Chronological Activity Timeline:');

    // Seed additional events for timeline testing: LoyaltyTransaction & Staff Note
    await prisma.loyaltyTransaction.create({
      data: {
        businessId: cafe.id,
        branchId: cafeBranch.id,
        customerId: custA.id,
        type: 'STAMP_ADDED',
        deltaStamps: 2,
        deltaPoints: 0,
        createdByUserId: cafeOwner.id,
        metadata: { reason: 'Test Stamp Award' },
      },
    });

    const noteTimeline = await createCustomerNote(cafeOwnerCtx, custA.id, 'Timeline test note content');

    const timeline = await getCustomerTimeline(cafeOwnerCtx, custA.id);
    assert(Array.isArray(timeline.data), 'Returns timeline data array');
    assert(timeline.data.length >= 3, 'Timeline aggregates at least 3 events');

    // Verify chronological ordering (newest first)
    let isChronological = true;
    for (let i = 0; i < timeline.data.length - 1; i++) {
      const current = new Date(timeline.data[i].timestamp).getTime();
      const next = new Date(timeline.data[i + 1].timestamp).getTime();
      if (current < next) {
        isChronological = false;
        break;
      }
    }
    assert(isChronological, 'Timeline items are strictly sorted newest-first (descending)');

    // Verify normalized timeline item shape
    const firstItem = timeline.data[0];
    assert(firstItem.id !== undefined, 'Timeline item has unique ID');
    assert(['EVENT', 'LOYALTY', 'REDEMPTION'].includes(firstItem.source), 'Timeline source is EVENT, LOYALTY, or REDEMPTION');
    assert(typeof firstItem.title === 'string' && firstItem.title.length > 0, 'Timeline item has non-empty title');
    assert(typeof firstItem.timestamp === 'string', 'Timeline item has ISO timestamp');
    assert(firstItem.badgeColor !== undefined, 'Timeline item has badge color for visual display');

    // Verify staff note appears on timeline
    const noteOnTimeline = timeline.data.find(i => i.id === `note_${noteTimeline.id}`);
    assert(noteOnTimeline !== undefined, 'Staff note appears on unified timeline');
    assert(noteOnTimeline?.description === 'Timeline test note content', 'Note description matches note content');

    // =========================================================================
    // SECTION 6: Customer Segmentation Foundation & Rule Evaluator
    // =========================================================================
    console.log('\n[6] Customer Segmentation Engine & Whitelisted Rule Evaluator:');

    // 1. Whitelist validation security: Rejects non-whitelisted fields
    let rejectedBadField = false;
    try {
      validateSegmentRuleDefinition({
        matchType: 'ALL',
        conditions: [{ field: 'passwordHash', operator: 'equals', value: 'secret' }],
      });
    } catch (err: any) {
      rejectedBadField = err.message.includes('Field is not whitelisted');
    }
    assert(rejectedBadField, 'Security: Rejects non-whitelisted field ("passwordHash") in segment rules');

    // 2. Whitelist validation security: Rejects non-whitelisted operators
    let rejectedBadOp = false;
    try {
      validateSegmentRuleDefinition({
        matchType: 'ALL',
        conditions: [{ field: 'totalVisits', operator: 'sql_inject', value: '1; DROP TABLE' }],
      });
    } catch (err: any) {
      rejectedBadOp = err.message.includes('Operator is not whitelisted');
    }
    assert(rejectedBadOp, 'Security: Rejects non-whitelisted operator ("sql_inject") in segment rules');

    // 3. Create VIP Tagged Segment (tagId = tagVip.id)
    const vipSegment = await createBusinessSegment(cafeOwnerCtx, {
      name: 'VIP Tagged Members',
      description: 'Customers with the VIP Gold tag',
      ruleDefinition: {
        matchType: 'ALL',
        conditions: [
          { field: 'tagId', operator: 'equals', value: tagVip.id },
        ],
      },
    });
    assert(vipSegment.id !== undefined, 'Creates customer segment with unique ID');
    assert(vipSegment.name === 'VIP Tagged Members', 'Segment name preserved');
    // Exactly Alice has this tag
    assert(vipSegment.customerCount === 1, `Computes dynamic customerCount = 1 for VIP Tagged (Alice)`);

    // 4. Create Lapsed Customers Segment (lastVisitAt before_days 30)
    const lapsedSegment = await createBusinessSegment(cafeOwnerCtx, {
      name: 'Lapsed Customers (30+ Days)',
      description: 'Customers who have not visited in 30 days',
      ruleDefinition: {
        matchType: 'ALL',
        conditions: [
          { field: 'lastVisitAt', operator: 'before_days', value: 30 },
        ],
      },
    });
    // Bob (45 days ago) matches
    assert(lapsedSegment.customerCount >= 1, `Computes customerCount >= 1 for Lapsed Customers (Bob)`);

    // 5. List segments with live computed counts
    const segmentsList = await getBusinessSegments(cafeOwnerCtx);
    assert(segmentsList.length >= 2, 'Lists business segments');
    const foundVip = segmentsList.find(s => s.id === vipSegment.id);
    assert(foundVip?.customerCount === 1, 'Live calculated customer count matches in segment list');

    // 6. Query matching customers for segment
    const segmentCusts = await getSegmentCustomers(cafeOwnerCtx, vipSegment.id);
    assert(segmentCusts.data.length === 1, 'getSegmentCustomers returns exactly 1 customer for VIP tag');
    assert(segmentCusts.data[0].id === custA.id, 'Contains Alice Wonder');

    // 7. Filter main customer directory by segmentId
    const dirBySegment = await getBusinessCustomers(cafeOwnerCtx, { segmentId: vipSegment.id });
    assert(dirBySegment.data.length === 1, 'Directory filtered by segmentId returns 1 matching customer');
    assert(dirBySegment.data[0].id === custA.id, 'Matched Alice Wonder');

    // =========================================================================
    // SECTION 7: Multi-Tenant Security & Tenant Isolation (IDOR)
    // =========================================================================
    console.log('\n[7] Multi-Tenant Security & IDOR Protection:');

    // 1. Cafe owner cannot view Salon customer 360
    let rejectedCrossTenantView = false;
    try {
      await getCustomer360(cafeOwnerCtx, salonCust.id);
    } catch (err: any) {
      rejectedCrossTenantView = err.code === 'CUSTOMER_NOT_FOUND' || err.status === 404;
    }
    assert(rejectedCrossTenantView, 'IDOR: Cafe staff cannot view Salon customer 360 (returns 404)');

    // 2. Cafe owner cannot update Salon customer profile
    let rejectedCrossTenantUpdate = false;
    try {
      await updateCustomerProfile(cafeOwnerCtx, salonCust.id, { name: 'Hacked Name' });
    } catch (err: any) {
      rejectedCrossTenantUpdate = err.code === 'CUSTOMER_NOT_FOUND' || err.status === 404;
    }
    assert(rejectedCrossTenantUpdate, 'IDOR: Cafe staff cannot update Salon customer profile (returns 404)');

    // 3. Cafe owner cannot view Salon customer timeline
    let rejectedCrossTenantTimeline = false;
    try {
      await getCustomerTimeline(cafeOwnerCtx, salonCust.id);
    } catch (err: any) {
      rejectedCrossTenantTimeline = err.code === 'CUSTOMER_NOT_FOUND' || err.status === 404;
    }
    assert(rejectedCrossTenantTimeline, 'IDOR: Cafe staff cannot access Salon customer timeline (returns 404)');

    // 4. Cafe owner cannot add notes to Salon customer
    let rejectedCrossTenantNote = false;
    try {
      await createCustomerNote(cafeOwnerCtx, salonCust.id, 'Malicious cross-tenant note');
    } catch (err: any) {
      rejectedCrossTenantNote = err.code === 'CUSTOMER_NOT_FOUND' || err.status === 404;
    }
    assert(rejectedCrossTenantNote, 'IDOR: Cafe staff cannot add notes to Salon customer (returns 404)');

    // 5. Cafe owner cannot assign Salon tag to Cafe customer
    let rejectedCrossTenantTagAssign = false;
    try {
      await assignCustomerTag(cafeOwnerCtx, custA.id, salonTag.id);
    } catch (err: any) {
      rejectedCrossTenantTagAssign = err.code === 'TAG_NOT_FOUND' || err.status === 404;
    }
    assert(rejectedCrossTenantTagAssign, 'IDOR: Cannot assign cross-tenant tag to customer (returns 404)');

    // 6. Cafe owner cannot view or delete Salon segment
    let rejectedCrossTenantSegment = false;
    try {
      const salonSegment = await createBusinessSegment(salonOwnerCtx, {
        name: 'Salon Segment',
        ruleDefinition: { matchType: 'ALL', conditions: [] },
      });
      await deleteBusinessSegment(cafeOwnerCtx, salonSegment.id);
    } catch (err: any) {
      rejectedCrossTenantSegment = err.code === 'SEGMENT_NOT_FOUND' || err.status === 404;
    }
    assert(rejectedCrossTenantSegment, 'IDOR: Cafe staff cannot delete Salon segment (returns 404)');

    // =========================================================================
    // SECTION 8: HTTP REST API Endpoints
    // =========================================================================
    console.log('\n[8] HTTP REST API Endpoints:');

    // Login as Cafe Owner
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'marcus@reployty.com',
        password: 'OwnerPass123!',
      }),
    });
    assert(loginRes.status === 200, 'POST /api/auth/login successful for Cafe Owner');
    const authCookie = loginRes.cookie || '';

    // 1. GET /api/business/customers
    const apiCusts = await request('/api/business/customers', {
      headers: { Cookie: authCookie },
    });
    assert(apiCusts.status === 200, 'GET /api/business/customers returns 200 OK');
    assert(Array.isArray(apiCusts.data?.data), 'Returns customer array');
    assert(apiCusts.data?.pagination?.total >= 3, 'Returns pagination total');

    // 2. GET /api/business/customers/:id
    const apiCust360 = await request(`/api/business/customers/${custA.id}`, {
      headers: { Cookie: authCookie },
    });
    assert(apiCust360.status === 200, 'GET /api/business/customers/:id returns 200 OK');
    assert(apiCust360.data?.customer?.id === custA.id, 'Returns Customer 360 via HTTP');

    // 3. PUT /api/business/customers/:id
    const apiUpdate = await request(`/api/business/customers/${custA.id}`, {
      method: 'PUT',
      headers: {
        Cookie: authCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Alice Wonder-Updated',
      }),
    });
    assert(apiUpdate.status === 200, 'PUT /api/business/customers/:id returns 200 OK');
    assert(apiUpdate.data?.name === 'Alice Wonder-Updated', 'Profile name updated via HTTP');

    // 4. GET /api/business/customers/:id/timeline
    const apiTimeline = await request(`/api/business/customers/${custA.id}/timeline`, {
      headers: { Cookie: authCookie },
    });
    assert(apiTimeline.status === 200, 'GET /api/business/customers/:id/timeline returns 200 OK');
    assert(Array.isArray(apiTimeline.data?.data), 'Returns timeline items array via HTTP');

    // 5. GET /api/business/customers/:id/notes & POST note
    const apiCreateNote = await request(`/api/business/customers/${custA.id}/notes`, {
      method: 'POST',
      headers: {
        Cookie: authCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'HTTP created note',
      }),
    });
    assert(apiCreateNote.status === 201, 'POST /api/business/customers/:id/notes returns 201 Created');
    assert(apiCreateNote.data?.content === 'HTTP created note', 'Note content saved via HTTP');

    // 6. GET /api/business/customer-tags & POST tag
    const apiCreateTag = await request('/api/business/customer-tags', {
      method: 'POST',
      headers: {
        Cookie: authCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'HTTP Test Tag',
        color: '#10B981',
      }),
    });
    assert(apiCreateTag.status === 201, 'POST /api/business/customer-tags returns 201 Created');

    const apiTags = await request('/api/business/customer-tags', {
      headers: { Cookie: authCookie },
    });
    assert(apiTags.status === 200, 'GET /api/business/customer-tags returns 200 OK');
    assert(Array.isArray(apiTags.data), 'Returns tags list via HTTP');

    // 7. GET /api/business/customer-segments & POST segment
    const apiCreateSeg = await request('/api/business/customer-segments', {
      method: 'POST',
      headers: {
        Cookie: authCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'HTTP Test Segment',
        ruleDefinition: {
          matchType: 'ALL',
          conditions: [{ field: 'totalVisits', operator: 'greater_than', value: 10 }],
        },
      }),
    });
    assert(apiCreateSeg.status === 201, 'POST /api/business/customer-segments returns 201 Created');
    assert(apiCreateSeg.data?.customerCount >= 2, 'API returns computed customerCount (>= 2)');

    const apiSegs = await request('/api/business/customer-segments', {
      headers: { Cookie: authCookie },
    });
    assert(apiSegs.status === 200, 'GET /api/business/customer-segments returns 200 OK');
    assert(Array.isArray(apiSegs.data), 'Returns segments list via HTTP');

    // 8. Unauthenticated access rejected
    const unauthRes = await request('/api/business/customers');
    assert(unauthRes.status === 401, 'Unauthenticated GET /api/business/customers rejected (401)');

    // 9. IDOR access via HTTP: Cafe owner requests Salon customer -> 404
    const idorRes = await request(`/api/business/customers/${salonCust.id}`, {
      headers: { Cookie: authCookie },
    });
    assert(idorRes.status === 404, 'HTTP IDOR: Cross-tenant GET /api/business/customers/:id returns 404 Not Found');

    console.log('\n==================================================================');
    console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================================\n');

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test Suite Error:', err);
    process.exit(1);
  }
}

runCRMTestSuite();
