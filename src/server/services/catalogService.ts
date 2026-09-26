import { prisma } from '../db/client';
import { TenantContext, requirePermission } from '../auth/tenantContext';
import { createAuditLog } from './auditService';
import { CustomerSessionContext } from './customerAuthService';
import {
  CreateMenuItemInput,
  UpdateMenuItemInput,
  CreateServiceInput,
  UpdateServiceInput,
  CreateProductInput,
  UpdateProductInput,
  CatalogOverview,
  CustomerCatalogData,
} from '../../types/catalog';

export class CatalogOperationError extends Error {
  constructor(message: string, public code: string = 'CATALOG_OPERATION_ERROR') {
    super(message);
    this.name = 'CatalogOperationError';
  }
}

// ============================================================================
// 1. MENU MANAGEMENT
// ============================================================================

export async function getBusinessMenus(ctx: TenantContext) {
  requirePermission(ctx, 'CATALOG_VIEW');

  return prisma.menu.findMany({
    where: { businessId: ctx.businessId },
    include: {
      categories: {
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            orderBy: { name: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createMenu(
  ctx: TenantContext,
  data: { name: string; isActive?: boolean }
) {
  requirePermission(ctx, 'CATALOG_MANAGE');
  const name = data.name?.trim();
  if (!name) {
    throw new CatalogOperationError('Menu name is required', 'VALIDATION_ERROR');
  }

  const menu = await prisma.menu.create({
    data: {
      businessId: ctx.businessId,
      name,
      isActive: data.isActive ?? true,
    },
    include: {
      categories: {
        include: { items: true },
      },
    },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_CREATED',
    entityType: 'Menu',
    entityId: menu.id,
    newState: { name: menu.name, isActive: menu.isActive },
  });

  return menu;
}

export async function updateMenu(
  ctx: TenantContext,
  menuId: string,
  data: { name?: string; isActive?: boolean }
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.menu.findUnique({
    where: { id: menuId },
  });

  if (!existing || existing.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Menu not found', 'NOT_FOUND');
  }

  const updated = await prisma.menu.update({
    where: { id: menuId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      isActive: data.isActive !== undefined ? data.isActive : undefined,
    },
    include: {
      categories: {
        include: { items: true },
      },
    },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_UPDATED',
    entityType: 'Menu',
    entityId: menuId,
    previousState: { name: existing.name, isActive: existing.isActive },
    newState: { name: updated.name, isActive: updated.isActive },
  });

  return updated;
}

export async function archiveMenu(ctx: TenantContext, menuId: string) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.menu.findUnique({
    where: { id: menuId },
  });

  if (!existing || existing.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Menu not found', 'NOT_FOUND');
  }

  const updated = await prisma.menu.update({
    where: { id: menuId },
    data: { isActive: false },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_ARCHIVED',
    entityType: 'Menu',
    entityId: menuId,
    previousState: { isActive: existing.isActive },
    newState: { isActive: false },
  });

  return updated;
}

// ----------------------------------------------------------------------------
// Menu Categories
// ----------------------------------------------------------------------------

export async function createMenuCategory(
  ctx: TenantContext,
  menuId: string,
  data: { name: string; sortOrder?: number }
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const menu = await prisma.menu.findUnique({
    where: { id: menuId },
  });

  if (!menu || menu.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Menu not found', 'NOT_FOUND');
  }

  const name = data.name?.trim();
  if (!name) {
    throw new CatalogOperationError('Category name is required', 'VALIDATION_ERROR');
  }

  const count = await prisma.menuCategory.count({ where: { menuId } });
  const category = await prisma.menuCategory.create({
    data: {
      menuId,
      name,
      sortOrder: data.sortOrder ?? count + 1,
    },
    include: {
      items: true,
    },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_CATEGORY_CREATED',
    entityType: 'MenuCategory',
    entityId: category.id,
    newState: { name: category.name, sortOrder: category.sortOrder, menuId },
  });

  return category;
}

export async function updateMenuCategory(
  ctx: TenantContext,
  categoryId: string,
  data: { name?: string; sortOrder?: number }
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.menuCategory.findUnique({
    where: { id: categoryId },
    include: { menu: true },
  });

  if (!existing || existing.menu.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Category not found', 'NOT_FOUND');
  }

  const updated = await prisma.menuCategory.update({
    where: { id: categoryId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      sortOrder: data.sortOrder !== undefined ? data.sortOrder : undefined,
    },
    include: { items: true },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_CATEGORY_UPDATED',
    entityType: 'MenuCategory',
    entityId: categoryId,
    previousState: { name: existing.name, sortOrder: existing.sortOrder },
    newState: { name: updated.name, sortOrder: updated.sortOrder },
  });

  return updated;
}

export async function reorderMenuCategories(
  ctx: TenantContext,
  menuId: string,
  categoryIds: string[]
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const menu = await prisma.menu.findUnique({
    where: { id: menuId },
  });

  if (!menu || menu.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Menu not found', 'NOT_FOUND');
  }

  // Update sort order sequentially
  await prisma.$transaction(
    categoryIds.map((id, index) =>
      prisma.menuCategory.updateMany({
        where: { id, menuId },
        data: { sortOrder: index + 1 },
      })
    )
  );

  return prisma.menuCategory.findMany({
    where: { menuId },
    orderBy: { sortOrder: 'asc' },
    include: { items: true },
  });
}

export async function deleteMenuCategory(ctx: TenantContext, categoryId: string) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.menuCategory.findUnique({
    where: { id: categoryId },
    include: { menu: true, items: true },
  });

  if (!existing || existing.menu.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Category not found', 'NOT_FOUND');
  }

  await prisma.menuCategory.delete({
    where: { id: categoryId },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_CATEGORY_DELETED',
    entityType: 'MenuCategory',
    entityId: categoryId,
    previousState: { name: existing.name, menuId: existing.menuId },
  });

  return { success: true };
}

// ----------------------------------------------------------------------------
// Menu Items
// ----------------------------------------------------------------------------

export async function createMenuItem(
  ctx: TenantContext,
  categoryId: string,
  data: CreateMenuItemInput
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const category = await prisma.menuCategory.findUnique({
    where: { id: categoryId },
    include: { menu: true },
  });

  if (!category || category.menu.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Category not found', 'NOT_FOUND');
  }

  const name = data.name?.trim();
  if (!name) {
    throw new CatalogOperationError('Item name is required', 'VALIDATION_ERROR');
  }

  if (typeof data.priceMinor !== 'number' || data.priceMinor < 0) {
    throw new CatalogOperationError('Price must be a non-negative integer in minor units', 'VALIDATION_ERROR');
  }

  const item = await prisma.menuItem.create({
    data: {
      categoryId,
      name,
      description: data.description?.trim() || null,
      priceMinor: Math.round(data.priceMinor),
      isAvailable: data.isAvailable ?? true,
    },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_ITEM_CREATED',
    entityType: 'MenuItem',
    entityId: item.id,
    newState: { name: item.name, priceMinor: item.priceMinor, categoryId },
  });

  return item;
}

export async function updateMenuItem(
  ctx: TenantContext,
  itemId: string,
  data: UpdateMenuItemInput
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.menuItem.findUnique({
    where: { id: itemId },
    include: { category: { include: { menu: true } } },
  });

  if (!existing || existing.category.menu.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Item not found', 'NOT_FOUND');
  }

  // If changing category, verify target category belongs to this business
  if (data.categoryId && data.categoryId !== existing.categoryId) {
    const targetCat = await prisma.menuCategory.findUnique({
      where: { id: data.categoryId },
      include: { menu: true },
    });
    if (!targetCat || targetCat.menu.businessId !== ctx.businessId) {
      throw new CatalogOperationError('Target category not found in this business', 'NOT_FOUND');
    }
  }

  if (data.priceMinor !== undefined && (typeof data.priceMinor !== 'number' || data.priceMinor < 0)) {
    throw new CatalogOperationError('Price must be a non-negative integer in minor units', 'VALIDATION_ERROR');
  }

  const updated = await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      description: data.description !== undefined ? data.description?.trim() || null : undefined,
      priceMinor: data.priceMinor !== undefined ? Math.round(data.priceMinor) : undefined,
      isAvailable: data.isAvailable !== undefined ? data.isAvailable : undefined,
      categoryId: data.categoryId !== undefined ? data.categoryId : undefined,
    },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_ITEM_UPDATED',
    entityType: 'MenuItem',
    entityId: itemId,
    previousState: {
      name: existing.name,
      priceMinor: existing.priceMinor,
      isAvailable: existing.isAvailable,
      categoryId: existing.categoryId,
    },
    newState: {
      name: updated.name,
      priceMinor: updated.priceMinor,
      isAvailable: updated.isAvailable,
      categoryId: updated.categoryId,
    },
  });

  return updated;
}

export async function toggleMenuItemAvailability(
  ctx: TenantContext,
  itemId: string,
  isAvailable: boolean
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.menuItem.findUnique({
    where: { id: itemId },
    include: { category: { include: { menu: true } } },
  });

  if (!existing || existing.category.menu.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Item not found', 'NOT_FOUND');
  }

  const updated = await prisma.menuItem.update({
    where: { id: itemId },
    data: { isAvailable },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_ITEM_AVAILABILITY_TOGGLED',
    entityType: 'MenuItem',
    entityId: itemId,
    previousState: { isAvailable: existing.isAvailable },
    newState: { isAvailable },
  });

  return updated;
}

export async function deleteMenuItem(ctx: TenantContext, itemId: string) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.menuItem.findUnique({
    where: { id: itemId },
    include: { category: { include: { menu: true } } },
  });

  if (!existing || existing.category.menu.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Item not found', 'NOT_FOUND');
  }

  await prisma.menuItem.delete({
    where: { id: itemId },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_MENU_ITEM_DELETED',
    entityType: 'MenuItem',
    entityId: itemId,
    previousState: { name: existing.name, categoryId: existing.categoryId },
  });

  return { success: true };
}

