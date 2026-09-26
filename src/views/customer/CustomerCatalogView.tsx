import React, { useState, useEffect, useMemo } from 'react';
import {
  UtensilsCrossed,
  Scissors,
  Package,
  Search,
  Clock,
  Sparkles,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { CustomerCatalogData } from '../../types/catalog';

interface CustomerCatalogViewProps {
  onNavigateTab?: (tab: 'home' | 'loyalty' | 'rewards' | 'catalog' | 'activity' | 'profile') => void;
}

export const CustomerCatalogView: React.FC<CustomerCatalogViewProps> = () => {
  const { business } = useCustomerAuth();
  const primaryColor = business?.primaryColor || '#4F6BFF';

  const [catalog, setCatalog] = useState<CustomerCatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<'all' | 'menu' | 'services' | 'products'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/customer/catalog');
        if (!res.ok) {
          throw new Error('Failed to load catalog');
        }
        const data: CustomerCatalogData = await res.json();
        setCatalog(data);
      } catch (err: any) {
        setError(err.message || 'Unable to load menu and catalog at this time');
      } finally {
        setLoading(false);
      }
    };

    fetchCatalog();
  }, []);

  const currencySymbol = useMemo(() => {
    return catalog?.business?.currency === 'USD' ? '$' : '₹';
  }, [catalog]);

  // Aggregate categories
  const allCategories = useMemo(() => {
    const list: { id: string; name: string; type: 'menu' | 'services' | 'products' }[] = [];
    if (!catalog) return list;

    if (catalog.menus) {
      for (const m of catalog.menus) {
        for (const cat of m.categories) {
          list.push({ id: cat.id, name: cat.name, type: 'menu' });
        }
      }
    }
    if (catalog.serviceCategories) {
      for (const cat of catalog.serviceCategories) {
        list.push({ id: cat.id, name: cat.name, type: 'services' });
      }
    }
    if (catalog.productCategories) {
      for (const cat of catalog.productCategories) {
        list.push({ id: cat.id, name: cat.name, type: 'products' });
      }
    }
    return list;
  }, [catalog]);

  // Aggregate items
  const allItems = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      description?: string | null;
      priceMinor: number;
      categoryId: string;
      categoryName: string;
      type: 'menu' | 'services' | 'products';
      durationMinutes?: number;
      sku?: string | null;
      stockQuantity?: number;
    }> = [];

    if (!catalog) return items;

    if (catalog.menus) {
      for (const m of catalog.menus) {
        for (const cat of m.categories) {
          for (const item of cat.items) {
            items.push({
              id: item.id,
              name: item.name,
              description: item.description,
              priceMinor: item.priceMinor,
              categoryId: cat.id,
              categoryName: cat.name,
              type: 'menu',
            });
          }
        }
      }
    }

    if (catalog.serviceCategories) {
      for (const cat of catalog.serviceCategories) {
        for (const svc of cat.services) {
          items.push({
            id: svc.id,
            name: svc.name,
            priceMinor: svc.priceMinor,
            categoryId: cat.id,
            categoryName: cat.name,
            type: 'services',
            durationMinutes: svc.durationMinutes,
          });
        }
      }
    }

    if (catalog.productCategories) {
      for (const cat of catalog.productCategories) {
        for (const prod of cat.products) {
          items.push({
            id: prod.id,
            name: prod.name,
            priceMinor: prod.priceMinor,
            categoryId: cat.id,
            categoryName: cat.name,
            type: 'products',
            sku: prod.sku,
            stockQuantity: prod.stockQuantity,
          });
        }
      }
    }

    return items;
  }, [catalog]);

  // Filter items
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Type filter
      if (selectedSection !== 'all' && item.type !== selectedSection) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query) || false;
        const matchesCategory = item.categoryName.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesCategory) return false;
      }
      return true;
    });
  }, [allItems, selectedSection, selectedCategory, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Catalog Header Banner */}
      <div
        style={{
          padding: '18px 20px',
          borderRadius: '16px',
          background: `linear-gradient(135deg, ${primaryColor}15 0%, #FFFFFF 100%)`,
          border: `1px solid ${primaryColor}25`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Sparkles size={16} color={primaryColor} />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: primaryColor,
            }}
          >
            Digital Catalog
          </span>
        </div>
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0', color: '#0F172A' }}>
          {business?.name ? `${business.name} Offerings` : 'Offerings & Menu'}
        </h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
          Browse fresh items, signature services, and products available at this location.
        </p>
      </div>

      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Search items, drinks, services..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px 10px 38px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF',
            fontSize: '14px',
            color: '#0F172A',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <Search
          size={16}
          color="#94A3B8"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
        />
      </div>

      {/* Type Section Pills */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          onClick={() => {
            setSelectedSection('all');
            setSelectedCategory('all');
          }}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            border: 'none',
            backgroundColor: selectedSection === 'all' ? primaryColor : '#F1F5F9',
            color: selectedSection === 'all' ? '#FFFFFF' : '#475569',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          All Offerings
        </button>

        {catalog?.menus && catalog.menus.length > 0 && (
          <button
            onClick={() => {
              setSelectedSection('menu');
              setSelectedCategory('all');
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: selectedSection === 'menu' ? primaryColor : '#F1F5F9',
              color: selectedSection === 'menu' ? '#FFFFFF' : '#475569',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <UtensilsCrossed size={13} />
            <span>Menu</span>
          </button>
        )}

        {catalog?.serviceCategories && catalog.serviceCategories.length > 0 && (
          <button
            onClick={() => {
              setSelectedSection('services');
              setSelectedCategory('all');
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: selectedSection === 'services' ? primaryColor : '#F1F5F9',
              color: selectedSection === 'services' ? '#FFFFFF' : '#475569',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Scissors size={13} />
            <span>Services</span>
          </button>
        )}

        {catalog?.productCategories && catalog.productCategories.length > 0 && (
          <button
            onClick={() => {
              setSelectedSection('products');
              setSelectedCategory('all');
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: selectedSection === 'products' ? primaryColor : '#F1F5F9',
              color: selectedSection === 'products' ? '#FFFFFF' : '#475569',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Package size={13} />
            <span>Products</span>
          </button>
        )}
      </div>

      {/* Category Horizontal Filter */}
      {allCategories.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            onClick={() => setSelectedCategory('all')}
            style={{
              padding: '4px 10px',
              borderRadius: '8px',
              border: selectedCategory === 'all' ? `1px solid ${primaryColor}` : '1px solid #E2E8F0',
              backgroundColor: selectedCategory === 'all' ? `${primaryColor}10` : '#FFFFFF',
              color: selectedCategory === 'all' ? primaryColor : '#64748B',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            All Categories
          </button>
          {allCategories
            .filter((c) => selectedSection === 'all' || c.type === selectedSection)
            .map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: selectedCategory === cat.id ? `1px solid ${primaryColor}` : '1px solid #E2E8F0',
                  backgroundColor: selectedCategory === cat.id ? `${primaryColor}10` : '#FFFFFF',
                  color: selectedCategory === cat.id ? primaryColor : '#64748B',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {cat.name}
              </button>
            ))}
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>
          Loading menu items...
        </div>
      ) : error ? (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: '#FEF2F2',
            color: '#B91C1C',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            backgroundColor: '#F8FAFC',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
              color: '#94A3B8',
            }}
          >
            <Layers size={22} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
            No items found
          </div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {searchQuery ? 'Try clearing your search query' : 'Check back soon for available offerings.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredItems.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #F1F5F9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                    {item.name}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#F1F5F9',
                      color: '#64748B',
                    }}
                  >
                    {item.categoryName}
                  </span>
                </div>

                {item.description && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
                    {item.description}
                  </p>
                )}

                {item.durationMinutes && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: '#94A3B8',
                      marginTop: '6px',
                    }}
                  >
                    <Clock size={12} />
                    <span>{item.durationMinutes} min session</span>
                  </div>
                )}
              </div>

              {/* Price badge */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 800,
                    color: primaryColor,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {currencySymbol}{(item.priceMinor / 100).toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
