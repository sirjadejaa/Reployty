import React, { useState, useEffect, useCallback } from 'react';
import {
  Gift,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  QrCode,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Award,
  Coins,
  Store,
  Check,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import { RewardItem, RewardRedemptionItem } from '../../types/loyalty';
import { useIsMobile } from '../../hooks/useIsMobile';

export const BusinessRewardsView: React.FC = () => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<'catalog' | 'terminal' | 'ledger'>('catalog');

  // Rewards list & metrics state
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [metrics, setMetrics] = useState({
    totalRewards: 0,
    activeRewards: 0,
    totalClaimed: 0,
    totalRedeemed: 0,
  });
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Branches list for dropdowns
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Create / Edit Reward Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<RewardItem | null>(null);
  const [rewardForm, setRewardForm] = useState({
    title: '',
    description: '',
    costType: 'STAMPS' as 'STAMPS' | 'POINTS' | 'BOTH',
    stampsRequired: 10,
    pointsRequired: 100,
    expiryDays: 30,
    usageLimitPerCustomer: 1,
    usageLimitTotal: '',
    branchId: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'DRAFT',
  });
  const [isSavingReward, setIsSavingReward] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Staff Redemption Terminal state
  const [lookupCode, setLookupCode] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    redemption: RewardRedemptionItem;
    isValid: boolean;
    isExpired: boolean;
    isBranchRestricted: boolean;
    statusText: string;
  } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [redemptionSuccessMessage, setRedemptionSuccessMessage] = useState<string | null>(null);

  // Redemptions Ledger state
  const [ledgerRedemptions, setLedgerRedemptions] = useState<RewardRedemptionItem[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<string>('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Fetch rewards catalog & metrics
  const fetchRewards = useCallback(async () => {
    try {
      setLoadingRewards(true);
      const res = await fetch('/api/business/rewards');
      if (res.ok) {
        const data = await res.json();
        setRewards(data.rewards || []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Failed to load rewards', err);
    } finally {
      setLoadingRewards(false);
    }
  }, []);

  // Fetch branches
  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/business/branches');
      if (res.ok) {
        const data = await res.json();
        setBranches(Array.isArray(data) ? data : data.branches || []);
      }
    } catch (err) {
      console.error('Failed to load branches', err);
    }
  }, []);

  // Fetch redemptions ledger
  const fetchLedger = useCallback(async () => {
    try {
      setLoadingLedger(true);
      const params = new URLSearchParams({
        page: ledgerPage.toString(),
        limit: '15',
      });
      if (ledgerStatusFilter) params.append('status', ledgerStatusFilter);
      if (ledgerSearch.trim()) params.append('search', ledgerSearch.trim());

      const res = await fetch(`/api/business/redemptions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLedgerRedemptions(data.redemptions || []);
        setLedgerTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load redemptions ledger', err);
    } finally {
      setLoadingLedger(false);
    }
  }, [ledgerPage, ledgerStatusFilter, ledgerSearch]);

  useEffect(() => {
    fetchRewards();
    fetchBranches();
  }, [fetchRewards, fetchBranches]);

  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchLedger();
    }
  }, [activeTab, fetchLedger]);

  // Handle Reward Save
  const handleSaveReward = async () => {
    try {
      setIsSavingReward(true);
      setFormError(null);

      if (!rewardForm.title.trim()) {
        setFormError('Reward title is required');
        return;
      }

      const payload: any = {
        title: rewardForm.title.trim(),
        description: rewardForm.description.trim() || undefined,
        expiryDays: Number(rewardForm.expiryDays) || 30,
        usageLimitPerCustomer: rewardForm.usageLimitPerCustomer ? Number(rewardForm.usageLimitPerCustomer) : null,
        usageLimitTotal: rewardForm.usageLimitTotal ? Number(rewardForm.usageLimitTotal) : null,
        branchId: rewardForm.branchId || null,
        status: rewardForm.status,
      };

      if (rewardForm.costType === 'STAMPS' || rewardForm.costType === 'BOTH') {
        payload.stampsRequired = Number(rewardForm.stampsRequired) || 1;
      } else {
        payload.stampsRequired = null;
      }

      if (rewardForm.costType === 'POINTS' || rewardForm.costType === 'BOTH') {
        payload.pointsRequired = Number(rewardForm.pointsRequired) || 1;
      } else {
        payload.pointsRequired = null;
      }

      const url = editingReward ? `/api/business/rewards/${editingReward.id}` : '/api/business/rewards';
      const method = editingReward ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save reward');
      }

      setIsModalOpen(false);
      setEditingReward(null);
      fetchRewards();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSavingReward(false);
    }
  };

  // Open Edit Modal
  const handleEditReward = (reward: RewardItem) => {
    setEditingReward(reward);
    setRewardForm({
      title: reward.title,
      description: reward.description || '',
      costType:
        reward.stampsRequired && reward.pointsRequired
          ? 'BOTH'
          : reward.pointsRequired
          ? 'POINTS'
          : 'STAMPS',
      stampsRequired: reward.stampsRequired || 10,
      pointsRequired: reward.pointsRequired || 100,
      expiryDays: reward.expiryDays || 30,
      usageLimitPerCustomer: reward.usageLimitPerCustomer || 1,
      usageLimitTotal: reward.usageLimitTotal ? reward.usageLimitTotal.toString() : '',
      branchId: reward.branchId || '',
      status: (reward.status as any) || 'ACTIVE',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Toggle Reward Status
  const handleToggleStatus = async (reward: RewardItem) => {
    try {
      const nextStatus = reward.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const res = await fetch(`/api/business/rewards/${reward.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchRewards();
      }
    } catch (err) {
      console.error('Failed to toggle status', err);
    }
  };

  // Staff Terminal: Lookup Code
  const handleLookup = async (codeToSearch?: string) => {
    const targetCode = (codeToSearch || lookupCode).trim();
    if (!targetCode) return;

    try {
      setIsLookingUp(true);
      setLookupError(null);
      setLookupResult(null);
      setRedemptionSuccessMessage(null);

      const res = await fetch(`/api/business/redemptions/lookup/${encodeURIComponent(targetCode)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Voucher code not found');
      }

      const data = await res.json();
      setLookupResult(data);
    } catch (err: any) {
      setLookupError(err.message || 'Unable to locate redemption code');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Staff Terminal: Validate & Complete Redemption
  const handleValidateRedemption = async () => {
    if (!lookupResult?.redemption) return;

    try {
      setIsValidating(true);
      setLookupError(null);

      const res = await fetch('/api/business/redemptions/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: lookupResult.redemption.redemptionCode }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to complete redemption');
      }

      await res.json();
      setRedemptionSuccessMessage(
        `Reward "${lookupResult.redemption.reward?.title}" successfully redeemed for ${lookupResult.redemption.customer?.name}!`
      );
      // Refresh lookup card
      handleLookup(lookupResult.redemption.redemptionCode);
      fetchRewards();
    } catch (err: any) {
      setLookupError(err.message);
    } finally {
      setIsValidating(false);
    }
  };

  // Filtered rewards
  const filteredRewards = rewards.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(catalogSearch.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 'var(--space-6)',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'rgba(79, 107, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
              }}
            >
              <Gift size={24} />
            </div>
            <div>
              <h1
                style={{
                  fontSize: 'var(--font-size-2xl)',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                Rewards & Redemption
              </h1>
              <p
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  marginTop: 'var(--space-1)',
                }}
              >
                Manage your reward catalogue, redeem vouchers securely, and inspect redemption history.
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        {activeTab === 'catalog' && (
          <Button
            variant="primary"
            onClick={() => {
              setEditingReward(null);
              setRewardForm({
                title: '',
                description: '',
                costType: 'STAMPS',
                stampsRequired: 10,
                pointsRequired: 100,
                expiryDays: 30,
                usageLimitPerCustomer: 1,
                usageLimitTotal: '',
                branchId: '',
                status: 'ACTIVE',
              });
              setFormError(null);
              setIsModalOpen(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <Plus size={18} />
            Create Reward
          </Button>
        )}
      </div>

      {/* Metrics Row */}
      <div
        className="responsive-kpi-grid"
        style={{
          marginBottom: 'var(--space-6)',
        }}
      >
        <Card className="kpi-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="kpi-label" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              TOTAL REWARDS
            </span>
            <Gift size={16} color="var(--color-primary)" />
          </div>
          <div className="kpi-value" style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 'var(--space-2)' }}>
            {metrics.totalRewards}
          </div>
          <div className="kpi-subtext" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>
            {metrics.activeRewards} currently active
          </div>
        </Card>

        <Card className="kpi-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="kpi-label" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              ACTIVE REWARDS
            </span>
            <CheckCircle2 size={16} color="var(--color-success)" />
          </div>
          <div className="kpi-value" style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 'var(--space-2)', color: 'var(--color-success)' }}>
            {metrics.activeRewards}
          </div>
          <div className="kpi-subtext" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>
            Live in Customer PWA
          </div>
        </Card>

        <Card className="kpi-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="kpi-label" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              CLAIMED VOUCHERS
            </span>
            <Clock size={16} color="var(--color-warning)" />
          </div>
          <div className="kpi-value" style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 'var(--space-2)', color: 'var(--color-warning)' }}>
            {metrics.totalClaimed}
          </div>
          <div className="kpi-subtext" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>
            Awaiting redemption
          </div>
        </Card>

        <Card className="kpi-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="kpi-label" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              TOTAL REDEEMED
            </span>
            <ShieldCheck size={16} color="var(--color-primary)" />
          </div>
          <div className="kpi-value" style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 'var(--space-2)', color: 'var(--color-primary)' }}>
            {metrics.totalRedeemed}
          </div>
          <div className="kpi-subtext" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>
            Completed rewards
          </div>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <button
          onClick={() => setActiveTab('catalog')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            border: 'none',
            borderBottom: activeTab === 'catalog' ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'catalog' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'catalog' ? 600 : 500,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
          }}
        >
          <Gift size={18} />
          Rewards Catalog
        </button>

        <button
          onClick={() => setActiveTab('terminal')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            border: 'none',
            borderBottom: activeTab === 'terminal' ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'terminal' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'terminal' ? 600 : 500,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
          }}
        >
          <QrCode size={18} />
          Staff Redemption Terminal
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            border: 'none',
            borderBottom: activeTab === 'ledger' ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'ledger' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'ledger' ? 600 : 500,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
          }}
        >
          <Clock size={18} />
          Redemptions Ledger
        </button>
      </div>

      {/* TAB 1: REWARDS CATALOG */}
      {activeTab === 'catalog' && (
        <div>
          {/* Controls bar */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: '240px' }}>
              <Input
                placeholder="Search rewards by title or description..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                leftIcon={<Search size={16} />}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {['ALL', 'ACTIVE', 'INACTIVE'].map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>

          {/* Catalog Grid */}
          {loadingRewards ? (
            <Card style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              Loading reward catalogue...
            </Card>
          ) : filteredRewards.length === 0 ? (
            <Card style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
              <Gift size={48} color="var(--color-text-tertiary)" style={{ margin: '0 auto var(--space-4)' }} />
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                No Rewards Found
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
                {catalogSearch ? 'No rewards match your search criteria.' : 'Create your first reward for customers to earn.'}
              </p>
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              {filteredRewards.map((reward) => (
                <Card
                  key={reward.id}
                  style={{
                    padding: 'var(--space-5)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderLeft: reward.status === 'ACTIVE' ? '4px solid var(--color-primary)' : '4px solid var(--color-border)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                      <h3
                        style={{
                          fontSize: 'var(--font-size-base)',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          margin: 0,
                        }}
                      >
                        {reward.title}
                      </h3>
                      <StatusBadge status={reward.status} />
                    </div>

                    {reward.description && (
                      <p
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text-secondary)',
                          margin: 'var(--space-2) 0 var(--space-4)',
                          lineHeight: 1.5,
                        }}
                      >
                        {reward.description}
                      </p>
                    )}

                    {/* Cost Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                      {reward.stampsRequired && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: 'rgba(79, 107, 255, 0.08)',
                            color: 'var(--color-primary)',
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 600,
                          }}
                        >
                          <Award size={14} />
                          {reward.stampsRequired} Stamps
                        </div>
                      )}

                      {reward.pointsRequired && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: 'rgba(234, 179, 8, 0.1)',
                            color: '#CA8A04',
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 600,
                          }}
                        >
                          <Coins size={14} />
                          {reward.pointsRequired} Points
                        </div>
                      )}

                      {reward.branch && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: 'var(--color-bg-secondary)',
                            color: 'var(--color-text-secondary)',
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--font-size-xs)',
                          }}
                        >
                          <Store size={14} />
                          {reward.branch.name}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer & Actions */}
                  <div
                    style={{
                      borderTop: '1px solid var(--color-border)',
                      paddingTop: 'var(--space-3)',
                      marginTop: 'var(--space-4)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                      {reward._count?.redemptions || 0} redemptions
                    </span>

                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <Button variant="outline" size="sm" onClick={() => handleToggleStatus(reward)}>
                        {reward.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleEditReward(reward)}>
                        Edit
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STAFF REDEMPTION TERMINAL */}
      {activeTab === 'terminal' && (
        <div className="terminal-two-col-grid">
          {/* Input & Lookup Box */}
          <Card style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(79, 107, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-primary)',
                }}
              >
                <QrCode size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0 }}>
                  Enter Voucher Code
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                  Customer presents code or barcode on their phone.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLookup();
              }}
            >
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  REDEMPTION CODE
                </label>
                <Input
                  placeholder="e.g. R-XXXX-XXXX or RPL-CHEN-FREE"
                  value={lookupCode}
                  onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                  style={{
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textAlign: 'center',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isLookingUp}
                  disabled={!lookupCode.trim()}
                  style={{ width: '100%' }}
                >
                  Verify Code
                </Button>
                {lookupResult && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setLookupCode('');
                      setLookupResult(null);
                      setLookupError(null);
                      setRedemptionSuccessMessage(null);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>

            {/* Quick Helper Tips */}
            <div
              style={{
                marginTop: 'var(--space-6)',
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              <strong>Cashier Verification Protocol:</strong>
              <ul style={{ margin: 'var(--space-1) 0 0', paddingLeft: 'var(--space-4)' }}>
                <li>Verify voucher is green ("Valid for Redemption")</li>
                <li>Check customer name/phone matches if needed</li>
                <li>Click <strong>"Complete Redemption"</strong> to mark voucher used</li>
              </ul>
            </div>
          </Card>

          {/* Result Card & Validation */}
          <div>
            {redemptionSuccessMessage && (
              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-4)',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <CheckCircle2 size={20} />
                {redemptionSuccessMessage}
              </div>
            )}

            {lookupError && (
              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-4)',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <AlertCircle size={20} />
                {lookupError}
              </div>
            )}

            {lookupResult ? (
              <Card style={{ padding: 'var(--space-6)' }}>
                {/* Status Indicator Banner */}
                <div
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-5)',
                    backgroundColor: lookupResult.isValid
                      ? 'rgba(34, 197, 94, 0.1)'
                      : lookupResult.statusText === 'ALREADY_REDEEMED'
                      ? 'rgba(239, 68, 68, 0.1)'
                      : 'rgba(234, 179, 8, 0.1)',
                    color: lookupResult.isValid
                      ? 'var(--color-success)'
                      : lookupResult.statusText === 'ALREADY_REDEEMED'
                      ? 'var(--color-danger)'
                      : '#CA8A04',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {lookupResult.isValid ? (
                      <ShieldCheck size={20} />
                    ) : (
                      <ShieldAlert size={20} />
                    )}
                    <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                      {lookupResult.statusText.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
                    {lookupResult.redemption.redemptionCode}
                  </span>
                </div>

                {/* Voucher Content Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                  <div>
                    <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                      REWARD
                    </label>
                    <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '2px' }}>
                      {lookupResult.redemption.reward?.title}
                    </div>
                    {lookupResult.redemption.reward?.description && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                        {lookupResult.redemption.reward?.description}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                      CUSTOMER
                    </label>
                    <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: '2px' }}>
                      {lookupResult.redemption.customer?.name}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                      {lookupResult.redemption.customer?.phone}
                    </div>
                  </div>
                </div>

                {/* Details Table / List */}
                <div
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-4)',
                    marginBottom: 'var(--space-6)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Claimed At:</span>
                    <span style={{ fontWeight: 500 }}>
                      {new Date(lookupResult.redemption.claimedAt).toLocaleString()}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Expires At:</span>
                    <span style={{ fontWeight: 500 }}>
                      {lookupResult.redemption.expiresAt
                        ? new Date(lookupResult.redemption.expiresAt).toLocaleDateString()
                        : 'No Expiry'}
                    </span>
                  </div>

                  {lookupResult.redemption.redeemedAt && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)', color: 'var(--color-danger)' }}>
                      <span>Redeemed At:</span>
                      <span style={{ fontWeight: 600 }}>
                        {new Date(lookupResult.redemption.redeemedAt).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {lookupResult.redemption.redeemedBy && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Redeemed By Cashier:</span>
                      <span style={{ fontWeight: 500 }}>{lookupResult.redemption.redeemedBy.name}</span>
                    </div>
                  )}

                  {lookupResult.redemption.branch && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Branch:</span>
                      <span style={{ fontWeight: 500 }}>{lookupResult.redemption.branch.name}</span>
                    </div>
                  )}
                </div>

                {/* Complete Redemption Button */}
                {lookupResult.isValid && (
                  <Button
                    variant="primary"
                    size="lg"
                    loading={isValidating}
                    onClick={handleValidateRedemption}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 'var(--space-2)',
                      fontSize: 'var(--font-size-base)',
                      fontWeight: 700,
                    }}
                  >
                    <Check size={20} />
                    Confirm Redemption Now
                  </Button>
                )}
              </Card>
            ) : (
              <Card style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                <QrCode size={48} style={{ margin: '0 auto var(--space-4)', opacity: 0.4 }} />
                <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Awaiting Code Lookup
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)' }}>
                  Enter a voucher code on the left to verify authenticity and eligibility.
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: REDEMPTIONS LEDGER */}
      {activeTab === 'ledger' && (
        <div>
          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: isMobile ? '100%' : '240px' }}>
              <Input
                placeholder="Search by code, customer name or phone..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                leftIcon={<Search size={16} />}
              />
            </div>

            <div className="mobile-filter-strip" style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {['', 'CLAIMED', 'REDEEMED', 'EXPIRED'].map((st) => (
                <Button
                  key={st || 'ALL'}
                  variant={ledgerStatusFilter === st ? 'primary' : 'outline'}
                  size="sm"
                  style={{ flexShrink: 0, minHeight: 36 }}
                  onClick={() => {
                    setLedgerStatusFilter(st);
                    setLedgerPage(1);
                  }}
                >
                  {st || 'ALL'}
                </Button>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLedger()}
                title="Refresh Ledger"
                style={{ flexShrink: 0, minHeight: 36 }}
              >
                <RefreshCw size={14} />
              </Button>
            </div>
          </div>

          {/* Ledger Table / Mobile Cards */}
          <Card style={{ overflow: 'hidden' }}>
            {loadingLedger ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                Loading redemption records...
              </div>
            ) : ledgerRedemptions.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                No redemption records found.
              </div>
            ) : isMobile ? (
              <div className="mobile-card-list" style={{ padding: 'var(--space-3)' }}>
                {ledgerRedemptions.map((redemption) => (
                  <div key={redemption.id} className="mobile-data-card">
                    <div className="mobile-data-card-header">
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontSize: '13px' }}>
                        {redemption.redemptionCode}
                      </span>
                      <StatusBadge status={redemption.status} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      {redemption.reward?.title || 'Reward'}
                    </div>
                    <div className="mobile-data-card-row">
                      <span className="mobile-data-card-label">Customer</span>
                      <span className="mobile-data-card-value">
                        {redemption.customer?.name || 'Unknown'} {redemption.customer?.phone ? `• ${redemption.customer.phone}` : ''}
                      </span>
                    </div>
                    <div className="mobile-data-card-row">
                      <span className="mobile-data-card-label">Cost</span>
                      <span className="mobile-data-card-value">
                        {redemption.stampsConsumed ? (
                          <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{redemption.stampsConsumed} Stamps</span>
                        ) : redemption.pointsConsumed ? (
                          <span style={{ color: '#CA8A04', fontWeight: 600 }}>{redemption.pointsConsumed} Points</span>
                        ) : '-'}
                      </span>
                    </div>
                    <div className="mobile-data-card-row" style={{ paddingTop: '8px', borderTop: '1px solid var(--color-border-subtle)', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                      <span>Claimed: {new Date(redemption.claimedAt).toLocaleDateString()}</span>
                      {redemption.redeemedAt ? (
                        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                          Redeemed: {new Date(redemption.redeemedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span>Expires: {redemption.expiresAt ? new Date(redemption.expiresAt).toLocaleDateString() : 'None'}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderBottom: '1px solid var(--color-border)',
                        textAlign: 'left',
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--font-size-xs)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Code</th>
                      <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Customer</th>
                      <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Reward</th>
                      <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Cost</th>
                      <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Status</th>
                      <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Claimed</th>
                      <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Redeemed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRedemptions.map((redemption) => (
                      <tr
                        key={redemption.id}
                        style={{
                          borderBottom: '1px solid var(--color-border)',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 700, fontFamily: 'monospace' }}>
                          {redemption.redemptionCode}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {redemption.customer?.name || 'Unknown'}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                            {redemption.customer?.phone}
                          </div>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 500 }}>
                          {redemption.reward?.title || 'Reward'}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          {redemption.stampsConsumed ? (
                            <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                              {redemption.stampsConsumed} Stamps
                            </span>
                          ) : redemption.pointsConsumed ? (
                            <span style={{ color: '#CA8A04', fontWeight: 600 }}>
                              {redemption.pointsConsumed} Points
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          <StatusBadge status={redemption.status} />
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                          {new Date(redemption.claimedAt).toLocaleString()}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                          {redemption.redeemedAt ? (
                            <div>
                              <div>{new Date(redemption.redeemedAt).toLocaleString()}</div>
                              {redemption.redeemedBy && (
                                <div style={{ color: 'var(--color-text-tertiary)' }}>by {redemption.redeemedBy.name}</div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {ledgerTotal > 15 && (
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  Total {ledgerTotal} redemptions
                </span>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ledgerPage <= 1}
                    onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ledgerPage * 15 >= ledgerTotal}
                    onClick={() => setLedgerPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* CREATE / EDIT REWARD MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingReward ? 'Edit Reward' : 'Create New Reward'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {formError && (
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-danger)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {formError}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              REWARD TITLE *
            </label>
            <Input
              placeholder="e.g. Free Specialty Espresso or Matcha Latte"
              value={rewardForm.title}
              onChange={(e) => setRewardForm({ ...rewardForm, title: e.target.value })}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              DESCRIPTION
            </label>
            <Textarea
              placeholder="Provide details on what the customer receives when presenting this voucher..."
              value={rewardForm.description}
              onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
              rows={2}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              COST TYPE
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                type="button"
                variant={rewardForm.costType === 'STAMPS' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setRewardForm({ ...rewardForm, costType: 'STAMPS' })}
              >
                Stamps
              </Button>
              <Button
                type="button"
                variant={rewardForm.costType === 'POINTS' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setRewardForm({ ...rewardForm, costType: 'POINTS' })}
              >
                Points
              </Button>
              <Button
                type="button"
                variant={rewardForm.costType === 'BOTH' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setRewardForm({ ...rewardForm, costType: 'BOTH' })}
              >
                Both / Dual
              </Button>
            </div>
          </div>

          {(rewardForm.costType === 'STAMPS' || rewardForm.costType === 'BOTH') && (
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                STAMPS REQUIRED *
              </label>
              <Input
                type="number"
                min="1"
                value={rewardForm.stampsRequired}
                onChange={(e) => setRewardForm({ ...rewardForm, stampsRequired: Number(e.target.value) })}
              />
            </div>
          )}

          {(rewardForm.costType === 'POINTS' || rewardForm.costType === 'BOTH') && (
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                POINTS REQUIRED *
              </label>
              <Input
                type="number"
                min="1"
                value={rewardForm.pointsRequired}
                onChange={(e) => setRewardForm({ ...rewardForm, pointsRequired: Number(e.target.value) })}
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                EXPIRY (DAYS)
              </label>
              <Input
                type="number"
                min="1"
                value={rewardForm.expiryDays}
                onChange={(e) => setRewardForm({ ...rewardForm, expiryDays: Number(e.target.value) })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                LIMIT PER CUSTOMER
              </label>
              <Input
                type="number"
                min="1"
                value={rewardForm.usageLimitPerCustomer}
                onChange={(e) => setRewardForm({ ...rewardForm, usageLimitPerCustomer: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              BRANCH AVAILABILITY
            </label>
            <select
              value={rewardForm.branchId}
              onChange={(e) => setRewardForm({ ...rewardForm, branchId: e.target.value })}
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={isSavingReward} onClick={handleSaveReward}>
              {editingReward ? 'Save Changes' : 'Create Reward'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
