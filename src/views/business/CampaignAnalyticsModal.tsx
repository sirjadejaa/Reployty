import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  CheckCircle,
  Eye,
  MousePointer,
  Sparkles,
  Clock,
  Plus,
  RefreshCw,
  Check,
  Copy,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  CampaignAnalyticsSummary,
  AttributedConversionItem,
  CampaignTimelineEvent,
  TrackedLinkItem,
} from '../../types/analytics';

interface CampaignAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string | null;
  campaignName?: string;
}

type TabType = 'funnel' | 'conversions' | 'links' | 'timeline';

export const CampaignAnalyticsModal: React.FC<CampaignAnalyticsModalProps> = ({
  isOpen,
  onClose,
  campaignId,
  campaignName,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('funnel');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [summary, setSummary] = useState<CampaignAnalyticsSummary | null>(null);
  const [conversions, setConversions] = useState<AttributedConversionItem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<CampaignTimelineEvent[]>([]);
  const [trackedLinks, setTrackedLinks] = useState<TrackedLinkItem[]>([]);

  // Create Link state
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Date filter state
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');

  const fetchAnalyticsData = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (dateFilter !== 'all') {
        const now = new Date();
        const days = dateFilter === '7d' ? 7 : dateFilter === '30d' ? 30 : 90;
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        params.set('startDate', start.toISOString());
      }

      const [summaryRes, convRes, timeRes, linksRes] = await Promise.all([
        fetch(`/api/business/campaigns/${campaignId}/analytics?${params.toString()}`),
        fetch(`/api/business/campaigns/${campaignId}/conversions`),
        fetch(`/api/business/campaigns/${campaignId}/timeline`),
        fetch(`/api/business/campaigns/${campaignId}/links`),
      ]);

      if (!summaryRes.ok) {
        throw new Error('Failed to load campaign analytics');
      }

      const summaryData = await summaryRes.json();
      const convData = convRes.ok ? await convRes.json() : { conversions: [] };
      const timeData = timeRes.ok ? await timeRes.json() : { events: [] };
      const linksData = linksRes.ok ? await linksRes.json() : [];

      setSummary(summaryData);
      setConversions(convData.conversions || []);
      setTimelineEvents(timeData.events || []);
      setTrackedLinks(Array.isArray(linksData) ? linksData : []);
    } catch (err: any) {
      setError(err.message || 'Error fetching analytics');
    } finally {
      setLoading(false);
    }
  }, [campaignId, dateFilter]);

  useEffect(() => {
    if (isOpen && campaignId) {
      fetchAnalyticsData();
    }
  }, [isOpen, campaignId, fetchAnalyticsData]);

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignId || !newLinkUrl.trim()) return;

    setCreatingLink(true);
    setLinkError(null);

    try {
      const res = await fetch(`/api/business/campaigns/${campaignId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalUrl: newLinkUrl.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create tracking link');
      }

      const newLink = await res.json();
      setTrackedLinks((prev) => [newLink, ...prev]);
      setNewLinkUrl('');
    } catch (err: any) {
      setLinkError(err.message);
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCopyLink = (url: string, code: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getConversionBadgeVariant = (type: string) => {
    switch (type) {
      case 'RETURN_VISIT':
        return 'completed';
      case 'LOYALTY_STAMP':
      case 'LOYALTY_POINTS':
        return 'active';
      case 'REWARD_REDEMPTION':
      case 'OFFER_REDEMPTION':
        return 'completed';
      case 'CUSTOMER_REACTIVATED':
        return 'active';
      default:
        return 'pending';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={summary?.campaignName || campaignName || 'Campaign Analytics'}
      maxWidth="820px"
    >
      <div className="space-y-5 text-xs text-[var(--color-text-primary)]">
        {/* Subheader with Badges and Attribution Window */}
        {summary && (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--color-border-subtle)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {summary.channel}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                {summary.type}
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                <Clock size={12} />
                <span>{summary.attributionWindowDays}-day attribution window</span>
              </span>
            </div>

            {/* Date range filter */}
            <div className="flex items-center gap-1 bg-[var(--color-bg-subtle)] p-0.5 rounded-lg border border-[var(--color-border-subtle)]">
              {(['all', '7d', '30d', '90d'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDateFilter(preset)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    dateFilter === preset
                      ? 'bg-[var(--color-bg-card)] text-[#4F6BFF] shadow-xs'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {preset === 'all' ? 'All Time' : preset.toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                onClick={fetchAnalyticsData}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] ml-1"
                title="Refresh analytics"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-[var(--color-border-subtle)]">
          <button
            type="button"
            onClick={() => setActiveTab('funnel')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'funnel'
                ? 'border-[#4F6BFF] text-[#4F6BFF]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Performance & Funnel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('conversions')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'conversions'
                ? 'border-[#4F6BFF] text-[#4F6BFF]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <span>Conversions</span>
            {conversions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-blue-500/10 text-blue-600 font-bold">
                {conversions.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('links')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'links'
                ? 'border-[#4F6BFF] text-[#4F6BFF]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <span>Tracked Links</span>
            {trackedLinks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-purple-500/10 text-purple-600 font-bold">
                {trackedLinks.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'timeline'
                ? 'border-[#4F6BFF] text-[#4F6BFF]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Activity Timeline
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchAnalyticsData} />
        ) : summary ? (
          <>
            {/* TAB 1: FUNNEL & PERFORMANCE */}
            {activeTab === 'funnel' && (
              <div className="space-y-5">
                {/* KPI Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="p-3 bg-[var(--color-bg-card)] border-[var(--color-border-subtle)]">
                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                      <Users size={12} />
                      <span>Total Recipients</span>
                    </div>
                    <div className="text-xl font-bold mt-1 text-[var(--color-text-primary)]">
                      {summary.delivery.totalRecipients.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      {summary.delivery.sent} dispatched
                    </div>
                  </Card>

                  <Card className="p-3 bg-[var(--color-bg-card)] border-[var(--color-border-subtle)]">
                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                      <CheckCircle size={12} className="text-emerald-500" />
                      <span>Delivered</span>
                    </div>
                    <div className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                      {summary.delivery.delivered.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      {(summary.delivery.deliveryRate * 100).toFixed(1)}% delivery rate
                    </div>
                  </Card>

                  <Card className="p-3 bg-[var(--color-bg-card)] border-[var(--color-border-subtle)]">
                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                      {summary.channel === 'WHATSAPP' ? (
                        <>
                          <CheckCircle size={12} className="text-blue-500" />
                          <span>WhatsApp Reads</span>
                        </>
                      ) : summary.channel === 'EMAIL' ? (
                        <>
                          <Eye size={12} className="text-blue-500" />
                          <span>Email Opens</span>
                        </>
                      ) : (
                        <>
                          <MousePointer size={12} className="text-blue-500" />
                          <span>Link Clicks</span>
                        </>
                      )}
                    </div>
                    <div className="text-xl font-bold mt-1 text-blue-600 dark:text-blue-400">
                      {summary.channel === 'WHATSAPP'
                        ? summary.engagement.reads.toLocaleString()
                        : summary.channel === 'EMAIL'
                        ? summary.engagement.opens.toLocaleString()
                        : summary.engagement.clicks.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      {summary.channel === 'WHATSAPP'
                        ? `${(summary.engagement.readRate * 100).toFixed(1)}% read rate`
                        : summary.channel === 'EMAIL'
                        ? `${(summary.engagement.openRate * 100).toFixed(1)}% open rate`
                        : `${(summary.engagement.clickRate * 100).toFixed(1)}% click rate`}
                    </div>
                  </Card>

                  <Card className="p-3 bg-[var(--color-bg-card)] border-[var(--color-border-subtle)]">
                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                      <Sparkles size={12} className="text-[#4F6BFF]" />
                      <span>Conversions</span>
                    </div>
                    <div className="text-xl font-bold mt-1 text-[#4F6BFF]">
                      {summary.conversions.totalConversions.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      {(summary.conversions.conversionRate * 100).toFixed(1)}% conversion rate
                    </div>
                  </Card>
                </div>

                {/* Delivery Funnel Visualization */}
                <Card className="p-4 bg-[var(--color-bg-card)] border-[var(--color-border-subtle)]">
                  <h3 className="font-semibold text-xs text-[var(--color-text-primary)] mb-3">
                    Delivery & Conversion Funnel
                  </h3>
                  <div className="space-y-3">
                    {/* Stage 1: Recipients */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-medium">1. Target Audience</span>
                        <span className="text-[var(--color-text-muted)]">
                          {summary.delivery.totalRecipients} recipients (100%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
                      </div>
                    </div>

                    {/* Stage 2: Sent */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-medium">2. Dispatched via Provider</span>
                        <span className="text-[var(--color-text-muted)]">
                          {summary.delivery.sent} sent (
                          {summary.delivery.totalRecipients > 0
                            ? ((summary.delivery.sent / summary.delivery.totalRecipients) * 100).toFixed(1)
                            : 0}
                          %)
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{
                            width: `${
                              summary.delivery.totalRecipients > 0
                                ? Math.min(100, (summary.delivery.sent / summary.delivery.totalRecipients) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Stage 3: Delivered */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-medium">3. Confirmed Delivered</span>
                        <span className="text-emerald-600 font-semibold">
                          {summary.delivery.delivered} delivered ({(summary.delivery.deliveryRate * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{
                            width: `${
                              summary.delivery.totalRecipients > 0
                                ? Math.min(100, (summary.delivery.delivered / summary.delivery.totalRecipients) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Stage 4: Engaged */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-medium">4. Customer Engagement</span>
                        <span className="text-blue-600 font-semibold">
                          {summary.channel === 'WHATSAPP'
                            ? `${summary.engagement.reads} read`
                            : summary.channel === 'EMAIL'
                            ? `${summary.engagement.opens} opened (${summary.engagement.clicks} clicks)`
                            : `${summary.engagement.clicks} link clicks`}
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{
                            width: `${
                              summary.delivery.delivered > 0
                                ? Math.min(
                                    100,
                                    ((summary.channel === 'WHATSAPP'
                                      ? summary.engagement.reads
                                      : summary.channel === 'EMAIL'
                                      ? summary.engagement.opens
                                      : summary.engagement.clicks) /
                                      summary.delivery.delivered) *
                                      100
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Stage 5: Converted */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-medium text-[#4F6BFF]">5. Attributed Conversions</span>
                        <span className="text-[#4F6BFF] font-bold">
                          {summary.conversions.totalConversions} conversions (
                          {(summary.conversions.conversionRate * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden">
                        <div
                          className="h-full bg-[#4F6BFF] rounded-full"
                          style={{
                            width: `${
                              summary.delivery.delivered > 0
                                ? Math.min(100, (summary.conversions.totalConversions / summary.delivery.delivered) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Conversion Types Breakdown */}
                {Object.keys(summary.conversions.byType).length > 0 && (
                  <Card className="p-4 bg-[var(--color-bg-card)] border-[var(--color-border-subtle)]">
                    <h3 className="font-semibold text-xs text-[var(--color-text-primary)] mb-3">
                      Conversions by Behavior
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(summary.conversions.byType).map(([type, count]) => (
                        <div
                          key={type}
                          className="p-2.5 rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] flex items-center justify-between"
                        >
                          <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                            {type.replace('_', ' ')}
                          </span>
                          <span className="text-xs font-bold text-[var(--color-text-primary)]">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* TAB 2: CONVERSIONS LIST */}
            {activeTab === 'conversions' && (
              <div className="space-y-4">
                {conversions.length === 0 ? (
                  <EmptyState
                    title="No attributed conversions yet"
                    description="Conversions appear when customers return, earn loyalty stamps, or redeem rewards within the attribution window."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                          <th className="py-2.5 px-3">Customer</th>
                          <th className="py-2.5 px-3">Conversion Type</th>
                          <th className="py-2.5 px-3">Occurred At</th>
                          <th className="py-2.5 px-3">Attribution Delta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border-subtle)]">
                        {conversions.map((conv) => (
                          <tr key={conv.id} className="hover:bg-[var(--color-bg-subtle)] transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="font-medium text-[var(--color-text-primary)]">
                                {conv.customerName}
                              </div>
                              <div className="text-[10px] text-[var(--color-text-muted)]">
                                {conv.customerPhoneMasked}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusBadge
                                status={getConversionBadgeVariant(conv.conversionType) as any}
                                label={conv.conversionType.replace('_', ' ')}
                              />
                            </td>
                            <td className="py-2.5 px-3 text-[var(--color-text-muted)]">
                              {new Date(conv.occurredAt).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-[var(--color-text-muted)]">
                              {conv.metadata?.attributionDeltaHours !== undefined
                                ? `${conv.metadata.attributionDeltaHours}h after send`
                                : 'Within window'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TRACKED LINKS */}
            {activeTab === 'links' && (
              <div className="space-y-5">
                {/* Create Tracked Link Form */}
                <Card className="p-4 bg-[var(--color-bg-card)] border-[var(--color-border-subtle)]">
                  <h3 className="font-semibold text-xs text-[var(--color-text-primary)] mb-2 flex items-center gap-1.5">
                    <Plus size={14} className="text-[#4F6BFF]" />
                    <span>Create Campaign Tracked Link</span>
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-muted)] mb-3">
                    Wrap destination URLs to measure click rates, unique clickers, and attribute downstream conversions safely without open-redirect risks.
                  </p>

                  <form onSubmit={handleCreateLink} className="space-y-2">
                    {linkError && (
                      <div className="p-2 text-xs text-red-600 bg-red-500/10 rounded-lg">
                        {linkError}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        required
                        type="url"
                        placeholder="https://yourstore.com/special-menu"
                        value={newLinkUrl}
                        onChange={(e) => setNewLinkUrl(e.target.value)}
                        className="text-xs"
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={creatingLink || !newLinkUrl.trim()}
                      >
                        {creatingLink ? 'Creating...' : 'Shorten & Track'}
                      </Button>
                    </div>
                  </form>
                </Card>

                {/* Tracked Links Table */}
                {trackedLinks.length === 0 ? (
                  <EmptyState
                    title="No tracked links created yet"
                    description="Create a tracked link above to add into your campaign message template."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                          <th className="py-2.5 px-3">Tracking URL</th>
                          <th className="py-2.5 px-3">Destination</th>
                          <th className="py-2.5 px-3 text-right">Total Clicks</th>
                          <th className="py-2.5 px-3 text-right">Unique Clickers</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border-subtle)]">
                        {trackedLinks.map((link) => (
                          <tr key={link.id} className="hover:bg-[var(--color-bg-subtle)] transition-colors">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#4F6BFF]">
                              {link.trackingUrl}
                            </td>
                            <td className="py-2.5 px-3 text-[var(--color-text-muted)] max-w-xs truncate" title={link.originalUrl}>
                              {link.originalUrl}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              {link.clickCount}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-blue-600">
                              {link.uniqueClickCount}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyLink(link.trackingUrl, link.trackingCode)}
                                className="h-7 px-2 text-[11px]"
                              >
                                {copiedCode === link.trackingCode ? (
                                  <>
                                    <Check size={12} className="text-emerald-500 mr-1" />
                                    <span>Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} className="mr-1" />
                                    <span>Copy URL</span>
                                  </>
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: CHRONOLOGICAL ACTIVITY TIMELINE */}
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                {timelineEvents.length === 0 ? (
                  <EmptyState
                    title="No timeline events recorded yet"
                    description="Timeline events will populate chronologically as messages are dispatched and customers engage."
                  />
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--color-border-subtle)]">
                    {timelineEvents.map((ev) => (
                      <div key={ev.id} className="relative">
                        <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-[#4F6BFF] ring-4 ring-[var(--color-bg-card)]" />
                        <div className="p-3 rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[var(--color-text-primary)]">
                              {ev.description}
                            </span>
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {new Date(ev.occurredAt).toLocaleString()}
                            </span>
                          </div>
                          {ev.customerName && (
                            <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                              Customer: {ev.customerName} {ev.customerPhoneMasked ? `(${ev.customerPhoneMasked})` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
};
