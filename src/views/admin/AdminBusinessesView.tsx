import React, { useState, useEffect } from 'react';
import {
  Search,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { PlatformBusiness, AdminRoute } from '../../types/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface AdminBusinessesViewProps {
  onNavigate: (route: AdminRoute, params?: { id?: string }) => void;
}

export const AdminBusinessesView: React.FC<AdminBusinessesViewProps> = ({ onNavigate }) => {
  const isMobile = useIsMobile();
  const { addToast } = useToast();
  const [businesses, setBusinesses] = useState<PlatformBusiness[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Status Modal State
  const [targetBusiness, setTargetBusiness] = useState<PlatformBusiness | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [pendingStatus, setPendingStatus] = useState<'ACTIVE' | 'SUSPENDED'>('SUSPENDED');
  const [statusReason, setStatusReason] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Plan Assignment Modal State
  const [availablePlans, setAvailablePlans] = useState<Array<{ id: string; name: string; slug: string; priceMinor: number }>>([]);
  const [planTargetBusiness, setPlanTargetBusiness] = useState<PlatformBusiness | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState<boolean>(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [isUpdatingPlan, setIsUpdatingPlan] = useState<boolean>(false);

  const fetchBusinesses = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
      });
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/admin/businesses?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch businesses (HTTP ${res.status})`);
      }

      const json = await res.json();
      setBusinesses(json.items || []);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalCount(json.pagination?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Error communicating with administration service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, [page, statusFilter]);

  useEffect(() => {
    fetch('/api/admin/plans', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAvailablePlans(data))
      .catch(() => {});
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchBusinesses();
  };

  const openPlanModal = (biz: PlatformBusiness) => {
    setPlanTargetBusiness(biz);
    setSelectedPlanId(biz.planId || (availablePlans[0]?.id ?? ''));
    setIsPlanModalOpen(true);
  };

  const handleConfirmPlanChange = async () => {
    if (!planTargetBusiness || !selectedPlanId) return;

    try {
      setIsUpdatingPlan(true);
      const res = await fetch(`/api/admin/businesses/${planTargetBusiness.id}/plan`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ planId: selectedPlanId }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update business plan');
      }

      addToast({
        type: 'success',
        title: 'Plan Assigned Successfully',
        message: `${planTargetBusiness.name} has been switched to ${json.planName || 'selected plan'}.`,
      });

      setIsPlanModalOpen(false);
      await fetchBusinesses();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Plan Assignment Failed',
        message: err.message,
      });
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  const openStatusModal = (biz: PlatformBusiness, nextStatus: 'ACTIVE' | 'SUSPENDED') => {
    setTargetBusiness(biz);
    setPendingStatus(nextStatus);
    setStatusReason('');
    setIsModalOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!targetBusiness) return;

    try {
      setIsUpdatingStatus(true);
      const res = await fetch(`/api/admin/businesses/${targetBusiness.id}/status`, {
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
        message: `${targetBusiness.name} status updated to ${pendingStatus}.`,
      });

      setIsModalOpen(false);
      await fetchBusinesses();
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <AdminPageHeader
        title="Businesses"
        description="Manage registered businesses, monitor tenant health, and inspect configurations."
      />

      {/* Filter & Search Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          padding: '12px 16px',
        }}
      >
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flex: 1,
            minWidth: isMobile ? '100%' : 280,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? '100%' : 220 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search businesses, slug, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: 40,
                paddingLeft: 34,
                paddingRight: 12,
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                fontSize: '13px',
                color: '#1E293B',
                outline: 'none',
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#4F6BFF')}
              onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
            />
          </div>

          <Button type="submit" variant="primary" size="sm" style={{ height: 40, padding: '0 16px', minHeight: 40 }}>
            Search
          </Button>

          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
                fetchBusinesses();
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748B',
                fontSize: '13px',
                cursor: 'pointer',
                padding: '8px',
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: isMobile ? '100%' : 'auto' }}>
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              height: 40,
              padding: '0 12px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              fontSize: '13px',
              color: '#334155',
              cursor: 'pointer',
              outline: 'none',
              flex: isMobile ? 1 : undefined,
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchBusinesses}
            title="Refresh list"
            style={{ height: 40, width: 40, padding: 0, flexShrink: 0 }}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Main Table Card */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Skeleton height="36px" />
            <Skeleton height="48px" />
            <Skeleton height="48px" />
            <Skeleton height="48px" />
            <Skeleton height="48px" />
          </div>
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#DC2626' }}>
            <AlertTriangle size={24} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{error}</div>
            <Button variant="outline" size="sm" onClick={fetchBusinesses} style={{ marginTop: 12 }}>
              Try Again
            </Button>
          </div>
        ) : businesses.length === 0 ? (
          <EmptyState
            title="No businesses found"
            description={search ? `No tenants matched "${search}". Try adjusting your filters.` : 'No registered businesses found in the platform database.'}
            action={
              search ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    fetchBusinesses();
                  }}
                >
                  Clear search
                </Button>
              ) : undefined
            }
          />
        ) : isMobile ? (
          <div className="mobile-card-list" style={{ padding: '12px' }}>
            {businesses.map((biz) => {
              const isSuspended = biz.status === 'SUSPENDED';
              return (
                <div key={biz.id} className="mobile-data-card">
                  <div className="mobile-data-card-header">
                    <div>
                      <div className="mobile-data-card-title">{biz.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        /{biz.slug}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        backgroundColor: isSuspended ? '#FEF3C7' : '#DCFCE7',
                        color: isSuspended ? '#92400E' : '#166534',
                        fontSize: '11px',
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
                      <span>{biz.status}</span>
                    </div>
                  </div>

                  <div className="mobile-data-card-row">
                    <span className="mobile-data-card-label">Category</span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#F1F5F9',
                        color: '#475569',
                        textTransform: 'uppercase',
                      }}
                    >
                      {biz.category}
                    </span>
                  </div>

                  <div className="mobile-data-card-row">
                    <span className="mobile-data-card-label">Plan</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#EFF6FF',
                          color: '#1D4ED8',
                        }}
                      >
                        {biz.planName || 'Free Starter'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openPlanModal(biz)}
                        style={{
                          fontSize: '11px',
                          color: '#4F46E5',
                          background: 'none',
                          border: 'none',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: '0 2px',
                        }}
                      >
                        Change
                      </button>
                    </div>
                  </div>

                  <div className="mobile-data-card-row">
                    <span className="mobile-data-card-label">Owner</span>
                    <span className="mobile-data-card-value">
                      {biz.ownerName} {biz.ownerEmail ? `(${biz.ownerEmail})` : ''}
                    </span>
                  </div>

                  <div className="mobile-data-card-row">
                    <span className="mobile-data-card-label">Fleet</span>
                    <span className="mobile-data-card-value">
                      {biz.branchesCount} branches • {biz.customersCount} customers
                    </span>
                  </div>

                  <div className="mobile-data-card-row">
                    <span className="mobile-data-card-label">Created</span>
                    <span className="mobile-data-card-value">
                      {new Date(biz.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid #F1F5F9', marginTop: '4px' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigate('admin-business-detail', { id: biz.id })}
                      style={{ flex: 1, minHeight: 40, justifyContent: 'center' }}
                    >
                      <Eye size={14} style={{ marginRight: 6 }} />
                      View
                    </Button>
                    <button
                      type="button"
                      onClick={() => openStatusModal(biz, isSuspended ? 'ACTIVE' : 'SUSPENDED')}
                      style={{
                        flex: 1,
                        minHeight: 40,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                        border: isSuspended ? '1px solid #BBF7D0' : '1px solid #FED7AA',
                        backgroundColor: isSuspended ? '#F0FDF4' : '#FFFBEB',
                        color: isSuspended ? '#166534' : '#92400E',
                      }}
                    >
                      {isSuspended ? 'Reactivate' : 'Suspend'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Business
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Category
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Plan
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Owner
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Branches
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Customers
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Created
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', textAlign: 'right', letterSpacing: '0.02em' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((biz, idx) => {
                  const isSuspended = biz.status === 'SUSPENDED';
                  return (
                    <tr
                      key={biz.id}
                      style={{
                        borderBottom: idx === businesses.length - 1 ? 'none' : '1px solid #F1F5F9',
                        transition: 'background-color 120ms ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Business Name & Slug */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A' }}>
                          {biz.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                          /{biz.slug}
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            textTransform: 'uppercase',
                          }}
                        >
                          {biz.category}
                        </span>
                      </td>

                      {/* Plan */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#EFF6FF',
                              color: '#1D4ED8',
                            }}
                          >
                            {biz.planName || 'Free Starter'}
                          </span>
                          <button
                            type="button"
                            onClick={() => openPlanModal(biz)}
                            style={{
                              fontSize: '11px',
                              color: '#4F46E5',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              padding: '2px 4px',
                            }}
                            title="Change Subscription Plan"
                          >
                            Change
                          </button>
                        </div>
                      </td>

                      {/* Owner */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1E293B' }}>
                          {biz.ownerName}
                        </div>
                        {biz.ownerEmail && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {biz.ownerEmail}
                          </div>
                        )}
                      </td>

                      {/* Branches */}
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#334155' }}>
                        {biz.branchesCount}
                      </td>

                      {/* Customers */}
                      <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                        {biz.customersCount}
                      </td>

                      {/* Status - Compact Badge */}
                      <td style={{ padding: '14px 16px' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            backgroundColor: isSuspended ? '#FEF3C7' : '#DCFCE7',
                            color: isSuspended ? '#92400E' : '#166534',
                            fontSize: '11px',
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
                          <span>{biz.status}</span>
                        </div>
                      </td>

                      {/* Created */}
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#64748B' }}>
                        {new Date(biz.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <button
                            type="button"
                            onClick={() => onNavigate('admin-business-detail', { id: biz.id })}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid #E2E8F0',
                              backgroundColor: '#FFFFFF',
                              color: '#334155',
                              fontSize: '12px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'all 150ms ease',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.backgroundColor = '#F8FAFC';
                              e.currentTarget.style.borderColor = '#CBD5E1';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.backgroundColor = '#FFFFFF';
                              e.currentTarget.style.borderColor = '#E2E8F0';
                            }}
                          >
                            <Eye size={13} />
                            <span>Details</span>
                          </button>

                          {isSuspended ? (
                            <button
                              type="button"
                              onClick={() => openStatusModal(biz, 'ACTIVE')}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: '1px solid #BBF7D0',
                                backgroundColor: '#F0FDF4',
                                color: '#166534',
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#DCFCE7')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#F0FDF4')}
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openStatusModal(biz, 'SUSPENDED')}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: '1px solid #FED7AA',
                                backgroundColor: '#FFFBEB',
                                color: '#92400E',
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FEF3C7')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#FFFBEB')}
                            >
                              Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {!isLoading && !error && businesses.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '1px solid #E2E8F0',
              backgroundColor: '#FAFAFC',
              fontSize: '13px',
              color: '#64748B',
            }}
          >
            <div>
              Showing <span style={{ fontWeight: 600, color: '#0F172A' }}>{businesses.length}</span> of{' '}
              <span style={{ fontWeight: 600, color: '#0F172A' }}>{totalCount}</span> businesses
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: page <= 1 ? '#CBD5E1' : '#334155',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={14} />
                <span>Prev</span>
              </button>

              <span style={{ padding: '0 4px', fontSize: '12px', color: '#64748B' }}>
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: page >= totalPages ? '#CBD5E1' : '#334155',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status Transition Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isUpdatingStatus && setIsModalOpen(false)}
        title={pendingStatus === 'SUSPENDED' ? 'Suspend Business' : 'Reactivate Business'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
            {pendingStatus === 'SUSPENDED'
              ? `Are you sure you want to suspend "${targetBusiness?.name}"? While suspended, the business and its staff will not be able to process transactions or access operational features.`
              : `Are you sure you want to reactivate "${targetBusiness?.name}"? The business will be fully restored to active status.`}
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
              Reason for audit trail (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Terms of service violation, billing hold..."
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
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

      {/* Plan Assignment Modal */}
      <Modal
        isOpen={isPlanModalOpen}
        onClose={() => !isUpdatingPlan && setIsPlanModalOpen(false)}
        title={`Assign Subscription Plan: ${planTargetBusiness?.name}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
            Switching plans will immediately grant or adjust feature entitlements and capacity limits for <strong>{planTargetBusiness?.name}</strong> across all staff accounts and customer portals.
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
              Select Target Plan
            </label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              style={{
                width: '100%',
                height: 40,
                padding: '0 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                backgroundColor: '#FFFFFF',
                color: '#1E293B',
                outline: 'none',
              }}
            >
              {availablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug}) — ₹{(p.priceMinor / 100).toLocaleString()}/mo
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#EFF6FF',
              borderRadius: '8px',
              border: '1px solid #BFDBFE',
              fontSize: '12px',
              color: '#1E40AF',
              lineHeight: 1.4,
            }}
          >
            <strong>Note:</strong> Active subscriptions will be updated without disruption. All audit logs for this change will be recorded under your Super Admin credentials.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPlanModalOpen(false)}
              disabled={isUpdatingPlan}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmPlanChange}
              disabled={isUpdatingPlan || !selectedPlanId}
            >
              {isUpdatingPlan ? 'Assigning Plan...' : 'Confirm Plan Assignment'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
