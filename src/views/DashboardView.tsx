import React, { useState, useEffect } from 'react';
import {
  Users,
  Building2,
  UserCheck,
  Award,
  ArrowRight,
  CheckCircle2,
  Circle,
  Palette,
  Settings,
  Sparkles,
  Clock,
  RefreshCw,
  AlertCircle,
  QrCode,
  Gift,
  Zap,
} from 'lucide-react';

import { PageContainer } from '../components/layout/PageContainer';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';

import { useTenant } from '../context/TenantContext';
import { useToast } from '../context/ToastContext';
import { AdminRoute } from '../types/loyalty';
import { BusinessDashboardData } from '../types/business';

export interface DashboardViewProps {
  onNavigate: (route: AdminRoute) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { currentBusiness } = useTenant();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BusinessDashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/business/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        addToast({
          type: 'error',
          title: 'Failed to load dashboard',
          message: 'Unable to retrieve business metrics from the server.',
        });
      }
    } catch (err) {
      console.error('Failed to fetch business dashboard:', err);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [currentBusiness.id]);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <PageContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Skeleton height={100} radius="var(--radius-lg)" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            <Skeleton height={110} radius="var(--radius-lg)" />
            <Skeleton height={110} radius="var(--radius-lg)" />
            <Skeleton height={110} radius="var(--radius-lg)" />
            <Skeleton height={110} radius="var(--radius-lg)" />
          </div>
          <Skeleton height={260} radius="var(--radius-lg)" />
        </div>
      </PageContainer>
    );
  }

  const business = data?.business;
  const metrics = data?.metrics;
  const onboarding = data?.onboarding;
  const recentActivity = data?.recentActivity || [];

  const completedSteps = onboarding?.completedStepsCount || 0;
  const totalSteps = onboarding?.totalSteps || 6;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  return (
    <PageContainer>
      {/* 1. Welcome & Business Context Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          {/* Business Logo or Monogram Badge */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--color-primary-subtle)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {(business?.logo || currentBusiness.logo) ? (
              <img
                src={business?.logo || currentBusiness.logo || ''}
                alt={`${business?.name || currentBusiness.name} logo`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                  if (e.currentTarget.parentElement) {
                    e.currentTarget.parentElement.innerText = (business?.name || currentBusiness.name).slice(0, 2).toUpperCase();
                  }
                }}
              />
            ) : (
              <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)' }}>
                {(business?.name || currentBusiness.name).slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <h1
                style={{
                  fontSize: 'var(--font-size-2xl)',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                {getTimeGreeting()}, {business?.name || currentBusiness.name}
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--color-primary-soft)',
                  color: 'var(--color-primary)',
                }}
              >
                {business?.category || currentBusiness.category}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Here is your live operational overview and retention performance.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Updating...' : 'Refresh'}
          </Button>
          {!onboarding?.isCompleted && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigate('onboarding')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={14} />
              Setup Guide ({progressPercent}%)
            </Button>
          )}
        </div>
      </div>

      {/* 2. Onboarding Setup Checklist Card (if incomplete or recently completed) */}
      <Card
        style={{
          marginBottom: 'var(--space-6)',
          border: onboarding?.isCompleted ? '1px solid var(--color-border-subtle)' : '1px solid #C7D2FE',
          backgroundColor: onboarding?.isCompleted ? '#FFFFFF' : '#F5F7FF',
          padding: 'var(--space-5)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                {onboarding?.isCompleted ? 'Business Setup Complete' : 'Complete your business setup'}
              </h2>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: onboarding?.isCompleted ? '#DCFCE7' : '#EEF2FF',
                  color: onboarding?.isCompleted ? '#166534' : '#4F6BFF',
                }}
              >
                {completedSteps} of {totalSteps} steps completed
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              {onboarding?.isCompleted
                ? 'Your core business profile, branch, and team settings are configured.'
                : 'Follow the essential steps to prepare your Reployty retention workspace for customers.'}
            </p>
          </div>

          <Button
            variant={onboarding?.isCompleted ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => onNavigate('onboarding')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {onboarding?.isCompleted ? 'Review Setup' : 'Continue Setup'}
            <ArrowRight size={14} />
          </Button>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '6px',
            backgroundColor: '#E2E8F0',
            borderRadius: '3px',
            overflow: 'hidden',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              backgroundColor: onboarding?.isCompleted ? 'var(--color-success)' : 'var(--color-primary)',
              borderRadius: '3px',
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        {/* Checklist items */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <div
            onClick={() => onNavigate('settings-business')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 500,
              color: onboarding?.checklist.businessInfo ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {onboarding?.checklist.businessInfo ? (
              <CheckCircle2 size={16} color="var(--color-success)" />
            ) : (
              <Circle size={16} color="var(--color-text-muted)" />
            )}
            <span>Business Information</span>
          </div>

          <div
            onClick={() => onNavigate('settings-business')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 500,
              color: onboarding?.checklist.category ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {onboarding?.checklist.category ? (
              <CheckCircle2 size={16} color="var(--color-success)" />
            ) : (
              <Circle size={16} color="var(--color-text-muted)" />
            )}
            <span>Business Category</span>
          </div>

          <div
            onClick={() => onNavigate('settings-branches')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 500,
              color: onboarding?.checklist.branchSetup ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {onboarding?.checklist.branchSetup ? (
              <CheckCircle2 size={16} color="var(--color-success)" />
            ) : (
              <Circle size={16} color="var(--color-text-muted)" />
            )}
            <span>Branch Location</span>
          </div>

          <div
            onClick={() => onNavigate('settings-branding')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 500,
              color: onboarding?.checklist.branding ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {onboarding?.checklist.branding ? (
              <CheckCircle2 size={16} color="var(--color-success)" />
            ) : (
              <Circle size={16} color="var(--color-text-muted)" />
            )}
            <span>Theme & Branding</span>
          </div>

          <div
            onClick={() => onNavigate('settings-staff')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 500,
              color: onboarding?.checklist.staffSetup ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {onboarding?.checklist.staffSetup ? (
              <CheckCircle2 size={16} color="var(--color-success)" />
            ) : (
              <Circle size={16} color="var(--color-text-muted)" />
            )}
            <span>Team Members</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 500,
              color: onboarding?.checklist.loyaltySetup ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {onboarding?.checklist.loyaltySetup ? (
              <CheckCircle2 size={16} color="var(--color-success)" />
            ) : (
              <Circle size={16} color="var(--color-text-muted)" />
            )}
            <span>Customer Loyalty Program</span>
          </div>

        </div>
      </Card>

      {/* 3. Real PostgreSQL KPI Area */}
      <div
        className="responsive-kpi-grid"
        style={{
          marginBottom: 'var(--space-6)',
        }}
      >
        <Card className="kpi-card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="kpi-label" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Total Customers
            </span>
            <div
              className="metric-icon-box"
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                backgroundColor: '#EEF2FF',
                color: '#4F6BFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {metrics?.totalCustomers ?? 0}
          </div>
          <div className="kpi-subtext" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Enrolled in {business?.name || 'this business'}
          </div>
        </Card>

        <Card className="kpi-card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="kpi-label" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Active Branches
            </span>
            <div
              className="metric-icon-box"
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building2 size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {metrics?.activeBranches ?? 0}
          </div>
          <div className="kpi-subtext" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Operating physical locations
          </div>
        </Card>

        <Card className="kpi-card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="kpi-label" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Staff Members
            </span>
            <div
              className="metric-icon-box"
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                backgroundColor: '#F0FDF4',
                color: '#16A34A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserCheck size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {metrics?.staffMembers ?? 0}
          </div>
          <div className="kpi-subtext" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Active team memberships
          </div>
        </Card>

        <Card className="kpi-card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="kpi-label" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Loyalty Programs
            </span>
            <div
              className="metric-icon-box"
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                backgroundColor: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Award size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {metrics?.loyaltyPrograms ?? 0}
          </div>
          <div className="kpi-subtext" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Active reward campaigns
          </div>
        </Card>
      </div>

      {/* 4. Customer Retention Action Center — Context-Aware Recommendations */}
      <Card
        style={{
          marginBottom: 'var(--space-6)',
          padding: 'var(--space-5)',
          border: '1px solid #E2E8F0',
          backgroundColor: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '6px',
                backgroundColor: '#EEF2FF',
                color: '#4F6BFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                Retention Action Center
              </h2>
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                Actionable next steps to turn first-time guests into loyal regulars.
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {/* Action 1: Loyalty Program */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              backgroundColor: '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#4F6BFF', textTransform: 'uppercase' }}>
                  Step 1 • Digital Pass
                </span>
                <StatusBadge
                  status={data?.loyaltyProgram ? 'active' : 'pending'}
                  label={data?.loyaltyProgram ? 'Active' : 'Missing'}
                />
              </div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px', color: 'var(--color-text-primary)' }}>
                {data?.loyaltyProgram ? 'Loyalty Stamp Card' : 'Enable Loyalty Program'}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4 }}>
                {data?.loyaltyProgram
                  ? `Customers earn stamps towards "${data.loyaltyProgram.rewardTitle}".`
                  : 'Configure digital stamps or points so guests get rewarded on every purchase.'}
              </p>
            </div>
            <Button
              variant={data?.loyaltyProgram ? 'outline' : 'primary'}
              size="sm"
              onClick={() => onNavigate('loyalty')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Award size={14} />
              {data?.loyaltyProgram ? 'Configure Program' : 'Set Up Loyalty'}
            </Button>
          </div>

          {/* Action 2: Reward Catalog */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              backgroundColor: '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', textTransform: 'uppercase' }}>
                  Step 2 • Rewards
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  Catalog
                </span>
              </div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px', color: 'var(--color-text-primary)' }}>
                Perks & Vouchers
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4 }}>
                Offer free drinks, appetizers, or discounts to motivate customers to reach their next stamp.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('rewards')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Gift size={14} />
              Manage Rewards Catalog
            </Button>
          </div>

          {/* Action 3: Customer QR Code Entry */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              backgroundColor: '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#D97706', textTransform: 'uppercase' }}>
                  Step 3 • Customer Entry
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  Standee QR
                </span>
              </div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px', color: 'var(--color-text-primary)' }}>
                Counter Standee Pass
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4 }}>
                Place your QR standee on the cashier counter. Customers scan and join without downloading an app.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('customer-preview')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <QrCode size={14} />
              Preview Customer Pass
            </Button>
          </div>

          {/* Action 4: Automated Retention & Re-engagement */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              backgroundColor: '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase' }}>
                  Step 4 • Automations
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  Win-Back
                </span>
              </div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px', color: 'var(--color-text-primary)' }}>
                Retention Triggers
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4 }}>
                Automatically send celebratory rewards on birthdays or re-engagement offers after 30 days of inactivity.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('automations')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Zap size={14} />
              Set Up Automations
            </Button>
          </div>
        </div>
      </Card>

      {/* 5. Two-Column Operational Layout */}
      <div
        className="responsive-two-col"
        style={{
          marginBottom: 'var(--space-6)',
        }}
      >

        {/* Left: Quick Actions & Honest Future States */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Card style={{ padding: 'var(--space-5)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 var(--space-3)' }}>
              Quick Business Actions
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <button
                onClick={() => onNavigate('settings-branches')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Building2 size={16} color="#4F6BFF" />
                <span>Manage Branches</span>
              </button>

              <button
                onClick={() => onNavigate('settings-staff')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  transition: 'all 0.15s ease',
                }}
              >
                <UserCheck size={16} color="#16A34A" />
                <span>Manage Staff</span>
              </button>

              <button
                onClick={() => onNavigate('settings-branding')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Palette size={16} color="#D97706" />
                <span>Theme & Brand</span>
              </button>

              <button
                onClick={() => onNavigate('settings-business')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Settings size={16} color="#64748B" />
                <span>Business Settings</span>
              </button>
            </div>
          </Card>

          {/* Customer Loyalty & Digital Stamp Cards */}
          <Card
            style={{
              padding: 'var(--space-5)',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            {/* Condition 1: Incomplete business setup prerequisite */}
            {!onboarding?.isCompleted && (!onboarding?.checklist.businessInfo || !onboarding?.checklist.branchSetup) ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        backgroundColor: '#EEF2FF',
                        color: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Award size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        Customer Loyalty
                      </h4>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Digital QR Stamp & Points Rewards
                      </span>
                    </div>
                  </div>
                  <StatusBadge status="pending" label="Setup required" />
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    marginBottom: 'var(--space-3)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}
                >
                  <AlertCircle size={16} color="#D97706" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400E', marginBottom: 2 }}>
                      Complete your business setup to configure customer loyalty.
                    </div>
                    <div style={{ fontSize: '11px', color: '#B45309', lineHeight: 1.4 }}>
                      Set up your primary branch location and address details before issuing customer loyalty passes and rewards.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigate('onboarding')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Sparkles size={14} />
                    Complete Business Setup
                  </Button>
                </div>
              </div>
            ) : !data?.loyaltyProgram ? (
              /* Condition 2: Prerequisite satisfied, but loyalty not yet configured */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        backgroundColor: '#EEF2FF',
                        color: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Award size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        Customer Loyalty
                      </h4>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Digital QR Stamp & Points Rewards
                      </span>
                    </div>
                  </div>
                  <StatusBadge status="pending" label="Not configured" />
                </div>

                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 var(--space-3)' }}>
                  Set up your loyalty program to let customers earn stamps or points and unlock rewards.
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid var(--color-border-subtle)',
                    marginBottom: 'var(--space-3)',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted)' }}>Status</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Not configured</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigate('loyalty')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Award size={14} />
                    Set Up Loyalty
                  </Button>
                </div>
              </div>
            ) : (
              /* Condition 3: Loyalty program is active with real PostgreSQL data */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        backgroundColor: '#DCFCE7',
                        color: '#16A34A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Award size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        Customer Loyalty
                      </h4>
                      <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 500 }}>
                        Your customer loyalty program is active.
                      </span>
                    </div>
                  </div>
                  <StatusBadge status="active" label="Active" />
                </div>

                {/* Real PostgreSQL Program Snapshot */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 'var(--space-2)',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid var(--color-border-subtle)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Program
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 2 }}>
                      {data.loyaltyProgram.name}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Type & Target
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 2 }}>
                      {data.loyaltyProgram.type === 'STAMP'
                        ? `${data.loyaltyProgram.targetStamps || 10} stamps`
                        : `${data.loyaltyProgram.pointsPerCurrencyMinor || 10} pts / ₹10`}
                    </div>

                  </div>

                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Reward
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {data.loyaltyProgram.rewardTitle}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Active Passes
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 }}>
                      {data.loyaltyProgram.activeCardsCount} issued
                    </div>
                  </div>
                </div>

                {data.loyaltyProgram.qrCode && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: '#EEF2FF',
                      border: '1px solid #C7D2FE',
                      marginBottom: 'var(--space-3)',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)' }}>
                      <QrCode size={14} />
                      <span>Standee QR: <strong>{data.loyaltyProgram.qrCode.destinationUrl}</strong></span>
                    </div>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {data.loyaltyProgram.qrCode.scanCount} scans
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  <Button

                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate('customer-preview')}
                  >
                    Preview Pass
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigate('loyalty')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Award size={14} />
                    Manage Loyalty
                  </Button>
                </div>
              </div>
            )}
          </Card>

        </div>

        {/* Right: Real Operational Audit Activity */}
        <Card style={{ padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              Recent Workspace Activity
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Audit Trail
            </span>
          </div>

          {recentActivity.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <Clock size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)' }}>
                No recent activity recorded yet. Changes you make to branches, staff, and settings will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {recentActivity.map((event) => (
                <div
                  key={event.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    paddingBottom: 'var(--space-3)',
                    borderBottom: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: event.action.includes('CREATED') || event.action.includes('COMPLETED')
                          ? 'var(--color-success)'
                          : 'var(--color-primary)',
                        marginTop: 5,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {event.action.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {event.entityType} • {event.actor?.name || 'System Operator'}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
};
