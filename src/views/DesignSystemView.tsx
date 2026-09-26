import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SearchInput } from '../components/ui/SearchInput';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { Switch } from '../components/ui/Switch';
import { Checkbox } from '../components/ui/Checkbox';
import { StatusBadge } from '../components/ui/StatusBadge';
import { MetricSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import { Drawer } from '../components/ui/Drawer';
import { useToast } from '../context/ToastContext';
import { Tabs } from '../components/ui/Tabs';

export const DesignSystemView: React.FC = () => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('buttons');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form states for testbench
  const [testInput, setTestInput] = useState('');
  const [testErrorInput, setTestErrorInput] = useState('invalid-email-format');
  const [testSwitch, setTestSwitch] = useState(true);
  const [testCheckbox, setTestCheckbox] = useState(true);

  const COLOR_SWATCHES = [
    { name: 'Brand Primary', hex: '#4F6BFF', token: '--color-primary', bg: '#4F6BFF', text: '#FFFFFF' },
    { name: 'Primary Dark', hex: '#111827', token: '--color-primary-dark', bg: '#111827', text: '#FFFFFF' },
    { name: 'Background', hex: '#F8FAFC', token: '--color-bg', bg: '#F8FAFC', text: '#111827', border: true },
    { name: 'Surface', hex: '#FFFFFF', token: '--color-surface', bg: '#FFFFFF', text: '#111827', border: true },
    { name: 'Primary Text', hex: '#111827', token: '--color-text-primary', bg: '#111827', text: '#FFFFFF' },
    { name: 'Secondary Text', hex: '#64748B', token: '--color-text-secondary', bg: '#64748B', text: '#FFFFFF' },
    { name: 'Muted Text', hex: '#94A3B8', token: '--color-text-muted', bg: '#94A3B8', text: '#FFFFFF' },
    { name: 'Border', hex: '#E2E8F0', token: '--color-border', bg: '#E2E8F0', text: '#111827' },
    { name: 'Success', hex: '#16A34A', token: '--color-success', bg: '#16A34A', text: '#FFFFFF' },
    { name: 'Warning', hex: '#F59E0B', token: '--color-warning', bg: '#F59E0B', text: '#111827' },
    { name: 'Danger', hex: '#DC2626', token: '--color-danger', bg: '#DC2626', text: '#FFFFFF' },
    { name: 'Info', hex: '#2563EB', token: '--color-info', bg: '#2563EB', text: '#FFFFFF' },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Design System & Component Library"
        description="Permanent visual source of truth for all Reployty screens. All buttons, inputs, typography, cards, and states must adhere to these tokens."
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              variant="outline"
              onClick={() => setModalOpen(true)}
              leftIcon={<Layers size={16} />}
            >
              Test Modal
            </Button>
            <Button
              variant="outline"
              onClick={() => setDrawerOpen(true)}
              leftIcon={<SlidersHorizontal size={16} />}
            >
              Test Drawer
            </Button>
          </div>
        }
      />

      {/* Interactive Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'buttons', label: 'Buttons & Actions' },
          { id: 'forms', label: 'Inputs & Forms' },
          { id: 'colors', label: 'Colors & Tokens' },
          { id: 'typography', label: 'Typography' },
          { id: 'badges', label: 'Status Badges' },
          { id: 'feedback', label: 'Toasts & Dialogs' },
          { id: 'states', label: 'Empty & Error States' },
          { id: 'loading', label: 'Skeleton Loaders' },
        ]}
      />

      {/* Tab Content: Buttons */}
      {activeTab === 'buttons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Card title="Button Variants" subtitle="Semantic button styles with consistent heights and hover states">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
              <Button variant="primary">Primary Button</Button>
              <Button variant="secondary">Secondary Button</Button>
              <Button variant="outline">Outline Button</Button>
              <Button variant="ghost">Ghost Button</Button>
              <Button variant="danger">Danger Button</Button>
              <Button variant="success">Success Button</Button>
            </div>
          </Card>

          <Card title="Button Sizes" subtitle="Standardized 32px (sm), 38px (md), and 44px (lg) touch-friendly heights">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
              <Button variant="primary" size="sm">Small (32px)</Button>
              <Button variant="primary" size="md">Default (38px)</Button>
              <Button variant="primary" size="lg">Large (44px)</Button>
            </div>
          </Card>

          <Card title="Button States" subtitle="Loading spinners, disabled state, and icon combinations">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
              <Button variant="primary" loading>Loading Button</Button>
              <Button variant="secondary" loading>Loading Secondary</Button>
              <Button variant="primary" disabled>Disabled State</Button>
              <Button variant="outline" leftIcon={<Send size={15} />}>With Left Icon</Button>
              <Button variant="primary" rightIcon={<Sparkles size={15} />}>With Right Icon</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Tab Content: Forms */}
      {activeTab === 'forms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Card title="Form Input Controls" subtitle="Standard inputs with accessible labels, helpers, and focus rings">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
              <Input
                label="Customer Full Name"
                placeholder="e.g. Jordan Miller"
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                helperText="Enter first and last name"
                required
              />

              <Input
                label="Email Address"
                value={testErrorInput}
                onChange={e => setTestErrorInput(e.target.value)}
                error="Please enter a valid email address."
                required
              />

              <SearchInput
                placeholder="Search customers by phone..."
                defaultValue=""
              />

              <Select
                label="Business Category"
                defaultValue="cafe"
                options={[
                  { value: 'cafe', label: 'Café & Bakery' },
                  { value: 'salon', label: 'Salon & Spa' },
                  { value: 'gym', label: 'Gym & Fitness' },
                  { value: 'restaurant', label: 'Restaurant & Dining' },
                  { value: 'retail', label: 'Retail & Fashion' },
                ]}
                helperText="Determines default loyalty reward templates"
              />
            </div>

            <div style={{ marginTop: 'var(--space-4)' }}>
              <Textarea
                label="Reward Program Description"
                placeholder="Describe how customers earn and redeem rewards at your store..."
                rows={3}
                helperText="Displayed in the customer digital wallet pass"
              />
            </div>
          </Card>

          <Card title="Toggles & Selectors" subtitle="Accessible switch toggles and checkboxes">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Switch
                label="Enable SMS Visit Reminders"
                description="Automatically text customers who haven't visited in 30 days"
                checked={testSwitch}
                onChange={e => setTestSwitch(e.target.checked)}
              />

              <Checkbox
                label="Require staff PIN to redeem rewards"
                description="Prevents accidental redemptions at billing counter"
                checked={testCheckbox}
                onChange={e => setTestCheckbox(e.target.checked)}
              />
            </div>
          </Card>
        </div>
      )}

      {/* Tab Content: Colors */}
      {activeTab === 'colors' && (
        <Card title="Centralized Color Palette Tokens" subtitle="Defined in tokens.css - No arbitrary RGB or hex values">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {COLOR_SWATCHES.map(swatch => (
              <div
                key={swatch.name}
                style={{
                  borderRadius: 'var(--radius-md)',
                  border: swatch.border ? '1px solid var(--color-border)' : 'none',
                  overflow: 'hidden',
                  backgroundColor: 'var(--color-surface)',
                  boxShadow: 'var(--shadow-subtle)',
                }}
              >
                <div
                  style={{
                    height: 64,
                    backgroundColor: swatch.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: swatch.text,
                    fontWeight: 600,
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  {swatch.hex}
                </div>
                <div style={{ padding: 'var(--space-3)' }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, display: 'block' }}>
                    {swatch.name}
                  </span>
                  <code style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {swatch.token}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab Content: Typography */}
      {activeTab === 'typography' && (
        <Card title="Typography Hierarchy" subtitle="Clean modern sans-serif (Inter) with standardized weights and sizes">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Page Title (24-30px, 700)</span>
              <h1>Turn Customers into Regulars</h1>
            </div>

            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Section Heading (18-22px, 600)</span>
              <h2>Customer Loyalty & Retention Engine</h2>
            </div>

            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Card Heading (15-18px, 600)</span>
              <h3>Active Loyalty Stamp Cards</h3>
            </div>

            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Body Text (14-16px, 400)</span>
              <p>
                Reployty is a production-grade multi-tenant SaaS platform for customer loyalty, CRM, and retention for local businesses like cafés, salons, gyms, and retail shops.
              </p>
            </div>

            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Secondary / Captions (13-14px)</span>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                Average customer return cycle: 12 days • Last campaign sent yesterday
              </p>
            </div>

            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Labels (12-13px, 500)</span>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                BUSINESS PHONE NUMBER
              </label>
            </div>
          </div>
        </Card>
      )}

      {/* Tab Content: Status Badges */}
      {activeTab === 'badges' && (
        <Card title="Semantic Status Badges" subtitle="Readable indicators with accessible contrast and subtle background tints">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <StatusBadge status="active" />
            <StatusBadge status="inactive" />
            <StatusBadge status="pending" />
            <StatusBadge status="completed" />
            <StatusBadge status="failed" />
            <StatusBadge status="expired" />
            <StatusBadge status="available" />
            <StatusBadge status="redeemed" />
            <StatusBadge status="vip" />
            <StatusBadge status="at-risk" />
          </div>
        </Card>
      )}

      {/* Tab Content: Feedback & Overlays */}
      {activeTab === 'feedback' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Card title="Toast Notification System" subtitle="Non-blocking accessible notifications with auto-dismiss">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <Button
                variant="outline"
                leftIcon={<CheckCircle2 size={16} color="var(--color-success)" />}
                onClick={() =>
                  addToast({
                    type: 'success',
                    title: 'Reward Redeemed',
                    message: 'Customer Marcus Vance redeemed Free Flat White.',
                  })
                }
              >
                Trigger Success Toast
              </Button>

              <Button
                variant="outline"
                leftIcon={<AlertCircle size={16} color="var(--color-danger)" />}
                onClick={() =>
                  addToast({
                    type: 'error',
                    title: 'Sync Failed',
                    message: 'Could not connect to payment POS terminal.',
                  })
                }
              >
                Trigger Error Toast
              </Button>

              <Button
                variant="outline"
                leftIcon={<AlertTriangle size={16} color="var(--color-warning)" />}
                onClick={() =>
                  addToast({
                    type: 'warning',
                    title: 'Subscription Renewal',
                    message: 'Your plan will renew in 3 days.',
                  })
                }
              >
                Trigger Warning Toast
              </Button>

              <Button
                variant="outline"
                leftIcon={<Info size={16} color="var(--color-info)" />}
                onClick={() =>
                  addToast({
                    type: 'info',
                    title: 'New Feature',
                    message: 'Automated WhatsApp visit reminders are now active.',
                  })
                }
              >
                Trigger Info Toast
              </Button>
            </div>
          </Card>

          <Card title="Modals & Drawers" subtitle="Accessible overlays with keyboard Esc and backdrop dismiss">
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button variant="primary" onClick={() => setModalOpen(true)}>
                Open Centered Modal
              </Button>
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                Open Slide-Over Drawer
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Tab Content: States */}
      {activeTab === 'states' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-6)' }}>
          <Card title="Empty State Component">
            <EmptyState
              title="No customers yet"
              description="Customers who join your loyalty program by scanning your counter QR will appear here."
              action={
                <Button
                  variant="primary"
                  onClick={() => addToast({ type: 'info', title: 'QR Ready', message: 'Download QR from dashboard' })}
                >
                  Generate Counter QR
                </Button>
              }
            />
          </Card>

          <Card title="Error State Component">
            <ErrorState
              title="Unable to load customer records"
              message="The server could not be reached. Please check your network connection."
              onRetry={() => addToast({ type: 'info', title: 'Retrying', message: 'Reloading customer records...' })}
            />
          </Card>
        </div>
      )}

      {/* Tab Content: Loading */}
      {activeTab === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Card title="Skeleton Shimmer Metric Loaders">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </div>
          </Card>

          <Card title="Skeleton Table Shimmer">
            <TableSkeleton rows={3} />
          </Card>
        </div>
      )}

      {/* Test Modal Dialog */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Reusable Modal Component"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setModalOpen(false);
                addToast({ type: 'success', title: 'Action Confirmed', message: 'Modal action executed.' });
              }}
            >
              Confirm Action
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          This modal provides focus trapping, backdrop click-to-dismiss, Escape key listener, and standardized padding and typography.
        </p>
      </Modal>

      {/* Test Drawer Component */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Slide-Over Drawer Filter"
        footer={
          <Button variant="primary" style={{ width: '100%' }} onClick={() => setDrawerOpen(false)}>
            Apply Filters
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Drawers are used for filters, customer quick-view, and mobile workflows. On mobile, this transforms into a bottom sheet!
          </p>
          <Select
            label="Filter by Tier"
            defaultValue="all"
            options={[
              { value: 'all', label: 'All Customer Tiers' },
              { value: 'vip', label: 'VIP Regulars' },
              { value: 'gold', label: 'Gold Members' },
              { value: 'at_risk', label: 'At Risk (30+ days inactive)' },
            ]}
          />
          <Switch
            label="Only show customers with available rewards"
            checked={true}
            onChange={() => {}}
          />
        </div>
      </Drawer>
    </PageContainer>
  );
};
