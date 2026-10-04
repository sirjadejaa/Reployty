import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { AdminRoute } from '../../types/loyalty';
import { useTenant } from '../../context/TenantContext';
import { SearchInput } from '../ui/SearchInput';
import { Avatar } from '../ui/Avatar';
import { useToast } from '../../context/ToastContext';

export interface HeaderProps {
  currentRoute: AdminRoute;
  onToggleSidebar: () => void;
}

const ROUTE_TITLES: Record<AdminRoute, { title: string; breadcrumb: string }> = {
  dashboard: { title: 'Dashboard', breadcrumb: 'Overview' },
  customers: { title: 'Customers', breadcrumb: 'CRM' },
  'business-customers': { title: 'Customers', breadcrumb: 'CRM' },
  loyalty: { title: 'Loyalty Program', breadcrumb: 'Programs' },
  rewards: { title: 'Rewards', breadcrumb: 'Incentives' },
  offers: { title: 'Offers & Promotions', breadcrumb: 'Marketing' },
  menu: { title: 'Menu, Services & Products', breadcrumb: 'Catalog' },
  reviews: { title: 'Customer Reviews', breadcrumb: 'Reputation' },
  campaigns: { title: 'Campaigns & Retention', breadcrumb: 'Outreach' },
  automations: { title: 'Automations Engine', breadcrumb: 'Triggers' },
  analytics: { title: 'Analytics & Insights', breadcrumb: 'Reports' },
  branches: { title: 'Branch Locations', breadcrumb: 'Business' },
  staff: { title: 'Staff & Team', breadcrumb: 'Organization' },
  settings: { title: 'Settings', breadcrumb: 'Configuration' },
  onboarding: { title: 'Business Onboarding', breadcrumb: 'Setup' },
  'settings-business': { title: 'Business Profile', breadcrumb: 'Settings' },
  'settings-branches': { title: 'Branch Management', breadcrumb: 'Settings' },
  'settings-staff': { title: 'Staff Management', breadcrumb: 'Settings' },
  'settings-branding': { title: 'Branding & Theme', breadcrumb: 'Settings' },
  'settings-messaging': { title: 'Messaging & Providers', breadcrumb: 'Settings' },
  billing: { title: 'Billing & Subscriptions', breadcrumb: 'Settings' },
  'design-system': { title: 'Design System & Component Library', breadcrumb: 'Source of Truth' },
  'customer-preview': { title: 'Customer Experience Preview', breadcrumb: 'Mobile View' },
};

export const Header: React.FC<HeaderProps> = ({
  currentRoute,
  onToggleSidebar,
}) => {
  const { currentBusiness, currentUser } = useTenant();
  const { addToast } = useToast();
  const [searchValue, setSearchValue] = React.useState('');

  const routeInfo = ROUTE_TITLES[currentRoute] || { title: 'Dashboard', breadcrumb: 'Overview' };

  const handleNotificationClick = () => {
    addToast({
      type: 'info',
      title: 'Customer Notifications',
      message: '3 new customers joined The Roasted Bean loyalty program today!',
    });
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation sidebar"
        >
          <Menu size={20} />
        </button>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {currentBusiness.logo ? (
              <img
                src={currentBusiness.logo}
                alt={`${currentBusiness.name} logo`}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  objectFit: 'cover',
                  border: '1px solid var(--color-border)',
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : null}
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
                fontWeight: 500,
              }}
            >
              {currentBusiness.name} / {routeInfo.breadcrumb}
            </span>
          </div>
          <h2
            style={{
              fontSize: 'var(--font-size-lg)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              lineHeight: 1.2,
            }}
          >
            {routeInfo.title}
          </h2>
        </div>
      </div>

      <div className="header-actions">
        {/* Global search on desktop */}
        <div className="header-search-wrap">
          <SearchInput
            placeholder="Search customers, rewards..."
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            onClear={() => setSearchValue('')}
          />
        </div>

        {/* Simulation Environment Indicator */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 9px',
            borderRadius: '9999px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            color: '#1D4ED8',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
          title="Safe Demo / Simulation Mode: No real external SMS, WhatsApp, or payment charges are triggered"
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#2563EB' }} />
          <span>Simulation</span>
        </div>

        {/* Notifications */}
        <button
          className="icon-button"
          onClick={handleNotificationClick}
          aria-label="View notifications (1 unread)"
          title="Notifications"
        >
          <Bell size={18} />
          <span className="notification-indicator" />
        </button>

        {/* User avatar */}
        <Avatar name={currentUser.name} size="sm" />
      </div>

    </header>
  );
};
