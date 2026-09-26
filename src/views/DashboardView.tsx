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
} from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
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
            <span>Loyalty Pass (Phase 6)</span>
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

      {/* 4. Two-Column Operational Layout */}
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

          {/* Honest Setup State for Loyalty & Customer Retention Engine */}
          <Card
            style={{
              padding: 'var(--space-5)',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '10px',
                  backgroundColor: '#EEF2FF',
                  color: '#4F6BFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Award size={18} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Customer Loyalty Pass
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  Digital QR Stamp & Points Rewards (Coming in Phase 6)
                </span>
              </div>
            </div>

            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 var(--space-3)' }}>
              Once you complete business onboarding and configure your locations, your digital stamp card passes, points thresholds, and QR standees will unlock here.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                fontSize: '12px',
              }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>Status: Foundation configured</span>
              <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Scheduled: Phase 6</span>
            </div>
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
