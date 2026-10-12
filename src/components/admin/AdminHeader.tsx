import React from 'react';
import { Menu, ShieldCheck, ArrowUpRight, Building2 } from 'lucide-react';
import { AdminRoute } from '../../types/admin';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';

export interface AdminHeaderProps {
  currentRoute: AdminRoute;
  onToggleSidebar: () => void;
  onExitToBusiness?: () => void;
}

const ROUTE_CONTEXT: Record<AdminRoute, { section: string; title: string }> = {
  'admin-overview': { section: 'Overview', title: 'Platform Health & Metrics' },
  'admin-applications': { section: 'Manage', title: 'Business Applications' },
  'admin-businesses': { section: 'Manage', title: 'Business Directory' },
  'admin-business-detail': { section: 'Manage', title: 'Business Inspection' },
  'admin-users': { section: 'Manage', title: 'Platform Users' },
  'admin-staff': { section: 'Manage', title: 'Staff Memberships' },
  'admin-roles': { section: 'Access', title: 'Roles & Permissions' },
  'admin-audit-logs': { section: 'Insights', title: 'Audit Trail' },
  'admin-analytics': { section: 'Insights', title: 'Platform Analytics' },
  'admin-plans': { section: 'Billing', title: 'Subscription Plans' },
  'admin-billing': { section: 'Billing', title: 'Subscriptions & Billing' },
};

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentRoute,
  onToggleSidebar,
  onExitToBusiness,
}) => {
  const { user } = useAuth();
  const info = ROUTE_CONTEXT[currentRoute] || { section: 'Admin', title: 'Platform Console' };

  return (
    <header
      className="app-header admin-header"
      style={{
        height: 64,
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        padding: '0 var(--space-6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-header)',
      }}
    >
      {/* Left side: Hamburger toggle + breadcrumb context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0, overflow: 'hidden' }}>
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation sidebar"
          style={{ flexShrink: 0 }}
        >
          <Menu size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0, overflow: 'hidden' }}>
          <span
            className="hidden-mobile"
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#94A3B8',
              whiteSpace: 'nowrap',
            }}
          >
            {info.section}
          </span>
          <span className="hidden-mobile" style={{ fontSize: '12px', color: '#CBD5E1' }}>/</span>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#1E293B',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {info.title}
          </span>
        </div>
      </div>

      {/* Right side: Clean, un-crowded action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        {/* Simulation Environment Indicator - Desktop Only */}
        <div
          className="hidden-mobile"
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

        {/* Subtle Super Admin badge - Desktop Only */}
        <div
          className="hidden-mobile"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            backgroundColor: '#EEF2FF',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#4F6BFF',
            letterSpacing: '0.02em',
          }}
        >
          <ShieldCheck size={14} />
          <span>Super Admin</span>
        </div>

        {/* Exit to Business App Switcher */}
        {onExitToBusiness && (
          <>
            {/* Desktop variant */}
            <button
              type="button"
              onClick={onExitToBusiness}
              className="hidden-mobile"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#475569',
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
              title="Switch to Tenant Workspace"
            >
              <span>Business App</span>
              <ArrowUpRight size={13} color="#64748B" />
            </button>

            {/* Mobile variant: Compact Tenant button */}
            <button
              type="button"
              onClick={onExitToBusiness}
              className="hidden-desktop"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
              }}
              title="Switch to Tenant Workspace"
            >
              <Building2 size={13} color="#4F6BFF" />
              <span>Tenant</span>
            </button>
          </>
        )}

        <Avatar name={user?.name || 'Administrator'} size="sm" />
      </div>
    </header>
  );
};
