import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { PlatformMembership, AdminRoute } from '../../types/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface AdminStaffViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

export const AdminStaffView: React.FC<AdminStaffViewProps> = () => {
  const isMobile = useIsMobile();
  const [memberships, setMemberships] = useState<PlatformMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchMemberships = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
      });
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/admin/memberships?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to load memberships (HTTP ${res.status})`);
      }

      const json = await res.json();
      setMemberships(json.items || []);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalCount(json.pagination?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Error communicating with administration service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMemberships();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchMemberships();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <AdminPageHeader
        title="Staff Memberships"
        description="Cross-tenant role allocations connecting users to business workspaces."
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
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 280 }}
        >
          <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
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
              placeholder="Search member, email, business..."
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
              }}
            />
          </div>

          <Button type="submit" variant="primary" size="sm" style={{ height: 40, padding: '0 16px' }}>
            Search
          </Button>

          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
                fetchMemberships();
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748B',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
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
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INVITED">Invited</option>
          </select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchMemberships}
            title="Refresh list"
            style={{ height: 40, width: 40, padding: 0 }}
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
          </div>
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#DC2626' }}>
            <AlertTriangle size={24} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{error}</div>
            <Button variant="outline" size="sm" onClick={fetchMemberships} style={{ marginTop: 12 }}>
              Try Again
            </Button>
          </div>
        ) : memberships.length === 0 ? (
          <EmptyState
            title="No staff memberships found"
            description={search ? `No assignments matched "${search}".` : 'No staff memberships recorded.'}
          />
        ) : isMobile ? (
          <div className="mobile-card-list" style={{ padding: '12px' }}>
            {memberships.map(m => (
              <div key={m.id} className="mobile-data-card">
                <div className="mobile-data-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Avatar name={m.userName} size="sm" />
                    <div>
                      <div className="mobile-data-card-title">{m.userName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{m.userEmail}</div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: m.status === 'ACTIVE' ? '#DCFCE7' : '#FEF3C7',
                      color: m.status === 'ACTIVE' ? '#166534' : '#92400E',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: m.status === 'ACTIVE' ? '#16A34A' : '#D97706',
                      }}
                    />
                    <span>{m.status}</span>
                  </div>
                </div>

                <div className="mobile-data-card-row">
                  <span className="mobile-data-card-label">Business & Role</span>
                  <span className="mobile-data-card-value">
                    <span style={{ fontWeight: 600 }}>{m.businessName}</span>
                    <span
                      style={{
                        marginLeft: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: m.role === 'OWNER' ? '#EEF2FF' : '#F1F5F9',
                        color: m.role === 'OWNER' ? '#4F6BFF' : '#334155',
                      }}
                    >
                      {m.role}
                    </span>
                  </span>
                </div>

                <div className="mobile-data-card-row">
                  <span className="mobile-data-card-label">Assigned Date</span>
                  <span className="mobile-data-card-value">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                    User
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                    Relationship (User → Business → Role)
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                    Assigned Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m, idx) => (
                  <tr
                    key={m.id}
                    style={{
                      borderBottom: idx === memberships.length - 1 ? 'none' : '1px solid #F1F5F9',
                      transition: 'background-color 120ms ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* User */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <Avatar name={m.userName} size="sm" />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: '#0F172A' }}>
                            {m.userName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {m.userEmail}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Relationship: User -> Business -> Role */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                          {m.businessName}
                        </span>
                        <ArrowRight size={13} color="#94A3B8" />
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: m.role === 'OWNER' ? '#EEF2FF' : '#F1F5F9',
                            color: m.role === 'OWNER' ? '#4F6BFF' : '#334155',
                          }}
                        >
                          {m.role}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 16px' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          backgroundColor: m.status === 'ACTIVE' ? '#DCFCE7' : '#FEF3C7',
                          color: m.status === 'ACTIVE' ? '#166534' : '#92400E',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: m.status === 'ACTIVE' ? '#16A34A' : '#D97706',
                          }}
                        />
                        <span>{m.status}</span>
                      </div>
                    </td>

                    {/* Created Date */}
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#64748B' }}>
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && !error && memberships.length > 0 && (
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
              Showing <span style={{ fontWeight: 600, color: '#0F172A' }}>{memberships.length}</span> of{' '}
              <span style={{ fontWeight: 600, color: '#0F172A' }}>{totalCount}</span> assignments
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
    </div>
  );
};
