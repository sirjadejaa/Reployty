import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Check,
  X,
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  Calendar,
  Layers,
  Sparkles,
  Users,
  Store,
  UserCheck,
  Gift,
  Tag,
  Download,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { AdminRoute } from '../../types/loyalty';

export interface BusinessBillingViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

interface BillingPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPriceMinor: number;
  yearlyPriceMinor: number;
  currency: string;
  features: string[];
  limits: Record<string, number | null>;
  maxCustomers: number;
  maxBranches: number;
  maxStaff: number;
  isCurrent: boolean;
}

interface BillingData {
  subscription: {
    id: string;
    status: string;
    billingInterval: 'MONTHLY' | 'YEARLY';
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    gracePeriodEndsAt: string | null;
    currentPriceMinor: number;
    currency: string;
  };
  plan: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    monthlyPriceMinor: number;
    yearlyPriceMinor: number;
    features: string[];
    limits: Record<string, number | null>;
  };
  usage: {
    maxCustomers: number;
    maxBranches: number;
    maxStaff: number;
    maxRewards: number;
    maxOffers: number;
    monthlyAiDrafts: number;
  };
  limits: {
    maxCustomers: number | null;
    maxBranches: number | null;
    maxStaff: number | null;
    maxRewards: number | null;
    maxOffers: number | null;
    monthlyAiDrafts: number | null;
  };
  availablePlans: BillingPlan[];
  recentPayments: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    status: string;
    paymentMethod: string | null;
    createdAt: string;
  }>;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    amountMinor: number;
    currency: string;
    status: string;
    billingPeriod: string | null;
    issuedAt: string;
    paidAt: string | null;
  }>;
}

const FEATURE_CATALOG: Array<{ key: string; label: string; icon: React.ElementType }> = [
  { key: 'CUSTOMER_CRM', label: 'Customer CRM & Member Directory', icon: Users },
  { key: 'LOYALTY', label: 'Digital Loyalty Cards & Stamps', icon: Layers },
  { key: 'CATALOG', label: 'Digital Menu & Product Catalog', icon: Layers },
  { key: 'BRANCHES', label: 'Multi-Branch Location Management', icon: Store },
  { key: 'STAFF', label: 'Staff Roles & Cashier Terminals', icon: UserCheck },
  { key: 'REWARDS', label: 'Custom Rewards & Redemption Engine', icon: Gift },
  { key: 'OFFERS', label: 'Promotional Offers & Marketing Passes', icon: Tag },
  { key: 'REVIEWS', label: 'Customer Reviews & Private Feedback', icon: Sparkles },
  { key: 'ANALYTICS', label: 'Full Analytics & Business Intelligence', icon: Sparkles },
  { key: 'AI_REVIEW_ASSISTANT', label: 'AI Review Assistant (Multilingual Drafts)', icon: Sparkles },
  { key: 'EXPORTS', label: 'RFC 4180 CSV Data Exports', icon: Download },
];

