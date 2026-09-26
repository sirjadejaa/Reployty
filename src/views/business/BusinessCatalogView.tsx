import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UtensilsCrossed,
  Scissors,
  Package,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Edit2,
  Trash2,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import { useTenant } from '../../context/TenantContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  CatalogTab,
  CatalogOverview,
  MenuData,
  MenuItemData,
  ServiceData,
  ProductData,
} from '../../types/catalog';

export interface BusinessCatalogViewProps {
  onNavigate?: (route: string) => void;
}

export const BusinessCatalogView: React.FC<BusinessCatalogViewProps> = () => {
  const { currentBusiness } = useTenant();
  const isMobile = useIsMobile();

  // Determine initial tab based on business category
  const initialTab = useMemo<CatalogTab>(() => {
    const cat = currentBusiness?.category?.toUpperCase() || '';
    if (cat.includes('SALON') || cat.includes('SPA') || cat.includes('GYM')) {
      return 'services';
    }
    if (cat.includes('RETAIL') || cat.includes('STORE')) {
      return 'products';
    }
    return 'menu';
  }, [currentBusiness]);

  const [activeTab, setActiveTab] = useState<CatalogTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<CatalogOverview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'AVAILABLE' | 'UNAVAILABLE'>('ALL');

  // Modals state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string; type: CatalogTab; menuId?: string } | null>(null);
  const [categoryName, setCategoryName] = useState('');

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    categoryId: '',
    price: '', // in standard currency units (e.g. 180.00)
    description: '',
    durationMinutes: '30',
    sku: '',
    stockQuantity: '0',
    isAvailable: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Currency symbol helper
  const currencySymbol = useMemo(() => {
    return (currentBusiness as any)?.currency === 'USD' ? '$' : '₹';
  }, [currentBusiness]);

  // Load catalog overview
  const fetchCatalog = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch('/api/business/catalog/overview');
      if (!res.ok) {
        throw new Error('Failed to load catalog overview');
      }
      const data: CatalogOverview = await res.json();
      setCatalog(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error connecting to catalog service');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4000);
    } else {
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  // Active Menu helper (uses the first active menu or first available)
  const activeMenu = useMemo<MenuData | null>(() => {
    if (!catalog?.menus || catalog.menus.length === 0) return null;
    return catalog.menus.find((m) => m.isActive) || catalog.menus[0];
  }, [catalog]);

  // Current categories for the active tab
  const currentCategories = useMemo(() => {
    if (!catalog) return [];
    if (activeTab === 'menu') {
      return activeMenu?.categories || [];
    }
    if (activeTab === 'services') {
      return catalog.serviceCategories || [];
    }
    return catalog.productCategories || [];
  }, [catalog, activeTab, activeMenu]);

  // Flattened items for the active tab
  const allCurrentItems = useMemo(() => {
    if (!catalog) return [];
    if (activeTab === 'menu') {
      const items: (MenuItemData & { categoryName: string; type: 'menu' })[] = [];
      if (activeMenu?.categories) {
        for (const cat of activeMenu.categories) {
          for (const item of cat.items) {
            items.push({ ...item, categoryName: cat.name, type: 'menu' });
          }
        }
      }
      return items;
    }
    if (activeTab === 'services') {
      const items: (ServiceData & { categoryName: string; type: 'services' })[] = [];
      for (const cat of catalog.serviceCategories) {
        for (const svc of cat.services) {
          items.push({ ...svc, categoryName: cat.name, type: 'services' });
        }
      }
      return items;
    }
    // Products
    const items: (ProductData & { categoryName: string; type: 'products' })[] = [];
    for (const cat of catalog.productCategories) {
      for (const prod of cat.products) {
        items.push({ ...prod, categoryName: cat.name, type: 'products' });
      }
    }
    return items;
  }, [catalog, activeTab, activeMenu]);

  // Filtered items based on search and filters
  const filteredItems = useMemo(() => {
    return allCurrentItems.filter((item: any) => {
      // Search
      const matchesSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.categoryName.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Category
      if (selectedCategoryFilter !== 'ALL' && item.categoryId !== selectedCategoryFilter) {
        return false;
      }

      // Availability
      if (availabilityFilter === 'AVAILABLE' && !item.isAvailable) return false;
      if (availabilityFilter === 'UNAVAILABLE' && item.isAvailable) return false;

      return true;
    });
  }, [allCurrentItems, searchQuery, selectedCategoryFilter, availabilityFilter]);

  // Handle Availability Toggle
  const handleToggleAvailability = async (item: any) => {
    const newStatus = !item.isAvailable;
    const itemType = activeTab;

    try {
      let endpoint = '';
      if (itemType === 'menu') {
        endpoint = `/api/business/catalog/menu-items/${item.id}/availability`;
      } else if (itemType === 'services') {
        endpoint = `/api/business/catalog/services/${item.id}/availability`;
      } else {
        endpoint = `/api/business/catalog/products/${item.id}/availability`;
      }

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: newStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update availability');
      }

      showNotification(`${item.name} is now ${newStatus ? 'available' : 'unavailable'}`);
      fetchCatalog();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  // Open Add Category Modal
  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    setCategoryName('');
    setCategoryModalOpen(true);
  };

  // Open Edit Category Modal
  const handleOpenEditCategory = (cat: any) => {
    setEditingCategory({ id: cat.id, name: cat.name, type: activeTab });
    setCategoryName(cat.name);
    setCategoryModalOpen(true);
  };

  // Save Category
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) {
      showNotification('Category name is required', true);
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingCategory) {
        // Update
        let endpoint = '';
        if (activeTab === 'menu') endpoint = `/api/business/catalog/menu-categories/${editingCategory.id}`;
        else if (activeTab === 'services') endpoint = `/api/business/catalog/service-categories/${editingCategory.id}`;
        else endpoint = `/api/business/catalog/product-categories/${editingCategory.id}`;

        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: categoryName.trim() }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update category');
        }
        showNotification('Category updated successfully');
      } else {
        // Create
        let endpoint = '';
        let body: any = { name: categoryName.trim() };

        if (activeTab === 'menu') {
          if (!activeMenu) throw new Error('No menu found. Please create a menu first.');
          endpoint = `/api/business/catalog/menus/${activeMenu.id}/categories`;
        } else if (activeTab === 'services') {
          endpoint = '/api/business/catalog/service-categories';
        } else {
          endpoint = '/api/business/catalog/product-categories';
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create category');
        }
        showNotification('Category created successfully');
      }

      setCategoryModalOpen(false);
      setCategoryName('');
      setEditingCategory(null);
      fetchCatalog();
    } catch (err: any) {
      showNotification(err.message, true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (cat: any) => {
    if (!window.confirm(`Are you sure you want to delete category "${cat.name}"? Items inside this category may also be removed.`)) {
      return;
    }

    try {
      let endpoint = '';
      if (activeTab === 'menu') endpoint = `/api/business/catalog/menu-categories/${cat.id}`;
      else if (activeTab === 'services') endpoint = `/api/business/catalog/service-categories/${cat.id}`;
      else endpoint = `/api/business/catalog/product-categories/${cat.id}`;

      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete category');
      }

      showNotification('Category deleted');
      fetchCatalog();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  // Category Reorder
  const handleMoveCategory = async (catIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? catIndex - 1 : catIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentCategories.length) return;

    const reordered = [...currentCategories];
    const temp = reordered[catIndex];
    reordered[catIndex] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const orderedIds = reordered.map((c) => c.id);

    try {
      let endpoint = '';
      if (activeTab === 'menu') {
        if (!activeMenu) return;
        endpoint = `/api/business/catalog/menus/${activeMenu.id}/categories/reorder`;
      } else if (activeTab === 'services') {
        endpoint = '/api/business/catalog/service-categories/reorder';
      } else {
        endpoint = '/api/business/catalog/product-categories/reorder';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedCategoryIds: orderedIds }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reorder categories');
      }

      fetchCatalog();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  // Open Add Item Modal
  const handleOpenAddItem = () => {
    setEditingItemId(null);
    setItemForm({
      name: '',
      categoryId: currentCategories[0]?.id || '',
      price: '',
      description: '',
      durationMinutes: '30',
      sku: '',
      stockQuantity: '0',
      isAvailable: true,
    });
    setItemModalOpen(true);
  };

  // Open Edit Item Modal
  const handleOpenEditItem = (item: any) => {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      categoryId: item.categoryId,
      price: (item.priceMinor / 100).toFixed(2),
      description: item.description || '',
      durationMinutes: String(item.durationMinutes || 30),
      sku: item.sku || '',
      stockQuantity: String(item.stockQuantity || 0),
      isAvailable: item.isAvailable,
    });
    setItemModalOpen(true);
  };

  // Save Item (Create or Update)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.name.trim()) {
      showNotification('Item name is required', true);
      return;
    }
    if (!itemForm.categoryId) {
      showNotification('Please select a category', true);
      return;
    }
    const numPrice = parseFloat(itemForm.price);
    if (isNaN(numPrice) || numPrice < 0) {
      showNotification('Please enter a valid non-negative price', true);
      return;
    }

    try {
      setIsSubmitting(true);
      const priceMinor = Math.round(numPrice * 100);

      if (editingItemId) {
        // Update item
        let endpoint = '';
        let body: any = {
          name: itemForm.name.trim(),
          categoryId: itemForm.categoryId,
          priceMinor,
          isAvailable: itemForm.isAvailable,
        };

        if (activeTab === 'menu') {
          endpoint = `/api/business/catalog/menu-items/${editingItemId}`;
          body.description = itemForm.description.trim() || null;
        } else if (activeTab === 'services') {
          endpoint = `/api/business/catalog/services/${editingItemId}`;
          body.durationMinutes = parseInt(itemForm.durationMinutes) || 30;
        } else {
          endpoint = `/api/business/catalog/products/${editingItemId}`;
          body.sku = itemForm.sku.trim() || null;
          body.stockQuantity = parseInt(itemForm.stockQuantity) || 0;
        }

        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update item');
        }
        showNotification('Item updated successfully');
      } else {
        // Create item
        let endpoint = '';
        let body: any = {
          name: itemForm.name.trim(),
          categoryId: itemForm.categoryId,
          priceMinor,
          isAvailable: itemForm.isAvailable,
        };

        if (activeTab === 'menu') {
          endpoint = `/api/business/catalog/menu-categories/${itemForm.categoryId}/items`;
          body.description = itemForm.description.trim() || null;
        } else if (activeTab === 'services') {
          endpoint = '/api/business/catalog/services';
          body.durationMinutes = parseInt(itemForm.durationMinutes) || 30;
        } else {
          endpoint = '/api/business/catalog/products';
          body.sku = itemForm.sku.trim() || null;
          body.stockQuantity = parseInt(itemForm.stockQuantity) || 0;
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create item');
        }
        showNotification('Item created successfully');
      }

      setItemModalOpen(false);
      setEditingItemId(null);
      fetchCatalog();
    } catch (err: any) {
      showNotification(err.message, true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Item
  const handleDeleteItem = async (item: any) => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"?`)) return;

    try {
      let endpoint = '';
      if (activeTab === 'menu') endpoint = `/api/business/catalog/menu-items/${item.id}`;
      else if (activeTab === 'services') endpoint = `/api/business/catalog/services/${item.id}`;
      else endpoint = `/api/business/catalog/products/${item.id}`;

      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete item');
      }

      showNotification(`${item.name} deleted`);
      fetchCatalog();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      {/* Alerts */}
      {errorMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#FEE2E2',
            color: '#B91C1C',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#DCFCE7',
            color: '#15803D',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Header & Metrics */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              Menu & Catalog
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-primary-light, #EFF6FF)',
                color: 'var(--color-primary, #2563EB)',
                textTransform: 'uppercase',
              }}
            >
              {currentBusiness?.category || 'General'}
            </span>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
            Manage offerings, prices, and categories across Menus, Services, and Retail products.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', width: isMobile ? '100%' : 'auto' }}>
          <Button
            variant="outline"
            onClick={handleOpenAddCategory}
            style={{ flex: isMobile ? 1 : 'initial' }}
            leftIcon={<Layers size={16} />}
          >
            Add Category
          </Button>
          <Button
            variant="primary"
            onClick={handleOpenAddItem}
            style={{ flex: isMobile ? 1 : 'initial' }}
            leftIcon={<Plus size={16} />}
            disabled={currentCategories.length === 0}
          >
            Add Item
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 'var(--space-4)',
        }}
      >
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)' }}>
            <UtensilsCrossed size={16} />
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Menu Items</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px' }}>
            {catalog?.totalMenuItems ?? 0}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)' }}>
            <Scissors size={16} />
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Services</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px' }}>
            {catalog?.totalServices ?? 0}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)' }}>
            <Package size={16} />
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Products</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px' }}>
            {catalog?.totalProducts ?? 0}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)' }}>
            <Layers size={16} />
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Active Categories</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px' }}>
            {currentCategories.length}
          </div>
        </Card>
      </div>

      {/* Segmented Control Tabs */}
      <div
        style={{
          display: 'flex',
          backgroundColor: 'var(--color-bg-secondary, #F1F5F9)',
          padding: '4px',
          borderRadius: '10px',
          width: isMobile ? '100%' : 'fit-content',
        }}
      >
        <button
          onClick={() => {
            setActiveTab('menu');
            setSelectedCategoryFilter('ALL');
          }}
          style={{
            flex: isMobile ? 1 : 'initial',
            padding: '8px 20px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'menu' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'menu' ? 'var(--color-text, #0F172A)' : 'var(--color-text-secondary, #64748B)',
            fontWeight: activeTab === 'menu' ? 700 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: activeTab === 'menu' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <UtensilsCrossed size={16} />
          <span>Menu</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('services');
            setSelectedCategoryFilter('ALL');
          }}
          style={{
            flex: isMobile ? 1 : 'initial',
            padding: '8px 20px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'services' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'services' ? 'var(--color-text, #0F172A)' : 'var(--color-text-secondary, #64748B)',
            fontWeight: activeTab === 'services' ? 700 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: activeTab === 'services' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Scissors size={16} />
          <span>Services</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('products');
            setSelectedCategoryFilter('ALL');
          }}
          style={{
            flex: isMobile ? 1 : 'initial',
            padding: '8px 20px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'products' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'products' ? 'var(--color-text, #0F172A)' : 'var(--color-text-secondary, #64748B)',
            fontWeight: activeTab === 'products' ? 700 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: activeTab === 'products' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Package size={16} />
          <span>Products</span>
        </button>
      </div>

      {/* Category Pills / Ordering bar */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="var(--color-primary, #2563EB)" />
            <span style={{ fontWeight: 700, fontSize: '15px' }}>
              {activeTab === 'menu' ? 'Menu Categories' : activeTab === 'services' ? 'Service Categories' : 'Product Categories'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              ({currentCategories.length})
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleOpenAddCategory} leftIcon={<Plus size={14} />}>
            New Category
          </Button>
        </div>

        {currentCategories.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            No categories defined yet. Create your first category above to begin adding items.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {currentCategories.map((cat, idx) => {
              const itemCount = (cat as any).items?.length ?? (cat as any).services?.length ?? (cat as any).products?.length ?? 0;
              return (
                <div
                  key={cat.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    backgroundColor: selectedCategoryFilter === cat.id ? 'var(--color-primary-light, #EFF6FF)' : 'var(--color-bg-secondary, #F8FAFC)',
                    border: `1px solid ${selectedCategoryFilter === cat.id ? 'var(--color-primary, #2563EB)' : 'var(--color-border, #E2E8F0)'}`,
                    fontSize: '13px',
                  }}
                >
                  <button
                    onClick={() => setSelectedCategoryFilter(selectedCategoryFilter === cat.id ? 'ALL' : cat.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontWeight: selectedCategoryFilter === cat.id ? 700 : 500,
                      color: selectedCategoryFilter === cat.id ? 'var(--color-primary, #2563EB)' : 'var(--color-text, #0F172A)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{cat.name}</span>
                    <span style={{ fontSize: '11px', opacity: 0.75 }}>({itemCount})</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '6px' }}>
                    <button
                      onClick={() => handleMoveCategory(idx, 'up')}
                      disabled={idx === 0}
                      title="Move Up"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: idx === 0 ? 'default' : 'pointer',
                        opacity: idx === 0 ? 0.3 : 0.7,
                        padding: '2px',
                      }}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => handleMoveCategory(idx, 'down')}
                      disabled={idx === currentCategories.length - 1}
                      title="Move Down"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: idx === currentCategories.length - 1 ? 'default' : 'pointer',
                        opacity: idx === currentCategories.length - 1 ? 0.3 : 0.7,
                        padding: '2px',
                      }}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => handleOpenEditCategory(cat)}
                      title="Edit Category Name"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, padding: '2px' }}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat)}
                      title="Delete Category"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, padding: '2px', color: '#DC2626' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 'var(--space-3)',
          alignItems: 'stretch',
        }}
      >
        <div style={{ flex: 1 }}>
          <Input
            placeholder={`Search ${activeTab === 'menu' ? 'menu items' : activeTab === 'services' ? 'services' : 'products'}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={16} />}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #E2E8F0)',
              backgroundColor: '#FFFFFF',
              fontSize: '14px',
              color: 'var(--color-text, #0F172A)',
            }}
          >
            <option value="ALL">All Categories</option>
            {currentCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as any)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #E2E8F0)',
              backgroundColor: '#FFFFFF',
              fontSize: '14px',
              color: 'var(--color-text, #0F172A)',
            }}
          >
            <option value="ALL">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </select>
        </div>
      </div>

      {/* Content Area: Items Listing */}
      {loading ? (
        <Card style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', color: 'var(--color-text-secondary)' }}>
            Loading catalog data...
          </div>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: 'var(--color-bg-secondary, #F8FAFC)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              color: 'var(--color-text-secondary)',
            }}
          >
            {activeTab === 'menu' ? <UtensilsCrossed size={28} /> : activeTab === 'services' ? <Scissors size={28} /> : <Package size={28} />}
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0' }}>
            No {activeTab} items found
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 16px 0', fontSize: '14px' }}>
            {currentCategories.length === 0
              ? 'Start by creating a category for your business.'
              : 'Add your first item or adjust your search filter.'}
          </p>
          {currentCategories.length === 0 ? (
            <Button variant="primary" onClick={handleOpenAddCategory} leftIcon={<Plus size={16} />}>
              Create Category
            </Button>
          ) : (
            <Button variant="primary" onClick={handleOpenAddItem} leftIcon={<Plus size={16} />}>
              Add First {activeTab === 'menu' ? 'Menu Item' : activeTab === 'services' ? 'Service' : 'Product'}
            </Button>
          )}
        </Card>
      ) : (
        /* Items Grid / Table */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredItems.map((item: any) => (
            <Card
              key={item.id}
              style={{
                padding: '16px 20px',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: '12px',
                borderLeft: `4px solid ${item.isAvailable ? 'var(--color-success, #10B981)' : '#94A3B8'}`,
              }}
            >
              {/* Item Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text, #0F172A)' }}>
                    {item.name}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--color-bg-secondary, #F1F5F9)',
                      color: 'var(--color-text-secondary, #64748B)',
                    }}
                  >
                    {item.categoryName}
                  </span>
                  {/* Service duration badge */}
                  {item.durationMinutes && (
                    <span
                      style={{
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        color: 'var(--color-text-secondary, #64748B)',
                      }}
                    >
                      <Clock size={12} />
                      {item.durationMinutes} min
                    </span>
                  )}
                  {/* Product SKU badge */}
                  {item.sku && (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #64748B)' }}>
                      SKU: {item.sku}
                    </span>
                  )}
                </div>

                {/* Description or details */}
                {item.description && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #64748B)' }}>
                    {item.description}
                  </p>
                )}

                {/* Product stock indicator */}
                {activeTab === 'products' && (
                  <div style={{ fontSize: '12px', marginTop: '4px', color: item.stockQuantity > 0 ? '#15803D' : '#DC2626' }}>
                    Stock: {item.stockQuantity} units
                  </div>
                )}
              </div>

              {/* Price & Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isMobile ? 'space-between' : 'flex-end',
                  width: isMobile ? '100%' : 'auto',
                  gap: '16px',
                  paddingTop: isMobile ? '8px' : 0,
                  borderTop: isMobile ? '1px solid var(--color-border, #E2E8F0)' : 'none',
                }}
              >
                {/* Price Display */}
                <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text, #0F172A)' }}>
                    {currencySymbol}{(item.priceMinor / 100).toFixed(2)}
                  </div>
                  <div style={{ fontSize: '11px', color: item.isAvailable ? '#15803D' : '#94A3B8', fontWeight: 600 }}>
                    {item.isAvailable ? 'Available' : 'Unavailable'}
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Toggle availability switch */}
                  <Button
                    variant={item.isAvailable ? 'outline' : 'secondary'}
                    size="sm"
                    onClick={() => handleToggleAvailability(item)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    {item.isAvailable ? 'Set Unavailable' : 'Set Available'}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => handleOpenEditItem(item)}
                    title="Edit Item"
                  >
                    <Edit2 size={15} />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => handleDeleteItem(item)}
                    title="Delete Item"
                  >
                    <Trash2 size={15} color="#DC2626" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Category Create/Edit Modal */}
      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={editingCategory ? 'Edit Category' : `New ${activeTab === 'menu' ? 'Menu' : activeTab === 'services' ? 'Service' : 'Product'} Category`}
      >
        <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Category Name *
            </label>
            <Input
              placeholder="e.g. Espresso Drinks, Hair Treatments, Beverages"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button variant="outline" type="button" onClick={() => setCategoryModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {editingCategory ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Item Create/Edit Modal */}
      <Modal
        isOpen={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={
          editingItemId
            ? `Edit ${activeTab === 'menu' ? 'Menu Item' : activeTab === 'services' ? 'Service' : 'Product'}`
            : `Add New ${activeTab === 'menu' ? 'Menu Item' : activeTab === 'services' ? 'Service' : 'Product'}`
        }
      >
        <form onSubmit={handleSaveItem} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Name *
            </label>
            <Input
              placeholder={`e.g. ${activeTab === 'menu' ? 'Artisan Cappuccino' : activeTab === 'services' ? 'Deluxe Hair Spa' : 'Organic Coffee Beans 250g'}`}
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Category *
            </label>
            <select
              value={itemForm.categoryId}
              onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border, #E2E8F0)',
                backgroundColor: '#FFFFFF',
                fontSize: '14px',
              }}
            >
              {currentCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Price ({currencySymbol}) *
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={itemForm.price}
              onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
              required
            />
          </div>

          {activeTab === 'menu' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Description (Optional)
              </label>
              <Textarea
                placeholder="Describe ingredients, preparation, or highlights..."
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                rows={3}
              />
            </div>
          )}

          {activeTab === 'services' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Duration (Minutes)
              </label>
              <Input
                type="number"
                min="1"
                step="5"
                placeholder="30"
                value={itemForm.durationMinutes}
                onChange={(e) => setItemForm({ ...itemForm, durationMinutes: e.target.value })}
              />
            </div>
          )}

          {activeTab === 'products' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  SKU (Stock Keeping Unit)
                </label>
                <Input
                  placeholder="e.g. BEAN-DARK-250G"
                  value={itemForm.sku}
                  onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Stock Quantity
                </label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={itemForm.stockQuantity}
                  onChange={(e) => setItemForm({ ...itemForm, stockQuantity: e.target.value })}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <input
              type="checkbox"
              id="isAvailableCheckbox"
              checked={itemForm.isAvailable}
              onChange={(e) => setItemForm({ ...itemForm, isAvailable: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--color-primary, #2563EB)' }}
            />
            <label htmlFor="isAvailableCheckbox" style={{ fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
              Item is currently available to customers
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button variant="outline" type="button" onClick={() => setItemModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {editingItemId ? 'Update Item' : 'Create Item'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
