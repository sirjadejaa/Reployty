import React from 'react';
import {
  LayoutDashboard,
  Users,
  Award,
  Gift,
  Menu,
} from 'lucide-react';
import { AdminRoute } from '../../types/loyalty';

export interface MobileBottomNavProps {
  currentRoute: AdminRoute;
  onRouteChange: (route: AdminRoute) => void;
  onOpenMore: () => void;
}

interface MobileItem {
  id: AdminRoute;
  label: string;
  icon: React.ReactNode;
}

const MOBILE_NAV_ITEMS: MobileItem[] = [
  { id: 'dashboard', label: 'Home', icon: <LayoutDashboard size={20} /> },
  { id: 'business-customers', label: 'Customers', icon: <Users size={20} /> },
  { id: 'loyalty', label: 'Loyalty', icon: <Award size={20} /> },
  { id: 'rewards', label: 'Rewards', icon: <Gift size={20} /> },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentRoute,
  onRouteChange,
  onOpenMore,
}) => {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      <div className="mobile-bottom-nav-inner">
        {MOBILE_NAV_ITEMS.map(item => {
          const isActive =
            currentRoute === item.id ||
            (item.id === 'business-customers' && (currentRoute as string) === 'customers') ||
            (item.id === 'customers' && (currentRoute as string) === 'business-customers');
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

        {/* More button */}
        <button
          className="mobile-nav-item"
          onClick={onOpenMore}
          aria-label="More navigation options"
        >
          <span className="mobile-nav-icon">
            <Menu size={20} />
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
};
