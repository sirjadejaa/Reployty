import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  BarChart3,
  Menu,
} from 'lucide-react';
import { AdminRoute } from '../../types/admin';

export interface AdminMobileBottomNavProps {
  currentRoute: AdminRoute;
  onRouteChange: (route: AdminRoute) => void;
  onOpenMore: () => void;
}

interface AdminMobileItem {
  id: AdminRoute;
  label: string;
  icon: React.ReactNode;
}

const MAIN_ADMIN_ITEMS: AdminMobileItem[] = [
  { id: 'admin-overview', label: 'Overview', icon: <LayoutDashboard size={20} /> },
  { id: 'admin-businesses', label: 'Businesses', icon: <Building2 size={20} /> },
  { id: 'admin-users', label: 'Users', icon: <Users size={20} /> },
  { id: 'admin-analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
];

const SECONDARY_ADMIN_ROUTES: AdminRoute[] = [
  'admin-applications',
  'admin-staff',
  'admin-roles',
  'admin-audit-logs',
  'admin-plans',
  'admin-billing',
];

export const AdminMobileBottomNav: React.FC<AdminMobileBottomNavProps> = ({
  currentRoute,
  onRouteChange,
  onOpenMore,
}) => {
  const isSecondaryActive = SECONDARY_ADMIN_ROUTES.includes(currentRoute);

  return (
    <nav className="mobile-bottom-nav" aria-label="Super Admin Mobile Navigation">
      <div className="mobile-bottom-nav-inner">
        {MAIN_ADMIN_ITEMS.map((item) => {
          const isActive =
            currentRoute === item.id ||
            (item.id === 'admin-businesses' && currentRoute === 'admin-business-detail');

          return (
            <button
              key={item.id}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onRouteChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* More Button: Opens the Super Admin sidebar for remaining items */}
        <button
          className={`mobile-nav-item ${isSecondaryActive ? 'active' : ''}`}
          onClick={onOpenMore}
          aria-label="More navigation options (opens sidebar)"
          title="More Sections"
        >
          <span className="mobile-nav-icon" style={{ position: 'relative' }}>
            <Menu size={20} />
            {isSecondaryActive && (
              <span
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary)',
                }}
              />
            )}
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
};
