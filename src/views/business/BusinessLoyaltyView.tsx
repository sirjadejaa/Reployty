import React, { useState, useEffect, useCallback } from 'react';
import {
  Award,
  Coins,
  Plus,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
  Filter,
  Sliders,
  RefreshCw,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  LoyaltyProgramConfig,
  LoyaltyTransactionItem,
  LoyaltyCustomerLookup,
} from '../../types/loyalty';

export const BusinessLoyaltyView: React.FC = () => {
  const isMobile = useIsMobile(768);

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'terminal' | 'program' | 'history'>('terminal');

  // Program & metrics state
  const [activeProgram, setActiveProgram] = useState<LoyaltyProgramConfig | null>(null);
  const [allPrograms, setAllPrograms] = useState<LoyaltyProgramConfig[]>([]);
  const [metrics, setMetrics] = useState({
    totalCards: 0,
    totalStampsAwarded: 0,
    totalPointsEarned: 0,
    transactionCount: 0,
  });
  const [loadingProgram, setLoadingProgram] = useState(true);

  // Terminal state: Customer search & selection
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LoyaltyCustomerLookup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<LoyaltyCustomerLookup | null>(null);

  // Award actions
  const [customStamps, setCustomStamps] = useState(1);
  const [purchaseAmount, setPurchaseAmount] = useState(100);
  const [isSubmittingAward, setIsSubmittingAward] = useState(false);
  const [awardFeedback, setAwardFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Adjustment Modal state
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<'stamp' | 'point'>('stamp');
  const [adjustDelta, setAdjustDelta] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  // Program Modal state
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [programForm, setProgramForm] = useState({
    name: 'Coffee Club',
    type: 'STAMP' as 'STAMP' | 'POINTS',
    targetStamps: 10,
    pointsPerRupee: 10, // 1 point per ₹10 (1000 minor units)
    rewardTitle: 'Free Specialty Beverage',
    status: 'ACTIVE' as 'ACTIVE' | 'PAUSED',
  });
  const [isSavingProgram, setIsSavingProgram] = useState(false);

  // History state
  const [historyTransactions, setHistoryTransactions] = useState<LoyaltyTransactionItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilterType, setHistoryFilterType] = useState<string>('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch active loyalty program and aggregate metrics
  const fetchProgram = useCallback(async () => {
    try {
      setLoadingProgram(true);
      const res = await fetch('/api/business/loyalty/program');
      if (res.ok) {
        const data = await res.json();
        setActiveProgram(data.activeProgram);
        setAllPrograms(data.programs || []);
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      }
    } catch (err) {
      console.error('Failed to load loyalty program', err);
    } finally {
      setLoadingProgram(false);
    }
  }, []);

  useEffect(() => {
    fetchProgram();
  }, [fetchProgram]);

  // Search customers for terminal (stable callback without selectedCustomer dependency)
  const searchCustomers = useCallback(async (query: string) => {
    try {
      setIsSearching(true);
      const url = `/api/business/loyalty/customers${query ? `?search=${encodeURIComponent(query)}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        // If current selected customer is in results, refresh their state without triggering re-fetch
        setSelectedCustomer(prev => {
          if (!prev) return null;
          const updated = data.find((c: LoyaltyCustomerLookup) => c.id === prev.id);
          return updated || prev;
        });
      }
    } catch (err) {
      console.error('Customer search failed', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Search on initial terminal load or query change
  useEffect(() => {
    const timer = setTimeout(() => {
      searchCustomers(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, searchCustomers]);

  // Fetch activity history
  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      let url = `/api/business/loyalty/history?page=${historyPage}&limit=15`;
      if (historyFilterType) {
        url += `&type=${encodeURIComponent(historyFilterType)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setHistoryTransactions(data.transactions || []);
        setHistoryTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load loyalty history', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage, historyFilterType]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  // Auto-dismiss feedback after 4 seconds
  useEffect(() => {
    if (awardFeedback) {
      const timer = setTimeout(() => setAwardFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [awardFeedback]);

  // Award Stamp Handler with Idempotency
  const handleAwardStamps = async (count: number) => {
    if (!selectedCustomer) return;
    try {
      setIsSubmittingAward(true);
      setAwardFeedback(null);
      const idempotencyKey = `award_stamp_${selectedCustomer.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const res = await fetch('/api/business/loyalty/award-stamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          stampsToAdd: count,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to award stamps');
      }

      setAwardFeedback({
        type: 'success',
        message: `Successfully awarded ${count} stamp${count > 1 ? 's' : ''} to ${selectedCustomer.name}!`,
      });

      // Refresh customer list & metrics
      searchCustomers(searchQuery);
      fetchProgram();
    } catch (err: any) {
      setAwardFeedback({
        type: 'error',
        message: err.message || 'Error awarding stamps',
      });
    } finally {
      setIsSubmittingAward(false);
    }
  };

  // Award Points Handler with Idempotency
  const handleAwardPoints = async () => {
    if (!selectedCustomer) return;
    try {
      setIsSubmittingAward(true);
      setAwardFeedback(null);
      const idempotencyKey = `award_pts_${selectedCustomer.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      // Convert rupees to minor units (1 INR = 100 paise)
      const purchaseAmountMinor = Math.round(Number(purchaseAmount) * 100);

      const res = await fetch('/api/business/loyalty/award-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          purchaseAmountMinor,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to award points');
      }

      setAwardFeedback({
        type: 'success',
        message: `Successfully awarded points for ₹${purchaseAmount} purchase to ${selectedCustomer.name}!`,
      });

      searchCustomers(searchQuery);
      fetchProgram();
    } catch (err: any) {
      setAwardFeedback({
        type: 'error',
        message: err.message || 'Error awarding points',
      });
    } finally {
      setIsSubmittingAward(false);
    }
  };

  // Manual Adjustment Handler
  const handleSaveAdjustment = async () => {
    if (!selectedCustomer || !adjustReason.trim()) return;
    try {
      setIsSubmittingAdjust(true);
      const delta = Number(adjustDelta);

      const res = await fetch('/api/business/loyalty/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          deltaStamps: adjustType === 'stamp' ? delta : 0,
          deltaPoints: adjustType === 'point' ? delta : 0,
          reason: adjustReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply adjustment');
      }

      setIsAdjustModalOpen(false);
      setAdjustReason('');
      setAwardFeedback({
        type: 'success',
        message: `Adjustment applied successfully for ${selectedCustomer.name}.`,
      });

      searchCustomers(searchQuery);
      fetchProgram();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust balance');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Save Program Configuration
  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingProgram(true);
      const payload = {
        id: activeProgram?.id,
        name: programForm.name.trim(),
        type: programForm.type,
        targetStamps: programForm.type === 'STAMP' ? Number(programForm.targetStamps) : undefined,
        pointsPerCurrencyMinor: programForm.type === 'POINTS' ? Number(programForm.pointsPerRupee) * 100 : undefined,
        rewardTitle: programForm.rewardTitle.trim(),
        status: programForm.status,
      };

      const res = await fetch('/api/business/loyalty/program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save loyalty program');
      }

      setIsProgramModalOpen(false);
      fetchProgram();
    } catch (err: any) {
      alert(err.message || 'Error saving program');
    } finally {
      setIsSavingProgram(false);
    }
  };

  // Toggle Program Active/Paused
  const handleToggleProgramStatus = async (programId: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      const res = await fetch(`/api/business/loyalty/program/${programId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchProgram();
      }
    } catch (err) {
      console.error('Failed to toggle program status', err);
    }
  };

  return (
    <div style={{ padding: isMobile ? '16px 12px calc(var(--mobile-nav-height, 64px) + 32px)' : '28px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? '14px' : '24px' }}>
      {/* Top Header */}
      {isMobile ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Loyalty Engine
              </h1>
              {activeProgram && (
                <StatusBadge
                  status={activeProgram.status === 'ACTIVE' ? 'active' : 'inactive'}
                  label={activeProgram.status === 'ACTIVE' ? 'Live' : 'Paused'}
                />
              )}
            </div>
            <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0 0' }}>
              Digital stamps & reward terminal
            </p>
          </div>

          <Button
            variant="outline"
            style={{ height: 38, padding: '0 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => {
              if (activeProgram) {
                setProgramForm({
                  name: activeProgram.name,
                  type: activeProgram.type === 'POINTS' ? 'POINTS' : 'STAMP',
                  targetStamps: activeProgram.targetStamps || 10,
                  pointsPerRupee: (activeProgram.pointsPerCurrencyMinor || 1000) / 100,
                  rewardTitle: activeProgram.rewardTitle || '',
                  status: activeProgram.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
                });
              }
              setIsProgramModalOpen(true);
            }}
          >
            <Settings size={15} /> Configure
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Loyalty Engine
              </h1>
              {loadingProgram ? (
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>Loading program...</span>
              ) : activeProgram ? (
                <StatusBadge
                  status={activeProgram.status === 'ACTIVE' ? 'active' : 'inactive'}
                  label={activeProgram.status === 'ACTIVE' ? 'Program Live' : 'Program Paused'}
                />
              ) : null}
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
              Turn first-time customers into regular visitors with digital stamps and points.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              variant="outline"
              style={{ minHeight: '42px', justifyContent: 'center' }}
              onClick={() => {
                if (activeProgram) {
                  setProgramForm({
                    name: activeProgram.name,
                    type: activeProgram.type === 'POINTS' ? 'POINTS' : 'STAMP',
                    targetStamps: activeProgram.targetStamps || 10,
                    pointsPerRupee: (activeProgram.pointsPerCurrencyMinor || 1000) / 100,
                    rewardTitle: activeProgram.rewardTitle || '',
                    status: activeProgram.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
                  });
                }
                setIsProgramModalOpen(true);
              }}
            >
              <Settings size={16} /> Configure Program
            </Button>
          </div>
        </div>
      )}

      {/* Program Summary / Metrics Bar */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Current Program */}
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Program</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 1 }}>
                  {activeProgram?.name || 'Coffee Club'}
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>
                  {activeProgram?.type === 'STAMP'
                    ? `Goal: ${activeProgram.targetStamps || 10} Stamps`
                    : 'Spend Points Program'}
                </div>
              </div>
              <StatusBadge
                status={activeProgram?.status === 'ACTIVE' ? 'active' : 'inactive'}
                label={activeProgram?.status === 'ACTIVE' ? 'Active' : 'Paused'}
              />
            </div>
          </Card>

          {/* Stamps & Points 2-col row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <Card style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Stamps</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>
                  {metrics.totalStampsAwarded}
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={16} />
                </div>
              </div>
            </Card>

            <Card style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Points</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>
                  {metrics.totalPointsEarned}
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Coins size={16} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* Desktop Aggregate Metrics Bar */
        <div className="responsive-kpi-grid">
          <Card className="kpi-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="kpi-label" style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Active Members
                </div>
                <div className="kpi-value" style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {metrics.totalCards}
                </div>
              </div>
              <div className="metric-icon-box" style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4F6BFF', flexShrink: 0 }}>
                <Award size={22} />
              </div>
            </div>
          </Card>

          <Card className="kpi-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="kpi-label" style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Stamps Awarded
                </div>
                <div className="kpi-value" style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {metrics.totalStampsAwarded}
                </div>
              </div>
              <div className="metric-icon-box" style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A', flexShrink: 0 }}>
                <CheckCircle2 size={22} />
              </div>
            </div>
          </Card>

          <Card className="kpi-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="kpi-label" style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Points Earned
                </div>
                <div className="kpi-value" style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {metrics.totalPointsEarned}
                </div>
              </div>
              <div className="metric-icon-box" style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706', flexShrink: 0 }}>
                <Coins size={22} />
              </div>
            </div>
          </Card>

          <Card className="kpi-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="kpi-label" style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Transactions
                </div>
                <div className="kpi-value" style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {metrics.transactionCount}
                </div>
              </div>
              <div className="metric-icon-box" style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', flexShrink: 0 }}>
                <Clock size={22} />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div
        className="tabs-nav"
        style={{
          display: 'flex',
          gap: isMobile ? '6px' : '8px',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '4px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('terminal')}
          style={{
            padding: isMobile ? '8px 14px' : '10px 18px',
            borderRadius: '8px',
            fontSize: isMobile ? '13px' : '14px',
            fontWeight: activeTab === 'terminal' ? 700 : 500,
            color: activeTab === 'terminal' ? '#4F6BFF' : '#64748B',
            backgroundColor: activeTab === 'terminal' ? '#EEF2FF' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '6px' : '8px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            minHeight: isMobile ? '40px' : '44px',
          }}
        >
          <Award size={isMobile ? 16 : 18} /> {isMobile ? 'Terminal' : 'Staff Awarding Terminal'}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('program')}
          style={{
            padding: isMobile ? '8px 14px' : '10px 18px',
            borderRadius: '8px',
            fontSize: isMobile ? '13px' : '14px',
            fontWeight: activeTab === 'program' ? 700 : 500,
            color: activeTab === 'program' ? '#4F6BFF' : '#64748B',
            backgroundColor: activeTab === 'program' ? '#EEF2FF' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '6px' : '8px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            minHeight: isMobile ? '40px' : '44px',
          }}
        >
          <Sliders size={isMobile ? 16 : 18} /> {isMobile ? 'Programs' : 'Program Configuration'}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            padding: isMobile ? '8px 14px' : '10px 18px',
            borderRadius: '8px',
            fontSize: isMobile ? '13px' : '14px',
            fontWeight: activeTab === 'history' ? 700 : 500,
            color: activeTab === 'history' ? '#4F6BFF' : '#64748B',
            backgroundColor: activeTab === 'history' ? '#EEF2FF' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '6px' : '8px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            minHeight: isMobile ? '40px' : '44px',
          }}
        >
          <Clock size={isMobile ? 16 : 18} /> {isMobile ? `Ledger (${historyTotal})` : `Activity Ledger (${historyTotal})`}
        </button>
      </div>

      {/* TAB 1: STAFF AWARDING TERMINAL */}
      {activeTab === 'terminal' && (
        isMobile ? (
          /* Mobile Sequential Workflow: Lookup -> Select -> View Balance -> Award/Adjust */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {awardFeedback && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  backgroundColor: awardFeedback.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                  border: `1px solid ${awardFeedback.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
                  color: awardFeedback.type === 'success' ? '#166534' : '#991B1B',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {awardFeedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                {awardFeedback.message}
              </div>
            )}

            {selectedCustomer ? (
              /* Selected Customer View with Balance and Actions */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Card style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Selected Customer Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Selected Customer
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                        {selectedCustomer.name}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                        {selectedCustomer.phone}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCustomer(null)}
                      style={{ minHeight: '38px', padding: '0 12px', fontSize: '12px' }}
                    >
                      Change Customer
                    </Button>
                  </div>

                  {/* Stamp or Points Workflow */}
                  {activeProgram?.type === 'STAMP' || selectedCustomer.activeProgramType === 'STAMP' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                          Stamp Pass: {activeProgram?.name || 'Active Program'}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#4F6BFF' }}>
                          {selectedCustomer.card?.stampsCollected ?? selectedCustomer.stampsBalance} / {activeProgram?.targetStamps || 10} Stamps
                        </span>
                      </div>

                      {/* Mobile Stamp Grid: 5 columns */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', padding: '4px 0' }}>
                        {Array.from({ length: activeProgram?.targetStamps || 10 }).map((_, idx) => {
                          const currentStamps = selectedCustomer.card?.stampsCollected ?? selectedCustomer.stampsBalance;
                          const isFilled = idx < currentStamps;
                          const isGift = idx === (activeProgram?.targetStamps || 10) - 1;
                          return (
                            <div
                              key={idx}
                              style={{
                                aspectRatio: '1',
                                borderRadius: '50%',
                                backgroundColor: isFilled ? '#4F6BFF' : '#F1F5F9',
                                border: `2px ${isFilled ? 'solid' : 'dashed'} ${isFilled ? '#4F6BFF' : '#CBD5E1'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isFilled ? '#FFFFFF' : '#64748B',
                                fontSize: '14px',
                                fontWeight: 700,
                              }}
                            >
                              {isGift ? '🎁' : isFilled ? '✓' : idx + 1}
                            </div>
                          );
                        })}
                      </div>

                      {/* Mobile Action Buttons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Button
                          variant="primary"
                          disabled={isSubmittingAward || !activeProgram || activeProgram.status !== 'ACTIVE'}
                          onClick={() => handleAwardStamps(1)}
                          style={{ width: '100%', minHeight: '46px', fontSize: '15px', fontWeight: 700, justifyContent: 'center', gap: '8px' }}
                        >
                          <Plus size={18} /> Award Stamp
                        </Button>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Button
                            variant="outline"
                            disabled={isSubmittingAward || !activeProgram || activeProgram.status !== 'ACTIVE'}
                            onClick={() => handleAwardStamps(2)}
                            style={{ flex: 1, minHeight: '42px', fontSize: '13px', justifyContent: 'center' }}
                          >
                            +2 Stamps
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setIsAdjustModalOpen(true)}
                            style={{ flex: 1, minHeight: '42px', fontSize: '13px', justifyContent: 'center', gap: '6px' }}
                          >
                            <Sliders size={14} /> Adjust Points
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Points Mobile View */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748B' }}>Current Points Balance</div>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
                            {selectedCustomer.pointsBalance} <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 500 }}>points</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsAdjustModalOpen(true)}
                          style={{ minHeight: '38px' }}
                        >
                          <Sliders size={14} /> Adjust Points
                        </Button>
                      </div>

                      <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <Input
                          type="number"
                          min="10"
                          label="Bill Amount (₹)"
                          value={purchaseAmount}
                          onChange={e => setPurchaseAmount(Math.max(0, Number(e.target.value)))}
                        />
                        <div style={{ fontSize: '13px', color: '#4F6BFF', fontWeight: 700 }}>
                          = {Math.floor((purchaseAmount * 100) / (activeProgram?.pointsPerCurrencyMinor || 1000))} Points
                        </div>
                        <Button
                          variant="primary"
                          disabled={isSubmittingAward || !activeProgram || activeProgram.status !== 'ACTIVE'}
                          onClick={handleAwardPoints}
                          style={{ width: '100%', minHeight: '46px', justifyContent: 'center', gap: '8px', fontSize: '15px', fontWeight: 700 }}
                        >
                          <Plus size={18} /> Award Points
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            ) : (
              /* Mobile Customer Lookup List */
              <Card style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                      Customer Lookup
                    </h2>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      Search and select a regular
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>{searchResults.length} found</span>
                </div>

                <Input
                  placeholder="Search customer name or phone..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />

                {/* Mobile Result Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {isSearching && searchResults.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                      <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                      Searching customers...
                    </div>
                  ) : !isSearching && searchResults.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                      No matching customers found.
                    </div>
                  ) : (
                    searchResults.map(c => {
                      const stamps = c.card?.stampsCollected ?? c.stampsBalance;
                      const target = c.card?.totalStampsNeeded ?? c.targetStamps;
                      return (
                        <div
                          key={c.id}
                          style={{
                            padding: '14px',
                            borderRadius: '10px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{c.name}</div>
                              <div style={{ fontSize: '13px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>{c.phone}</div>
                            </div>
                            <div>
                              {c.activeProgramType === 'STAMP' ? (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: '#EEF2FF',
                                    color: '#4F6BFF',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                  }}
                                >
                                  {stamps} / {target} Stamps
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: '#FEF3C7',
                                    color: '#92400E',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                  }}
                                >
                                  {c.pointsBalance} Pts
                                </span>
                              )}
                            </div>
                          </div>

                          <Button
                            variant="primary"
                            onClick={() => setSelectedCustomer(c)}
                            style={{ width: '100%', minHeight: '42px', justifyContent: 'center' }}
                          >
                            Select
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            )}
          </div>
        ) : (
          /* Desktop Two-Column Layout */
          <div className="terminal-two-col-grid">
            {/* Left Column: Customer Search & Lookup */}
            <Card style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Lookup Customer
                </h2>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>{searchResults.length} found</span>
              </div>

              <div style={{ position: 'relative' }}>
                <Input
                  placeholder="Search name or phone..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Results Roster */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '480px', overflowY: 'auto' }}>
                {isSearching && searchResults.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                    <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                    Searching customers...
                  </div>
                ) : !isSearching && searchResults.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                    No matching customers found. Ask customer to scan your table QR code to register.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: isSearching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                    {searchResults.map(c => {
                      const isSelected = selectedCustomer?.id === c.id;
                      const stamps = c.card?.stampsCollected ?? c.stampsBalance;
                      const target = c.card?.totalStampsNeeded ?? c.targetStamps;
                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelectedCustomer(c)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '10px',
                            backgroundColor: isSelected ? '#EEF2FF' : '#F8FAFC',
                            border: `1.5px solid ${isSelected ? '#4F6BFF' : '#E2E8F0'}`,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: isSelected ? '#3246C6' : '#0F172A' }}>
                              {c.name}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                              {c.phone}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {c.activeProgramType === 'STAMP' ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: isSelected ? '#4F6BFF' : '#E2E8F0',
                                  color: isSelected ? '#FFFFFF' : '#334155',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                }}
                              >
                                {stamps} / {target} Stamps
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: isSelected ? '#FEF3C7' : '#E2E8F0',
                                  color: isSelected ? '#92400E' : '#334155',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                }}
                              >
                                {c.pointsBalance} Pts
                              </span>
                            )}
                            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                              {c.totalVisits} visit{c.totalVisits === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            {/* Right Column: Customer Card & Award Terminal */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {awardFeedback && (
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: '12px',
                    backgroundColor: awardFeedback.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                    border: `1px solid ${awardFeedback.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
                    color: awardFeedback.type === 'success' ? '#166534' : '#991B1B',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  {awardFeedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  {awardFeedback.message}
                </div>
              )}

              {!selectedCustomer ? (
                <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#EEF2FF', color: '#4F6BFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                    <Award size={28} />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0' }}>
                    Select a Customer to Award Loyalty
                  </h3>
                  <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
                    Choose an existing customer from the lookup list on the left or search by phone number to award stamps or points.
                  </p>
                </Card>
              ) : (
                <Card style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Customer Identity Banner */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                        Selected Regular
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                        {selectedCustomer.name}
                      </div>
                      <div style={{ fontSize: '14px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                        {selectedCustomer.phone}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsAdjustModalOpen(true)}
                      >
                        <Sliders size={14} /> Adjust Balance
                      </Button>
                    </div>
                  </div>

                  {/* Live Loyalty Progress Display */}
                  {activeProgram?.type === 'STAMP' || selectedCustomer.activeProgramType === 'STAMP' ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                          Stamp Pass: {activeProgram?.name || 'Active Program'}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#4F6BFF' }}>
                          {selectedCustomer.card?.stampsCollected ?? selectedCustomer.stampsBalance} / {activeProgram?.targetStamps || 10} Stamps
                        </span>
                      </div>

                      {/* Stamp Matrix */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '8px', marginBottom: '16px' }}>
                        {Array.from({ length: activeProgram?.targetStamps || 10 }).map((_, idx) => {
                          const currentStamps = selectedCustomer.card?.stampsCollected ?? selectedCustomer.stampsBalance;
                          const isFilled = idx < currentStamps;
                          const isGift = idx === (activeProgram?.targetStamps || 10) - 1;
                          return (
                            <div
                              key={idx}
                              style={{
                                aspectRatio: '1',
                                borderRadius: '50%',
                                backgroundColor: isFilled ? '#4F6BFF' : '#F1F5F9',
                                border: `2px ${isFilled ? 'solid' : 'dashed'} ${isFilled ? '#4F6BFF' : '#CBD5E1'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isFilled ? '#FFFFFF' : '#64748B',
                                fontSize: '13px',
                                fontWeight: 700,
                              }}
                            >
                              {isGift ? '🎁' : isFilled ? '✓' : idx + 1}
                            </div>
                          );
                        })}
                      </div>

                      {/* Quick Award Actions */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                          Quick Award:
                        </span>
                        <Button
                          variant="primary"
                          size="md"
                          disabled={isSubmittingAward || !activeProgram || activeProgram.status !== 'ACTIVE'}
                          onClick={() => handleAwardStamps(1)}
                        >
                          <Plus size={16} /> +1 Stamp
                        </Button>
                        <Button
                          variant="outline"
                          size="md"
                          disabled={isSubmittingAward || !activeProgram || activeProgram.status !== 'ACTIVE'}
                          onClick={() => handleAwardStamps(2)}
                        >
                          <Plus size={16} /> +2 Stamps
                        </Button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={customStamps}
                            onChange={e => setCustomStamps(Math.max(1, Number(e.target.value)))}
                            style={{
                              width: '56px',
                              padding: '8px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '14px',
                              fontWeight: 700,
                              textAlign: 'center',
                            }}
                          />
                          <Button
                            variant="outline"
                            size="md"
                            disabled={isSubmittingAward || !activeProgram || activeProgram.status !== 'ACTIVE'}
                            onClick={() => handleAwardStamps(customStamps)}
                          >
                            Award Custom
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Points Awarding UI */
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div>
                          <div style={{ fontSize: '13px', color: '#64748B' }}>Current Points Balance</div>
                          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>
                            {selectedCustomer.pointsBalance} <span style={{ fontSize: '16px', color: '#64748B', fontWeight: 500 }}>points</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '13px', color: '#64748B' }}>
                          Conversion: <strong>1 pt per ₹{((activeProgram?.pointsPerCurrencyMinor || 1000) / 100).toFixed(0)}</strong>
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#F8FAFC', padding: '18px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                          Award Points on Purchase
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <Input
                              type="number"
                              min="10"
                              label="Bill Amount (₹)"
                              value={purchaseAmount}
                              onChange={e => setPurchaseAmount(Math.max(0, Number(e.target.value)))}
                            />
                          </div>
                          <div style={{ padding: '10px 14px', backgroundColor: '#EEF2FF', borderRadius: '8px', color: '#3246C6', fontSize: '13px', fontWeight: 700, marginTop: '22px' }}>
                            = {Math.floor((purchaseAmount * 100) / (activeProgram?.pointsPerCurrencyMinor || 1000))} Points
                          </div>
                          <div style={{ marginTop: '22px' }}>
                            <Button
                              variant="primary"
                              disabled={isSubmittingAward || !activeProgram || activeProgram.status !== 'ACTIVE'}
                              onClick={handleAwardPoints}
                            >
                              <Plus size={16} /> Award Points
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        )
      )}

      {/* TAB 2: PROGRAM CONFIGURATION */}
      {activeTab === 'program' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              Loyalty Programs
            </h2>
            <Button
              variant="primary"
              onClick={() => {
                setProgramForm({
                  name: '',
                  type: 'STAMP',
                  targetStamps: 10,
                  pointsPerRupee: 10,
                  rewardTitle: '',
                  status: 'ACTIVE',
                });
                setIsProgramModalOpen(true);
              }}
            >
              <Plus size={16} /> New Program
            </Button>
          </div>

          <div className="responsive-two-col">
            {allPrograms.map(p => (
              <Card key={p.id} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: p.type === 'STAMP' ? '#EEF2FF' : '#FEF3C7', color: p.type === 'STAMP' ? '#4F6BFF' : '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.type === 'STAMP' ? <Award size={20} /> : <Coins size={20} />}
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>{p.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>{p.type === 'STAMP' ? 'Stamp Pass Program' : 'Spend Points Program'}</div>
                    </div>
                  </div>
                  <StatusBadge
                    status={p.status === 'ACTIVE' ? 'active' : 'inactive'}
                    label={p.status}
                  />
                </div>

                <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Mechanic:</span>
                    <strong style={{ color: '#0F172A' }}>
                      {p.type === 'STAMP' ? `Goal: ${p.targetStamps} Stamps` : `1 pt per ₹${((p.pointsPerCurrencyMinor || 1000) / 100).toFixed(0)}`}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Target Reward:</span>
                    <strong style={{ color: '#0F172A' }}>{p.rewardTitle}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Total Cards Issued:</span>
                    <strong style={{ color: '#0F172A' }}>{p._count?.cards ?? 0}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setProgramForm({
                        name: p.name,
                        type: p.type === 'POINTS' ? 'POINTS' : 'STAMP',
                        targetStamps: p.targetStamps || 10,
                        pointsPerRupee: (p.pointsPerCurrencyMinor || 1000) / 100,
                        rewardTitle: p.rewardTitle,
                        status: p.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
                      });
                      setIsProgramModalOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant={p.status === 'ACTIVE' ? 'ghost' : 'outline'}
                    size="sm"
                    onClick={() => handleToggleProgramStatus(p.id, p.status)}
                  >
                    {p.status === 'ACTIVE' ? 'Pause Program' : 'Activate Program'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ACTIVITY LEDGER (HISTORY) */}
      {activeTab === 'history' && (
        <Card style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Filter size={16} color="#64748B" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Filter by Type:</span>
              <select
                value={historyFilterType}
                onChange={e => {
                  setHistoryFilterType(e.target.value);
                  setHistoryPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="">All Transactions</option>
                <option value="STAMP_ADDED">Stamps Added</option>
                <option value="POINTS_EARNED">Points Earned</option>
                <option value="ADJUSTMENT">Manual Adjustments</option>
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchHistory}
            >
              <RotateCcw size={14} /> Refresh
            </Button>
          </div>

          {/* Transactions Table */}
          {loadingHistory ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
              Loading loyalty ledger...
            </div>
          ) : historyTransactions.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>
              No loyalty transactions recorded yet.
            </div>
          ) : isMobile ? (
            /* Mobile Activity Ledger Cards */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {historyTransactions.map(t => (
                <div
                  key={t.id}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor:
                          t.type === 'STAMP_ADDED' ? '#EEF2FF' : t.type === 'POINTS_EARNED' ? '#FEF3C7' : '#F1F5F9',
                        color:
                          t.type === 'STAMP_ADDED' ? '#3246C6' : t.type === 'POINTS_EARNED' ? '#92400E' : '#475569',
                      }}
                    >
                      {t.type}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>
                      {new Date(t.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '14px' }}>
                        {t.customer?.name || 'Customer'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                        {t.customer?.phone}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '15px' }}>
                        {t.deltaStamps !== 0 ? (
                          <span style={{ color: t.deltaStamps > 0 ? '#16A34A' : '#DC2626' }}>
                            {t.deltaStamps > 0 ? `+${t.deltaStamps}` : t.deltaStamps} Stamps
                          </span>
                        ) : (
                          <span style={{ color: t.deltaPoints > 0 ? '#D97706' : '#DC2626' }}>
                            {t.deltaPoints > 0 ? `+${t.deltaPoints}` : t.deltaPoints} Pts
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                        {t.branch?.name || 'Main Branch'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Desktop Data Table */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px' }}>Date & Time</th>
                    <th style={{ padding: '10px 14px' }}>Customer</th>
                    <th style={{ padding: '10px 14px' }}>Type</th>
                    <th style={{ padding: '10px 14px' }}>Delta</th>
                    <th style={{ padding: '10px 14px' }}>Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {historyTransactions.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        {new Date(t.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{t.customer?.name || 'Customer'}</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>{t.customer?.phone}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor:
                              t.type === 'STAMP_ADDED' ? '#EEF2FF' : t.type === 'POINTS_EARNED' ? '#FEF3C7' : '#F1F5F9',
                            color:
                              t.type === 'STAMP_ADDED' ? '#3246C6' : t.type === 'POINTS_EARNED' ? '#92400E' : '#475569',
                          }}
                        >
                          {t.type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700 }}>
                        {t.deltaStamps !== 0 ? (
                          <span style={{ color: t.deltaStamps > 0 ? '#16A34A' : '#DC2626' }}>
                            {t.deltaStamps > 0 ? `+${t.deltaStamps}` : t.deltaStamps} Stamps
                          </span>
                        ) : (
                          <span style={{ color: t.deltaPoints > 0 ? '#D97706' : '#DC2626' }}>
                            {t.deltaPoints > 0 ? `+${t.deltaPoints}` : t.deltaPoints} Pts
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748B' }}>
                        {t.branch?.name || 'Main'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {historyTotal > 15 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
              <span style={{ fontSize: '13px', color: '#64748B' }}>
                Page {historyPage} of {Math.ceil(historyTotal / 15)}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage >= Math.ceil(historyTotal / 15)}
                  onClick={() => setHistoryPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* MODAL: Configure Program */}
      <Modal
        isOpen={isProgramModalOpen}
        onClose={() => setIsProgramModalOpen(false)}
        title={activeProgram ? 'Configure Loyalty Program' : 'Create Loyalty Program'}
      >
        <form onSubmit={handleSaveProgram} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Program Name"
            placeholder="e.g. Coffee Club, Regulars Pass"
            value={programForm.name}
            onChange={e => setProgramForm(f => ({ ...f, name: e.target.value }))}
            required
          />

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Program Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setProgramForm(f => ({ ...f, type: 'STAMP' }))}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: `2px solid ${programForm.type === 'STAMP' ? '#4F6BFF' : '#E2E8F0'}`,
                  backgroundColor: programForm.type === 'STAMP' ? '#EEF2FF' : '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '14px' }}>Stamp Pass</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>e.g. Buy 9, 10th free</div>
              </button>

              <button
                type="button"
                onClick={() => setProgramForm(f => ({ ...f, type: 'POINTS' }))}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: `2px solid ${programForm.type === 'POINTS' ? '#4F6BFF' : '#E2E8F0'}`,
                  backgroundColor: programForm.type === 'POINTS' ? '#EEF2FF' : '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '14px' }}>Spend Points</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>Earn points per ₹ spend</div>
              </button>
            </div>
          </div>

          {programForm.type === 'STAMP' ? (
            <Input
              type="number"
              min="1"
              max="100"
              label="Goal (Stamps to Complete)"
              value={programForm.targetStamps}
              onChange={e => setProgramForm(f => ({ ...f, targetStamps: Number(e.target.value) }))}
              helperText="Standard pass is typically 10 stamps."
              required
            />
          ) : (
            <Input
              type="number"
              min="1"
              label="Spend per Point (₹)"
              value={programForm.pointsPerRupee}
              onChange={e => setProgramForm(f => ({ ...f, pointsPerRupee: Number(e.target.value) }))}
              helperText="E.g. 10 means 1 point earned for every ₹10 spent."
              required
            />
          )}

          <Input
            label="Target Reward Name"
            placeholder="e.g. Free Specialty Treat"
            value={programForm.rewardTitle}
            onChange={e => setProgramForm(f => ({ ...f, rewardTitle: e.target.value }))}
            helperText="What does the customer earn upon completing the card or reaching threshold?"
            required
          />

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Status
            </label>
            <select
              value={programForm.status}
              onChange={e => setProgramForm(f => ({ ...f, status: e.target.value as any }))}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
              }}
            >
              <option value="ACTIVE">Active (Live for Customers)</option>
              <option value="PAUSED">Paused (Temporary hold)</option>
            </select>
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#F8FAFC', fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
            💡 <strong>Note:</strong> Reployty enforces <em>one active primary program</em> per business. Setting this program to Active will automatically pause other programs.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsProgramModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSavingProgram}
            >
              {isSavingProgram ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Manual Balance Adjustment */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Manual Balance Adjustment"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '14px', color: '#334155' }}>
            Adjusting balance for: <strong>{selectedCustomer?.name}</strong> ({selectedCustomer?.phone})
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Adjustment Target
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                type="button"
                variant={adjustType === 'stamp' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setAdjustType('stamp')}
              >
                Stamps
              </Button>
              <Button
                type="button"
                variant={adjustType === 'point' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setAdjustType('point')}
              >
                Points
              </Button>
            </div>
          </div>

          <Input
            type="number"
            label="Delta Amount (+ for add, - for deduct)"
            value={adjustDelta}
            onChange={e => setAdjustDelta(Number(e.target.value))}
            helperText="Negative values will deduct from current balance (cannot drop below 0)."
            required
          />

          <Textarea
            label="Reason for Adjustment *"
            placeholder="e.g. Counter system offline correction, Customer goodwill credit, Order cancellation"
            value={adjustReason}
            onChange={e => setAdjustReason(e.target.value)}
            required
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAdjustModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={isSubmittingAdjust || !adjustReason.trim()}
              onClick={handleSaveAdjustment}
            >
              {isSubmittingAdjust ? 'Applying...' : 'Confirm Adjustment'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
