import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Store,
  Check,
  Calendar,
  Users,
  Trash2,
  Edit2,
  Power,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import {
  OfferItem,
  OfferRedemptionItem,
  OfferType,
  OfferStatus,
  CreateOfferInput,
} from '../../types/offers';
import { useIsMobile } from '../../hooks/useIsMobile';

interface BusinessOffersViewProps {
  onNavigate?: (route: string) => void;
}

export const BusinessOffersView: React.FC<BusinessOffersViewProps> = () => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<'catalog' | 'terminal' | 'ledger'>('catalog');

  // Offers list & state
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Create / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferItem | null>(null);
  const [offerForm, setOfferForm] = useState<{
    title: string;
    description: string;
    type: OfferType;
    discountValue: number;
    minPurchaseMajor: string;
    maxDiscountMajor: string;
    startDate: string;
    endDate: string;
    usageLimitPerCustomer: string;
    usageLimitTotal: string;
    branchId: string;
    targetAudience: 'ALL' | 'NEW_CUSTOMERS' | 'EXISTING_CUSTOMERS' | 'VIP';
    terms: string;
    status: OfferStatus;
  }>({
    title: '',
    description: '',
    type: 'PERCENTAGE_DISCOUNT',
    discountValue: 15,
    minPurchaseMajor: '',
    maxDiscountMajor: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    usageLimitPerCustomer: '1',
    usageLimitTotal: '',
    branchId: '',
    targetAudience: 'ALL',
    terms: 'Valid on dine-in and takeaway. Cannot be combined with other offers.',
    status: 'ACTIVE',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Staff Redemption Terminal state
  const [terminalSearchCustomer, setTerminalSearchCustomer] = useState('');
  const [searchedCustomer, setSearchedCustomer] = useState<{
    id: string;
    name: string;
    phone: string;
    totalVisits: number;
    stampsBalance: number;
  } | null>(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [selectedOfferForRedeem, setSelectedOfferForRedeem] = useState<OfferItem | null>(null);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    reason?: string;
    priorRedemptionsCount: number;
    remainingUsage: number | null;
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redemptionReceipt, setRedemptionReceipt] = useState<OfferRedemptionItem | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  // Ledger state
  const [ledgerRedemptions, setLedgerRedemptions] = useState<OfferRedemptionItem[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [loadingLedger, setLoadingLedger] = useState(false);

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

  // Fetch offers
  const fetchOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (branchFilter !== 'ALL') params.append('branchId', branchFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/business/offers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data);
      }
    } catch (err) {
      console.error('Failed to fetch offers', err);
    } finally {
      setLoadingOffers(false);
    }
  }, [statusFilter, branchFilter, searchQuery]);

  // Fetch ledger
  const fetchLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const params = new URLSearchParams();
      params.append('page', '1');
      params.append('limit', '50');
      const res = await fetch(`/api/business/offers/redemptions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLedgerRedemptions(data.redemptions || []);
        setLedgerTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load ledger', err);
    } finally {
      setLoadingLedger(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    if (activeTab === 'catalog') {
      fetchOffers();
    } else if (activeTab === 'ledger') {
      fetchLedger();
    }
  }, [activeTab, fetchOffers, fetchLedger]);

  // Metrics
  const totalOffersCount = offers.length;
  const activeOffersCount = offers.filter((o) => o.effectiveStatus === 'ACTIVE').length;
  const scheduledOffersCount = offers.filter((o) => o.effectiveStatus === 'SCHEDULED').length;
  const totalRedemptionsCount = offers.reduce((acc, o) => acc + (o.redemptionsCount || 0), 0);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingOffer(null);
    setOfferForm({
      title: '',
      description: '',
      type: 'PERCENTAGE_DISCOUNT',
      discountValue: 15,
      minPurchaseMajor: '',
      maxDiscountMajor: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      usageLimitPerCustomer: '1',
      usageLimitTotal: '',
      branchId: '',
      targetAudience: 'ALL',
      terms: 'Valid on dine-in and takeaway. Cannot be combined with other offers.',
      status: 'ACTIVE',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (offer: OfferItem) => {
    setEditingOffer(offer);
    const cfg = offer.eligibilityConfig || {};
    setOfferForm({
      title: offer.title,
      description: offer.description || '',
      type: offer.type,
      discountValue: offer.discountValue,
      minPurchaseMajor: offer.minPurchaseMinor !== null ? String(offer.minPurchaseMinor / 100) : '',
      maxDiscountMajor: offer.maxDiscountMinor !== null ? String(offer.maxDiscountMinor / 100) : '',
      startDate: new Date(offer.startDate).toISOString().split('T')[0],
      endDate: offer.endDate ? new Date(offer.endDate).toISOString().split('T')[0] : '',
      usageLimitPerCustomer: offer.usageLimitPerCustomer !== null ? String(offer.usageLimitPerCustomer) : '',
      usageLimitTotal: offer.usageLimitTotal !== null ? String(offer.usageLimitTotal) : '',
      branchId: cfg.branchId || '',
      targetAudience: cfg.targetAudience || 'ALL',
      terms: cfg.terms || '',
      status: offer.status,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Save Offer (Create / Update)
  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerForm.title.trim()) {
      setFormError('Offer title is required');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const payload: CreateOfferInput = {
        title: offerForm.title.trim(),
        description: offerForm.description.trim() || null,
        type: offerForm.type,
        discountValue: Number(offerForm.discountValue),
        minPurchaseMinor: offerForm.minPurchaseMajor ? Math.round(Number(offerForm.minPurchaseMajor) * 100) : null,
        maxDiscountMinor: offerForm.maxDiscountMajor ? Math.round(Number(offerForm.maxDiscountMajor) * 100) : null,
        startDate: new Date(offerForm.startDate).toISOString(),
        endDate: offerForm.endDate ? new Date(offerForm.endDate).toISOString() : null,
        usageLimitPerCustomer: offerForm.usageLimitPerCustomer ? Number(offerForm.usageLimitPerCustomer) : null,
        usageLimitTotal: offerForm.usageLimitTotal ? Number(offerForm.usageLimitTotal) : null,
        status: offerForm.status,
        eligibilityConfig: {
          branchId: offerForm.branchId || null,
          targetAudience: offerForm.targetAudience,
          terms: offerForm.terms.trim() || null,
        },
      };

      const url = editingOffer ? `/api/business/offers/${editingOffer.id}` : '/api/business/offers';
      const method = editingOffer ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save offer');
      }

      setIsModalOpen(false);
      fetchOffers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Status
  const handleToggleStatus = async (offer: OfferItem) => {
    const nextStatus: OfferStatus = offer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(`/api/business/offers/${offer.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchOffers();
      }
    } catch (err) {
      console.error('Failed to toggle status', err);
    }
  };

  // Delete Offer
  const handleDeleteOffer = async (offer: OfferItem) => {
    if (!window.confirm(`Are you sure you want to remove offer "${offer.title}"?`)) return;
    try {
      const res = await fetch(`/api/business/offers/${offer.id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchOffers();
      }
    } catch (err) {
      console.error('Failed to delete offer', err);
    }
  };

  // Staff Terminal: Search Customer
  const handleSearchCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalSearchCustomer.trim()) return;
    setSearchingCustomer(true);
    setTerminalError(null);
    setSearchedCustomer(null);
    setSelectedOfferForRedeem(null);
    setValidationResult(null);
    setRedemptionReceipt(null);

    try {
      const res = await fetch(`/api/business/customers?search=${encodeURIComponent(terminalSearchCustomer.trim())}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        const customerList = Array.isArray(data) ? data : data.customers || [];
        if (customerList.length > 0) {
          setSearchedCustomer(customerList[0]);
        } else {
          setTerminalError('No customer found matching this phone number or name');
        }
      } else {
        setTerminalError('Failed to search customer');
      }
    } catch (err: any) {
      setTerminalError(err.message);
    } finally {
      setSearchingCustomer(false);
    }
  };

  // Staff Terminal: Select offer & validate
  const handleSelectOfferForValidation = async (offer: OfferItem) => {
    if (!searchedCustomer) return;
    setSelectedOfferForRedeem(offer);
    setIsValidating(true);
    setValidationResult(null);
    setTerminalError(null);
    setRedemptionReceipt(null);

    try {
      const res = await fetch('/api/business/offers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: offer.id,
          customerId: searchedCustomer.id,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setValidationResult(data);
      } else {
        setTerminalError(data.error || 'Failed to validate offer');
      }
    } catch (err: any) {
      setTerminalError(err.message);
    } finally {
      setIsValidating(false);
    }
  };

  // Staff Terminal: Redeem Offer
  const handleExecuteRedeem = async () => {
    if (!searchedCustomer || !selectedOfferForRedeem) return;
    setIsRedeeming(true);
    setTerminalError(null);

    try {
      const idempotencyKey = `staff-${searchedCustomer.id}-${selectedOfferForRedeem.id}-${Date.now()}`;
      const res = await fetch('/api/business/offers/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: selectedOfferForRedeem.id,
          customerId: searchedCustomer.id,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Redemption failed');
      }

      setRedemptionReceipt(data.redemption);
      setValidationResult(null);
      fetchOffers();
    } catch (err: any) {
      setTerminalError(err.message);
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div style={{ padding: isMobile ? 'var(--space-3)' : 'var(--space-6)', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                backgroundColor: 'rgba(235, 94, 40, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EB5E28',
              }}
            >
              <Tag size={20} />
            </div>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: 0 }}>
              Special Offers & Promotions
            </h1>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
            Create controlled discounts, drive repeat visits, and securely redeem customer promotions.
          </p>
        </div>

        {activeTab === 'catalog' && (
          <Button
            variant="primary"
            onClick={handleOpenCreate}
            leftIcon={<Plus size={18} />}
            style={{ width: isMobile ? '100%' : 'auto' }}
          >
            Create Offer
          </Button>
        )}
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              TOTAL OFFERS
            </span>
            <Tag size={16} color="var(--color-text-tertiary)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 'var(--space-2)' }}>
            {totalOffersCount}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              ACTIVE NOW
            </span>
            <CheckCircle2 size={16} color="#10B981" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 'var(--space-2)', color: '#10B981' }}>
            {activeOffersCount}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              SCHEDULED
            </span>
            <Clock size={16} color="#3B82F6" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 'var(--space-2)', color: '#3B82F6' }}>
            {scheduledOffersCount}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              TOTAL REDEEMED
            </span>
            <ShieldCheck size={16} color="#8B5CF6" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 'var(--space-2)', color: '#8B5CF6' }}>
            {totalRedemptionsCount}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: 'var(--space-6)',
          gap: 'var(--space-4)',
        }}
      >
        <button
          onClick={() => setActiveTab('catalog')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'catalog' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
            color: activeTab === 'catalog' ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'catalog' ? 600 : 500,
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <Tag size={16} />
          Offers Catalog
        </button>

        <button
          onClick={() => setActiveTab('terminal')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'terminal' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
            color: activeTab === 'terminal' ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'terminal' ? 600 : 500,
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <ShieldCheck size={16} />
          Staff Redemption Terminal
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'ledger' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
            color: activeTab === 'ledger' ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'ledger' ? 600 : 500,
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <Clock size={16} />
          Redemptions Ledger
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OFFERS CATALOG */}
      {/* ========================================================================= */}
      {activeTab === 'catalog' && (
        <div>
          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div style={{ flex: 1, position: 'relative' }}>
              <Input
                placeholder="Search promotions by title or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search size={16} />}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-surface)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="DRAFT">Draft</option>
              </select>

              {branches.length > 0 && (
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-surface)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  <option value="ALL">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}

              <Button variant="ghost" onClick={fetchOffers} leftIcon={<RefreshCw size={16} />}>
                Refresh
              </Button>
            </div>
          </div>

          {/* Offers List */}
          {loadingOffers ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-secondary)' }}>
              Loading offers...
            </div>
          ) : offers.length === 0 ? (
            <Card style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
              <Tag size={40} color="var(--color-text-tertiary)" style={{ marginBottom: 'var(--space-3)' }} />
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: 0 }}>No Offers Found</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', marginBottom: 'var(--space-4)' }}>
                Create your first promotional offer to attract and reward customers.
              </p>
              <Button variant="primary" onClick={handleOpenCreate} leftIcon={<Plus size={16} />}>
                Create Promotion
              </Button>
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(350px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              {offers.map((offer) => {
                const effectiveStatus = offer.effectiveStatus || 'ACTIVE';
                return (
                  <Card
                    key={offer.id}
                    style={{
                      padding: 'var(--space-4)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      border: '1px solid var(--color-border)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div>
                      {/* Top Badges */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(235, 94, 40, 0.1)',
                              color: '#EB5E28',
                              fontSize: '11px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                            }}
                          >
                            {offer.type === 'PERCENTAGE_DISCOUNT'
                              ? `${offer.discountValue}% OFF`
                              : offer.type === 'FIXED_DISCOUNT'
                              ? `₹${(offer.discountValue / 100).toFixed(0)} OFF`
                              : offer.type.replace('_', ' ')}
                          </span>

                          <StatusBadge status={effectiveStatus.toLowerCase()} label={effectiveStatus} />
                        </div>

                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} color="#10B981" />
                          {offer.redemptionsCount || 0} redeemed
                        </div>
                      </div>

                      {/* Title & Description */}
                      <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: '0 0 var(--space-1) 0' }}>
                        {offer.title}
                      </h3>
                      {offer.description && (
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-3) 0', lineHeight: 1.4 }}>
                          {offer.description}
                        </p>
                      )}

                      {/* Meta Information Pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-secondary)', margin: 'var(--space-3) 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--color-bg-canvas)', padding: '2px 6px', borderRadius: '4px' }}>
                          <Calendar size={12} />
                          {new Date(offer.startDate).toLocaleDateString()}
                          {offer.endDate ? ` - ${new Date(offer.endDate).toLocaleDateString()}` : ' (No Expiry)'}
                        </div>

                        {offer.branchName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--color-bg-canvas)', padding: '2px 6px', borderRadius: '4px' }}>
                            <Store size={12} />
                            {offer.branchName}
                          </div>
                        )}

                        {offer.eligibilityConfig?.targetAudience && offer.eligibilityConfig.targetAudience !== 'ALL' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--color-bg-canvas)', padding: '2px 6px', borderRadius: '4px' }}>
                            <Users size={12} />
                            {offer.eligibilityConfig.targetAudience.replace('_', ' ')}
                          </div>
                        )}

                        {offer.usageLimitPerCustomer && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--color-bg-canvas)', padding: '2px 6px', borderRadius: '4px' }}>
                            Limit: {offer.usageLimitPerCustomer} / customer
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid var(--color-border)',
                        paddingTop: 'var(--space-3)',
                        marginTop: 'var(--space-3)',
                      }}
                    >
                      <button
                        onClick={() => handleToggleStatus(offer)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 'var(--font-size-xs)',
                          color: offer.status === 'ACTIVE' ? 'var(--color-warning)' : 'var(--color-success)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: 500,
                        }}
                      >
                        <Power size={13} />
                        {offer.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>

                      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(offer)}
                          leftIcon={<Edit2 size={13} />}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOffer(offer)}
                          leftIcon={<Trash2 size={13} color="var(--color-danger)" />}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STAFF REDEMPTION TERMINAL */}
      {/* ========================================================================= */}
      {activeTab === 'terminal' && (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <Card style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <ShieldCheck size={20} color="var(--color-brand-primary)" />
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: 0 }}>
                Customer Offer Redemption Terminal
              </h2>
            </div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              Verify customer eligibility, inspect usage limits, and safely redeem offers with server-authoritative double-redemption prevention.
            </p>

            {/* Customer Search Form */}
            <form onSubmit={handleSearchCustomer} style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <div style={{ flex: 1 }}>
                <Input
                  placeholder="Enter customer phone (e.g. +91 98765 43210) or name..."
                  value={terminalSearchCustomer}
                  onChange={(e) => setTerminalSearchCustomer(e.target.value)}
                  leftIcon={<Search size={16} />}
                />
              </div>
              <Button type="submit" variant="primary" loading={searchingCustomer}>
                Search
              </Button>
            </form>

            {terminalError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  color: 'var(--color-danger)',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: 'var(--space-3)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <AlertCircle size={16} />
                {terminalError}
              </div>
            )}
          </Card>

          {/* Searched Customer Details & Available Offers */}
          {searchedCustomer && (
            <div>
              <Card style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)', backgroundColor: 'var(--color-bg-canvas)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, margin: 0 }}>
                      {searchedCustomer.name}
                    </h3>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                      {searchedCustomer.phone} • {searchedCustomer.totalVisits} previous visits
                    </p>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      color: '#10B981',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    Active Customer
                  </span>
                </div>
              </Card>

              {/* Offer Selector */}
              <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                Select an Offer to Validate & Redeem:
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                {offers.map((offer) => {
                  const isSelected = selectedOfferForRedeem?.id === offer.id;
                  return (
                    <div
                      key={offer.id}
                      onClick={() => handleSelectOfferForValidation(offer)}
                      style={{
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? '2px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
                        backgroundColor: isSelected ? 'rgba(235, 94, 40, 0.04)' : 'var(--color-bg-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                          {offer.title}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                          {offer.type === 'PERCENTAGE_DISCOUNT' ? `${offer.discountValue}% OFF` : `Discount: ₹${offer.discountValue}`}
                          {offer.branchName ? ` • Valid only at ${offer.branchName}` : ' • All branches'}
                        </div>
                      </div>

                      <Button size="sm" variant={isSelected ? 'primary' : 'ghost'}>
                        {isSelected ? 'Selected' : 'Validate'}
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Validation Result Box */}
              {isValidating && (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
                  Validating promotion eligibility rules...
                </div>
              )}

              {validationResult && (
                <Card
                  style={{
                    padding: 'var(--space-4)',
                    marginBottom: 'var(--space-4)',
                    border: validationResult.isValid ? '1px solid #10B981' : '1px solid #EF4444',
                    backgroundColor: validationResult.isValid ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                    {validationResult.isValid ? (
                      <CheckCircle2 size={24} color="#10B981" />
                    ) : (
                      <ShieldAlert size={24} color="#EF4444" />
                    )}

                    <div style={{ flex: 1 }}>
                      <h4
                        style={{
                          margin: '0 0 var(--space-1) 0',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 700,
                          color: validationResult.isValid ? '#065F46' : '#991B1B',
                        }}
                      >
                        {validationResult.isValid ? 'Eligible for Redemption' : 'Not Eligible for Redemption'}
                      </h4>

                      <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        {validationResult.isValid
                          ? `Customer has used this offer ${validationResult.priorRedemptionsCount} time(s). Remaining allowance: ${validationResult.remainingUsage ?? 'Unlimited'}.`
                          : validationResult.reason}
                      </p>

                      {validationResult.isValid && (
                        <div style={{ marginTop: 'var(--space-4)' }}>
                          <Button
                            variant="primary"
                            onClick={handleExecuteRedeem}
                            loading={isRedeeming}
                            leftIcon={<Check size={16} />}
                          >
                            Confirm & Redeem Offer Now
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* Successful Redemption Receipt */}
              {redemptionReceipt && (
                <Card
                  style={{
                    padding: 'var(--space-6)',
                    backgroundColor: '#FFFFFF',
                    border: '2px solid #10B981',
                    textAlign: 'center',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      color: '#10B981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto var(--space-3) auto',
                    }}
                  >
                    <Check size={28} />
                  </div>

                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: '0 0 var(--space-1) 0' }}>
                    Offer Successfully Redeemed!
                  </h3>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--space-4) 0' }}>
                    Promotion applied for {redemptionReceipt.customerName}.
                  </p>

                  <div
                    style={{
                      display: 'inline-block',
                      backgroundColor: 'var(--color-bg-canvas)',
                      padding: 'var(--space-3) var(--space-6)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px dashed var(--color-border)',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Single-Use Redemption Code
                    </div>
                    <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, letterSpacing: 2, color: 'var(--color-brand-primary)', marginTop: '4px' }}>
                      {redemptionReceipt.redemptionCode}
                    </div>
                  </div>

                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                    Redeemed on {new Date(redemptionReceipt.redeemedAt).toLocaleString()}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: REDEMPTIONS LEDGER */}
      {/* ========================================================================= */}
      {activeTab === 'ledger' && (
        <div>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: 'var(--space-4)',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0 }}>
                  Redemptions History Ledger ({ledgerTotal})
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                  Audited ledger of promotional codes redeemed by staff and cashiers across all branches.
                </p>
              </div>

              <Button variant="ghost" size="sm" onClick={fetchLedger} leftIcon={<RefreshCw size={14} />}>
                Refresh
              </Button>
            </div>

            {loadingLedger ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-secondary)' }}>
                Loading redemption records...
              </div>
            ) : ledgerRedemptions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-secondary)' }}>
                No redemptions recorded yet.
              </div>
            ) : isMobile ? (
              // Mobile Card List
              <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {ledgerRedemptions.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-bg-canvas)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                        {r.offerTitle || 'Promotional Offer'}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#10B981',
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        REDEEMED
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                      Customer: <strong>{r.customerName}</strong> ({r.customerPhone})
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                      Staff: {r.redeemedByStaffName || 'Staff Member'} {r.branchName ? `• ${r.branchName}` : ''}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px dashed var(--color-border)' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>
                        {r.redemptionCode}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                        {new Date(r.redeemedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Desktop Table
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-bg-canvas)', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Offer</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Customer</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Redeemed By</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Branch</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Code</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRedemptions.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.offerTitle}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div>{r.customerName}</div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{r.customerPhone}</div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                          {r.redeemedByStaffName || 'Staff Member'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                          {r.branchName || 'All Branches'}
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-brand-primary)' }}>
                          {r.redemptionCode}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
                          {new Date(r.redeemedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CREATE / EDIT OFFER MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingOffer ? 'Edit Promotion Offer' : 'Create Special Offer'}
      >
        <form onSubmit={handleSaveOffer}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {formError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  color: 'var(--color-danger)',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <AlertCircle size={16} />
                {formError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Offer Title *
              </label>
              <Input
                placeholder="e.g. 20% OFF First Order, Flat ₹100 OFF"
                value={offerForm.title}
                onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Description
              </label>
              <Textarea
                placeholder="Describe what customers receive..."
                value={offerForm.description}
                onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })}
                rows={2}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Offer Type
                </label>
                <select
                  value={offerForm.type}
                  onChange={(e) => setOfferForm({ ...offerForm, type: e.target.value as OfferType })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-surface)',
                  }}
                >
                  <option value="PERCENTAGE_DISCOUNT">Percentage Discount (%)</option>
                  <option value="FIXED_DISCOUNT">Fixed Discount Amount (₹)</option>
                  <option value="FREE_PRODUCT">Free Product Item</option>
                  <option value="FREE_SERVICE">Free Service Item</option>
                  <option value="BUY_X_GET_Y">Buy X Get Y</option>
                  <option value="BIRTHDAY">Birthday Special</option>
                  <option value="COMEBACK">Comeback Retention</option>
                  <option value="VIP">VIP Exclusive</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  {offerForm.type === 'PERCENTAGE_DISCOUNT' ? 'Discount Percentage (%) *' : 'Discount Value (Minor Units / ₹) *'}
                </label>
                <Input
                  type="number"
                  min="0"
                  value={offerForm.discountValue}
                  onChange={(e) => setOfferForm({ ...offerForm, discountValue: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Start Date *
                </label>
                <Input
                  type="date"
                  value={offerForm.startDate}
                  onChange={(e) => setOfferForm({ ...offerForm, startDate: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  End Date (Optional)
                </label>
                <Input
                  type="date"
                  value={offerForm.endDate}
                  onChange={(e) => setOfferForm({ ...offerForm, endDate: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Min Purchase Amount (₹ Optional)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={offerForm.minPurchaseMajor}
                  onChange={(e) => setOfferForm({ ...offerForm, minPurchaseMajor: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Target Branch Restriction
                </label>
                <select
                  value={offerForm.branchId}
                  onChange={(e) => setOfferForm({ ...offerForm, branchId: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-surface)',
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
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Usage Limit Per Customer
                </label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 1"
                  value={offerForm.usageLimitPerCustomer}
                  onChange={(e) => setOfferForm({ ...offerForm, usageLimitPerCustomer: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Target Audience
                </label>
                <select
                  value={offerForm.targetAudience}
                  onChange={(e) => setOfferForm({ ...offerForm, targetAudience: e.target.value as any })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-surface)',
                  }}
                >
                  <option value="ALL">All Customers</option>
                  <option value="NEW_CUSTOMERS">New Customers Only</option>
                  <option value="VIP">VIP Customers Only</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Terms & Conditions
              </label>
              <Input
                placeholder="e.g. Valid dine-in only. Cannot be combined with other offers."
                value={offerForm.terms}
                onChange={(e) => setOfferForm({ ...offerForm, terms: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={isSaving}>
                {editingOffer ? 'Update Offer' : 'Create Offer'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
