import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Award,
  Gift,
  Tag,
  Star,
  Store,
  Download,
  RefreshCw,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Layers,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  AnalyticsOverview,
  CustomerAnalytics,
  RetentionAnalytics,
  LoyaltyAnalytics,
  RewardsAnalytics,
  OffersAnalytics,
  ReviewAnalytics,
  BranchAnalytics,
  DateRangePreset,
  MetricComparison,
  ExportType,
} from '../../types/analytics';
import {
  AnalyticsAreaChart,
  AnalyticsBarChart,
  AnalyticsDonutChart,
} from '../../components/analytics/AnalyticsCharts';

interface BranchOption {
  id: string;
  name: string;
  isPrimary?: boolean;
}

export interface BusinessAnalyticsViewProps {
  onNavigate?: (route: string) => void;
}

export const BusinessAnalyticsView: React.FC<BusinessAnalyticsViewProps> = ({ onNavigate: _onNavigate }) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<
    'overview' | 'retention' | 'loyalty' | 'offers' | 'reviews' | 'branches'
  >('overview');

  // Filter state
  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [compareEnabled, setCompareEnabled] = useState<boolean>(true);

  // Data states
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [customerData, setCustomerData] = useState<CustomerAnalytics | null>(null);
  const [retentionData, setRetentionData] = useState<RetentionAnalytics | null>(null);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyAnalytics | null>(null);
  const [rewardsData, setRewardsData] = useState<RewardsAnalytics | null>(null);
  const [offersData, setOffersData] = useState<OffersAnalytics | null>(null);
  const [reviewData, setReviewData] = useState<ReviewAnalytics | null>(null);
  const [branchData, setBranchData] = useState<BranchAnalytics | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFormulaGuide, setShowFormulaGuide] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  // Fetch branches on mount
  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/business/branches');
      if (res.ok) {
        const data = await res.json();
        setBranches(Array.isArray(data) ? data : data.branches || []);
      }
    } catch (err) {
      console.error('Failed to load branches', err);
    }
  };

  // Build query string
  const buildQuery = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams();
      params.set('preset', preset);
      if (preset === 'custom') {
        if (customStart) params.set('startDate', customStart);
        if (customEnd) params.set('endDate', customEnd);
      }
      if (selectedBranchId !== 'all') {
        params.set('branchId', selectedBranchId);
      }
      params.set('compare', compareEnabled ? 'true' : 'false');

      if (extra) {
        Object.entries(extra).forEach(([k, v]) => params.set(k, v));
      }
      return params.toString();
    },
    [preset, customStart, customEnd, selectedBranchId, compareEnabled]
  );

  // Main data fetch based on active tab
  const fetchAnalyticsData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const q = buildQuery();

      if (activeTab === 'overview') {
        const [oRes, cRes] = await Promise.all([
          fetch(`/api/business/analytics/overview?${q}`),
          fetch(`/api/business/analytics/customers?${q}`),
        ]);
        if (!oRes.ok) throw await oRes.json();
        setOverview(await oRes.json());
        if (cRes.ok) setCustomerData(await cRes.json());
      } else if (activeTab === 'retention') {
        const res = await fetch(`/api/business/analytics/retention?${q}`);
        if (!res.ok) throw await res.json();
        setRetentionData(await res.json());
      } else if (activeTab === 'loyalty') {
        const [lRes, rRes] = await Promise.all([
          fetch(`/api/business/analytics/loyalty?${q}`),
          fetch(`/api/business/analytics/rewards?${q}`),
        ]);
        if (!lRes.ok) throw await lRes.json();
        setLoyaltyData(await lRes.json());
        if (rRes.ok) setRewardsData(await rRes.json());
      } else if (activeTab === 'offers') {
        const res = await fetch(`/api/business/analytics/offers?${q}`);
        if (!res.ok) throw await res.json();
        setOffersData(await res.json());
      } else if (activeTab === 'reviews') {
        const res = await fetch(`/api/business/analytics/reviews?${q}`);
        if (!res.ok) throw await res.json();
        setReviewData(await res.json());
      } else if (activeTab === 'branches') {
        const res = await fetch(`/api/business/analytics/branches?${q}`);
        if (!res.ok) throw await res.json();
        setBranchData(await res.json());
      }
    } catch (err: any) {
      console.error('Analytics load error:', err);
      setErrorMessage(err.error || 'Failed to load analytics metrics');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, buildQuery]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Export CSV handler
  const handleExportCsv = async (type: ExportType) => {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const q = buildQuery({ type });
      const res = await fetch(`/api/business/analytics/export?${q}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `reployty_${type}_${preset}.csv`;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export CSV error:', err);
      alert('Failed to download CSV export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Helper component to render KPI comparison card
  const renderKpiCard = (
    title: string,
    metric: MetricComparison | number,
    icon: React.ReactNode,
    suffix: string = '',
    prefix: string = '',
    tooltip?: string
  ) => {
    const isComparison = typeof metric === 'object' && metric !== null && 'current' in metric;
    const currentVal = isComparison ? metric.current : metric;

    return (
      <Card
        style={{
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>{title}</span>
          <div
            style={{
              padding: '6px',
              backgroundColor: '#EEF2FF',
              color: '#4F6BFF',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '28px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {prefix}
            {currentVal.toLocaleString()}
            {suffix}
          </span>
        </div>

        {isComparison && compareEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            {metric.delta === 0 ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  color: '#64748B',
                  fontWeight: 600,
                  backgroundColor: '#F1F5F9',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                <Minus size={12} /> 0%
              </span>
            ) : metric.delta > 0 ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  color: '#059669',
                  fontWeight: 600,
                  backgroundColor: '#ECFDF5',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                <TrendingUp size={12} /> +{metric.percentChange ?? 0}%
              </span>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  color: '#DC2626',
                  fontWeight: 600,
                  backgroundColor: '#FEF2F2',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                <TrendingDown size={12} /> {metric.percentChange ?? 0}%
              </span>
            )}
            <span style={{ color: '#94A3B8' }}>
              vs prev ({prefix}
              {metric.previous.toLocaleString()}
              {suffix})
            </span>
          </div>
        )}

        {tooltip && (
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{tooltip}</div>
        )}
      </Card>
    );
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: '#0F172A',
              letterSpacing: '-0.02em',
              margin: '0 0 6px 0',
            }}
          >
            Analytics & Business Intelligence
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748B' }}>
            Authoritative performance metrics, customer retention, loyalty health, and multi-branch intelligence.
          </p>
        </div>

        {/* Global Controls: Date Preset, Branch Filter, Compare Toggle & CSV Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Preset Dropdown */}
          <div style={{ position: 'relative' }}>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DateRangePreset)}
              style={{
                height: '38px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 500,
                color: '#0F172A',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="this_month">This Month</option>
              <option value="prev_month">Previous Month</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom Date Pickers if custom selected */}
          {preset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{
                  height: '36px',
                  padding: '0 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                }}
              />
              <span style={{ fontSize: '12px', color: '#64748B' }}>to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{
                  height: '36px',
                  padding: '0 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                }}
              />
            </div>
          )}

          {/* Branch Filter */}
          <div style={{ position: 'relative' }}>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              style={{
                height: '38px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 500,
                color: '#0F172A',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.isPrimary ? '(Primary)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Compare Toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              color: '#334155',
              cursor: 'pointer',
              userSelect: 'none',
              backgroundColor: '#F8FAFC',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
            }}
          >
            <input
              type="checkbox"
              checked={compareEnabled}
              onChange={(e) => setCompareEnabled(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Compare
          </label>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAnalyticsData}
            disabled={isLoading}
            style={{ height: '38px', padding: '0 12px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </Button>

          {/* Export CSV Dropdown */}
          <div style={{ position: 'relative' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExporting}
              style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} />
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
              <ChevronDown size={14} />
            </Button>

            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '44px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                  padding: '6px',
                  minWidth: '190px',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {(
                  [
                    { label: 'Overview Metrics', type: 'overview' },
                    { label: 'Customers & Status', type: 'customers' },
                    { label: 'Loyalty Transactions', type: 'loyalty' },
                    { label: 'Reward Redemptions', type: 'rewards' },
                    { label: 'Offer Redemptions', type: 'offers' },
                    { label: 'Customer Reviews', type: 'reviews' },
                    { label: 'Branch Comparison', type: 'branches' },
                  ] as { label: string; type: ExportType }[]
                ).map((item) => (
                  <button
                    key={item.type}
                    onClick={() => handleExportCsv(item.type)}
                    style={{
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: '#0F172A',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '1px solid #E2E8F0',
          marginBottom: '24px',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {[
          { id: 'overview', label: 'Overview', icon: <TrendingUp size={16} /> },
          { id: 'retention', label: 'Retention & Cohorts', icon: <Users size={16} /> },
          { id: 'loyalty', label: 'Loyalty & Rewards', icon: <Award size={16} /> },
          { id: 'offers', label: 'Special Offers', icon: <Tag size={16} /> },
          { id: 'reviews', label: 'Reviews & Feedback', icon: <Star size={16} /> },
          { id: 'branches', label: 'Branch Comparison', icon: <Store size={16} /> },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                border: 'none',
                borderBottom: isActive ? '2px solid #4F6BFF' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: isActive ? '#4F6BFF' : '#64748B',
                fontWeight: isActive ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {errorMessage && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '8px',
            color: '#991B1B',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <ShieldAlert size={20} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading state skeleton */}
      {isLoading && (
        <div
          style={{
            padding: '48px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            color: '#64748B',
          }}
        >
          <RefreshCw size={28} className="animate-spin" color="#4F6BFF" />
          <span style={{ fontSize: '14px' }}>Loading real-time business intelligence...</span>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {!isLoading && activeTab === 'overview' && overview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Top KPI Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {renderKpiCard('Total Customers', overview.metrics.totalCustomers, <Users size={18} />)}
            {renderKpiCard('New Customers', overview.metrics.newCustomers, <Users size={18} />)}
            {renderKpiCard('Active Customers', overview.metrics.activeCustomers, <TrendingUp size={18} />)}
            {renderKpiCard('Total Visits / Activity', overview.metrics.totalVisits, <Store size={18} />)}
            {renderKpiCard('Stamps Awarded', overview.metrics.stampsIssued, <Award size={18} />)}
            {renderKpiCard('Points Awarded', overview.metrics.pointsIssued, <Award size={18} />)}
            {renderKpiCard('Rewards Redeemed', overview.metrics.rewardsRedeemed, <Gift size={18} />)}
            {renderKpiCard('Offers Redeemed', overview.metrics.offersRedeemed, <Tag size={18} />)}
            {renderKpiCard('Avg Review Rating', overview.metrics.averageRating, <Star size={18} />, '★')}
          </div>

          {/* Activity Timeline Chart */}
          <Card style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
                  Customer Visits & Activity Timeline
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>
                  {overview.dateRange.current.label}{' '}
                  {compareEnabled && `(compared to ${overview.dateRange.previous.label})`}
                </p>
              </div>
            </div>

            <AnalyticsAreaChart
              data={overview.trends.visitsTimeline}
              height={260}
              valueSuffix=" visits"
            />
          </Card>

          {/* Secondary Breakdown Row */}
          {customerData && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '20px',
              }}
            >
              {/* Customer Lifecycle Statuses */}
              <Card style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>
                  Customer Base Distribution
                </h3>
                <AnalyticsDonutChart
                  segments={[
                    { label: 'Active', value: customerData.statusDistribution.active, color: '#10B981' },
                    { label: 'VIP', value: customerData.statusDistribution.vip, color: '#8B5CF6' },
                    { label: 'At Risk', value: customerData.statusDistribution.atRisk, color: '#F59E0B' },
                    { label: 'Inactive', value: customerData.statusDistribution.inactive, color: '#94A3B8' },
                  ]}
                  centerLabel="Customers"
                  centerValue={customerData.totalCustomers}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                    <span>Active: <strong>{customerData.statusDistribution.active}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#8B5CF6' }} />
                    <span>VIP: <strong>{customerData.statusDistribution.vip}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
                    <span>At Risk: <strong>{customerData.statusDistribution.atRisk}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#94A3B8' }} />
                    <span>Inactive: <strong>{customerData.statusDistribution.inactive}</strong></span>
                  </div>
                </div>
              </Card>

              {/* Customer Acquisition Mix */}
              <Card style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>
                  Customer Acquisition Mix
                </h3>
                <AnalyticsBarChart
                  data={[
                    { label: 'New Patrons', value: customerData.acquisitionMix.newCustomers, color: '#4F6BFF' },
                    { label: 'Returning Patrons', value: customerData.acquisitionMix.returningCustomers, color: '#10B981' },
                  ]}
                  horizontal
                  valueSuffix=" patrons"
                />
              </Card>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RETENTION & COHORTS */}
      {!isLoading && activeTab === 'retention' && retentionData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Retention KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {renderKpiCard(
              'Returning Customer Rate',
              retentionData.returningCustomerRate,
              <TrendingUp size={18} />,
              '%',
              '',
              '% of customers with >1 visit during this period'
            )}
            {renderKpiCard(
              'Repeat Visit Rate',
              retentionData.repeatVisitRate,
              <Store size={18} />,
              '%',
              '',
              '% of total visits that are 2nd+ repeat visits'
            )}
            {renderKpiCard(
              'Reactivated Customers',
              retentionData.reactivatedCustomers,
              <RefreshCw size={18} />,
              '',
              '',
              'Visited after > 30 days of inactivity'
            )}
            {renderKpiCard(
              'At Risk Customers',
              retentionData.atRiskCustomerCount,
              <AlertCircle size={18} />,
              '',
              '',
              'Customers inactive between 30–60 days'
            )}
          </div>

          {/* Retention Breakdown Info */}
          <Card style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
              Period Visit Frequency Breakdown
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '13px', color: '#64748B' }}>Total Visiting Customers</span>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
                  {retentionData.totalCustomersWithVisits.toLocaleString()}
                </div>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '13px', color: '#64748B' }}>Single-Visit Customers</span>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
                  {retentionData.singleVisitCustomers.toLocaleString()}
                </div>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#EEF2FF', borderRadius: '8px', border: '1px solid #C7D2FE' }}>
                <span style={{ fontSize: '13px', color: '#4338CA' }}>Multi-Visit (Repeat) Customers</span>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#4338CA', marginTop: '4px' }}>
                  {retentionData.multiVisitCustomers.toLocaleString()}
                </div>
              </div>
            </div>
          </Card>

          {/* Educational Calculation Guide */}
          <Card style={{ padding: '24px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setShowFormulaGuide(!showFormulaGuide)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <HelpCircle size={18} color="#4F6BFF" />
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                  How are retention & comparison metrics calculated?
                </h4>
              </div>
              <ChevronDown
                size={16}
                style={{
                  transform: showFormulaGuide ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              />
            </div>

            {showFormulaGuide && (
              <div style={{ marginTop: '16px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                <p>
                  <strong>Returning Customer Rate:</strong> Calculated as{' '}
                  <code style={{ backgroundColor: '#E2E8F0', padding: '2px 6px', borderRadius: '4px' }}>
                    {retentionData.definitions.returningCustomerRate}
                  </code>
                  . It measures what percentage of unique visiting customers made more than 1 visit during the selected period.
                </p>
                <p>
                  <strong>Repeat Visit Rate:</strong> Calculated as{' '}
                  <code style={{ backgroundColor: '#E2E8F0', padding: '2px 6px', borderRadius: '4px' }}>
                    {retentionData.definitions.repeatVisitRate}
                  </code>
                  . It measures the share of total transaction volume driven by repeat visits.
                </p>
                <p>
                  <strong>Reactivated Customers:</strong> Calculated as{' '}
                  <code style={{ backgroundColor: '#E2E8F0', padding: '2px 6px', borderRadius: '4px' }}>
                    {retentionData.definitions.reactivatedCustomer}
                  </code>
                  . Helps identify lapsed patrons who returned to your establishment.
                </p>
                <p>
                  <strong>Comparison Periods:</strong> Automatically pairs your selected date range with the immediately preceding identical duration (e.g. Last 30 Days vs the 30 days prior).
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: LOYALTY & REWARDS */}
      {!isLoading && activeTab === 'loyalty' && loyaltyData && rewardsData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Loyalty KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {renderKpiCard('Active Loyalty Members', loyaltyData.activeMembers, <Award size={18} />)}
            {renderKpiCard('Stamps Issued', loyaltyData.stampsIssued, <Award size={18} />)}
            {renderKpiCard('Points Issued', loyaltyData.pointsIssued, <Award size={18} />)}
            {renderKpiCard('Rewards Claimed', rewardsData.totalClaimed, <Gift size={18} />)}
            {renderKpiCard('Rewards Redeemed', rewardsData.totalRedeemed, <CheckCircle2 size={18} />)}
            {renderKpiCard('Redemption Rate', rewardsData.overallRedemptionRate, <TrendingUp size={18} />, '%')}
          </div>

          {/* Stamp Issuance Timeline */}
          <Card style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
              Stamp Issuance Activity Over Time
            </h3>
            <AnalyticsAreaChart
              data={loyaltyData.trends.stampsOverTime}
              color="#8B5CF6"
              height={240}
              valueSuffix=" stamps"
            />
          </Card>

          {/* Top Claimed and Redeemed Rewards */}
          <Card style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
              Top Performing Rewards Catalog Items
            </h3>
            {rewardsData.topRewards.length === 0 ? (
              <p style={{ color: '#64748B', fontSize: '13px' }}>No rewards claimed or redeemed in this period.</p>
            ) : (
              <AnalyticsBarChart
                data={rewardsData.topRewards.map((r) => ({
                  label: r.title,
                  value: r.claimedCount,
                  secondaryValue: r.redeemedCount,
                  color: '#4F6BFF',
                }))}
                horizontal
                valueSuffix=" claimed"
              />
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: OFFERS */}
      {!isLoading && activeTab === 'offers' && offersData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Offers KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
            }}
          >
            {renderKpiCard('Active Offers', offersData.activeOffersCount, <Tag size={18} />)}
            {renderKpiCard('Total Redemptions', offersData.totalRedemptions, <CheckCircle2 size={18} />)}
          </div>

          {/* Offer Redemptions Timeline */}
          <Card style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
              Special Offer Redemptions Timeline
            </h3>
            <AnalyticsAreaChart
              data={offersData.redemptionsOverTime}
              color="#10B981"
              height={240}
              valueSuffix=" redemptions"
            />
          </Card>

          {/* Top Offers */}
          <Card style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
              Top Performing Offers by Customer Redemptions
            </h3>
            {offersData.topOffers.length === 0 ? (
              <p style={{ color: '#64748B', fontSize: '13px' }}>No offer redemptions recorded in this period.</p>
            ) : (
              <AnalyticsBarChart
                data={offersData.topOffers.map((o) => ({
                  label: o.title,
                  value: o.redemptionCount,
                  color: '#10B981',
                }))}
                horizontal
                valueSuffix=" redeemed"
              />
            )}
          </Card>
        </div>
      )}

      {/* TAB 5: REVIEWS & FEEDBACK */}
      {!isLoading && activeTab === 'reviews' && reviewData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Reviews KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {renderKpiCard('Average Rating', reviewData.averageRating, <Star size={18} />, '★')}
            {renderKpiCard('Total Reviews / Feedback', reviewData.totalReviews, <Star size={18} />)}
            {renderKpiCard('AI Draft Coverage', reviewData.aiResponseCoverage, <Layers size={18} />, '%')}
            {renderKpiCard(
              'Google Review Targets',
              reviewData.googleTargetCount,
              <ArrowUpRight size={18} />,
              '',
              '',
              'Direct CTA clicks toward Google Review URL'
            )}
            {renderKpiCard(
              'Private Feedback',
              reviewData.privateFeedbackCount,
              <HelpCircle size={18} />,
              '',
              '',
              'Internal feedback messages'
            )}
          </div>

          {/* Charts Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
            }}
          >
            {/* Star Distribution */}
            <Card style={{ padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>
                Star Rating Breakdown (1★ - 5★)
              </h3>
              <AnalyticsBarChart
                data={[
                  { label: '5 Stars', value: reviewData.ratingDistribution[5] || 0, color: '#10B981' },
                  { label: '4 Stars', value: reviewData.ratingDistribution[4] || 0, color: '#34D399' },
                  { label: '3 Stars', value: reviewData.ratingDistribution[3] || 0, color: '#FBBF24' },
                  { label: '2 Stars', value: reviewData.ratingDistribution[2] || 0, color: '#F97316' },
                  { label: '1 Star', value: reviewData.ratingDistribution[1] || 0, color: '#EF4444' },
                ]}
                horizontal
                valueSuffix=" reviews"
              />
            </Card>

            {/* Sentiment Breakdown */}
            <Card style={{ padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>
                Customer Sentiment
              </h3>
              <AnalyticsDonutChart
                segments={[
                  { label: 'Positive', value: reviewData.sentimentCounts.positive, color: '#10B981' },
                  { label: 'Neutral', value: reviewData.sentimentCounts.neutral, color: '#F59E0B' },
                  { label: 'Negative', value: reviewData.sentimentCounts.negative, color: '#EF4444' },
                ]}
                centerLabel="Reviews"
                centerValue={reviewData.totalReviews}
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                  <span>Positive: <strong>{reviewData.sentimentCounts.positive}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
                  <span>Neutral: <strong>{reviewData.sentimentCounts.neutral}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
                  <span>Negative: <strong>{reviewData.sentimentCounts.negative}</strong></span>
                </div>
              </div>
            </Card>
          </div>

          {/* Google Semantics Disclosure Notice */}
          <div
            style={{
              padding: '14px 18px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#1E40AF',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <AlertCircle size={18} />
            <span>
              <strong>Note on Google Reviews:</strong> Google Review Targets indicate instances where satisfied customers were directed to your external Google Review page via the smart routing CTA. Reployty does not publish or scrape external Google profiles.
            </span>
          </div>
        </div>
      )}

      {/* TAB 6: BRANCH COMPARISON */}
      {!isLoading && activeTab === 'branches' && branchData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Card style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
              Branch Performance Comparison Table
            </h3>

            {branchData.branches.length === 0 ? (
              <p style={{ color: '#64748B', fontSize: '13px' }}>No branch data recorded.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600 }}>
                      <th style={{ padding: '12px 16px' }}>Branch Name</th>
                      <th style={{ padding: '12px 16px' }}>Total Customers</th>
                      <th style={{ padding: '12px 16px' }}>Period Visits</th>
                      <th style={{ padding: '12px 16px' }}>Stamps Issued</th>
                      <th style={{ padding: '12px 16px' }}>Points Issued</th>
                      <th style={{ padding: '12px 16px' }}>Offer Redemptions</th>
                      <th style={{ padding: '12px 16px' }}>Avg Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchData.branches.map((b) => (
                      <tr key={b.branchId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>
                          {b.branchName}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>{b.customerCount.toLocaleString()}</td>
                        <td style={{ padding: '12px 16px', color: '#334155', fontWeight: 600 }}>
                          {b.visitCount.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {b.stampsIssued.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {b.pointsIssued.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {b.offerRedemptions.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {b.averageRating > 0 ? `${b.averageRating} ★` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Visits by Branch Bar Chart */}
          <Card style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
              Activity Visits by Branch
            </h3>
            <AnalyticsBarChart
              data={branchData.branches.map((b) => ({
                label: b.branchName,
                value: b.visitCount,
                color: '#4F6BFF',
              }))}
              height={220}
              valueSuffix=" visits"
            />
          </Card>
        </div>
      )}
    </div>
  );
};
