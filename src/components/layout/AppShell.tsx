import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { Drawer } from '../ui/Drawer';
import { AdminRoute } from '../../types/loyalty';
import {
  Tag,
  UtensilsCrossed,
  Star,
  Megaphone,
  BarChart3,
  UserCheck,
  Settings,
  Sparkles,
  Smartphone,
  ChevronRight,
} from 'lucide-react';

export interface AppShellProps {
  currentRoute: AdminRoute;
  onRouteChange: (route: AdminRoute) => void;
  children: React.ReactNode;
}

const MORE_NAV_ITEMS: { id: AdminRoute; label: string; icon: React.ReactNode }[] = [
  { id: 'offers', label: 'Offers & Promotions', icon: <Tag size={18} /> },
  { id: 'menu', label: 'Menu & Services', icon: <UtensilsCrossed size={18} /> },
  { id: 'reviews', label: 'Customer Reviews', icon: <Star size={18} /> },
  { id: 'campaigns', label: 'Campaigns & Re-engagement', icon: <Megaphone size={18} /> },
  { id: 'analytics', label: 'Analytics & Reports', icon: <BarChart3 size={18} /> },
  { id: 'staff', label: 'Staff & Roles', icon: <UserCheck size={18} /> },
  { id: 'settings', label: 'Business Settings', icon: <Settings size={18} /> },
  { id: 'design-system', label: 'Design System & UI', icon: <Sparkles size={18} /> },
  { id: 'customer-preview', label: 'Customer Experience Preview', icon: <Smartphone size={18} /> },
];

export const AppShell: React.FC<AppShellProps> = ({
  currentRoute,
  onRouteChange,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  return (
    <div className="app-shell">
      {/* Sidebar for Desktop & Tablet */}
      <Sidebar
        currentRoute={currentRoute}
        onRouteChange={route => {
          onRouteChange(route);
          setSidebarOpen(false);
        }}
        isOpenMobile={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="app-main">
        <Header
          currentRoute={currentRoute}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        <main
          className="app-content"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            width: '100%',
            maxWidth: '100%',
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile Dedicated Bottom Navigation (< 640px) */}
      <MobileBottomNav
        currentRoute={currentRoute}
        onRouteChange={route => {
          onRouteChange(route);
          setMoreDrawerOpen(false);
        }}
        onOpenMore={() => setMoreDrawerOpen(true)}
      />

      {/* Mobile "More" Drawer / Bottom Sheet */}
      <Drawer
        isOpen={moreDrawerOpen}
        onClose={() => setMoreDrawerOpen(false)}
        title="More Sections"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {MORE_NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => {
                onRouteChange(item.id);
                setMoreDrawerOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: currentRoute === item.id ? 'var(--color-primary-subtle)' : 'transparent',
                color: currentRoute === item.id ? 'var(--color-primary)' : 'var(--color-text-primary)',
                fontWeight: currentRoute === item.id ? 600 : 500,
                fontSize: 'var(--font-size-base)',
                textAlign: 'left',
                minHeight: '44px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ color: currentRoute === item.id ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              <ChevronRight size={16} color="var(--color-text-muted)" />
            </button>
          ))}
        </div>
      </Drawer>
    </div>
  );
};
