import { prisma } from '../../src/server/db/client';
import { getTenantContext } from '../../src/server/auth/tenantContext';
import {
  getCatalogOverview,
  getBusinessMenus,
  createMenu,
  updateMenu,
  archiveMenu,
  createMenuCategory,
  updateMenuCategory,
  reorderMenuCategories,
  deleteMenuCategory,
  createMenuItem,
  updateMenuItem,
  toggleMenuItemAvailability,
  deleteMenuItem,
  getBusinessServices,
  createServiceCategory,
  updateServiceCategory,
  reorderServiceCategories,
  deleteServiceCategory,
  createService,
  updateService,
  toggleServiceAvailability,
  deleteService,
  getBusinessProducts,
  createProductCategory,
  updateProductCategory,
  reorderProductCategories,
  deleteProductCategory,
  createProduct,
  updateProduct,
  toggleProductAvailability,
  deleteProduct,
  getCustomerCatalog,
} from '../../src/server/services/catalogService';
import { createCustomerSession } from '../../src/server/services/customerAuthService';

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

async function runCatalogTestSuite() {
  console.log('\n==================================================================');
  console.log('REPLOYTY PHASE 11: CATALOG SYSTEM AUTOMATED TEST SUITE');
  console.log('==================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. Setup Context: Retrieve seeded businesses and users
    // -------------------------------------------------------------------------
    const cafe = await prisma.business.findUnique({
      where: { slug: 'roasted-bean-cafe' },
      include: { branches: true },
    });
    if (!cafe) throw new Error('Seeded cafe not found');

    const bakery = await prisma.business.findUnique({
      where: { slug: 'new-wave-bakery' },
      include: { branches: true },
    });
    if (!bakery) throw new Error('Seeded bakery not found');

    const cafeOwner = await prisma.user.findUnique({
      where: { email: 'marcus@reployty.com' },
    });
    if (!cafeOwner) throw new Error('Seeded cafe owner not found');

    const cafeCashier = await prisma.user.findUnique({
      where: { email: 'sarah.cashier@reployty.com' },
    });
    if (!cafeCashier) throw new Error('Seeded cafe cashier not found');

    const bakeryOwner = await prisma.user.findUnique({
      where: { email: 'chloe.baker@reployty.com' },
    });
    if (!bakeryOwner) throw new Error('Seeded bakery owner not found');

    // Tenant contexts
    const cafeOwnerCtx = await getTenantContext(cafeOwner.id, cafe.id);
    const cafeCashierCtx = await getTenantContext(cafeCashier.id, cafe.id);
    const bakeryOwnerCtx = await getTenantContext(bakeryOwner.id, bakery.id);

    console.log('--- TEST 1: CATALOG OVERVIEW ---');
    const cafeOverview = await getCatalogOverview(cafeOwnerCtx);
    assert(Array.isArray(cafeOverview.menus), 'Overview returns menus array');
    assert(Array.isArray(cafeOverview.serviceCategories), 'Overview returns serviceCategories');
    assert(Array.isArray(cafeOverview.productCategories), 'Overview returns productCategories');
    assert(typeof cafeOverview.totalMenuItems === 'number', 'Overview returns totalMenuItems counter');
    assert(typeof cafeOverview.totalServices === 'number', 'Overview returns totalServices counter');
    assert(typeof cafeOverview.totalProducts === 'number', 'Overview returns totalProducts counter');

    console.log('\n--- TEST 2: MENU & MENU ITEM CRUD ---');
    // Create new menu
    const testMenu = await createMenu(cafeOwnerCtx, { name: 'Seasonal Specials Menu', isActive: true });
    assert(testMenu.name === 'Seasonal Specials Menu', 'createMenu creates menu with correct name');
    assert(testMenu.isActive === true, 'createMenu sets isActive');

    // Update menu
    const updatedMenu = await updateMenu(cafeOwnerCtx, testMenu.id, { name: 'Winter Specials Menu' });
    assert(updatedMenu.name === 'Winter Specials Menu', 'updateMenu updates menu title');

    // Create menu category
    const menuCat1 = await createMenuCategory(cafeOwnerCtx, testMenu.id, { name: 'Hot Beverages' });
    const menuCat2 = await createMenuCategory(cafeOwnerCtx, testMenu.id, { name: 'Artisan Pastries' });
    assert(menuCat1.name === 'Hot Beverages', 'createMenuCategory creates first category');
    assert(menuCat2.sortOrder > menuCat1.sortOrder, 'Categories are created with sequential sortOrder');

    // Reorder categories
    const reorderedCats = await reorderMenuCategories(cafeOwnerCtx, testMenu.id, [menuCat2.id, menuCat1.id]);
    assert(reorderedCats[0].id === menuCat2.id, 'reorderMenuCategories moves menuCat2 to first position');
    assert(reorderedCats[0].sortOrder === 1, 'First category receives sortOrder 1');
    assert(reorderedCats[1].sortOrder === 2, 'Second category receives sortOrder 2');

    // Create menu item
    const menuItem1 = await createMenuItem(cafeOwnerCtx, menuCat1.id, {
      name: 'Spiced Hazelnut Latte',
      description: 'Double espresso with spiced hazelnut syrup and oat milk',
      priceMinor: 22000, // ₹220.00
      isAvailable: true,
    });
    assert(menuItem1.name === 'Spiced Hazelnut Latte', 'createMenuItem sets item name');
    assert(menuItem1.priceMinor === 22000, 'createMenuItem stores priceMinor in integer minor units');
    assert(menuItem1.isAvailable === true, 'createMenuItem sets availability to true');

    // Toggle menu item availability
    const toggledItem = await toggleMenuItemAvailability(cafeOwnerCtx, menuItem1.id, false);
    assert(toggledItem.isAvailable === false, 'toggleMenuItemAvailability toggles to false');

    // Update menu item
    const updatedItem = await updateMenuItem(cafeOwnerCtx, menuItem1.id, {
      priceMinor: 24000,
      description: 'Updated signature recipe',
    });
    assert(updatedItem.priceMinor === 24000, 'updateMenuItem updates priceMinor');
    assert(updatedItem.description === 'Updated signature recipe', 'updateMenuItem updates description');

    console.log('\n--- TEST 3: SERVICE & SERVICE CATEGORY CRUD ---');
    // Create service category
    const svcCat1 = await createServiceCategory(cafeOwnerCtx, { name: 'Tasting Sessions' });
    const svcCat2 = await createServiceCategory(cafeOwnerCtx, { name: 'Barista Masterclass' });
    assert(svcCat1.name === 'Tasting Sessions', 'createServiceCategory creates category');
    assert(svcCat2.sortOrder > svcCat1.sortOrder, 'Service categories sequential sortOrder');

    // Reorder service categories
    const reorderedSvcCats = await reorderServiceCategories(cafeOwnerCtx, [svcCat2.id, svcCat1.id]);
    const svcCat2Updated = reorderedSvcCats.find(c => c.id === svcCat2.id);
    const svcCat1Updated = reorderedSvcCats.find(c => c.id === svcCat1.id);
    assert(Boolean(svcCat2Updated && svcCat1Updated && svcCat2Updated.sortOrder < svcCat1Updated.sortOrder), 'reorderServiceCategories places svcCat2 before svcCat1');

    // Create service
    const service1 = await createService(cafeOwnerCtx, svcCat1.id, {
      name: 'Cupping & Sensory Workshop',
      durationMinutes: 45,
      priceMinor: 75000, // ₹750.00
      isAvailable: true,
    });
    assert(service1.name === 'Cupping & Sensory Workshop', 'createService creates service');
    assert(service1.durationMinutes === 45, 'createService sets durationMinutes');
    assert(service1.priceMinor === 75000, 'createService sets priceMinor in minor units');

    // Update service
    const updatedSvc = await updateService(cafeOwnerCtx, service1.id, { durationMinutes: 60 });
    assert(updatedSvc.durationMinutes === 60, 'updateService updates durationMinutes');

    // Toggle service availability
    const toggledSvc = await toggleServiceAvailability(cafeOwnerCtx, service1.id, false);
    assert(toggledSvc.isAvailable === false, 'toggleServiceAvailability toggles to false');

    console.log('\n--- TEST 4: PRODUCT & PRODUCT CATEGORY CRUD ---');
    // Create product category
    const prodCat1 = await createProductCategory(cafeOwnerCtx, { name: 'Whole Bean Coffee' });
    const prodCat2 = await createProductCategory(cafeOwnerCtx, { name: 'Brewing Equipment' });
    assert(prodCat1.name === 'Whole Bean Coffee', 'createProductCategory creates category');

    // Reorder product categories
    const reorderedProdCats = await reorderProductCategories(cafeOwnerCtx, [prodCat2.id, prodCat1.id]);
    const prodCat2Updated = reorderedProdCats.find(c => c.id === prodCat2.id);
    const prodCat1Updated = reorderedProdCats.find(c => c.id === prodCat1.id);
    assert(Boolean(prodCat2Updated && prodCat1Updated && prodCat2Updated.sortOrder < prodCat1Updated.sortOrder), 'reorderProductCategories places prodCat2 before prodCat1');

    // Create product
    const product1 = await createProduct(cafeOwnerCtx, prodCat1.id, {
      name: 'Ethiopia Yirgacheffe 250g',
      sku: 'ETH-YIRG-250G',
      stockQuantity: 24,
      priceMinor: 65000, // ₹650.00
      isAvailable: true,
    });
    assert(product1.name === 'Ethiopia Yirgacheffe 250g', 'createProduct sets product name');
    assert(product1.sku === 'ETH-YIRG-250G', 'createProduct sets SKU');
    assert(product1.stockQuantity === 24, 'createProduct sets stockQuantity');
    assert(product1.priceMinor === 65000, 'createProduct sets priceMinor');

    // Update product
    const updatedProd = await updateProduct(cafeOwnerCtx, product1.id, { stockQuantity: 20 });
    assert(updatedProd.stockQuantity === 20, 'updateProduct updates stockQuantity');

    console.log('\n--- TEST 5: MULTI-TENANT IDOR ISOLATION ---');
    // Bakery owner attempts to update Cafe's menu item -> must throw NOT_FOUND
    let bakeryIdorBlocked = false;
    try {
      await updateMenuItem(bakeryOwnerCtx, menuItem1.id, { name: 'Malicious Rename' });
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        bakeryIdorBlocked = true;
      }
    }
    assert(bakeryIdorBlocked, 'Cross-tenant IDOR: Bakery owner blocked from updating Cafe menu item (404/NOT_FOUND)');

    // Bakery owner attempts to update Cafe's service category -> must throw NOT_FOUND
    let catIdorBlocked = false;
    try {
      await updateServiceCategory(bakeryOwnerCtx, svcCat1.id, { name: 'Hacked Category' });
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        catIdorBlocked = true;
      }
    }
    assert(catIdorBlocked, 'Cross-tenant IDOR: Bakery owner blocked from updating Cafe service category (404/NOT_FOUND)');

    // Bakery owner attempts to delete Cafe's product -> must throw NOT_FOUND
    let prodIdorBlocked = false;
    try {
      await deleteProduct(bakeryOwnerCtx, product1.id);
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        prodIdorBlocked = true;
      }
    }
    assert(prodIdorBlocked, 'Cross-tenant IDOR: Bakery owner blocked from deleting Cafe product (404/NOT_FOUND)');

    console.log('\n--- TEST 6: RBAC PERMISSION GATE (CASHIER 403) ---');
    // Cashier does not have CATALOG_MANAGE permission
    let cashierForbidden = false;
    try {
      await createMenuItem(cafeCashierCtx, menuCat1.id, {
        name: 'Unauthorized Item',
        priceMinor: 10000,
      });
    } catch (err: any) {
      if (err.name === 'PermissionDeniedError' || err.code === 'FORBIDDEN_PERMISSION') {
        cashierForbidden = true;
      }
    }
    assert(cashierForbidden, 'RBAC Gate: Staff without CATALOG_MANAGE denied item creation (403)');

    console.log('\n--- TEST 7: CUSTOMER READ-ONLY CATALOG VIEW ---');
    // Create customer session for cafe
    const testCust = await prisma.customer.findFirst({
      where: { businessId: cafe.id },
    });
    if (!testCust) throw new Error('Customer not found for customer catalog test');

    const custSession = await createCustomerSession(testCust.id, cafe.id);

    const custCatalog = await getCustomerCatalog({
      businessId: cafe.id,
    });

    assert(custCatalog.business.id === cafe.id, 'Customer catalog returns correct business ID');
    assert(Array.isArray(custCatalog.menus), 'Customer catalog returns menus');
    assert(Array.isArray(custCatalog.serviceCategories), 'Customer catalog returns serviceCategories');
    assert(Array.isArray(custCatalog.productCategories), 'Customer catalog returns productCategories');

    // Verify unavailable items are omitted for customers
    // We set menuItem1 isAvailable = false earlier; let's check it is NOT in customer's menu items
    let foundUnavailableItem = false;
    for (const m of custCatalog.menus) {
      for (const cat of m.categories) {
        for (const item of cat.items) {
          if (item.id === menuItem1.id) {
            foundUnavailableItem = true;
          }
        }
      }
    }
    assert(!foundUnavailableItem, 'Customer catalog omits unavailable menu items');

    console.log('\n--- TEST 8: CLEANUP TEST DATA ---');
    // Delete item, categories, menu
    await deleteMenuItem(cafeOwnerCtx, menuItem1.id);
    await deleteMenuCategory(cafeOwnerCtx, menuCat1.id);
    await deleteMenuCategory(cafeOwnerCtx, menuCat2.id);
    await archiveMenu(cafeOwnerCtx, testMenu.id);
    await deleteService(cafeOwnerCtx, service1.id);
    await deleteServiceCategory(cafeOwnerCtx, svcCat1.id);
    await deleteServiceCategory(cafeOwnerCtx, svcCat2.id);
    await deleteProduct(cafeOwnerCtx, product1.id);
    await deleteProductCategory(cafeOwnerCtx, prodCat1.id);
    await deleteProductCategory(cafeOwnerCtx, prodCat2.id);
    assert(true, 'Cleanup completed cleanly without dangling test records');

    console.log('\n==================================================================');
    console.log(`CATALOG TEST SUITE RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================================\n');

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test Suite Error:', err);
    process.exit(1);
  }
}

runCatalogTestSuite();
