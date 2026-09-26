import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCheck,
  KeyRound,
  ScrollText,
  BarChart3,
  ArrowUpRight,
  LogOut,
  Shield,
  CreditCard,
  Layers,
} from 'lucide-react';
import { AdminRoute } from '../../types/admin';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';

export interface AdminSidebarProps {
  currentRoute: AdminRoute;
  onRouteChange: (route: AdminRoute) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onExitToBusiness?: () => void;
}

interface AdminNavGroup {
  label: string;
  items: Array<{
    id: AdminRoute;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  }>;
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      { id: 'admin-overview', label: 'Overview', icon: LayoutDashboard },
    ],
  },
  {
    label: 'MANAGE',
    items: [
      { id: 'admin-businesses', label: 'Businesses', icon: Building2 },
      { id: 'admin-users', label: 'Users', icon: Users },
      { id: 'admin-staff', label: 'Staff', icon: UserCheck },
    ],
  },
  {
    label: 'ACCESS',
    items: [
      { id: 'admin-roles', label: 'Roles & Permissions', icon: KeyRound },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { id: 'admin-analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'admin-audit-logs', label: 'Audit Logs', icon: ScrollText },
    ],
  },
  {
    label: 'BILLING & PLANS',
    items: [
      { id: 'admin-plans', label: 'Subscription Plans', icon: Layers },
      { id: 'admin-billing', label: 'Subscriptions & Billing', icon: CreditCard },
    ],
  },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentRoute,
  onRouteChange,
  isOpenMobile = false,
  onCloseMobile,
  onExitToBusiness,
}) => {
  const { user, logout } = useAuth();

  const handleNavClick = (route: AdminRoute) => {
    onRouteChange(route);
    if (isOpenMobile && onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {isOpenMobile && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 'calc(var(--z-sidebar) - 1)' }}
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`app-sidebar ${isOpenMobile ? 'mobile-open' : ''}`}
        aria-label="Platform Admin Navigation"
        style={{
          width: 252,
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            height: 64,
            padding: '0 var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #F1F5F9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                backgroundColor: '#4F6BFF',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(79, 107, 255, 0.25)',
              }}
              aria-hidden="true"
            >
              <Shield size={18} strokeWidth={2.2} />
            </div>
            <div>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#111827',
                  letterSpacing: '-0.02em',
                }}
              >
                Reployty
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#64748B',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginTop: -2,
                }}
              >
                Super Admin
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav
          className="sidebar-nav"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-4) var(--space-3)',
          }}
        >
          {NAV_GROUPS.map((group, idx) => (
            <div
              key={group.label}
              style={{
                marginBottom: 'var(--space-4)',
                marginTop: idx === 0 ? 0 : 'var(--space-2)',
              }}
            >
              <div
                style={{
                  padding: '0 var(--space-3) var(--space-1) var(--space-3)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                }}
              >
                {group.label}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {group.items.map(item => {
                  const isActive = currentRoute === item.id;
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="nav-item"
                      onClick={e => {
                        e.preventDefault();
                        handleNavClick(item.id);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#4F6BFF' : '#475569',
                        backgroundColor: isActive ? '#EEF2FF' : 'transparent',
                        textDecoration: 'none',
                        transition: 'background-color 150ms ease, color 150ms ease',
                      }}
                    >
                      <Icon
                        size={17}
                        className={isActive ? undefined : undefined}
                        style={{
                          color: isActive ? '#4F6BFF' : '#64748B',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1 }}>{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-3)',
            borderTop: '1px solid #F1F5F9',
            backgroundColor: '#FAFAFC',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          {/* Switch to Business Workspace */}
          {onExitToBusiness && (
            <button
              type="button"
              onClick={onExitToBusiness}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '7px 10px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 150ms ease, border-color 150ms ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
                e.currentTarget.style.borderColor = '#CBD5E1';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
            >
              <span>Switch to Business</span>
              <ArrowUpRight size={14} color="#64748B" />
            </button>
          )}

          {/* User Profile & Sign Out */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
              <Avatar name={user?.name || 'Admin'} size="sm" />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0F172A',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user?.name || 'Administrator'}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#64748B',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user?.email || 'admin@reployty.com'}
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
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: '#94A3B8',
                cursor: 'pointer',
                transition: 'color 150ms ease, background-color 150ms ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#DC2626';
                e.currentTarget.style.backgroundColor = '#FEF2F2';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = '#94A3B8';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