// ============================================================================
// 2. SERVICE MANAGEMENT
// ============================================================================

export async function getBusinessServices(
  ctx: TenantContext,
  filter?: { search?: string; categoryId?: string; isAvailable?: boolean }
) {
  requirePermission(ctx, 'CATALOG_VIEW');

  return prisma.serviceCategory.findMany({
    where: {
      businessId: ctx.businessId,
      id: filter?.categoryId ? filter.categoryId : undefined,
    },
    include: {
      services: {
        where: {
          isAvailable: filter?.isAvailable !== undefined ? filter.isAvailable : undefined,
          name: filter?.search ? { contains: filter.search, mode: 'insensitive' } : undefined,
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createServiceCategory(
  ctx: TenantContext,
  data: { name: string; sortOrder?: number }
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const name = data.name?.trim();
  if (!name) {
    throw new CatalogOperationError('Category name is required', 'VALIDATION_ERROR');
  }

  const count = await prisma.serviceCategory.count({ where: { businessId: ctx.businessId } });
  const category = await prisma.serviceCategory.create({
    data: {
      businessId: ctx.businessId,
      name,
      sortOrder: data.sortOrder ?? count + 1,
    },
    include: { services: true },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_SERVICE_CATEGORY_CREATED',
    entityType: 'ServiceCategory',
    entityId: category.id,
    newState: { name: category.name },
  });

  return category;
}

export async function updateServiceCategory(
  ctx: TenantContext,
  categoryId: string,
  data: { name?: string; sortOrder?: number }
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.serviceCategory.findUnique({
    where: { id: categoryId },
  });

  if (!existing || existing.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Service category not found', 'NOT_FOUND');
  }

  const updated = await prisma.serviceCategory.update({
    where: { id: categoryId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      sortOrder: data.sortOrder !== undefined ? data.sortOrder : undefined,
    },
    include: { services: true },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_SERVICE_CATEGORY_UPDATED',
    entityType: 'ServiceCategory',
    entityId: categoryId,
    previousState: { name: existing.name, sortOrder: existing.sortOrder },
    newState: { name: updated.name, sortOrder: updated.sortOrder },
  });

  return updated;
}

export async function deleteServiceCategory(ctx: TenantContext, categoryId: string) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.serviceCategory.findUnique({
    where: { id: categoryId },
  });

  if (!existing || existing.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Service category not found', 'NOT_FOUND');
  }

  await prisma.serviceCategory.delete({
    where: { id: categoryId },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_SERVICE_CATEGORY_DELETED',
    entityType: 'ServiceCategory',
    entityId: categoryId,
    previousState: { name: existing.name },
  });

  return { success: true };
}

export async function reorderServiceCategories(
  ctx: TenantContext,
  categoryIds: string[]
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  await prisma.$transaction(
    categoryIds.map((id, index) =>
      prisma.serviceCategory.updateMany({
        where: { id, businessId: ctx.businessId },
        data: { sortOrder: index + 1 },
      })
    )
  );

  return prisma.serviceCategory.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { sortOrder: 'asc' },
    include: { services: true },
  });
}

export async function createService(
  ctx: TenantContext,
  categoryId: string,
  data: CreateServiceInput
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const category = await prisma.serviceCategory.findUnique({
    where: { id: categoryId },
  });

  if (!category || category.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Service category not found', 'NOT_FOUND');
  }

  const name = data.name?.trim();
  if (!name) {
    throw new CatalogOperationError('Service name is required', 'VALIDATION_ERROR');
  }

  if (typeof data.priceMinor !== 'number' || data.priceMinor < 0) {
    throw new CatalogOperationError('Price must be a non-negative integer in minor units', 'VALIDATION_ERROR');
  }

  const service = await prisma.service.create({
    data: {
      categoryId,
      name,
      durationMinutes: data.durationMinutes ?? 30,
      priceMinor: Math.round(data.priceMinor),
      isAvailable: data.isAvailable ?? true,
    },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_SERVICE_CREATED',
    entityType: 'Service',
    entityId: service.id,
    newState: { name: service.name, priceMinor: service.priceMinor, durationMinutes: service.durationMinutes },
  });

  return service;
}

export async function updateService(
  ctx: TenantContext,
  serviceId: string,
  data: UpdateServiceInput
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { category: true },
  });

  if (!existing || existing.category.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Service not found', 'NOT_FOUND');
  }

  if (data.categoryId && data.categoryId !== existing.categoryId) {
    const targetCat = await prisma.serviceCategory.findUnique({
      where: { id: data.categoryId },
    });
    if (!targetCat || targetCat.businessId !== ctx.businessId) {
      throw new CatalogOperationError('Target category not found in this business', 'NOT_FOUND');
    }
  }

  if (data.priceMinor !== undefined && (typeof data.priceMinor !== 'number' || data.priceMinor < 0)) {
    throw new CatalogOperationError('Price must be a non-negative integer in minor units', 'VALIDATION_ERROR');
  }

  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      durationMinutes: data.durationMinutes !== undefined ? data.durationMinutes : undefined,
      priceMinor: data.priceMinor !== undefined ? Math.round(data.priceMinor) : undefined,
      isAvailable: data.isAvailable !== undefined ? data.isAvailable : undefined,
      categoryId: data.categoryId !== undefined ? data.categoryId : undefined,
    },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_SERVICE_UPDATED',
    entityType: 'Service',
    entityId: serviceId,
    previousState: { name: existing.name, priceMinor: existing.priceMinor },
    newState: { name: updated.name, priceMinor: updated.priceMinor },
  });

  return updated;
}

