import React, { useState, useEffect } from 'react';
import {
  Search,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { PlatformAuditLog, AdminRoute } from '../../types/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface AdminAuditLogsViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

const ACTION_OPTIONS = [
  'ALL',
  'LOGIN_SUCCESS',
  'LOGOUT',
  'TENANT_SWITCH',
  'BUSINESS_SUSPENDED',
  'BUSINESS_REACTIVATED',
  'USER_SUSPENDED',
  'USER_DISABLED',
  'USER_REACTIVATED',
  'MEMBERSHIP_UPDATED',
  'CUSTOMER_CREATED',
  'STAMPS_AWARDED',
  'REWARD_REDEEMED',
];

export const AdminAuditLogsView: React.FC<AdminAuditLogsViewProps> = () => {
  const isMobile = useIsMobile();
  const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Detail Modal State
  const [selectedLog, setSelectedLog] = useState<PlatformAuditLog | null>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
      });
      if (search.trim()) params.append('search', search.trim());
      if (actionFilter !== 'ALL') params.append('action', actionFilter);

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to load audit trail (HTTP ${res.status})`);
      }

      const json = await res.json();
      setLogs(json.items || []);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalCount(json.pagination?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Error communicating with administration service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <AdminPageHeader
        title="Audit Logs"
        description="Immutable security trail of platform mutations and operational events."
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
              placeholder="Search action, actor, entity ID..."
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
                fetchLogs();
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
            value={actionFilter}
            onChange={e => {
              setActionFilter(e.target.value);
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
            {ACTION_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt === 'ALL' ? 'All Operations' : opt.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchLogs}
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
            <Skeleton height="48px" />
          </div>
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#DC2626' }}>
            <AlertTriangle size={24} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{error}</div>
            <Button variant="outline" size="sm" onClick={fetchLogs} style={{ marginTop: 12 }}>
              Try Again
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            title="No audit events found"
            description={search ? `No log records matched "${search}".` : 'No audit entries recorded.'}
          />
        ) : isMobile ? (
          <div className="mobile-card-list" style={{ padding: '12px' }}>
            {logs.map(log => {
              const isNegative = log.action.includes('SUSPEND') || log.action.includes('DISABLE');
              const isPositive = log.action.includes('REACTIVATE') || log.action.includes('ACTIVE');

              return (
                <div key={log.id} className="mobile-data-card">
                  <div className="mobile-data-card-header">
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: isNegative ? '#FEF2F2' : isPositive ? '#F0FDF4' : '#EEF2FF',
                        color: isNegative ? '#DC2626' : isPositive ? '#16A34A' : '#4F6BFF',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {log.action}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="mobile-data-card-row">
                    <span className="mobile-data-card-label">Actor</span>
                    <span className="mobile-data-card-value">
                      <span style={{ fontWeight: 600 }}>{log.actorName}</span>
                      {log.actorEmail && <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>{log.actorEmail}</span>}
                    </span>
                  </div>

                  <div className="mobile-data-card-row">
                    <span className="mobile-data-card-label">Target</span>
                    <span className="mobile-data-card-value">
                      <span style={{ fontWeight: 500 }}>{log.entityType}</span>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#94A3B8', marginLeft: '4px' }}>
                        ({log.entityId.slice(0, 8)}...)
                      </span>
                    </span>
                  </div>

                  {log.businessName && (
                    <div className="mobile-data-card-row">
                      <span className="mobile-data-card-label">Scope</span>
                      <span className="mobile-data-card-value">{log.businessName}</span>
                    </div>
                  )}

                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        minHeight: '36px',
                      }}
                    >
                      <Eye size={13} color="#64748B" />
                      <span>Inspect Details</span>
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
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                    Time
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                    Action
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                    Actor
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                    Target Entity
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                    Business Scope
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', textAlign: 'right' }}>
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => {
                  const isNegative = log.action.includes('SUSPEND') || log.action.includes('DISABLE');
                  const isPositive = log.action.includes('REACTIVATE') || log.action.includes('ACTIVE');

                  return (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: idx === logs.length - 1 ? 'none' : '1px solid #F1F5F9',
                        transition: 'background-color 120ms ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Time */}
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                        <div>{new Date(log.createdAt).toLocaleDateString()}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: isNegative ? '#FEF2F2' : isPositive ? '#F0FDF4' : '#EEF2FF',
                            color: isNegative ? '#DC2626' : isPositive ? '#16A34A' : '#4F6BFF',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Actor */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                          {log.actorName}
                        </div>
                        {log.actorEmail && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {log.actorEmail}
                          </div>
                        )}
                      </td>

                      {/* Target Entity */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: '12px', color: '#334155' }}>
                          <span style={{ fontWeight: 500 }}>{log.entityType}</span>
                        </div>
                        <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#94A3B8', marginTop: 2 }}>
                          {log.entityId.slice(0, 12)}...
                        </div>
                      </td>

                      {/* Business Scope */}
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#475569' }}>
                        {log.businessName}
                      </td>

                      {/* Inspect */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
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
                          <Eye size={13} color="#64748B" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && !error && logs.length > 0 && (
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
              Showing <span style={{ fontWeight: 600, color: '#0F172A' }}>{logs.length}</span> of{' '}
              <span style={{ fontWeight: 600, color: '#0F172A' }}>{totalCount}</span> log entries
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

      {/* Audit Detail Drawer / Modal with Clean Diff Viewer */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Event Details"
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Metadata Summary */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--space-3)',
                padding: '16px',
                backgroundColor: '#F8FAFC',
                borderRadius: '8px',
                border: '1px solid #F1F5F9',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Action</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#4F6BFF', marginTop: 2 }}>
                  {selectedLog.action}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Actor</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', marginTop: 2 }}>
                  {selectedLog.actorName}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Target</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', marginTop: 2 }}>
                  {selectedLog.entityType} ({selectedLog.entityId.slice(0, 8)}...)
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Time</div>
                <div style={{ fontSize: '13px', color: '#475569', marginTop: 2 }}>
                  {new Date(selectedLog.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* State Diff Viewer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                State Changes
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                {/* Previous State */}
                <div
                  style={{
                    backgroundColor: '#FAFAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: 6 }}>
                    Previous State
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: '#475569',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {selectedLog.previousState
                      ? JSON.stringify(selectedLog.previousState, null, 2)
                      : 'None (Initial state)'}
                  </pre>
                </div>

                {/* New State */}
                <div
                  style={{
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#166534', marginBottom: 6 }}>
                    New State
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: '#166534',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {selectedLog.newState
                      ? JSON.stringify(selectedLog.newState, null, 2)
                      : 'No state payload'}
                  </pre>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <Button variant="primary" size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
