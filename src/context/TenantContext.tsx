import React, { createContext, useContext } from 'react';
import { Business, User, BusinessCategory } from '../types/tenant';
import { CATEGORY_THEME_PRESETS } from '../types/theme';
import { useAuth } from './AuthContext';

export const SAMPLE_BUSINESSES: Business[] = [
  {
    id: 'biz_cafe_01',
    name: 'The Roasted Bean Café',
    slug: 'roasted-bean-cafe',
    category: 'cafe',
    tagline: 'Craft coffee, fresh pastries & cozy vibes',
    address: '142 Market Street, Downtown',
    phone: '+1 (555) 234-5678',
    themeConfig: CATEGORY_THEME_PRESETS.cafe.theme,
    createdAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'biz_salon_02',
    name: 'Luxe & Glow Beauty Bar',
    slug: 'luxe-glow-beauty',
    category: 'salon',
    tagline: 'Premium hair, nail & organic spa care',
    address: '58 Pearl Boulevard, Suite B',
    phone: '+1 (555) 345-6789',
    themeConfig: CATEGORY_THEME_PRESETS.salon.theme,
    createdAt: '2026-02-10T10:00:00Z',
  },
];

interface TenantContextType {
  currentBusiness: Business;
  availableBusinesses: Business[];
  switchBusiness: (businessId: string) => Promise<void>;
  currentUser: User;
  activeCategory: BusinessCategory;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, currentBusiness: authBusiness, memberships, switchBusiness: authSwitchBusiness } = useAuth();

  // Map server memberships to client Business objects with theme presets
  const availableBusinesses: Business[] = memberships.length > 0
    ? memberships.map(m => {
        const cat = (m.category?.toLowerCase() || 'cafe') as BusinessCategory;
        const preset = CATEGORY_THEME_PRESETS[cat] || CATEGORY_THEME_PRESETS.cafe;
        return {
          id: m.businessId,
          name: m.businessName,
          slug: m.businessSlug || m.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          category: cat,
          tagline: `${m.businessName} Loyalty & Retention`,
          themeConfig: preset.theme,
          createdAt: new Date().toISOString(),
        };
      })
    : SAMPLE_BUSINESSES;

  const currentCategory = (authBusiness?.category?.toLowerCase() || 'cafe') as BusinessCategory;
  const currentPreset = CATEGORY_THEME_PRESETS[currentCategory] || CATEGORY_THEME_PRESETS.cafe;

  const currentBusiness: Business = authBusiness
    ? {
        id: authBusiness.id,
        name: authBusiness.name,
        slug: authBusiness.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        category: currentCategory,
        tagline: `${authBusiness.name} Loyalty & Retention`,
        themeConfig: currentPreset.theme,
        createdAt: new Date().toISOString(),
      }
    : availableBusinesses[0] || SAMPLE_BUSINESSES[0];

  const currentUser: User = user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || undefined,
        memberships: memberships.map(m => ({
          businessId: m.businessId,
          role: (m.role?.toLowerCase() || 'staff') as any,
          permissions: [],
        })),
      }
    : {
        id: 'usr_guest',
        name: 'Guest User',
        email: 'guest@reployty.com',
        memberships: [],
      };

  const switchBusiness = async (businessId: string) => {
    await authSwitchBusiness(businessId);
  };

  return (
    <TenantContext.Provider
      value={{
        currentBusiness,
        availableBusinesses,
        switchBusiness,
        currentUser,
        activeCategory: currentBusiness.category,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
