import React, { useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  Eye,
  Trash2,
  Users,
  Send,
  CheckCircle,
  Clock,
  Sparkles,
  RefreshCw,
  BarChart2,
} from 'lucide-react';
import { CampaignAnalyticsModal } from './CampaignAnalyticsModal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { MetricCard } from '../../components/ui/MetricCard';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  CampaignItem,
  CampaignDetailItem,
  CampaignStatus,
  CampaignType,
  CampaignChannel,
  AudienceType,
} from '../../types/campaign';

interface BusinessCampaignsViewProps {
  onNavigate?: (route: string) => void;
}

export const BusinessCampaignsView: React.FC<BusinessCampaignsViewProps> = () => {
  const isMobile = useIsMobile(640);
  const isTablet = useIsMobile(1024);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Campaign Detail State
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetailItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Create Campaign Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Branches & Segments for selects
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [segments, setSegments] = useState<Array<{ id: string; name: string }>>([]);

  // Schedule Modal State
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleCampaignTarget, setScheduleCampaignTarget] = useState<CampaignItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('10:00');
  const [scheduleTimezone, setScheduleTimezone] = useState('Asia/Kolkata');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Delivery breakdown state for detail modal
  const [deliveriesSummary, setDeliveriesSummary] = useState<any | null>(null);

  // Analytics Modal State (Phase 26)
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [analyticsCampaignId, setAnalyticsCampaignId] = useState<string | null>(null);
  const [analyticsCampaignName, setAnalyticsCampaignName] = useState<string | undefined>();

  const handleOpenAnalytics = (campaign: { id: string; name: string }) => {
    setAnalyticsCampaignId(campaign.id);
    setAnalyticsCampaignName(campaign.name);
    setAnalyticsModalOpen(true);
  };

  // Campaign Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'ONE_TIME' as CampaignType,
    channel: 'WHATSAPP' as CampaignChannel,
    audienceType: 'ALL_CUSTOMERS' as AudienceType,
    branchId: '',
    segmentId: '',
    messageTemplate: '',
    scheduledAt: '',
    timezone: 'Asia/Kolkata',
  });

  // Simulation Feedback State
  const [simulationResult, setSimulationResult] = useState<any | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Fetch Campaigns List
  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        queryParams.set('status', statusFilter);
      }
      if (searchQuery.trim()) {
        queryParams.set('search', searchQuery.trim());
      }

      const res = await fetch(`/api/business/campaigns?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
        setTotalCount(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch campaigns', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  // Fetch auxiliary options (branches, segments)
  useEffect(() => {
    async function loadAux() {
      try {
        const [branchRes, segRes] = await Promise.all([
          fetch('/api/business/branches'),
          fetch('/api/business/segments'),
        ]);
        if (branchRes.ok) {
          const bData = await branchRes.json();
          setBranches(bData.branches || bData || []);
        }
        if (segRes.ok) {
          const sData = await segRes.json();
          setSegments(Array.isArray(sData) ? sData : (sData.segments || []));
        }

      } catch (e) {
        console.error('Error loading branches/segments', e);
      }
    }
    loadAux();
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Fetch Detail & Deliveries Breakdown
  const handleViewDetail = async (id: string) => {
    setSelectedCampaignId(id);
    setDetailModalOpen(true);
    setSimulationResult(null);
    try {
      setLoadingDetail(true);
      const [res, delRes] = await Promise.all([
        fetch(`/api/business/campaigns/${id}`),
        fetch(`/api/business/campaigns/${id}/deliveries?limit=50`),
      ]);
      if (res.ok) {
        const data = await res.json();
        setCampaignDetail(data);
      }
      if (delRes.ok) {
        const delData = await delRes.json();
        setDeliveriesSummary(delData.summary || null);
      }
    } catch (err) {
      console.error('Failed to load campaign detail', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Open Schedule Modal
  const handleOpenSchedule = (c: CampaignItem) => {
    setScheduleCampaignTarget(c);
    const tomorrow = new Date(Date.now() + 86400000);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    setScheduleDate(`${yyyy}-${mm}-${dd}`);
    setScheduleTime('10:00');
    setScheduleTimezone(c.timezone || 'Asia/Kolkata');
    setScheduleError(null);
    setScheduleModalOpen(true);
  };

  // Submit Schedule
  const handleScheduleSubmit = async () => {
    if (!scheduleCampaignTarget) return;
    if (!scheduleDate || !scheduleTime) {
      setScheduleError('Please select both date and time');
      return;
    }
    setScheduleSubmitting(true);
    setScheduleError(null);
    try {
      const res = await fetch(`/api/business/campaigns/${scheduleCampaignTarget.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: `${scheduleDate}T${scheduleTime}:00`,
          timezone: scheduleTimezone,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setScheduleModalOpen(false);
        await fetchCampaigns();
        if (selectedCampaignId === scheduleCampaignTarget.id) {
          handleViewDetail(scheduleCampaignTarget.id);
        }
      } else {
        setScheduleError(data.error || 'Failed to schedule campaign');
      }
    } catch (err: any) {
      setScheduleError(err.message || 'Network error');
    } finally {
      setScheduleSubmitting(false);
    }
  };

  // Send Now (Phase 22 Immediate Queue Trigger)
  const handleSendNow = async (id: string) => {
    if (!window.confirm('Send this campaign now to all eligible customers?')) return;
    try {
      setSimulating(true);
      const res = await fetch(`/api/business/campaigns/${id}/send-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setSimulationResult(data);
        await fetchCampaigns();
        if (selectedCampaignId === id) {
          handleViewDetail(id);
        }
      } else {
        alert(data.error || 'Failed to send campaign now');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    } finally {
      setSimulating(false);
    }
  };

  // Cancel Campaign (Phase 22 Cancellation)
  const handleCancelCampaign = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this campaign and all pending queue deliveries?')) return;
    try {
      const res = await fetch(`/api/business/campaigns/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        await fetchCampaigns();
        if (selectedCampaignId === id) {
          handleViewDetail(id);
        }
      } else {
        alert(data.error || 'Failed to cancel campaign');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    }
  };

  // Status Change
  const handleStatusChange = async (id: string, nextStatus: CampaignStatus) => {
    try {
      const res = await fetch(`/api/business/campaigns/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await fetchCampaigns();
        if (selectedCampaignId === id) {
          handleViewDetail(id);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update campaign status');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    }
  };

  // Delete Campaign
  const handleDeleteCampaign = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this campaign?')) return;
    try {
      const res = await fetch(`/api/business/campaigns/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (selectedCampaignId === id) {
          setDetailModalOpen(false);
        }
        await fetchCampaigns();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete campaign');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    }
  };

  // Simulate Campaign Run (Staging Verification)
  const handleSimulateRun = async (id: string) => {
    try {
      setSimulating(true);
      setSimulationResult(null);
      const res = await fetch(`/api/business/campaigns/${id}/simulate-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulateDelivery: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setSimulationResult(data);
        await fetchCampaigns();
        if (selectedCampaignId === id) {
          handleViewDetail(id);
        }
      } else {
        alert(data.error || 'Failed to simulate campaign execution');
      }
    } catch (err: any) {
      alert(err.message || 'Execution error');
    } finally {
      setSimulating(false);
    }
  };

  // Submit Create Campaign
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError('Campaign name is required');
      return;
    }
    if (!formData.messageTemplate.trim()) {
      setFormError('Message template is required');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        type: formData.type,
        channel: formData.channel,
        audienceType: formData.audienceType,
        branchId: formData.branchId || undefined,
        segmentId: formData.audienceType === 'SAVED_SEGMENT' ? formData.segmentId : undefined,
        messageTemplate: formData.messageTemplate.trim(),
        scheduledAt: formData.scheduledAt ? new Date(formData.scheduledAt).toISOString() : undefined,
        status: formData.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      };

      const res = await fetch('/api/business/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setCreateModalOpen(false);
        setFormData({
          name: '',
          description: '',
          type: 'ONE_TIME',
          channel: 'WHATSAPP',
          audienceType: 'ALL_CUSTOMERS',
          branchId: '',
          segmentId: '',
          messageTemplate: '',
          scheduledAt: '',
          timezone: 'Asia/Kolkata',
        });
        await fetchCampaigns();
      } else {
        const err = await res.json();
        setFormError(err.error || 'Failed to create campaign');
      }
    } catch (err: any) {
      setFormError(err.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Metrics computation
  const activeCampaignsCount = campaigns.filter(c => c.status === 'ACTIVE' || c.status === 'SCHEDULED').length;
  const totalDeliveriesCount = campaigns.reduce((acc, c) => acc + (c._count?.deliveries || 0), 0);
  const totalAudienceSum = campaigns.reduce((acc, c) => acc + (c.totalAudience || 0), 0);

  const getStatusBadgeType = (status: CampaignStatus) => {
    switch (status) {
      case 'ACTIVE':
      case 'PROCESSING':
        return 'active';
      case 'SCHEDULED':
      case 'QUEUED':
        return 'pending';
      case 'COMPLETED':
      case 'SENT':
        return 'completed';
      case 'PAUSED':
        return 'at-risk';
      case 'FAILED':
      case 'CANCELLED':
        return 'failed';
      default:
        return 'inactive';
    }
  };

  return (
    <div
      style={{
        padding: isMobile ? '16px 12px calc(var(--mobile-nav-height, 64px) + 24px)' : isTablet ? '20px 20px' : '28px 32px',
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '16px' : '24px',
        width: '100%',
        boxSizing: 'border-box',
        minWidth: 0,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header & Breadcrumb */}
      <div
        style={{
          display: 'flex',
          flexDirection: isTablet ? 'column' : 'row',
          alignItems: isTablet ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: isMobile ? '12px' : '16px',
          width: '100%',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: '#4F6BFF',
                backgroundColor: 'rgba(79, 107, 255, 0.08)',
                padding: '3px 8px',
                borderRadius: '6px',
              }}
            >
              Retention Foundation • Outreach
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: isMobile ? '32px' : '36px',
                height: isMobile ? '32px' : '36px',
                borderRadius: '8px',
                backgroundColor: '#EEF2FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4F6BFF',
                flexShrink: 0,
              }}
            >
              <Megaphone size={isMobile ? 18 : 20} />
            </div>
            <h1
              style={{
                fontSize: isMobile ? '20px' : '24px',
                fontWeight: 700,
                color: 'var(--color-text-primary, #111827)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Campaigns & Re-engagement
            </h1>
          </div>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-text-muted, #6B7280)',
              margin: '4px 0 0 0',
              lineHeight: 1.5,
            }}
          >
            Design and verify targeted re-engagement campaigns, audience resolution, and consent-gated touchpoints.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCampaigns}
            leftIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            leftIcon={<Plus size={16} />}
          >
            Create Campaign
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isMobile ? '10px' : '16px',
          width: '100%',
        }}
      >
        <MetricCard
          label="Total Campaigns"
          value={totalCount}
          icon={<Megaphone size={18} />}
        />
        <MetricCard
          label="Active / Scheduled"
          value={activeCampaignsCount}
          icon={<Clock size={18} />}
        />
        <MetricCard
          label="Total Deliveries"
          value={totalDeliveriesCount}
          icon={<Send size={18} />}
        />
        <MetricCard
          label="Audience Reached"
          value={totalAudienceSum}
          icon={<Users size={18} />}
        />
      </div>

      {/* Filter Tabs & Search Bar (Separated into dedicated Card) */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-surface, #ffffff)',
          border: '1px solid var(--color-border-subtle, #E5E7EB)',
          borderRadius: '12px',
          padding: isMobile ? '12px 14px' : '16px 20px',
          display: 'flex',
          flexDirection: isTablet ? 'column' : 'row',
          alignItems: isTablet ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {/* Status Filters */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: isMobile ? '4px' : '0',
            scrollbarWidth: 'none',
          }}
        >
          {['ALL', 'DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].map(s => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? 'var(--color-primary, #4F6BFF)' : 'var(--color-bg-subtle, #F3F4F6)',
                  color: isActive ? '#ffffff' : 'var(--color-text-muted, #6B7280)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {s === 'ALL' ? 'All Campaigns' : s}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ width: isTablet ? '100%' : '260px', flexShrink: 0 }}>
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Campaign List Card */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-surface, #ffffff)',
          border: '1px solid var(--color-border-subtle, #E5E7EB)',
          borderRadius: '12px',
          padding: isMobile ? '14px' : '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--color-text-muted, #6B7280)', fontSize: '13px' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#4F6BFF' }} />
            Loading campaigns...
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--color-text-muted, #6B7280)' }}>
            <Megaphone size={40} style={{ margin: '0 auto 12px auto', opacity: 0.35 }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary, #111827)', margin: '0 0 6px 0' }}>
              No campaigns found
            </h3>
            <p style={{ fontSize: '13px', maxWidth: '420px', margin: '0 auto 16px auto', lineHeight: 1.5 }}>
              Get started by creating your first retention campaign. Reach customers with timely re-engagement offers.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              leftIcon={<Plus size={14} />}
            >
              Create Campaign
            </Button>
          </div>
        ) : isMobile ? (
          /* Mobile Card View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {campaigns.map(c => (
              <div
                key={c.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border-subtle, #E5E7EB)',
                  backgroundColor: 'var(--color-bg-surface, #ffffff)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}
                onClick={() => handleViewDetail(c.id)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary, #111827)' }}>
                      {c.name}
                    </div>
                    {c.description && (
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #6B7280)', marginTop: '2px', lineHeight: 1.4 }}>
                        {c.description}
                      </div>
                    )}
                    {c.scheduledAt && (
                      <div style={{ fontSize: '11px', color: '#4F6BFF', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <Clock size={11} />
                        <span>{new Date(c.scheduledAt).toLocaleDateString()} {new Date(c.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({c.timezone || 'UTC'})</span>
                      </div>
                    )}
                  </div>
                  <StatusBadge status={getStatusBadgeType(c.status)} label={c.status} />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                    {c.type}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                    {c.channel}
                  </span>
                  <span style={{ color: 'var(--color-text-muted, #6B7280)', fontSize: '11px', marginLeft: 'auto' }}>
                    Deliveries: <strong style={{ color: 'var(--color-text-primary, #111827)' }}>{c._count?.deliveries || 0}</strong>
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '6px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--color-border-subtle, #F1F5F9)',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <Button variant="ghost" size="sm" onClick={() => handleViewDetail(c.id)}>
                    View
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleOpenAnalytics(c)} style={{ color: '#4F6BFF' }} leftIcon={<BarChart2 size={12} />}>
                    Analytics
                  </Button>
                  {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
                    <>
                      <Button variant="primary" size="sm" onClick={() => handleSendNow(c.id)} leftIcon={<Send size={12} />}>
                        Send
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleOpenSchedule(c)} leftIcon={<Clock size={12} />}>
                        Schedule
                      </Button>
                    </>
                  )}
                  {(c.status === 'SCHEDULED' || c.status === 'QUEUED') && (
                    <Button variant="ghost" size="sm" onClick={() => handleCancelCampaign(c.id)} style={{ color: '#DC2626' }}>
                      Cancel
                    </Button>
                  )}
                  {(c.status === 'DRAFT' || c.status === 'PAUSED') && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusChange(c.id, 'ACTIVE')}>
                      Activate
                    </Button>
                  )}
                  {c.status !== 'CANCELLED' && c.status !== 'COMPLETED' && (
                    <Button variant="ghost" size="sm" onClick={() => handleSimulateRun(c.id)} style={{ color: '#2563EB' }}>
                      Simulate
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop & Tablet Table View */
          <div style={{ overflowX: 'auto', width: '100%', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle, #E5E7EB)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Campaign</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Type</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Channel</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Audience</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Deliveries</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle, #F1F5F9)',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg-subtle, #F9FAFB)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    onClick={() => handleViewDetail(c.id)}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
                        {c.name}
                      </div>
                      {c.description && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #6B7280)', marginTop: '2px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.description}
                        </div>
                      )}
                      {c.scheduledAt && (
                        <div style={{ fontSize: '11px', color: '#2563EB', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                          <Clock size={11} />
                          <span>{new Date(c.scheduledAt).toLocaleDateString()} {new Date(c.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({c.timezone || 'UTC'})</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                        {c.type}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                        {c.channel}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ color: 'var(--color-text-primary, #111827)', fontWeight: 500 }}>
                        {c.audienceType.replace('_', ' ')}
                      </div>
                      {c.branch && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #6B7280)', marginTop: '2px' }}>
                          {c.branch.name}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <StatusBadge status={getStatusBadgeType(c.status)} label={c.status} />
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
                      {c._count?.deliveries || 0}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetail(c.id)}
                          style={{ padding: '6px', minWidth: '32px', height: '32px' }}
                          title="View details"
                        >
                          <Eye size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenAnalytics(c)}
                          style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#4F6BFF' }}
                          title="Campaign Analytics & Attribution"
                        >
                          <BarChart2 size={15} />
                        </Button>
                        {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSendNow(c.id)}
                              style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#2563EB' }}
                              title="Send now"
                            >
                              <Send size={15} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenSchedule(c)}
                              style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#7C3AED' }}
                              title="Schedule campaign"
                            >
                              <Clock size={15} />
                            </Button>
                          </>
                        )}
                        {(c.status === 'SCHEDULED' || c.status === 'QUEUED') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelCampaign(c.id)}
                            style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#DC2626' }}
                            title="Cancel campaign"
                          >
                            <Trash2 size={15} />
                          </Button>
                        )}
                        {(c.status === 'DRAFT' || c.status === 'PAUSED') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStatusChange(c.id, 'ACTIVE')}
                            style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#16A34A' }}
                            title="Activate campaign"
                          >
                            <Play size={15} />
                          </Button>
                        )}
                        {c.status === 'ACTIVE' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStatusChange(c.id, 'PAUSED')}
                            style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#D97706' }}
                            title="Pause campaign"
                          >
                            <Pause size={15} />
                          </Button>
                        )}
                        {c.status !== 'CANCELLED' && c.status !== 'COMPLETED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSimulateRun(c.id)}
                            style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#2563EB' }}
                            title="Simulate campaign run"
                          >
                            <Sparkles size={15} />
                          </Button>
                        )}
                        {(c.status === 'DRAFT' || c.status === 'CANCELLED') && (c._count?.deliveries || 0) === 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCampaign(c.id)}
                            style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#DC2626' }}
                            title="Delete draft"
                          >
                            <Trash2 size={15} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE CAMPAIGN MODAL */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Retention Campaign"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-lg text-xs">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-1">
              Campaign Name *
            </label>
            <Input
              required
              placeholder="e.g. Weekend Specialty Roastery Special"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-1">
              Description
            </label>
            <Input
              placeholder="Optional campaign notes / purpose"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-1">
                Campaign Type
              </label>
              <Select
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as CampaignType })}
                options={[
                  { value: 'ONE_TIME', label: 'One-Time Broadcast' },
                  { value: 'AUTOMATED', label: 'Recurring Automation' },
                  { value: 'TRIGGERED', label: 'Event Triggered' },
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-1">
                Channel
              </label>
              <Select
                value={formData.channel}
                onChange={e => setFormData({ ...formData, channel: e.target.value as CampaignChannel })}
                options={[
                  { value: 'WHATSAPP', label: 'WhatsApp' },
                  { value: 'SMS', label: 'SMS' },
                  { value: 'EMAIL', label: 'Email' },
                  { value: 'IN_APP', label: 'In-App Notification' },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-1">
                Target Audience
              </label>
              <Select
                value={formData.audienceType}
                onChange={e => setFormData({ ...formData, audienceType: e.target.value as AudienceType })}
                options={[
                  { value: 'ALL_CUSTOMERS', label: 'All Customers' },
                  { value: 'SAVED_SEGMENT', label: 'Saved Segment' },
                  { value: 'DYNAMIC_SEGMENT', label: 'Dynamic Criteria' },
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-1">
                Branch Scope
              </label>
              <Select
                value={formData.branchId}
                onChange={e => setFormData({ ...formData, branchId: e.target.value })}
                options={[
                  { value: '', label: 'All Branches (Business-Wide)' },
                  ...branches.map(b => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
          </div>

          {formData.audienceType === 'SAVED_SEGMENT' && (
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-1">
                Select Customer Segment
              </label>
              <Select
                value={formData.segmentId}
                onChange={e => setFormData({ ...formData, segmentId: e.target.value })}
                options={[
                  { value: '', label: '-- Select Segment --' },
                  ...segments.map(s => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-1">
              Message Template *
            </label>
            <Textarea
              required
              rows={3}
              placeholder="Hi {{name}}! We missed you at Artisan Roast. Enjoy a fresh brew on us this weekend!"
              value={formData.messageTemplate}
              onChange={e => setFormData({ ...formData, messageTemplate: e.target.value })}
            />
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Supports merge tags: &#123;&#123;name&#125;&#125;, &#123;&#123;business&#125;&#125;
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-1">
              Schedule Date / Time (Optional)
            </label>
            <Input
              type="datetime-local"
              value={formData.scheduledAt}
              onChange={e => setFormData({ ...formData, scheduledAt: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
            <Button variant="ghost" size="sm" type="button" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Create Campaign'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CAMPAIGN DETAIL MODAL */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={campaignDetail?.name || 'Campaign Details'}
      >
        {loadingDetail ? (
          <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
            <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-[var(--color-primary-text)]" />
            Loading details...
          </div>
        ) : campaignDetail ? (
          <div className="space-y-4 text-xs">
            {/* Header badges */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={getStatusBadgeType(campaignDetail.status)}
                label={campaignDetail.status}
              />
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600">
                {campaignDetail.type}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600">
                {campaignDetail.channel}
              </span>
              {campaignDetail.branch && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-600">
                  {campaignDetail.branch.name}
                </span>
              )}
            </div>

            {campaignDetail.description && (
              <p className="text-[var(--color-text-muted)]">{campaignDetail.description}</p>
            )}

            {/* Template Box */}
            <div className="p-3 bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border-subtle)] space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Message Content
              </div>
              <p className="text-sm font-sans text-[var(--color-text-primary)] whitespace-pre-wrap">
                {campaignDetail.messageTemplate}
              </p>
            </div>

            {/* Deliveries Status Counts - Requirement 34 Operational Summary */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              <div className="p-2 bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-base font-bold text-[var(--color-text-primary)]">
                  {deliveriesSummary?.queued ?? (campaignDetail.statusSummary?.QUEUED || 0)}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Queued</div>
              </div>
              <div className="p-2 bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-base font-bold text-blue-600">
                  {deliveriesSummary?.processing ?? 0}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Processing</div>
              </div>
              <div className="p-2 bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-base font-bold text-emerald-600">
                  {deliveriesSummary?.delivered ?? (campaignDetail.statusSummary?.DELIVERED || 0)}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Delivered</div>
              </div>
              <div className="p-2 bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-base font-bold text-amber-600">
                  {deliveriesSummary?.retrying ?? 0}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Retrying</div>
              </div>
              <div className="p-2 bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-base font-bold text-red-600">
                  {deliveriesSummary?.failed ?? (campaignDetail.statusSummary?.FAILED || 0)}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Failed</div>
              </div>
              <div className="p-2 bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-base font-bold text-[var(--color-text-muted)]">
                  {deliveriesSummary?.cancelled ?? 0}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Cancelled</div>
              </div>
            </div>

            {/* Scheduled Information Box */}
            {campaignDetail.scheduledAt && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-700 dark:text-blue-300">
                  <Clock size={14} />
                  <span>Scheduled Execution</span>
                </div>
                <div className="text-[var(--color-text-primary)]">
                  {new Date(campaignDetail.scheduledAt).toLocaleString()} ({campaignDetail.timezone || 'UTC'})
                </div>
              </div>
            )}

            {/* Simulation feedback banner */}
            {simulationResult && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-lg space-y-1 text-xs">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle size={14} />
                  <span>Execution Triggered</span>
                </div>
                <div>Eligible Audience: {simulationResult.eligibleCount}</div>
                <div>Delivered: {simulationResult.deliveredCount} | Queued: {simulationResult.queuedCount} | Retrying: {simulationResult.retryingCount || 0}</div>
                <div>Suppressed (Consent): {simulationResult.suppressedConsentCount} | Cooldown: {simulationResult.suppressedCooldownCount}</div>
              </div>
            )}

            {/* Recent Deliveries */}
            {campaignDetail.deliveries && campaignDetail.deliveries.length > 0 && (
              <div>
                <div className="font-semibold text-xs text-[var(--color-text-primary)] mb-2">
                  Recent Deliveries ({campaignDetail.deliveries.length})
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] rounded-lg">
                  {campaignDetail.deliveries.map(d => (
                    <div key={d.id} className="p-2 flex items-center justify-between text-[11px]">
                      <div>
                        <div className="font-medium text-[var(--color-text-primary)]">
                          {d.customer?.name || 'Customer'}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">
                          {d.customer?.phone}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-600">
                          {d.status}
                        </span>
                        <div className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                          {new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDetailModalOpen(false);
                    handleOpenAnalytics(campaignDetail);
                  }}
                  leftIcon={<BarChart2 size={14} className="text-[#4F6BFF]" />}
                >
                  View Analytics
                </Button>
                {(campaignDetail.status === 'DRAFT' || campaignDetail.status === 'SCHEDULED') && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSendNow(campaignDetail.id)}
                      leftIcon={<Send size={14} />}
                    >
                      Send Now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenSchedule(campaignDetail)}
                      leftIcon={<Clock size={14} />}
                    >
                      Schedule
                    </Button>
                  </>
                )}
                {campaignDetail.status !== 'COMPLETED' && campaignDetail.status !== 'CANCELLED' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSimulateRun(campaignDetail.id)}
                    disabled={simulating}
                    leftIcon={<Sparkles size={14} />}
                  >
                    {simulating ? 'Running...' : 'Simulate Run'}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {(campaignDetail.status === 'SCHEDULED' || campaignDetail.status === 'QUEUED') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelCampaign(campaignDetail.id)}
                    className="text-red-600 hover:bg-red-500/10"
                  >
                    Cancel Campaign
                  </Button>
                )}
                {campaignDetail.status === 'DRAFT' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange(campaignDetail.id, 'ACTIVE')}
                  >
                    Activate
                  </Button>
                )}
                {campaignDetail.status === 'ACTIVE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange(campaignDetail.id, 'PAUSED')}
                  >
                    Pause
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* SCHEDULE CAMPAIGN MODAL (Requirement 32) */}
      <Modal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        title={`Schedule: ${scheduleCampaignTarget?.name || 'Campaign'}`}
      >
        <div className="space-y-4 text-xs">
          {scheduleError && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-xs">
              {scheduleError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1 text-[var(--color-text-primary)]">
                Execution Date
              </label>
              <Input
                type="date"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-[var(--color-text-primary)]">
                Execution Time
              </label>
              <Input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-[var(--color-text-primary)]">
              Timezone
            </label>
            <Select
              value={scheduleTimezone}
              onChange={e => setScheduleTimezone(e.target.value)}
              options={[
                { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST - UTC+05:30)' },
                { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
                { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
                { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
                { value: 'Asia/Dubai', label: 'Asia/Dubai (GST - UTC+04:00)' },
                { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT - UTC+08:00)' },
              ]}
            />
          </div>

          {/* Clear Human-Readable Schedule Summary (Requirement 32) */}
          {scheduleDate && scheduleTime && (
            <div className="p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded-lg text-xs space-y-1">
              <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Scheduled for
              </div>
              <div className="text-sm font-bold text-[var(--color-text-primary)]">
                {new Date(`${scheduleDate}T${scheduleTime}:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div className="text-xs font-semibold text-[var(--color-primary-text)]">
                {new Date(`${scheduleDate}T${scheduleTime}:00`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                {scheduleTimezone}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScheduleModalOpen(false)}
              disabled={scheduleSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleScheduleSubmit}
              disabled={scheduleSubmitting}
            >
              {scheduleSubmitting ? 'Scheduling...' : 'Schedule Campaign'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* CAMPAIGN ANALYTICS MODAL (Phase 26) */}
      <CampaignAnalyticsModal
        isOpen={analyticsModalOpen}
        onClose={() => setAnalyticsModalOpen(false)}
        campaignId={analyticsCampaignId}
        campaignName={analyticsCampaignName}
      />
    </div>
  );
};
