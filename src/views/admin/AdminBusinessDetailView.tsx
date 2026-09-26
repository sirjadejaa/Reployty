import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { PlatformBusinessDetail, AdminRoute } from '../../types/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';

export interface AdminBusinessDetailViewProps {
  businessId: string;
  onNavigate: (route: AdminRoute) => void;
}

export const AdminBusinessDetailView: React.FC<AdminBusinessDetailViewProps> = ({
  businessId,
  onNavigate,
}) => {
  const { addToast } = useToast();
  const [business, setBusiness] = useState<PlatformBusinessDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'branches' | 'staff' | 'loyalty'>('branches');

  // Status Change Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'ACTIVE' | 'SUSPENDED'>('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fetchBusiness = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/businesses/${businessId}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to load business details (HTTP ${res.status})`);
      }

      const json = await res.json();
      setBusiness(json);
    } catch (err: any) {
      setError(err.message || 'Error fetching business detail');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (businessId) {
      fetchBusiness();
    }
  }, [businessId]);

  const handleConfirmStatusChange = async () => {
    if (!business) return;

    try {
      setIsUpdatingStatus(true);
      const res = await fetch(`/api/admin/businesses/${business.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          status: pendingStatus,
          reason: statusReason.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update business status');
      }

      addToast({
        type: pendingStatus === 'ACTIVE' ? 'success' : 'warning',
        title: `Business ${pendingStatus === 'ACTIVE' ? 'Reactivated' : 'Suspended'}`,
        message: `${business.name} is now ${pendingStatus}.`,
      });

      setIsModalOpen(false);
      await fetchBusiness();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Status Update Failed',
        message: err.message,
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <Skeleton height="60px" />
        <Skeleton height="140px" />
        <Skeleton height="320px" />
      </div>
    );
  }

  if (error || !business) {
    return (
      <ErrorState
        title="Could not load business profile"
        message={error || 'Business not found.'}
        onRetry={fetchBusiness}
      />
    );
  }

  const isSuspended = business.status === 'SUSPENDED';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Breadcrumb & Actions */}
      <AdminPageHeader
        title={business.name}
        description={`Slug: /${business.slug} • Tenant ID: ${business.id}`}
        backAction={{
          label: 'Back to Businesses',
          onClick: () => onNavigate('admin-businesses'),
        }}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {/* Status Indicator */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: '9999px',
                backgroundColor: isSuspended ? '#FEF3C7' : '#DCFCE7',
                color: isSuspended ? '#92400E' : '#166534',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: isSuspended ? '#D97706' : '#16A34A',
                }}
              />
              <span>{business.status}</span>
            </div>

            {/* Category Pill */}
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '5px 10px',
                borderRadius: '6px',
                backgroundColor: '#F1F5F9',
                color: '#475569',
                textTransform: 'uppercase',
              }}
            >
              {business.category}
            </span>

            {/* Suspend / Reactivate Action */}
            {isSuspended ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPendingStatus('ACTIVE');
                  setStatusReason('');
                  setIsModalOpen(true);
                }}
                style={{ borderColor: '#BBF7D0', color: '#166534', backgroundColor: '#F0FDF4' }}
              >
                Reactivate Business
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPendingStatus('SUSPENDED');
                  setStatusReason('');
                  setIsModalOpen(true);
                }}
                style={{ borderColor: '#FECACA', color: '#DC2626', backgroundColor: '#FEF2F2' }}
              >
                Suspend Business
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              iconOnly
              onClick={fetchBusiness}
              title="Refresh diagnostic"
            >
              <RefreshCw size={14} />
            </Button>
          </div>
        }
      />

      {/* Business Overview - Structured 6-Cell Metadata Grid */}
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
          Business Overview
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {/* Contact */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Contact
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', marginTop: 4 }}>
              {business.email || 'None provided'}
            </div>
            {business.phone && (
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2 }}>
                {business.phone}
              </div>
            )}
          </div>

          {/* Timezone & Currency */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Timezone & Currency
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', marginTop: 4 }}>
              {business.timezone}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2 }}>
              Currency: {business.currency}
            </div>
          </div>

          {/* Created Date */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Created
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', marginTop: 4 }}>
              {new Date(business.createdAt).toLocaleDateString()}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2 }}>
              {new Date(business.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {/* Plan */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Subscription Tier
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#4F6BFF', marginTop: 4 }}>
              Growth Tier
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2 }}>
              Active platform subscription
            </div>
          </div>

          {/* Branches Count */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Branches
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
              {business.branches.length}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: 1 }}>
              Active physical locations
            </div>
          </div>

          {/* Customers Count */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Registered Customers
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
              {business.customersCount}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: 1 }}>
              Across all branches
            </div>
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div style={{ borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 'var(--space-6)' }}>
        {[
          { id: 'branches' as const, label: `Branches (${business.branches.length})` },
          { id: 'staff' as const, label: `Staff (${business.staff.length})` },
          { id: 'loyalty' as const, label: `Loyalty Programs (${business.loyaltyPrograms.length})` },
        ].map(tab => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 4px',
                fontSize: '13px',
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? '#4F6BFF' : '#64748B',
                border: 'none',
                borderBottom: isSelected ? '2px solid #4F6BFF' : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 150ms ease, border-color 150ms ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content Container */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {/* Tab 1: Branches */}
        {activeTab === 'branches' && (
          <div>
            {business.branches.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                No branches configured for this tenant.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Branch Name</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Code</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Address</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {business.branches.map((b, idx) => (
                    <tr
                      key={b.id}
                      style={{
                        borderBottom: idx === business.branches.length - 1 ? 'none' : '1px solid #F1F5F9',
                      }}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 600, fontSize: '13px', color: '#0F172A' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{b.name}</span>
                          {b.isMainBranch && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#EEF2FF',
                                color: '#4F6BFF',
                              }}
                            >
                              Main
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                        {b.code || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#475569' }}>
                        {b.address || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: b.status === 'ACTIVE' ? '#16A34A' : '#D97706' }}>
                        {b.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Staff */}
        {activeTab === 'staff' && (
          <div>
            {business.staff.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                No staff members assigned to this tenant.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Name</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Email</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Role</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {business.staff.map((s, idx) => (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: idx === business.staff.length - 1 ? 'none' : '1px solid #F1F5F9',
                      }}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 600, fontSize: '13px', color: '#0F172A' }}>
                        {s.user.name}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#475569' }}>
                        {s.user.email}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: s.role === 'OWNER' ? '#EEF2FF' : '#F1F5F9',
                            color: s.role === 'OWNER' ? '#4F6BFF' : '#475569',
                          }}
                        >
                          {s.role}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: s.status === 'ACTIVE' ? '#16A34A' : '#D97706' }}>
                        {s.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 3: Loyalty Programs */}
        {activeTab === 'loyalty' && (
          <div>
            {business.loyaltyPrograms.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                No loyalty programs configured.
              </div>
            ) : (
              <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                {business.loyaltyPrograms.map(p => (
                  <div
                    key={p.id}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '16px',
                      backgroundColor: '#FAFAFC',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A' }}>{p.name}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#EEF2FF',
                          color: '#4F6BFF',
                        }}
                      >
                        {p.type}
                      </span>
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '13px', color: '#334155' }}>
                      Reward: <span style={{ fontWeight: 600 }}>{p.rewardTitle}</span>
                    </div>
                    {p.targetStamps && (
                      <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748B' }}>
                        Target Stamps: {p.targetStamps}
                      </div>
                    )}
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', color: '#16A34A' }}>
                      <CheckCircle2 size={13} />
                      <span>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Status Mutation */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isUpdatingStatus && setIsModalOpen(false)}
        title={pendingStatus === 'SUSPENDED' ? 'Suspend Business' : 'Reactivate Business'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
            {pendingStatus === 'SUSPENDED'
              ? `Are you sure you want to suspend "${business.name}"? Transactions and staff sessions will be halted immediately.`
              : `Are you sure you want to reactivate "${business.name}"? Full operations will be restored immediately.`}
          </p>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: 6,
              }}
            >
              Reason for audit log (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Terms verification, compliance audit..."
              value={statusReason}
              onChange={e => setStatusReason(e.target.value)}
              style={{
                width: '100%',
                height: 38,
                padding: '0 12px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={isUpdatingStatus}
            >
              Cancel
            </Button>
            <Button
              variant={pendingStatus === 'SUSPENDED' ? 'danger' : 'primary'}
              size="sm"
              onClick={handleConfirmStatusChange}
              disabled={isUpdatingStatus}
            >
              {isUpdatingStatus ? 'Updating...' : pendingStatus === 'SUSPENDED' ? 'Confirm Suspension' : 'Confirm Reactivation'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