export async function toggleServiceAvailability(
  ctx: TenantContext,
  serviceId: string,
  isAvailable: boolean
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { category: true },
  });

  if (!existing || existing.category.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Service not found', 'NOT_FOUND');
  }

  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: { isAvailable },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_SERVICE_AVAILABILITY_TOGGLED',
    entityType: 'Service',
    entityId: serviceId,
    previousState: { isAvailable: existing.isAvailable },
    newState: { isAvailable },
  });

  return updated;
}

export async function deleteService(ctx: TenantContext, serviceId: string) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { category: true },
  });

  if (!existing || existing.category.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Service not found', 'NOT_FOUND');
  }

  await prisma.service.delete({
    where: { id: serviceId },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_SERVICE_DELETED',
    entityType: 'Service',
    entityId: serviceId,
    previousState: { name: existing.name },
  });

  return { success: true };
}

// ============================================================================
// 3. PRODUCT MANAGEMENT
// ============================================================================

export async function getBusinessProducts(
  ctx: TenantContext,
  filter?: { search?: string; categoryId?: string; isAvailable?: boolean }
) {
  requirePermission(ctx, 'CATALOG_VIEW');

  return prisma.productCategory.findMany({
    where: {
      businessId: ctx.businessId,
      id: filter?.categoryId ? filter.categoryId : undefined,
    },
    include: {
      products: {
        where: {
          isAvailable: filter?.isAvailable !== undefined ? filter.isAvailable : undefined,
          OR: filter?.search
            ? [
                { name: { contains: filter.search, mode: 'insensitive' } },
                { sku: { contains: filter.search, mode: 'insensitive' } },
              ]
            : undefined,
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createProductCategory(
  ctx: TenantContext,
  data: { name: string; sortOrder?: number }
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const name = data.name?.trim();
  if (!name) {
    throw new CatalogOperationError('Category name is required', 'VALIDATION_ERROR');
  }

  const count = await prisma.productCategory.count({ where: { businessId: ctx.businessId } });
  const category = await prisma.productCategory.create({
    data: {
      businessId: ctx.businessId,
      name,
      sortOrder: data.sortOrder ?? count + 1,
    },
    include: { products: true },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_PRODUCT_CATEGORY_CREATED',
    entityType: 'ProductCategory',
    entityId: category.id,
    newState: { name: category.name },
  });

  return category;
}

export async function updateProductCategory(
  ctx: TenantContext,
  categoryId: string,
  data: { name?: string; sortOrder?: number }
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.productCategory.findUnique({
    where: { id: categoryId },
  });

  if (!existing || existing.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Product category not found', 'NOT_FOUND');
  }

  const updated = await prisma.productCategory.update({
    where: { id: categoryId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      sortOrder: data.sortOrder !== undefined ? data.sortOrder : undefined,
    },
    include: { products: true },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_PRODUCT_CATEGORY_UPDATED',
    entityType: 'ProductCategory',
    entityId: categoryId,
    previousState: { name: existing.name, sortOrder: existing.sortOrder },
    newState: { name: updated.name, sortOrder: updated.sortOrder },
  });

  return updated;
}

export async function deleteProductCategory(ctx: TenantContext, categoryId: string) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.productCategory.findUnique({
    where: { id: categoryId },
  });

  if (!existing || existing.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Product category not found', 'NOT_FOUND');
  }

  await prisma.productCategory.delete({
    where: { id: categoryId },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_PRODUCT_CATEGORY_DELETED',
    entityType: 'ProductCategory',
    entityId: categoryId,
    previousState: { name: existing.name },
  });

  return { success: true };
}

export async function reorderProductCategories(
  ctx: TenantContext,
  categoryIds: string[]
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  await prisma.$transaction(
    categoryIds.map((id, index) =>
      prisma.productCategory.updateMany({
        where: { id, businessId: ctx.businessId },
        data: { sortOrder: index + 1 },
      })
    )
  );

  return prisma.productCategory.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { sortOrder: 'asc' },
    include: { products: true },
  });
}

export async function createProduct(
  ctx: TenantContext,
  categoryId: string,
  data: CreateProductInput
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const category = await prisma.productCategory.findUnique({
    where: { id: categoryId },
  });

  if (!category || category.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Product category not found', 'NOT_FOUND');
  }

  const name = data.name?.trim();
  if (!name) {
    throw new CatalogOperationError('Product name is required', 'VALIDATION_ERROR');
  }

  if (typeof data.priceMinor !== 'number' || data.priceMinor < 0) {
    throw new CatalogOperationError('Price must be a non-negative integer in minor units', 'VALIDATION_ERROR');
  }

  const product = await prisma.product.create({
    data: {
      categoryId,
      name,
      sku: data.sku?.trim() || null,
      priceMinor: Math.round(data.priceMinor),
      stockQuantity: data.stockQuantity ?? 0,
      isAvailable: data.isAvailable ?? true,
    },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_PRODUCT_CREATED',
    entityType: 'Product',
    entityId: product.id,
    newState: { name: product.name, priceMinor: product.priceMinor, sku: product.sku },
  });

  return product;
}

export async function updateProduct(
  ctx: TenantContext,
  productId: string,
  data: UpdateProductInput
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });

  if (!existing || existing.category.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Product not found', 'NOT_FOUND');
  }

  if (data.categoryId && data.categoryId !== existing.categoryId) {
    const targetCat = await prisma.productCategory.findUnique({
      where: { id: data.categoryId },
    });
    if (!targetCat || targetCat.businessId !== ctx.businessId) {
      throw new CatalogOperationError('Target category not found in this business', 'NOT_FOUND');
    }
  }

  if (data.priceMinor !== undefined && (typeof data.priceMinor !== 'number' || data.priceMinor < 0)) {
    throw new CatalogOperationError('Price must be a non-negative integer in minor units', 'VALIDATION_ERROR');
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      sku: data.sku !== undefined ? data.sku?.trim() || null : undefined,
      priceMinor: data.priceMinor !== undefined ? Math.round(data.priceMinor) : undefined,
      stockQuantity: data.stockQuantity !== undefined ? data.stockQuantity : undefined,
      isAvailable: data.isAvailable !== undefined ? data.isAvailable : undefined,
      categoryId: data.categoryId !== undefined ? data.categoryId : undefined,
    },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_PRODUCT_UPDATED',
    entityType: 'Product',
    entityId: productId,
    previousState: { name: existing.name, priceMinor: existing.priceMinor },
    newState: { name: updated.name, priceMinor: updated.priceMinor },
  });

  return updated;
}

