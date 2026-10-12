import React, { useState, useEffect } from 'react';
import {
  Home,
  Award,
  Gift,
  Clock,
  User,
  UtensilsCrossed,
  Tag,
  Menu,
  X,
  ChevronRight,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { PublicBusinessContext, PublicBranchContext } from '../../types/customer';

export type CustomerPwaTab =
  | 'home'
  | 'loyalty'
  | 'rewards'
  | 'offers'
  | 'catalog'
  | 'activity'
  | 'profile'
  | 'landing'
  | 'review';

interface CustomerPwaShellProps {
  currentTab: CustomerPwaTab;
  onNavigateTab: (tab: CustomerPwaTab) => void;
  business?: PublicBusinessContext | null;
  branch?: PublicBranchContext | null;
  children: React.ReactNode;
}

export const CustomerPwaShell: React.FC<CustomerPwaShellProps> = ({
  currentTab,
  onNavigateTab,
  business: propBusiness,
  branch: propBranch,
  children,
}) => {
  const { business: authBusiness, branch: authBranch, customer, logout } = useCustomerAuth();
  const business = propBusiness || authBusiness;
  const branch = propBranch || authBranch;
  const [isSlidebarOpen, setIsSlidebarOpen] = useState(false);

  const primaryColor = business?.primaryColor || '#4F6BFF';

  // Close slidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSlidebarOpen) {
        setIsSlidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSlidebarOpen]);

  // Lock body scroll when slidebar is open
  useEffect(() => {
    if (isSlidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSlidebarOpen]);

  const handleSelectTab = (tab: CustomerPwaTab) => {
    onNavigateTab(tab);
    setIsSlidebarOpen(false);
  };

  const handleLogout = async () => {
    setIsSlidebarOpen(false);
    if (logout) {
      await logout();
    }
  };

  // Determine current active secondary tab label
  const activeSecondaryTab = ['offers', 'catalog', 'activity'].includes(currentTab)
    ? currentTab === 'offers'
      ? 'Offers'
      : currentTab === 'catalog'
      ? 'Catalog'
      : 'Activity'
    : null;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F1F5F9',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          minHeight: '100vh',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
          position: 'relative',
        }}
      >
        {/* Top Business Header */}
        <header
          style={{
            padding: '10px 16px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '10px',
                backgroundColor: `${primaryColor}15`,
                color: primaryColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '16px',
                border: `1px solid ${primaryColor}30`,
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {business?.logo ? (
                <img
                  src={business.logo}
                  alt={business.name || 'Logo'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span>{business?.name ? business.name.charAt(0) : 'R'}</span>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#0F172A',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {business?.name || 'Reployty Partner'}
              </div>
              {branch?.name ? (
                <div
                  style={{
                    fontSize: '12px',
                    color: '#64748B',
                    marginTop: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {branch.name}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  {business?.category || 'Customer Rewards'}
                </div>
              )}
            </div>
          </div>

          {/* Right Header: Active secondary tab indicator + Slidebar toggle button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {activeSecondaryTab && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: `${primaryColor}15`,
                  color: primaryColor,
                  border: `1px solid ${primaryColor}30`,
                }}
              >
                {activeSecondaryTab}
              </span>
            )}
            <button
              id="customer-slidebar-toggle"
              aria-label="Open slide menu"
              onClick={() => setIsSlidebarOpen(true)}
              style={{
                width: 38,
                height: 38,
                borderRadius: '10px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                color: '#1E293B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
              title="Open Menu"
            >
              <Menu size={20} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        {/* Slidebar Backdrop */}
        <div
          id="customer-slidebar-backdrop"
          role="presentation"
          onClick={() => setIsSlidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            zIndex: 90,
            opacity: isSlidebarOpen ? 1 : 0,
            pointerEvents: isSlidebarOpen ? 'auto' : 'none',
            transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />

        {/* Slide-out Sidebar Drawer */}
        <aside
          id="customer-slidebar-drawer"
          aria-label="Customer Navigation Drawer"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '84%',
            maxWidth: '340px',
            backgroundColor: '#FFFFFF',
            zIndex: 100,
            transform: isSlidebarOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: isSlidebarOpen ? '-8px 0 30px rgba(0, 0, 0, 0.18)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {/* Drawer Top Header */}
          <div
            style={{
              padding: '18px 20px',
              borderBottom: '1px solid #F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#FAFAFA',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  backgroundColor: `${primaryColor}20`,
                  color: primaryColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                }}
              >
                {business?.name ? business.name.charAt(0) : 'R'}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                  {business?.name || 'Reployty'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  {branch?.name || 'Member Menu'}
                </div>
              </div>
            </div>

            <button
              id="customer-slidebar-close"
              aria-label="Close menu"
              onClick={() => setIsSlidebarOpen(false)}
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Customer Mini Profile Card */}
          {customer && (
            <div
              style={{
                margin: '16px 16px 8px 16px',
                padding: '14px 16px',
                borderRadius: '12px',
                background: `linear-gradient(135deg, ${primaryColor}10 0%, #F8FAFC 100%)`,
                border: `1px solid ${primaryColor}25`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: primaryColor,
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '14px',
                  }}
                >
                  {customer.name ? customer.name.charAt(0).toUpperCase() : 'M'}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                    {customer.name || 'Member'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>
                    {customer.phone}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 7px',
                  borderRadius: '6px',
                  backgroundColor: '#FFFFFF',
                  color: primaryColor,
                  border: `1px solid ${primaryColor}30`,
                }}
              >
                {(customer.stampsBalance ?? 0) > 0
                  ? `${customer.stampsBalance} Stamps`
                  : (customer.pointsBalance ?? 0) > 0
                  ? `${customer.pointsBalance} Pts`
                  : 'Regular'}
              </div>
            </div>
          )}

          {/* Drawer Menu Body */}
          <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Section 1: Secondary Navs (Moved from Bottom Bar) */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#94A3B8',
                  padding: '0 8px 8px 8px',
                }}
              >
                Explore & Deals
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* 1. Offers & Deals */}
                <button
                  id="slidebar-nav-offers"
                  onClick={() => handleSelectTab('offers')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: currentTab === 'offers' ? `1px solid ${primaryColor}40` : '1px solid transparent',
                    backgroundColor: currentTab === 'offers' ? `${primaryColor}10` : '#F8FAFC',
                    color: currentTab === 'offers' ? primaryColor : '#1E293B',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '8px',
                        backgroundColor: currentTab === 'offers' ? `${primaryColor}20` : '#EEF2FF',
                        color: currentTab === 'offers' ? primaryColor : '#4F6BFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Tag size={17} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>Special Offers</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>Exclusive promos & discounts</div>
                    </div>
                  </div>
                  <ChevronRight size={16} color="#94A3B8" />
                </button>

                {/* 2. Store Catalog */}
                <button
                  id="slidebar-nav-catalog"
                  onClick={() => handleSelectTab('catalog')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: currentTab === 'catalog' ? `1px solid ${primaryColor}40` : '1px solid transparent',
                    backgroundColor: currentTab === 'catalog' ? `${primaryColor}10` : '#F8FAFC',
                    color: currentTab === 'catalog' ? primaryColor : '#1E293B',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '8px',
                        backgroundColor: currentTab === 'catalog' ? `${primaryColor}20` : '#F0FDF4',
                        color: currentTab === 'catalog' ? primaryColor : '#16A34A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <UtensilsCrossed size={17} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>Catalog & Menu</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>Browse products & items</div>
                    </div>
                  </div>
                  <ChevronRight size={16} color="#94A3B8" />
                </button>

                {/* 3. Activity History */}
                <button
                  id="slidebar-nav-activity"
                  onClick={() => handleSelectTab('activity')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: currentTab === 'activity' ? `1px solid ${primaryColor}40` : '1px solid transparent',
                    backgroundColor: currentTab === 'activity' ? `${primaryColor}10` : '#F8FAFC',
                    color: currentTab === 'activity' ? primaryColor : '#1E293B',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '8px',
                        backgroundColor: currentTab === 'activity' ? `${primaryColor}20` : '#FEF3C7',
                        color: currentTab === 'activity' ? primaryColor : '#D97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Clock size={17} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>Activity History</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>Past visits & transactions</div>
                    </div>
                  </div>
                  <ChevronRight size={16} color="#94A3B8" />
                </button>
              </div>
            </div>

            {/* Section 2: Quick Jump to Primary Tabs */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#94A3B8',
                  padding: '0 8px 8px 8px',
                }}
              >
                Quick Navigation
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={() => handleSelectTab('home')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: currentTab === 'home' ? `${primaryColor}12` : '#FFFFFF',
                    color: currentTab === 'home' ? primaryColor : '#334155',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Home size={16} />
                  <span>Home</span>
                </button>

                <button
                  onClick={() => handleSelectTab('loyalty')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: currentTab === 'loyalty' ? `${primaryColor}12` : '#FFFFFF',
                    color: currentTab === 'loyalty' ? primaryColor : '#334155',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Award size={16} />
                  <span>Loyalty</span>
                </button>

                <button
                  onClick={() => handleSelectTab('rewards')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: currentTab === 'rewards' ? `${primaryColor}12` : '#FFFFFF',
                    color: currentTab === 'rewards' ? primaryColor : '#334155',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Gift size={16} />
                  <span>Rewards</span>
                </button>

                <button
                  onClick={() => handleSelectTab('profile')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: currentTab === 'profile' ? `${primaryColor}12` : '#FFFFFF',
                    color: currentTab === 'profile' ? primaryColor : '#334155',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <User size={16} />
                  <span>Profile</span>
                </button>
              </div>
            </div>

            {/* Section 3: Review Store Flow */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#94A3B8',
                  padding: '0 8px 8px 8px',
                }}
              >
                Feedback & Reviews
              </div>

              <button
                id="slidebar-nav-review"
                onClick={() => handleSelectTab('review')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #FEF08A',
                  backgroundColor: '#FEFCE8',
                  color: '#854D0E',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Sparkles size={18} color="#CA8A04" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>Write AI Review</div>
                    <div style={{ fontSize: '11px', color: '#A16207' }}>Rate your visit & earn rewards</div>
                  </div>
                </div>
                <ChevronRight size={16} color="#CA8A04" />
              </button>
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid #F1F5F9',
              backgroundColor: '#FAFAFA',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #FEE2E2',
                backgroundColor: '#FFF5F5',
                color: '#DC2626',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <LogOut size={16} />
              <span>Sign Out / Switch</span>
            </button>

            <div
              style={{
                textAlign: 'center',
                fontSize: '11px',
                color: '#94A3B8',
              }}
            >
              Powered by <strong>Reployty</strong>
            </div>
          </div>
        </aside>

        {/* Main Content View (Padded for 4-item Bottom Nav) */}
        <main
          style={{
            flex: 1,
            padding: '10px 14px 84px 14px',
            overflowY: 'auto',
          }}
        >
          {children}
        </main>

        {/* Fixed Bottom Navigation Bar - Exactly 4 Important Tabs */}
        <nav
          id="customer-bottom-nav"
          style={{
            position: 'fixed',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100%',
            maxWidth: '440px',
            backgroundColor: '#FFFFFF',
            borderTop: '1px solid #E2E8F0',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            padding: '8px 4px calc(8px + env(safe-area-inset-bottom, 0px)) 4px',
            zIndex: 40,
            boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.04)',
          }}
        >
          {/* 1. Home Tab */}
          <button
            id="customer-tab-home"
            onClick={() => onNavigateTab('home')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'home' ? primaryColor : '#64748B',
              padding: '6px 4px',
              minHeight: '48px',
              transition: 'color 0.15s ease',
            }}
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px 12px',
                borderRadius: '12px',
                backgroundColor: currentTab === 'home' ? `${primaryColor}15` : 'transparent',
                transition: 'background-color 0.15s ease',
              }}
            >
              <Home size={21} strokeWidth={currentTab === 'home' ? 2.5 : 2} />
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: currentTab === 'home' ? 700 : 500,
                letterSpacing: '-0.01em',
              }}
            >
              Home
            </span>
          </button>

          {/* 2. Loyalty Pass Tab */}
          <button
            id="customer-tab-loyalty"
            onClick={() => onNavigateTab('loyalty')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'loyalty' ? primaryColor : '#64748B',
              padding: '6px 4px',
              minHeight: '48px',
              transition: 'color 0.15s ease',
            }}
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px 12px',
                borderRadius: '12px',
                backgroundColor: currentTab === 'loyalty' ? `${primaryColor}15` : 'transparent',
                transition: 'background-color 0.15s ease',
              }}
            >
              <Award size={21} strokeWidth={currentTab === 'loyalty' ? 2.5 : 2} />
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: currentTab === 'loyalty' ? 700 : 500,
                letterSpacing: '-0.01em',
              }}
            >
              Loyalty
            </span>
          </button>

          {/* 3. Rewards Tab */}
          <button
            id="customer-tab-rewards"
            onClick={() => onNavigateTab('rewards')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'rewards' ? primaryColor : '#64748B',
              padding: '6px 4px',
              minHeight: '48px',
              transition: 'color 0.15s ease',
            }}
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px 12px',
                borderRadius: '12px',
                backgroundColor: currentTab === 'rewards' ? `${primaryColor}15` : 'transparent',
                transition: 'background-color 0.15s ease',
              }}
            >
              <Gift size={21} strokeWidth={currentTab === 'rewards' ? 2.5 : 2} />
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: currentTab === 'rewards' ? 700 : 500,
                letterSpacing: '-0.01em',
              }}
            >
              Rewards
            </span>
          </button>

          {/* 4. Profile Tab */}
          <button
            id="customer-tab-profile"
            onClick={() => onNavigateTab('profile')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'profile' ? primaryColor : '#64748B',
              padding: '6px 4px',
              minHeight: '48px',
              transition: 'color 0.15s ease',
            }}
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px 12px',
                borderRadius: '12px',
                backgroundColor: currentTab === 'profile' ? `${primaryColor}15` : 'transparent',
                transition: 'background-color 0.15s ease',
              }}
            >
              <User size={21} strokeWidth={currentTab === 'profile' ? 2.5 : 2} />
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: currentTab === 'profile' ? 700 : 500,
                letterSpacing: '-0.01em',
              }}
            >
              Profile
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
};

