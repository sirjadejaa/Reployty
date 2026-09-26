import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../context/ToastContext';

interface SubscriptionItem {
  id: string;
  businessId: string;
  status: string;
  billingInterval: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  gracePeriodEndsAt: string | null;
  business: { id: string; name: string; slug: string };
  plan: { id: string; name: string; slug: string; priceMinor: number };
}

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  businessId: string;
  amountMinor: number;
  currency: string;
  status: string;
  billingPeriod: string | null;
  issuedAt: string;
  business: { id: string; name: string; slug: string };
}

interface PaymentItem {
  id: string;
  businessId: string;
  amountMinor: number;
  currency: string;
  status: string;
  provider: string | null;
  providerPaymentId: string | null;
  paymentMethod: string | null;
  createdAt: string;
  business: { id: string; name: string; slug: string };
}

export const AdminBillingView: React.FC = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'invoices' | 'payments'>('subscriptions');
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Status override modal state
  const [targetSub, setTargetSub] = useState<SubscriptionItem | null>(null);
  const [newStatus, setNewStatus] = useState<string>('ACTIVE');
  const [graceDays, setGraceDays] = useState<number>(7);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const fetchAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [subsRes, invsRes, paysRes] = await Promise.all([
        fetch('/api/admin/billing/subscriptions', { credentials: 'include' }),
        fetch('/api/admin/billing/invoices', { credentials: 'include' }),
        fetch('/api/admin/billing/payments', { credentials: 'include' }),
      ]);

      if (!subsRes.ok || !invsRes.ok || !paysRes.ok) {
        throw new Error('Failed to fetch administrative billing data');
      }

      const [subsData, invsData, paysData] = await Promise.all([
        subsRes.json(),
        invsRes.json(),
        paysRes.json(),
      ]);

      setSubscriptions(subsData);
      setInvoices(invsData);
      setPayments(paysData);
    } catch (err: any) {
      setError(err.message || 'Error loading billing data');
      addToast({ type: 'error', title: err.message || 'Error loading billing data' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleUpdateStatus = async () => {
    if (!targetSub) return;
    try {
      setIsUpdating(true);
      const res = await fetch(`/api/admin/billing/subscriptions/${targetSub.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: newStatus,
          graceDays: newStatus === 'GRACE_PERIOD' ? graceDays : undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update subscription status');
      }

      addToast({
        type: 'success',
        title: `Status updated to ${newStatus} for ${targetSub.business.name}`,
      });
      setTargetSub(null);
      await fetchAllData();
    } catch (err: any) {
      addToast({ type: 'error', title: err.message || 'Error updating status' });
    } finally {
      setIsUpdating(false);
    }
  };

  const formatPrice = (minor: number, currency: string = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <AdminPageHeader
        title="Subscriptions & Global Billing"
        description="Cross-tenant subscription health, revenue telemetry, invoices, and manual override controls."
        actions={
          <Button variant="outline" onClick={fetchAllData} disabled={isLoading}>
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} style={{ marginRight: '6px' }} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#FEF2F2', border: '1px solid #EF4444', borderRadius: '8px', color: '#991B1B', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* TABS */}
      <div style={{ marginBottom: '20px' }}>
        <Tabs
          tabs={[
            { id: 'subscriptions', label: `Subscriptions (${subscriptions.length})` },
            { id: 'invoices', label: `Invoices (${invoices.length})` },
            { id: 'payments', label: `Payments (${payments.length})` },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as any)}
        />
      </div>

      {isLoading ? (
        <Card style={{ padding: '20px' }}>
          <Skeleton height="200px" radius="8px" />
        </Card>
      ) : (
        <>
          {/* SUBSCRIPTIONS TAB */}
          {activeTab === 'subscriptions' && (
            <Card style={{ padding: '20px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px 12px' }}>Business</th>
                      <th style={{ padding: '10px 12px' }}>Current Plan</th>
                      <th style={{ padding: '10px 12px' }}>Interval</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Period Renewal</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((s) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.business.name}
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.business.slug}</div>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                          <strong>{s.plan.name}</strong>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                          {s.billingInterval}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <StatusBadge status={s.status} />
                          {s.cancelAtPeriodEnd && (
                            <span style={{ display: 'block', fontSize: '11px', color: '#D97706', marginTop: '2px' }}>
                              Cancelling at end
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                          {new Date(s.currentPeriodEnd).toLocaleDateString('en-IN')}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTargetSub(s);
                              setNewStatus(s.status);
                            }}
                          >
                            Override Status
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* INVOICES TAB */}
          {activeTab === 'invoices' && (
            <Card style={{ padding: '20px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px 12px' }}>Invoice #</th>
                      <th style={{ padding: '10px 12px' }}>Business</th>
                      <th style={{ padding: '10px 12px' }}>Period</th>
                      <th style={{ padding: '10px 12px' }}>Amount</th>
                      <th style={{ padding: '10px 12px' }}>Issued Date</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                        <td style={{ padding: '12px' }}>{inv.business.name}</td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{inv.billingPeriod || 'Standard Cycle'}</td>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{formatPrice(inv.amountMinor, inv.currency)}</td>
                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{new Date(inv.issuedAt).toLocaleDateString('en-IN')}</td>
                        <td style={{ padding: '12px' }}>
                          <StatusBadge status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* PAYMENTS TAB */}
          {activeTab === 'payments' && (
            <Card style={{ padding: '20px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px 12px' }}>Business</th>
                      <th style={{ padding: '10px 12px' }}>Amount</th>
                      <th style={{ padding: '10px 12px' }}>Method</th>
                      <th style={{ padding: '10px 12px' }}>Provider Reference</th>
                      <th style={{ padding: '10px 12px' }}>Date</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{p.business.name}</td>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{formatPrice(p.amountMinor, p.currency)}</td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{p.paymentMethod || 'Gateway'}</td>
                        <td style={{ padding: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {p.providerPaymentId || 'N/A'}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{new Date(p.createdAt).toLocaleDateString('en-IN')}</td>
                        <td style={{ padding: '12px' }}>
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* OVERRIDE STATUS MODAL */}
      {targetSub && (
        <Modal
          isOpen={true}
          onClose={() => setTargetSub(null)}
          title={`Override Subscription: ${targetSub.business.name}`}
        >
          <div style={{ display: 'grid', gap: '16px', padding: '8px 0' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Manually set the subscription status for testing or support resolution. All overrides are logged in the platform audit trail.
            </p>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Status</label>
              <Select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                options={[
                  { value: 'ACTIVE', label: 'ACTIVE' },
                  { value: 'TRIAL', label: 'TRIAL' },
                  { value: 'GRACE_PERIOD', label: 'GRACE_PERIOD' },
                  { value: 'PAYMENT_FAILED', label: 'PAYMENT_FAILED' },
                  { value: 'OVERDUE', label: 'OVERDUE' },
                  { value: 'SUSPENDED', label: 'SUSPENDED' },
                  { value: 'CANCELLED', label: 'CANCELLED' },
                ]}
              />
            </div>

            {newStatus === 'GRACE_PERIOD' && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Grace Duration (Days)</label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={graceDays}
                  onChange={(e) => setGraceDays(Number(e.target.value))}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <Button variant="outline" onClick={() => setTargetSub(null)} disabled={isUpdating}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleUpdateStatus} disabled={isUpdating}>
                {isUpdating ? 'Saving...' : 'Confirm Override'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
