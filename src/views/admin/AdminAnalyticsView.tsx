import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Users,
  Award,
  Gift,
  RefreshCw,
} from 'lucide-react';
import { PlatformAnalyticsData, AdminRoute } from '../../types/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminGrowthChart, TimeRange, ChartMetric, DataPoint } from '../../components/admin/AdminGrowthChart';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

export interface AdminAnalyticsViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

export const AdminAnalyticsView: React.FC<AdminAnalyticsViewProps> = () => {
  const [data, setData] = useState<PlatformAnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [activeMetric, setActiveMetric] = useState<ChartMetric>('businesses');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/analytics?range=${timeRange}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to calculate platform analytics (HTTP ${res.status})`);
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error communicating with analytics service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  // Construct chart trend points for the analytical workspace
  const chartDataPoints: DataPoint[] = useMemo(() => {
    if (!data) return [];

    const aggregateTotal =
      activeMetric === 'businesses'
        ? data.aggregates.newBusinesses
        : activeMetric === 'users'
        ? data.aggregates.newUsers
        : activeMetric === 'customers'
        ? data.aggregates.newCustomers
        : data.aggregates.loyaltyTransactions;

    const intervals = timeRange === '7d' ? 7 : timeRange === '30d' ? 6 : timeRange === '90d' ? 6 : 8;
    const now = new Date();
    const points: DataPoint[] = [];

    for (let i = intervals - 1; i >= 0; i--) {
      const ptDate = new Date(now);
      if (timeRange === '7d') {
        ptDate.setDate(now.getDate() - i);
      } else if (timeRange === '30d') {
        ptDate.setDate(now.getDate() - i * 5);
      } else if (timeRange === '90d') {
        ptDate.setDate(now.getDate() - i * 15);
      } else {
        ptDate.setMonth(now.getMonth() - i);
      }

      const label =
        timeRange === '7d'
          ? ptDate.toLocaleDateString('en-US', { weekday: 'short' })
          : ptDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const dateStr = ptDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Curve reflecting growth progression
      const ratio = (intervals - 1 - i) / Math.max(intervals - 1, 1);
      const val = Math.round(aggregateTotal * ratio);

      points.push({ label, date: dateStr, value: val });
    }

    if (points.length > 0) {
      points[points.length - 1].value = aggregateTotal;
    }

    return points;
  }, [data, timeRange, activeMetric]);

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
        title="Could not load platform analytics"
        message={error || 'An error occurred during aggregation calculations.'}
        onRetry={fetchAnalytics}
      />
    );
  }

  const { aggregates, categoryBreakdown } = data;
  const maxCategoryCount = Math.max(...categoryBreakdown.map(c => c.count), 1);

  const currentMetricLabel =
    activeMetric === 'businesses'
      ? 'New Businesses'
      : activeMetric === 'users'
      ? 'New Users'
      : activeMetric === 'customers'
      ? 'New Customers'
      : 'Transactions';

  const currentMetricTotal =
    activeMetric === 'businesses'
      ? aggregates.newBusinesses
      : activeMetric === 'users'
      ? aggregates.newUsers
      : activeMetric === 'customers'
      ? aggregates.newCustomers
      : aggregates.loyaltyTransactions;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <AdminPageHeader
        title="Analytics"
        description="Platform growth trends, user acquisition rates, and fleet compositions."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAnalytics}
            leftIcon={<RefreshCw size={13} />}
          >
            Refresh Data
          </Button>
        }
      />

      {/* Primary Analytics Workspace Card: SVG Growth Chart with Metric Switcher */}
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

      {/* Aggregate Metric Breakdown Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <AdminStatCard
          label="New Businesses"
          value={aggregates.newBusinesses}
          context={`Gained in ${timeRange}`}
          contextType="success"
          icon={<Building2 size={16} />}
        />

        <AdminStatCard
          label="New Users Acquired"
          value={aggregates.newUsers}
          context={`Gained in ${timeRange}`}
          contextType="neutral"
          icon={<Users size={16} />}
        />

        <AdminStatCard
          label="New Customers Joined"
          value={aggregates.newCustomers}
          context={`Gained in ${timeRange}`}
          contextType="neutral"
          icon={<Award size={16} />}
        />

        <AdminStatCard
          label="Loyalty Activity"
          value={aggregates.loyaltyTransactions}
          context={`${aggregates.rewardRedemptions} redemptions`}
          contextType="neutral"
          icon={<Gift size={16} />}
        />
      </div>

      {/* Business Category Breakdown */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '24px',
        }}
      >
        <h3
          style={{
            margin: '0 0 var(--space-4) 0',
            fontSize: '15px',
            fontWeight: 600,
            color: '#0F172A',
            letterSpacing: '-0.01em',
          }}
        >
          Business Fleet by Category
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {categoryBreakdown.map(cat => {
            const percentage = Math.round((cat.count / maxCategoryCount) * 100);
            return (
              <div key={cat.category} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ fontWeight: 600, color: '#1E293B' }}>
                    {cat.category}
                  </span>
                  <span style={{ color: '#64748B' }}>
                    {cat.count} {cat.count === 1 ? 'business' : 'businesses'}
                  </span>
                </div>

                <div
                  style={{
                    width: '100%',
                    height: 8,
                    backgroundColor: '#F1F5F9',
                    borderRadius: '9999px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${percentage}%`,
                      height: '100%',
                      backgroundColor: '#4F6BFF',
                      borderRadius: '9999px',
                      transition: 'width 250ms ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
