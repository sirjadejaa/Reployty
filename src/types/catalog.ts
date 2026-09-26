export type CatalogTab = 'menu' | 'services' | 'products';

export interface MenuItemData {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceMinor: number;
  isAvailable: boolean;
  categoryName?: string;
}

export interface MenuCategoryData {
  id: string;
  menuId: string;
  name: string;
  sortOrder: number;
  items: MenuItemData[];
}

export interface MenuData {
  id: string;
  businessId: string;
  name: string;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  categories: MenuCategoryData[];
}

export interface ServiceData {
  id: string;
  categoryId: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
  isAvailable: boolean;
  categoryName?: string;
}

export interface ServiceCategoryData {
  id: string;
  businessId: string;
  name: string;
  sortOrder: number;
  services: ServiceData[];
}

export interface ProductData {
  id: string;
  categoryId: string;
  name: string;
  sku: string | null;
  priceMinor: number;
  stockQuantity: number;
  isAvailable: boolean;
  categoryName?: string;
}

export interface ProductCategoryData {
  id: string;
  businessId: string;
  name: string;
  sortOrder: number;
  products: ProductData[];
}

export interface CatalogOverview {
  menus: MenuData[];
  serviceCategories: ServiceCategoryData[];
  productCategories: ProductCategoryData[];
  totalMenuItems: number;
  totalServices: number;
  totalProducts: number;
}

export interface CreateMenuItemInput {
  categoryId?: string;
  name: string;
  description?: string | null;
  priceMinor: number;
  isAvailable?: boolean;
}

export interface UpdateMenuItemInput {
  name?: string;
  description?: string | null;
  priceMinor?: number;
  isAvailable?: boolean;
  categoryId?: string;
}

export interface CreateServiceInput {
  categoryId?: string;
  name: string;
  durationMinutes?: number;
  priceMinor: number;
  isAvailable?: boolean;
}

export interface UpdateServiceInput {
  name?: string;
  durationMinutes?: number;
  priceMinor?: number;
  isAvailable?: boolean;
  categoryId?: string;
}

export interface CreateProductInput {
  categoryId?: string;
  name: string;
  sku?: string | null;
  priceMinor: number;
  stockQuantity?: number;
  isAvailable?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  sku?: string | null;
  priceMinor?: number;
  stockQuantity?: number;
  isAvailable?: boolean;
  categoryId?: string;
}

export interface CustomerCatalogData {
  business: {
    id: string;
    name: string;
    category?: string | null;
    themePreset?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    logo?: string | null;
    currency?: string;
  };
  menus: MenuData[];
  serviceCategories: ServiceCategoryData[];
  productCategories: ProductCategoryData[];
}
