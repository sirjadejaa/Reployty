import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { PlatformUser, AdminRoute } from '../../types/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface AdminUsersViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = () => {
  const isMobile = useIsMobile();
  const { user: currentAdmin } = useAuth();
  const { addToast } = useToast();

  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Status Modal State
  const [targetUser, setTargetUser] = useState<PlatformUser | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'DISABLED'>('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
      });
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to load users (HTTP ${res.status})`);
      }

      const json = await res.json();
      setUsers(json.items || []);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalCount(json.pagination?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Error communicating with administration service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const openStatusModal = (u: PlatformUser) => {
    setTargetUser(u);
    setPendingStatus(u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
    setStatusReason('');
    setIsModalOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!targetUser) return;

    if (currentAdmin && currentAdmin.id === targetUser.id) {
      addToast({
        type: 'error',
        title: 'Action Prohibited',
        message: 'Self-lockout prevented: You cannot suspend your own active administrator account.',
      });
      setIsModalOpen(false);
      return;
    }

    try {
      setIsUpdatingStatus(true);
      const res = await fetch(`/api/admin/users/${targetUser.id}/status`, {
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
        throw new Error(json.error || 'Failed to update user status');
      }

      addToast({
        type: pendingStatus === 'ACTIVE' ? 'success' : 'warning',
        title: `Account ${pendingStatus === 'ACTIVE' ? 'Reactivated' : 'Suspended'}`,
        message: `${targetUser.name} status updated to ${pendingStatus}.`,
      });

      setIsModalOpen(false);
      await fetchUsers();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update Failed',
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
        title="Platform Users"
        description="Manage identity records, inspect tenant roles, and manage access statuses."
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
              placeholder="Search by name, email, phone..."
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
                fetchUsers();
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
            <option value="DISABLED">Disabled</option>
          </select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchUsers}
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
            <Button variant="outline" size="sm" onClick={fetchUsers} style={{ marginTop: 12 }}>
              Try Again
            </Button>
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            title="No users found"
            description={search ? `No accounts matched "${search}".` : 'No user accounts found.'}
            action={
              search ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    fetchUsers();
                  }}
                >
                  Clear search
                </Button>
              ) : undefined
            }
          />
        ) : isMobile ? (
          <div className="mobile-card-list" style={{ padding: '12px' }}>
            {users.map((u) => {
              const isCurrent = currentAdmin?.id === u.id;
              const isSuspended = u.status === 'SUSPENDED';
              const isDisabled = u.status === 'DISABLED';
              return (
                <div key={u.id} className="mobile-data-card">
                  <div className="mobile-data-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={u.name} size="sm" />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A' }}>{u.name}</span>
                          {u.isSuperAdmin && (
                            <span style={{ padding: '1px 5px', borderRadius: 4, backgroundColor: '#EEF2FF', color: '#4F6BFF', fontSize: 10, fontWeight: 600 }}>
                              Admin
                            </span>
                          )}
                          {isCurrent && (
                            <span style={{ padding: '1px 5px', borderRadius: 4, backgroundColor: '#F1F5F9', color: '#64748B', fontSize: 10 }}>
                              You
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>{u.email}</div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        backgroundColor: isSuspended ? '#FEF3C7' : isDisabled ? '#F1F5F9' : '#DCFCE7',
                        color: isSuspended ? '#92400E' : isDisabled ? '#64748B' : '#166534',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {u.status}
                    </span>
                  </div>

                  {u.memberships && u.memberships.length > 0 && (
                    <div className="mobile-data-card-row">
                      <span className="mobile-data-card-label">Businesses</span>
                      <span className="mobile-data-card-value">
                        {u.memberships.map(b => `${b.businessName} (${b.role})`).join(', ')}
                      </span>
                    </div>
                  )}

                  <div className="mobile-data-card-row">
                    <span className="mobile-data-card-label">Created</span>
                    <span className="mobile-data-card-value">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {!isCurrent && (
                    <div style={{ paddingTop: '8px', borderTop: '1px solid #F1F5F9', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => openStatusModal(u)}
                        style={{
                          width: '100%',
                          minHeight: 40,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 150ms ease',
                          border: isSuspended ? '1px solid #BBF7D0' : '1px solid #FECACA',
                          backgroundColor: isSuspended ? '#F0FDF4' : '#FEF2F2',
                          color: isSuspended ? '#166534' : '#DC2626',
                        }}
                      >
                        {isSuspended ? 'Reactivate User' : 'Suspend User'}
                      </button>
                    </div>
                  )}
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
                    User
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
                    Businesses & Role
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
                {users.map((u, idx) => {
                  const isCurrent = currentAdmin?.id === u.id;
                  const isSuspended = u.status === 'SUSPENDED';
                  const isDisabled = u.status === 'DISABLED';

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: idx === users.length - 1 ? 'none' : '1px solid #F1F5F9',
                        transition: 'background-color 120ms ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Combined Avatar + Name + Email cell */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <Avatar name={u.name} size="md" />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A' }}>
                                {u.name}
                              </span>
                              {u.isSuperAdmin && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: '#EEF2FF',
                                    color: '#4F6BFF',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                  }}
                                >
                                  <ShieldCheck size={11} />
                                  <span>Admin</span>
                                </span>
                              )}
                              {isCurrent && (
                                <span
                                  style={{
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: '#F1F5F9',
                                    color: '#64748B',
                                    fontSize: '10px',
                                    fontWeight: 500,
                                  }}
                                >
                                  You
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2 }}>
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            backgroundColor: isSuspended ? '#FEF3C7' : isDisabled ? '#F1F5F9' : '#DCFCE7',
                            color: isSuspended ? '#92400E' : isDisabled ? '#64748B' : '#166534',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: isSuspended ? '#D97706' : isDisabled ? '#94A3B8' : '#16A34A',
                            }}
                          />
                          <span>{u.status}</span>
                        </div>
                      </td>

                      {/* Businesses & Role */}
                      <td style={{ padding: '14px 16px' }}>
                        {u.memberships && u.memberships.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {u.memberships.slice(0, 2).map((b, bIdx) => (
                              <div key={bIdx} style={{ fontSize: '12px', color: '#334155' }}>
                                <span style={{ fontWeight: 600 }}>{b.businessName}</span>{' '}
                                <span style={{ color: '#64748B' }}>({b.role})</span>
                              </div>
                            ))}
                            {u.memberships.length > 2 && (
                              <span style={{ fontSize: '11px', color: '#4F6BFF' }}>
                                +{u.memberships.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94A3B8' }}>No businesses</span>
                        )}
                      </td>

                      {/* Created */}
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#64748B' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>

                          {!isCurrent && (
                            isSuspended ? (
                              <button
                                type="button"
                                onClick={() => openStatusModal(u)}
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
                                onClick={() => openStatusModal(u)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #FECACA',
                                  backgroundColor: '#FEF2F2',
                                  color: '#DC2626',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  transition: 'all 150ms ease',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FEE2E2')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#FEF2F2')}
                              >
                                Suspend
                              </button>
                            )
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

        {/* Pagination */}
        {!isLoading && !error && users.length > 0 && (
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
              Showing <span style={{ fontWeight: 600, color: '#0F172A' }}>{users.length}</span> of{' '}
              <span style={{ fontWeight: 600, color: '#0F172A' }}>{totalCount}</span> users
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

      {/* Confirmation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isUpdatingStatus && setIsModalOpen(false)}
        title={pendingStatus === 'ACTIVE' ? 'Reactivate User Account' : 'Suspend User Account'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
            {pendingStatus === 'ACTIVE'
              ? `Are you sure you want to restore access for ${targetUser?.name}? Active sessions and login will be permitted immediately.`
              : `Are you sure you want to suspend ${targetUser?.name}? All existing active sessions will be instantly revoked and the user will be locked out.`}
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
              placeholder="e.g. Security report, policy breach..."
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
              variant={pendingStatus === 'ACTIVE' ? 'primary' : 'danger'}
              size="sm"
              onClick={handleConfirmStatusChange}
              disabled={isUpdatingStatus}
            >
              {isUpdatingStatus ? 'Updating...' : pendingStatus === 'ACTIVE' ? 'Confirm Reactivation' : 'Confirm Suspension'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