export const BusinessBillingView: React.FC<BusinessBillingViewProps> = () => {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Billing interval toggle for plan catalog
  const [selectedInterval, setSelectedInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  // Change Plan Modal State
  const [targetPlan, setTargetPlan] = useState<BillingPlan | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);

  // Cancellation Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Fetch billing overview
  const fetchBillingData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/business/billing');
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to load billing information');
      }
      const json: BillingData = await res.json();
      setData(json);
      setSelectedInterval(json.subscription.billingInterval);
    } catch (err: any) {
      setError(err.message || 'Error fetching billing information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, []);

  const formatPrice = (minorUnits: number, currency: string = 'INR') => {
    const amount = minorUnits / 100;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handlePlanChange = async () => {
    if (!targetPlan) return;
    try {
      setChangingPlan(true);
      setError(null);
      const res = await fetch('/api/business/billing/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: targetPlan.id,
          billingInterval: selectedInterval,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to change subscription plan');
      }

      setActionSuccess(`Successfully transitioned to ${targetPlan.name}!`);
      setTargetPlan(null);
      await fetchBillingData();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChangingPlan(false);
    }
  };

  const handleCancelSubscription = async (immediate: boolean) => {
    try {
      setCancelling(true);
      setError(null);
      const res = await fetch('/api/business/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediate }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to cancel subscription');
      }

      setActionSuccess(
        immediate
          ? 'Subscription cancelled immediately. All your data remains preserved on the Free plan.'
          : 'Subscription will cancel at the end of the current billing cycle. All data will be preserved.'
      );
      setShowCancelModal(false);
      await fetchBillingData();
      setTimeout(() => setActionSuccess(null), 6000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleResumeSubscription = async () => {
    try {
      setError(null);
      const res = await fetch('/api/business/billing/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to resume subscription');
      }

      setActionSuccess('Your subscription has been resumed successfully!');
      await fetchBillingData();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Billing & Subscriptions" description="Loading your billing details..." />
        <div style={{ display: 'grid', gap: '20px' }}>
          <Skeleton height="160px" radius="12px" />
          <Skeleton height="300px" radius="12px" />
        </div>
      </PageContainer>
    );
  }

  if (error && !data) {
    return (
      <PageContainer>
        <PageHeader title="Billing & Subscriptions" description="Subscription management" />
        <Card>
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <AlertTriangle size={36} color="#DC2626" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Unable to load billing details
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>{error}</p>
            <Button variant="primary" onClick={fetchBillingData}>
              Try Again
            </Button>
          </div>
        </Card>
      </PageContainer>
    );
  }

  if (!data) return null;

  const { subscription, plan, usage, limits, availablePlans, recentInvoices, recentPayments } = data;
  const isYearlyCurrent = subscription.billingInterval === 'YEARLY';
  const periodEnd = new Date(subscription.currentPeriodEnd);
  const formattedPeriodEnd = periodEnd.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <PageContainer>
      <PageHeader
        title="Billing & Subscriptions"
        description="Manage your subscription plan, feature entitlements, billing intervals, and invoices."
      />

      {/* Feedback Alerts */}
      {actionSuccess && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #10B981',
            borderRadius: '8px',
            color: '#065F46',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 500,
          }}
        >
          <ShieldCheck size={18} color="#059669" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #EF4444',
            borderRadius: '8px',
            color: '#991B1B',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 500,
          }}
        >
          <AlertTriangle size={18} color="#DC2626" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. CURRENT SUBSCRIPTION HERO CARD */}
      <Card style={{ marginBottom: '28px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '20px',
            padding: '24px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {plan.name}
              </span>
              <StatusBadge status={subscription.status} />
              {subscription.cancelAtPeriodEnd && (
                <span
                  style={{
                    backgroundColor: '#FEF3C7',
                    color: '#92400E',
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}
                >
                  Cancels at period end
                </span>
              )}
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px', maxWidth: '540px' }}>
              {plan.description || 'Active subscription for your business.'}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={15} color="var(--primary-color)" />
                <span>
                  <strong>{formatPrice(subscription.currentPriceMinor, subscription.currency)}</strong> / {isYearlyCurrent ? 'year' : 'month'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={15} color="var(--text-muted)" />
                <span>
                  {subscription.cancelAtPeriodEnd ? 'Access ends: ' : 'Renews on: '}
                  <strong>{formattedPeriodEnd}</strong>
                </span>
              </div>
              {subscription.gracePeriodEndsAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#D97706' }}>
                  <Clock size={15} color="#D97706" />
                  <span>
                    Grace period expires:{' '}
                    <strong>{new Date(subscription.gracePeriodEndsAt).toLocaleDateString('en-IN')}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {subscription.cancelAtPeriodEnd ? (
              <Button variant="primary" onClick={handleResumeSubscription}>
                <RotateCcw size={16} style={{ marginRight: '6px' }} />
                Resume Subscription
              </Button>
            ) : (
              plan.slug !== 'free' && (
                <Button variant="outline" onClick={() => setShowCancelModal(true)} style={{ color: '#DC2626' }}>
                  Cancel Subscription
                </Button>
              )
            )}
          </div>
        </div>
      </Card>

      {/* 2. LIVE USAGE & LIMITS DASHBOARD */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>
          Resource Usage & Plan Limits
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {[
            { key: 'maxCustomers', label: 'Registered Customers', current: usage.maxCustomers, limit: limits.maxCustomers, icon: Users },
            { key: 'maxBranches', label: 'Branch Locations', current: usage.maxBranches, limit: limits.maxBranches, icon: Store },
            { key: 'maxStaff', label: 'Staff Members', current: usage.maxStaff, limit: limits.maxStaff, icon: UserCheck },
            { key: 'maxRewards', label: 'Active Rewards', current: usage.maxRewards, limit: limits.maxRewards, icon: Gift },
            { key: 'maxOffers', label: 'Active Special Offers', current: usage.maxOffers, limit: limits.maxOffers, icon: Tag },
            { key: 'monthlyAiDrafts', label: 'Monthly AI Drafts', current: usage.monthlyAiDrafts, limit: limits.monthlyAiDrafts, icon: Sparkles },
          ].map((item) => {
            const hasLimit = item.limit !== null && item.limit !== undefined;
            const pct = hasLimit ? Math.min(100, Math.round((item.current / item.limit!) * 100)) : 0;
            const isNearLimit = hasLimit && pct >= 80;
            const Icon = item.icon;

            return (
              <Card key={item.key} style={{ padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        padding: '6px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--background-secondary)',
                        color: 'var(--primary-color)',
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {item.label}
                    </span>
                  </div>
                  {isNearLimit && (
                    <span style={{ fontSize: '11px', color: '#D97706', fontWeight: 600, backgroundColor: '#FEF3C7', padding: '2px 6px', borderRadius: '4px' }}>
                      Approaching Limit
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {item.current.toLocaleString()}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    / {hasLimit ? item.limit!.toLocaleString() : 'Unlimited'}
                  </span>
                </div>

                {hasLimit && (
                  <div
                    style={{
                      height: '6px',
                      backgroundColor: 'var(--border-color)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        backgroundColor: pct >= 95 ? '#EF4444' : pct >= 80 ? '#F59E0B' : 'var(--primary-color)',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* 3. PLAN COMPARISON & PRICING MATRIX */}
      <div style={{ marginBottom: '36px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '18px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Available Subscription Plans
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Pick the right tier for your retention goals. All features are verified and enforced server-side.
            </p>
          </div>

          {/* Monthly / Yearly Toggle */}
          <div
            style={{
              display: 'inline-flex',
              padding: '4px',
              backgroundColor: 'var(--background-secondary)',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <button
              onClick={() => setSelectedInterval('MONTHLY')}
              style={{
                padding: '6px 14px',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: selectedInterval === 'MONTHLY' ? '#FFFFFF' : 'transparent',
                color: selectedInterval === 'MONTHLY' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: selectedInterval === 'MONTHLY' ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: selectedInterval === 'MONTHLY' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setSelectedInterval('YEARLY')}
              style={{
                padding: '6px 14px',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: selectedInterval === 'YEARLY' ? '#FFFFFF' : 'transparent',
                color: selectedInterval === 'YEARLY' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: selectedInterval === 'YEARLY' ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: selectedInterval === 'YEARLY' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Yearly
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: '#D1FAE5',
                  color: '#065F46',
                  padding: '2px 5px',
                  borderRadius: '6px',
                }}
              >
                SAVE 17%
              </span>
            </button>
          </div>
        </div>

        {/* Plan Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '18px',
          }}
        >
          {availablePlans.map((p) => {
            const isCurrent = p.id === plan.id;
            const price = selectedInterval === 'YEARLY' ? p.yearlyPriceMinor : p.monthlyPriceMinor;

            return (
              <Card
                key={p.id}
                style={{
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: isCurrent ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                  position: 'relative',
                }}
              >
                {isCurrent && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '18px',
                      backgroundColor: 'var(--primary-color)',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Current Plan
                  </div>
                )}

                <div>
                  <h4 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {p.name}
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', minHeight: '36px' }}>
                    {p.description}
                  </p>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {formatPrice(price, p.currency)}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        / {selectedInterval === 'YEARLY' ? 'year' : 'month'}
                      </span>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '10px' }}>
                      Included Features
                    </span>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
                      {FEATURE_CATALOG.map((f) => {
                        const included = p.features.includes(f.key);
                        return (
                          <li
                            key={f.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '12px',
                              color: included ? 'var(--text-primary)' : 'var(--text-muted)',
                              opacity: included ? 1 : 0.45,
                            }}
                          >
                            {included ? (
                              <Check size={14} color="#059669" />
                            ) : (
                              <X size={14} color="#9CA3AF" />
                            )}
                            <span style={{ textDecoration: included ? 'none' : 'line-through' }}>
                              {f.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                <div>
                  {isCurrent ? (
                    <Button variant="outline" disabled style={{ width: '100%' }}>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      variant={p.slug === 'growth' || p.slug === 'enterprise' ? 'primary' : 'outline'}
                      style={{ width: '100%' }}
                      onClick={() => setTargetPlan(p)}
                    >
                      {price < (selectedInterval === 'YEARLY' ? plan.yearlyPriceMinor : plan.monthlyPriceMinor)
                        ? 'Downgrade'
                        : 'Select Plan'}
                      <ArrowUpRight size={15} style={{ marginLeft: '4px' }} />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 4. INVOICES & PAYMENT HISTORY */}
      <Card style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Invoices & Payment Records
        </h3>

        {recentInvoices.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px 0' }}>
            No invoice records found for this business.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Invoice #</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Billing Period</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Issued Date</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {inv.invoiceNumber}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {inv.billingPeriod || 'Subscription Cycle'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {new Date(inv.issuedAt).toLocaleDateString('en-IN')}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatPrice(inv.amountMinor, inv.currency)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* RECENT PAYMENTS */}
        <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '28px', marginBottom: '14px' }}>
          Payment Transactions
        </h4>

        {recentPayments.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>
            No recorded payment transactions found.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Payment Method</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {new Date(p.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)' }}>
                      {p.paymentMethod || 'Online Gateway'}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatPrice(p.amountMinor, p.currency)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* CHANGE PLAN CONFIRMATION MODAL */}
      {targetPlan && (
        <Modal
          isOpen={true}
          onClose={() => setTargetPlan(null)}
          title={`Confirm Plan Switch: ${targetPlan.name}`}
        >
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
              You are about to switch to the <strong>{targetPlan.name}</strong> on a{' '}
              <strong>{selectedInterval.toLowerCase()}</strong> billing cycle.
            </p>

            <div
              style={{
                backgroundColor: 'var(--background-secondary)',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Payable Amount:</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {formatPrice(
                    selectedInterval === 'YEARLY' ? targetPlan.yearlyPriceMinor : targetPlan.monthlyPriceMinor,
                    targetPlan.currency
                  )}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                <span>Interval:</span>
                <span>{selectedInterval}</span>
              </div>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>
              🛡️ <strong>Data Preservation Guarantee:</strong> All your customer records, branches, stamps, reviews, and catalog items remain completely preserved. Server-side limits will be adjusted according to your new plan.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="outline" onClick={() => setTargetPlan(null)} disabled={changingPlan}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handlePlanChange} disabled={changingPlan}>
                {changingPlan ? 'Processing...' : 'Confirm Plan Switch'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* CANCELLATION MODAL */}
      {showCancelModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowCancelModal(false)}
          title="Cancel Subscription"
        >
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
              How would you like to cancel your current subscription?
            </p>

            <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
              <Card
                style={{
                  padding: '16px',
                  cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                }}
                onClick={() => handleCancelSubscription(false)}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Cancel at end of billing period (Recommended)
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Maintain full premium access until {formattedPeriodEnd}. Will not renew automatically.
                </p>
              </Card>

              <Card
                style={{
                  padding: '16px',
                  cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                }}
                onClick={() => handleCancelSubscription(true)}
              >
                <div style={{ fontWeight: 600, color: '#DC2626', marginBottom: '4px' }}>
                  Cancel immediately & downgrade to Free
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Switch to Free Forever tier right now. All your historical customer and business data remains safely preserved.
                </p>
              </Card>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowCancelModal(false)} disabled={cancelling}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageContainer>
  );
};