export async function toggleProductAvailability(
  ctx: TenantContext,
  productId: string,
  isAvailable: boolean
) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });

  if (!existing || existing.category.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Product not found', 'NOT_FOUND');
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { isAvailable },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_PRODUCT_AVAILABILITY_TOGGLED',
    entityType: 'Product',
    entityId: productId,
    previousState: { isAvailable: existing.isAvailable },
    newState: { isAvailable },
  });

  return updated;
}

export async function deleteProduct(ctx: TenantContext, productId: string) {
  requirePermission(ctx, 'CATALOG_MANAGE');

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });

  if (!existing || existing.category.businessId !== ctx.businessId) {
    throw new CatalogOperationError('Product not found', 'NOT_FOUND');
  }

  await prisma.product.delete({
    where: { id: productId },
  });

  await createAuditLog(ctx, {
    action: 'CATALOG_PRODUCT_DELETED',
    entityType: 'Product',
    entityId: productId,
    previousState: { name: existing.name },
  });

  return { success: true };
}

// ============================================================================
// 4. AGGREGATED CATALOG OVERVIEW (ADMIN)
// ============================================================================

export async function getCatalogOverview(ctx: TenantContext): Promise<CatalogOverview> {
  requirePermission(ctx, 'CATALOG_VIEW');

  const [menus, serviceCategories, productCategories] = await Promise.all([
    prisma.menu.findMany({
      where: { businessId: ctx.businessId },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: {
            items: { orderBy: { name: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.serviceCategory.findMany({
      where: { businessId: ctx.businessId },
      include: {
        services: { orderBy: { name: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.productCategory.findMany({
      where: { businessId: ctx.businessId },
      include: {
        products: { orderBy: { name: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  let totalMenuItems = 0;
  for (const menu of menus) {
    for (const cat of menu.categories) {
      totalMenuItems += cat.items.length;
    }
  }

  let totalServices = 0;
  for (const sc of serviceCategories) {
    totalServices += sc.services.length;
  }

  let totalProducts = 0;
  for (const pc of productCategories) {
    totalProducts += pc.products.length;
  }

  return {
    menus: menus as any,
    serviceCategories: serviceCategories as any,
    productCategories: productCategories as any,
    totalMenuItems,
    totalServices,
    totalProducts,
  };
}

// ============================================================================
// 5. CUSTOMER PWA READ-ONLY CATALOG
// ============================================================================

export async function getCustomerCatalog(customerCtx: { businessId: string } | CustomerSessionContext): Promise<CustomerCatalogData> {
  const businessId = customerCtx.businessId;

  const [business, menus, serviceCategories, productCategories] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        category: true,
        themePreset: true,
        primaryColor: true,
        secondaryColor: true,
        logo: true,
        currency: true,
      },
    }),
    prisma.menu.findMany({
      where: {
        businessId,
        isActive: true,
      },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: {
            items: {
              where: { isAvailable: true },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.serviceCategory.findMany({
      where: { businessId },
      include: {
        services: {
          where: { isAvailable: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.productCategory.findMany({
      where: { businessId },
      include: {
        products: {
          where: { isAvailable: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  return {
    business: business || {
      id: businessId,
      name: 'Business Catalog',
    },
    menus: menus as any,
    serviceCategories: serviceCategories as any,
    productCategories: productCategories as any,
  };
}
