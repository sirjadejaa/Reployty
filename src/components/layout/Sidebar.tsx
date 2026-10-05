import React from 'react';
import {
  LayoutDashboard,
  Users,
  Award,
  Gift,
  Tag,
  UtensilsCrossed,
  Star,
  BarChart3,
  UserCheck,
  Settings,
  HelpCircle,
  Sparkles,
  ChevronDown,
  Check,
  LogOut,
  ShieldAlert,
  Store,
  CreditCard,
  Megaphone,
  Zap,
  MessageSquare,
} from 'lucide-react';
import { AdminRoute } from '../../types/loyalty';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';

export interface SidebarProps {
  currentRoute: AdminRoute;
  onRouteChange: (route: AdminRoute) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

interface NavItemConfig {
  id: AdminRoute;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
  isComingSoon?: boolean;
}

interface NavSectionConfig {
  label: string;
  items: NavItemConfig[];
}

const NAV_SECTIONS: NavSectionConfig[] = [
  {
    label: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    ],
  },
  {
    label: 'CUSTOMER',
    items: [
      { id: 'business-customers', label: 'Customers', icon: <Users size={18} /> },
    ],
  },
  {
    label: 'LOYALTY',
    items: [
      { id: 'loyalty', label: 'Loyalty Engine', icon: <Award size={18} /> },
      { id: 'rewards', label: 'Rewards Catalog', icon: <Gift size={18} /> },
    ],
  },
  {
    label: 'ENGAGEMENT',
    items: [
      { id: 'offers', label: 'Special Offers', icon: <Tag size={18} /> },
      { id: 'reviews', label: 'Customer Reviews', icon: <Star size={18} /> },
      { id: 'campaigns', label: 'Campaigns', icon: <Megaphone size={18} /> },
      { id: 'automations', label: 'Automations', icon: <Zap size={18} /> },
    ],
  },
  {
    label: 'BUSINESS',
    items: [
      { id: 'menu', label: 'Menu & Catalog', icon: <UtensilsCrossed size={18} /> },
      { id: 'settings-branches', label: 'Branches', icon: <Store size={18} /> },
      { id: 'settings-staff', label: 'Staff & Team', icon: <UserCheck size={18} /> },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
    ],
  },
  {
    label: 'SETTINGS',
    items: [
      { id: 'billing', label: 'Billing & Plans', icon: <CreditCard size={18} /> },
      { id: 'settings-business', label: 'Business Profile', icon: <Settings size={18} /> },
      { id: 'settings-branding', label: 'Branding & Logo', icon: <Sparkles size={18} /> },
      { id: 'settings-messaging', label: 'Messaging Providers', icon: <MessageSquare size={18} /> },
      { id: 'settings', label: 'All Settings', icon: <Settings size={18} /> },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onRouteChange,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { currentBusiness, availableBusinesses, switchBusiness, currentUser } = useTenant();
  const { logout, currentBusiness: authBusiness, user: authUser } = useAuth();
  const [showBusinessDropdown, setShowBusinessDropdown] = React.useState(false);

  const handleNavClick = (route: AdminRoute) => {
    onRouteChange(route);
    if (isOpenMobile && onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 'calc(var(--z-sidebar) - 1)' }}
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside className={`app-sidebar ${isOpenMobile ? 'mobile-open' : ''}`} aria-label="Main Navigation">
        {/* Brand Header */}
        <div className="sidebar-header">
          <div className="brand-link">
            <div className="brand-logo" aria-hidden="true">
              <Award size={18} strokeWidth={2.5} />
            </div>
            <div>
              <span className="brand-name">Reployty</span>
            </div>
          </div>
        </div>

        {/* Business Switcher Context */}
        <div className="sidebar-business-switcher" style={{ position: 'relative' }}>
          <button
            type="button"
            className="business-switcher-btn"
            onClick={() => setShowBusinessDropdown(!showBusinessDropdown)}
            aria-expanded={showBusinessDropdown}
            aria-haspopup="listbox"
            aria-label="Switch current business"
          >
            <span className="business-avatar-badge" style={{ overflow: 'hidden', padding: 0 }}>
              {currentBusiness.logo ? (
                <img
                  src={currentBusiness.logo}
                  alt={currentBusiness.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    if (e.currentTarget.parentElement) {
                      e.currentTarget.parentElement.innerText = currentBusiness.name.slice(0, 2).toUpperCase();
                    }
                  }}
                />
              ) : (
                currentBusiness.name.slice(0, 2).toUpperCase()
              )}
            </span>
            <div className="business-info">
              <span className="business-title">{currentBusiness.name}</span>
              <span className="business-category">{currentBusiness.category.toUpperCase()}</span>
            </div>
            <ChevronDown size={16} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
          </button>

          {/* Business Dropdown */}
          {showBusinessDropdown && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 'var(--space-4)',
                right: 'var(--space-4)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-dropdown)',
                zIndex: 'var(--z-dropdown)',
                padding: 'var(--space-1)',
              }}
              role="listbox"
            >
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  padding: 'var(--space-2) var(--space-3)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Switch Business Tenant
              </div>
              {availableBusinesses.map(biz => (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => {
                    switchBusiness(biz.id);
                    setShowBusinessDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'left',
                    backgroundColor: biz.id === currentBusiness.id ? 'var(--color-primary-subtle)' : 'transparent',
                    color: biz.id === currentBusiness.id ? 'var(--color-primary)' : 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: biz.id === currentBusiness.id ? 600 : 500,
                  }}
                  role="option"
                  aria-selected={biz.id === currentBusiness.id}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      backgroundColor: 'var(--color-surface-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {biz.logo ? (
                      <img
                        src={biz.logo}
                        alt={biz.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                          if (e.currentTarget.parentElement) {
                            e.currentTarget.parentElement.innerText = biz.name.slice(0, 1).toUpperCase();
                          }
                        }}
                      />
                    ) : (
                      biz.name[0]
                    )}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {biz.name}
                  </span>
                  {biz.id === currentBusiness.id && <Check size={14} color="var(--color-primary)" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation List */}
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map(section => (
            <div key={section.label} style={{ marginBottom: 'var(--space-3)' }}>
              <span className="nav-section-label">{section.label}</span>
              {section.items.map(item => {
                const isActive =
                  currentRoute === item.id ||
                  (item.id === 'business-customers' && (currentRoute as string) === 'customers') ||
                  (item.id === 'customers' && (currentRoute as string) === 'business-customers');
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    onClick={e => {
                      e.preventDefault();
                      handleNavClick(item.id);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      textDecoration: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="nav-item-icon">{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {item.isComingSoon ? (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'var(--color-surface-muted)',
                          color: 'var(--color-text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Soon
                      </span>
                    ) : item.badge ? (
                      <span className="nav-item-badge">{item.badge}</span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Profile & Help Footer */}
        <div className="sidebar-footer">
          {authUser?.isSuperAdmin && (
            <a
              href="#admin-overview"
              className="btn btn-primary btn-sm"
              style={{
                width: '100%',
                marginBottom: 'var(--space-2)',
                backgroundColor: '#4F6BFF',
                borderColor: '#4F6BFF',
                fontSize: 'var(--font-size-xs)',
                justifyContent: 'center',
                gap: 6,
                textDecoration: 'none',
              }}
              onClick={() => onRouteChange('admin-overview' as any)}
            >
              <ShieldAlert size={14} />
              <span>Super Admin Portal</span>
            </a>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--color-surface-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              marginBottom: 'var(--space-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
              <Avatar name={currentUser.name} size="sm" />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {currentUser.name}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: authBusiness?.role === 'OWNER' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {authBusiness?.role || (authUser?.isSuperAdmin ? 'SuperAdmin' : 'Staff')}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              title="Sign Out"
              aria-label="Sign out"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-danger-text)';
                e.currentTarget.style.backgroundColor = 'var(--color-danger-subtle)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-muted)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <LogOut size={15} />
            </button>
          </div>

          <a
            href="#help"
            className="nav-item"
            style={{ minHeight: 32, fontSize: 'var(--font-size-xs)' }}
            onClick={e => {
              e.preventDefault();
              alert('Reployty Multi-Tenant Support: support@reployty.com');
            }}
          >
            <HelpCircle size={15} className="nav-item-icon" />
            <span>Help & Support</span>
          </a>
        </div>
      </aside>
    </>
  );
};
