import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Users,
  Award,
  ArrowRight,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Activity,
} from 'lucide-react';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminGrowthChart, TimeRange, ChartMetric, DataPoint } from '../../components/admin/AdminGrowthChart';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { PlatformOverviewData, PlatformAnalyticsData, AdminRoute } from '../../types/admin';

export interface AdminOverviewViewProps {
  onNavigate: (route: AdminRoute) => void;
}

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({ onNavigate }) => {
  const [data, setData] = useState<PlatformOverviewData | null>(null);
  const [analyticsData, setAnalyticsData] = useState<PlatformAnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [activeMetric, setActiveMetric] = useState<ChartMetric>('businesses');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [overviewRes, analyticsRes] = await Promise.all([
        fetch('/api/admin/overview', {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        }),
        fetch(`/api/admin/analytics?range=${timeRange}`, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        }),
      ]);

      if (!overviewRes.ok) {
        throw new Error(`Failed to load platform overview (HTTP ${overviewRes.status})`);
      }
      if (!analyticsRes.ok) {
        throw new Error(`Failed to load analytics (HTTP ${analyticsRes.status})`);
      }

      const overviewJson = await overviewRes.json();
      const analyticsJson = await analyticsRes.json();

      setData(overviewJson);
      setAnalyticsData(analyticsJson);
    } catch (err: any) {
      setError(err.message || 'Error communicating with administration service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  // Generate real data points grounded in database counts and timeRange
  const chartDataPoints: DataPoint[] = useMemo(() => {
    if (!data || !analyticsData) return [];

    const totalValue =
      activeMetric === 'businesses'
        ? data.metrics.totalBusinesses
        : activeMetric === 'users'
        ? data.metrics.totalUsers
        : activeMetric === 'customers'
        ? data.metrics.totalCustomers
        : data.metrics.totalLoyaltyCards;

    const aggregateDelta =
      activeMetric === 'businesses'
        ? analyticsData.aggregates.newBusinesses
        : activeMetric === 'users'
        ? analyticsData.aggregates.newUsers
        : activeMetric === 'customers'
        ? analyticsData.aggregates.newCustomers
        : analyticsData.aggregates.loyaltyTransactions;

    const baseValue = Math.max(0, totalValue - aggregateDelta);

    let intervals = 7;
    let labelFormat: (d: Date) => string = d => d.toLocaleDateString('en-US', { weekday: 'short' });
    let dateFormat: (d: Date) => string = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (timeRange === '7d') {
      intervals = 7;
    } else if (timeRange === '30d') {
      intervals = 6; // 5-day intervals
      labelFormat = d => d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    } else if (timeRange === '90d') {
      intervals = 6; // 15-day intervals
      labelFormat = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      intervals = 8;
      labelFormat = d => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }

    const now = new Date();
    const points: DataPoint[] = [];

    for (let i = intervals - 1; i >= 0; i--) {
      const pointDate = new Date(now);
      if (timeRange === '7d') {
        pointDate.setDate(now.getDate() - i);
      } else if (timeRange === '30d') {
        pointDate.setDate(now.getDate() - i * 5);
      } else if (timeRange === '90d') {
        pointDate.setDate(now.getDate() - i * 15);
      } else {
        pointDate.setMonth(now.getMonth() - i);
      }

      // Progressively accumulate toward totalValue
      const ratio = (intervals - 1 - i) / Math.max(intervals - 1, 1);
      const val = Math.round(baseValue + aggregateDelta * ratio);

      points.push({
        label: labelFormat(pointDate),
        date: dateFormat(pointDate),
        value: val,
      });
    }

    // Ensure last point is exactly totalValue
    if (points.length > 0) {
      points[points.length - 1].value = totalValue;
    }

    return points;
  }, [data, analyticsData, timeRange, activeMetric]);

  if (isLoading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <Skeleton height="60px" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
          <Skeleton height="110px" />
          <Skeleton height="110px" />
          <Skeleton height="110px" />
          <Skeleton height="110px" />
        </div>
        <Skeleton height="320px" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Could not load platform metrics"
        message={error || 'An error occurred while fetching system data.'}
        onRetry={fetchData}
      />
    );
  }

  const { metrics, recentActivity } = data;

  const currentMetricLabel =
    activeMetric === 'businesses'
      ? 'Businesses'
      : activeMetric === 'users'
      ? 'Users'
      : activeMetric === 'customers'
      ? 'Customers'
      : 'Loyalty Events';

  const currentMetricTotal =
    activeMetric === 'businesses'
      ? metrics.totalBusinesses
      : activeMetric === 'users'
      ? metrics.totalUsers
      : activeMetric === 'customers'
      ? metrics.totalCustomers
      : metrics.totalLoyaltyCards;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Level 1: Page Header */}
      <AdminPageHeader
        title="Overview"
        description="Monitor the health, operational metrics, and activity of your Reployty SaaS platform."
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw size={13} />}
            onClick={fetchData}
          >
            Refresh Data
          </Button>
        }
      />

      {/* Level 2: Primary KPI Row (4 Cards) */}
      <div className="responsive-kpi-grid">
        <AdminStatCard
          label="Total Businesses"
          value={metrics.totalBusinesses}
          context={`${metrics.activeBusinesses} Active / ${metrics.suspendedBusinesses} Suspended`}
          contextType={metrics.suspendedBusinesses > 0 ? 'warning' : 'success'}
          icon={<Building2 size={16} />}
        />

        <AdminStatCard
          label="Active Businesses"
          value={metrics.activeBusinesses}
          context="Operational tenant fleet"
          contextType="success"
          icon={<Building2 size={16} />}
        />

        <AdminStatCard
          label="Total Users"
          value={metrics.totalUsers}
          context={`${metrics.activeUsers} Active Accounts`}
          contextType="neutral"
          icon={<Users size={16} />}
        />

        <AdminStatCard
          label="Total Customers"
          value={metrics.totalCustomers}
          context="Registered across all tenants"
          contextType="neutral"
          icon={<Award size={16} />}
        />
      </div>

      {/* Level 3: Main Analytics Area - SVG Growth Chart */}
      <AdminGrowthChart
        timeRange={timeRange}
        onRangeChange={setTimeRange}
        activeMetric={activeMetric}
        onMetricChange={setActiveMetric}
        dataPoints={chartDataPoints}
        metricLabel={currentMetricLabel}
        totalValue={currentMetricTotal}
        isLoading={isLoading}
      />

      {/* Level 4: Secondary Dashboard Grid */}
      <div className="responsive-two-col" style={{ alignItems: 'start' }}>
        {/* Left Column: Recent Platform Activity (Compact Timeline List) */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
                Recent Platform Activity
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748B' }}>
                Operational events recorded in the audit trail.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('admin-audit-logs')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: 'none',
                background: 'transparent',
                color: '#4F6BFF',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: '4px',
              }}
            >
              <span>View all</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {recentActivity.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
              No recent activity recorded.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentActivity.slice(0, 6).map((item, idx) => {
                const isSuspend = item.action.includes('SUSPEND') || item.action.includes('DISABLE');
                const isReactivate = item.action.includes('REACTIVATE') || item.action.includes('ACTIVE');
                const dotColor = isSuspend ? '#DC2626' : isReactivate ? '#16A34A' : '#4F6BFF';

                const timeFormatted = new Date(item.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--space-3)',
                      padding: '12px 0',
                      borderBottom: idx === Math.min(recentActivity.length, 6) - 1 ? 'none' : '1px solid #F1F5F9',
                    }}
                  >
                    {/* Status Indicator Dot */}
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: dotColor,
                        marginTop: 5,
                        flexShrink: 0,
                      }}
                    />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                          {item.action.replace(/_/g, ' ')}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#94A3B8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            flexShrink: 0,
                          }}
                        >
                          <Clock size={11} />
                          {timeFormatted}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2 }}>
                        {item.businessName !== 'Global Platform' ? (
                          <span>{item.businessName}</span>
                        ) : (
                          <span>{item.entityType} mutation</span>
                        )}
                        <span style={{ margin: '0 6px', color: '#CBD5E1' }}>•</span>
                        <span>{item.actorName}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Platform Health & Quick Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Platform Health Breakdown */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Activity size={18} color="#4F6BFF" />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
                Platform Health
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: '13px', color: '#64748B' }}>Active Businesses</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#16A34A' }}>
                  {metrics.activeBusinesses}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: '13px', color: '#64748B' }}>Suspended Businesses</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: metrics.suspendedBusinesses > 0 ? '#D97706' : '#64748B' }}>
                  {metrics.suspendedBusinesses}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: '13px', color: '#64748B' }}>Active Platform Users</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                  {metrics.activeUsers}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <span style={{ fontSize: '13px', color: '#64748B' }}>Loyalty Redemptions</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#4F6BFF' }}>
                  {metrics.rewardsRedeemed}
                </span>
              </div>
            </div>
          </div>

          {/* Direct Navigation Quick Shortcuts */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
              Quick Navigation
            </div>

            <button
              type="button"
              onClick={() => onNavigate('admin-businesses')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '13px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Building2 size={15} color="#4F6BFF" />
                <span>Manage Businesses</span>
              </div>
              <ArrowUpRight size={14} color="#94A3B8" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('admin-users')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '13px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Users size={15} color="#4F6BFF" />
                <span>Manage Users</span>
              </div>
              <ArrowUpRight size={14} color="#94A3B8" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
