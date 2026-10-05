import React from 'react';
import {
  Building2,
  Palette,
  UserCheck,
  Globe,
  CreditCard,
  Bell,
  ArrowRight,
  Shield,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import { AdminRoute } from '../../types/loyalty';

export interface BusinessSettingsViewProps {
  onNavigate: (route: AdminRoute) => void;
}

export const BusinessSettingsView: React.FC<BusinessSettingsViewProps> = ({ onNavigate }) => {
  const { currentBusiness } = useTenant();
  const { user } = useAuth();

  const SETTINGS_SECTIONS = [
    {
      title: 'Business Profile',
      desc: 'Company name, category, headquarters address, phone, email, and website.',
      icon: Building2,
      route: 'settings-business' as AdminRoute,
      status: 'Active',
      actionLabel: 'Configure Profile',
    },
    {
      title: 'Branch Locations',
      desc: 'Physical stores, checkout counters, local operating hours, and timezones.',
      icon: Globe,
      route: 'settings-branches' as AdminRoute,
      status: 'Active',
      actionLabel: 'Manage Branches',
    },
    {
      title: 'Team & Staff Roles',
      desc: 'Manage cashier accounts, store managers, and RBAC permission assignments.',
      icon: UserCheck,
      route: 'settings-staff' as AdminRoute,
      status: 'Active',
      actionLabel: 'Manage Team',
    },
    {
      title: 'Branding & Logo',
      desc: 'Upload business workspace logo, configure color palettes, and select industry theme presets.',
      icon: Palette,
      route: 'settings-branding' as AdminRoute,
      status: 'Active',
      actionLabel: 'Manage Branding & Logo',
    },
    {
      title: 'Subscription & Billing',
      desc: 'Pricing plans, billing intervals, resource usage limits, and invoices.',
      icon: CreditCard,
      route: 'billing' as AdminRoute,
      status: 'Active',
      actionLabel: 'Manage Subscription',
      disabled: false,
    },
    {
      title: 'Messaging & Providers',
      desc: 'SMS (MSG91), WhatsApp (Meta Cloud API), and Email (SendGrid) connectors.',
      icon: Bell,
      route: 'settings-messaging' as AdminRoute,
      status: 'Active',
      actionLabel: 'Configure Providers',
      disabled: false,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Business Settings"
        description={`Configure workspace rules, team members, locations, and branding for ${currentBusiness.name}.`}
      />

      <div className="responsive-two-col" style={{ gap: 'var(--space-4)' }}>
        {SETTINGS_SECTIONS.map((sec) => {
          const IconComponent = sec.icon;
          return (
            <Card
              key={sec.title}
              style={{
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '1px solid var(--color-border-subtle)',
                backgroundColor: sec.disabled ? '#F8FAFC' : '#FFFFFF',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '10px',
                      backgroundColor: sec.disabled ? '#F1F5F9' : 'var(--color-primary-soft)',
                      color: sec.disabled ? '#94A3B8' : 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconComponent size={20} />
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      backgroundColor: sec.disabled ? '#E2E8F0' : '#DCFCE7',
                      color: sec.disabled ? '#64748B' : '#166534',
                    }}
                  >
                    {sec.status}
                  </span>
                </div>

                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: '0 0 var(--space-2)', color: 'var(--color-text-primary)' }}>
                  {sec.title}
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 var(--space-4)' }}>
                  {sec.desc}
                </p>
              </div>

              <div>
                {sec.disabled ? (
                  <Button variant="ghost" size="sm" disabled style={{ width: '100%', justifyContent: 'center' }}>
                    {sec.actionLabel}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onNavigate(sec.route)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>{sec.actionLabel}</span>
                    <ArrowRight size={14} />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Security & Operator Info */}
      <Card style={{ marginTop: 'var(--space-6)', padding: 'var(--space-5)', backgroundColor: '#F8FAFC' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Shield size={20} color="#4F6BFF" />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Tenant Security & Access Control
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Logged in as <strong>{user?.name}</strong> ({user?.email}). All business data and mutations are protected by strict server-side tenant isolation.
            </div>
          </div>
        </div>
      </Card>
    </PageContainer>
  );
};
