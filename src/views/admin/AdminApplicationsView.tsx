import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
  QrCode,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AdminRoute } from '../../types/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useToast } from '../../context/ToastContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { OnboardingRequestStatus } from '@prisma/client';

export interface AdminApplicationsViewProps {
  onNavigate: (route: AdminRoute, params?: { id?: string }) => void;
}


export interface OnboardingApplication {
  id: string;
  businessName: string;
  category: string;
  description: string | null;
  website: string | null;
  businessPhone: string | null;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  country: string;
  city: string;
  state: string | null;
  postalCode: string | null;
  address: string;
  numberOfBranches: number;
  themePreset: string | null;
  status: OnboardingRequestStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  provisionedAt: string | null;
  provisionedBusinessId: string | null;
  createdAt: string;
  updatedAt: string;
  provisionedBusiness?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
}

export const AdminApplicationsView: React.FC<AdminApplicationsViewProps> = ({ onNavigate }) => {
  const isMobile = useIsMobile();
  const { addToast } = useToast();

  const [applications, setApplications] = useState<OnboardingApplication[]>([]);
  const [counts, setCounts] = useState<{
    ALL: number;
    PENDING: number;
    UNDER_REVIEW: number;
    APPROVED: number;
    REJECTED: number;
    PROVISIONED: number;
  }>({
    ALL: 0,
    PENDING: 0,
    UNDER_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    PROVISIONED: 0,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Detail Modal State
  const [selectedApp, setSelectedApp] = useState<OnboardingApplication | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Provisioning Modal State
  const [isProvisionConfirmOpen, setIsProvisionConfirmOpen] = useState<boolean>(false);
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);
  const [provisionResult, setProvisionResult] = useState<{
    business: { id: string; name: string; slug: string };
    invitation: { setupUrl?: string; rawToken?: string };
    qrCode: { code: string; destinationUrl: string };
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const fetchApplications = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
      });
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/admin/onboarding-requests?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch onboarding applications (HTTP ${res.status})`);
      }

      const json = await res.json();
      setApplications(json.items || []);
      setCounts(json.counts || {
        ALL: 0,
        PENDING: 0,
        UNDER_REVIEW: 0,
        APPROVED: 0,
        REJECTED: 0,
        PROVISIONED: 0,
      });
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalCount(json.pagination?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Error communicating with onboarding service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchApplications();
  };

  const handleOpenDetail = (app: OnboardingApplication) => {
    setSelectedApp(app);
    setReviewNotes(app.reviewNotes || '');
    setIsDetailModalOpen(true);
  };

  const handleUpdateStatus = async (nextStatus: OnboardingRequestStatus) => {
    if (!selectedApp) return;

    try {
      setIsUpdatingStatus(true);
      const res = await fetch(`/api/admin/onboarding-requests/${selectedApp.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          status: nextStatus,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update application status');
      }

      addToast({
        type: 'success',
        title: 'Status Updated',
        message: `Application for ${selectedApp.businessName} updated to ${nextStatus}`,
      });

      setSelectedApp(json.request);
      await fetchApplications();
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

  const handleExecuteProvision = async () => {
    if (!selectedApp) return;

    try {
      setIsProvisioning(true);
      const res = await fetch(`/api/admin/onboarding-requests/${selectedApp.id}/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to provision business');
      }

      setProvisionResult({
        business: json.business,
        invitation: json.invitation,
        qrCode: json.qrCode,
      });

      addToast({
        type: 'success',
        title: 'Business Provisioned',
        message: `${json.business.name} is now created with owner workspace and QR standee.`,
      });

      await fetchApplications();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Provisioning Failed',
        message: err.message,
      });
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleCopySetupLink = () => {
    if (provisionResult?.invitation.setupUrl && navigator.clipboard) {
      navigator.clipboard.writeText(provisionResult.invitation.setupUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      addToast({
        type: 'info',
        title: 'Copied Setup Link',
        message: 'Owner password setup invitation URL copied to clipboard.',
      });
    }
  };

  const getBadgeConfig = (status: OnboardingRequestStatus): { status: string; label: string } => {
    switch (status) {
      case 'PROVISIONED':
        return { status: 'completed', label: 'Provisioned' };
      case 'APPROVED':
        return { status: 'active', label: 'Approved' };
      case 'UNDER_REVIEW':
        return { status: 'pending', label: 'Under Review' };
      case 'REJECTED':
        return { status: 'failed', label: 'Rejected' };
      case 'PENDING':
      default:
        return { status: 'pending', label: 'Pending' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <AdminPageHeader
        title="Business Applications"
        description="Review public client onboarding submissions, approve accounts, and provision production business workspaces."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchApplications}
            leftIcon={<RefreshCw size={14} />}
          >
            Refresh
          </Button>
        }
      />


      {/* Status Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 'var(--space-2)',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'ALL', label: 'All', count: counts.ALL },
          { id: 'PENDING', label: 'Pending', count: counts.PENDING },
          { id: 'UNDER_REVIEW', label: 'Under Review', count: counts.UNDER_REVIEW },
          { id: 'APPROVED', label: 'Approved', count: counts.APPROVED },
          { id: 'PROVISIONED', label: 'Provisioned', count: counts.PROVISIONED },
          { id: 'REJECTED', label: 'Rejected', count: counts.REJECTED },
        ].map(tab => {
          const isActive = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                backgroundColor: isActive ? '#EEF2FF' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 150ms ease',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: isActive ? '#FFFFFF' : 'var(--color-text-muted)',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Search by business name, owner, email, or city..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              height: 38,
              paddingLeft: 36,
              paddingRight: 12,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>
        <Button type="submit" variant="secondary" size="md">
          Search
        </Button>
      </form>

      {/* Table / List */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Skeleton height="48px" />
          <Skeleton height="64px" />
          <Skeleton height="64px" />
          <Skeleton height="64px" />
        </div>
      ) : error ? (
        <div
          style={{
            padding: 'var(--space-6)',
            backgroundColor: 'var(--color-danger-subtle)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-danger-border)',
            color: 'var(--color-danger-text)',
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          title="No applications found"
          description={
            statusFilter !== 'ALL'
              ? `There are no client applications with status "${statusFilter}".`
              : 'Prospective clients who submit the onboarding form will appear here for review and provisioning.'
          }
        />
      ) : isMobile ? (
        /* Mobile Card View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {applications.map(app => (
            <div
              key={app.id}
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>
                    {app.businessName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {app.category} • {app.city}, {app.country}
                  </div>
                </div>
                <StatusBadge {...getBadgeConfig(app.status)} />
              </div>


              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <strong>Owner:</strong> {app.ownerName} ({app.ownerEmail})
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {new Date(app.createdAt).toLocaleDateString()}
                </span>
                <Button variant="outline" size="sm" onClick={() => handleOpenDetail(app)}>
                  Review
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Desktop Table View */
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Business</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Category</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Owner Contact</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Location</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Submitted</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app, idx) => (
                <tr
                  key={app.id}
                  style={{
                    borderBottom: idx === applications.length - 1 ? 'none' : '1px solid var(--color-border)',
                    transition: 'background-color 150ms ease',
                  }}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
                      {app.businessName}
                    </div>
                    {app.website && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{app.website}</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {app.category}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {app.ownerName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{app.ownerEmail}</div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {app.city}, {app.country}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {new Date(app.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatusBadge {...getBadgeConfig(app.status)} />
                  </td>

                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                      <Button variant="outline" size="sm" onClick={() => handleOpenDetail(app)}>
                        Review
                      </Button>
                      {app.status === 'PROVISIONED' && app.provisionedBusinessId && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onNavigate('admin-business-detail', { id: app.provisionedBusinessId! })}
                        >
                          View Business
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Showing {applications.length} of {totalCount} applications
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              leftIcon={<ChevronLeft size={14} />}
            >
              Previous
            </Button>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 13, fontWeight: 500 }}>
              Page {page} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              rightIcon={<ChevronRight size={14} />}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* DETAIL / REVIEW MODAL */}
      {selectedApp && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Application Review: ${selectedApp.businessName}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '75vh', overflowY: 'auto' }}>
            {/* Status Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--color-bg)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Current Status
                </span>
                <div style={{ marginTop: 2 }}>
                  <StatusBadge {...getBadgeConfig(selectedApp.status)} />
                </div>

              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-muted)' }}>
                Submitted: {new Date(selectedApp.createdAt).toLocaleString()}
              </div>
            </div>

            {/* Business Info Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 'var(--space-3)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
              }}
            >
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Business Name
                </span>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedApp.businessName}</div>
              </div>

              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Category
                </span>
                <div style={{ fontSize: 13 }}>{selectedApp.category}</div>
              </div>

              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Website
                </span>
                <div style={{ fontSize: 13 }}>{selectedApp.website || 'None'}</div>
              </div>

              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Business Phone
                </span>
                <div style={{ fontSize: 13 }}>{selectedApp.businessPhone || 'None'}</div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Description
                </span>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {selectedApp.description || 'No description provided.'}
                </div>
              </div>
            </div>

            {/* Owner Contact */}
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Owner & Signatory
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Full Name</span>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedApp.ownerName}</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Email</span>
                  <div style={{ fontSize: 13 }}>{selectedApp.ownerEmail}</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Phone</span>
                  <div style={{ fontSize: 13 }}>{selectedApp.ownerPhone}</div>
                </div>
              </div>
            </div>

            {/* Location & Setup Preferences */}
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Location & Setup Requested
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-primary)', marginBottom: 6 }}>
                <strong>Address:</strong> {selectedApp.address}, {selectedApp.city}, {selectedApp.state ? `${selectedApp.state}, ` : ''}{selectedApp.country} {selectedApp.postalCode || ''}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                <span>Requested Branches: <strong>{selectedApp.numberOfBranches}</strong></span>
                <span>Theme Preset: <strong>{selectedApp.themePreset || 'Default'}</strong></span>
              </div>
            </div>

            {/* Review Notes Input */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Review Notes / Internal Decision Record
              </label>
              <textarea
                rows={2}
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Add comments on identity verification or provisioning conditions..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Action Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--color-border)',
                paddingTop: 'var(--space-4)',
                marginTop: 'var(--space-2)',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {selectedApp.status !== 'REJECTED' && selectedApp.status !== 'PROVISIONED' && (
                  <Button
                    variant="danger"
                    size="sm"
                    loading={isUpdatingStatus}
                    onClick={() => handleUpdateStatus('REJECTED')}
                  >
                    Reject
                  </Button>
                )}
                {selectedApp.status === 'PENDING' && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={isUpdatingStatus}
                    onClick={() => handleUpdateStatus('UNDER_REVIEW')}
                  >
                    Mark Under Review
                  </Button>
                )}
                {selectedApp.status !== 'APPROVED' && selectedApp.status !== 'PROVISIONED' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={isUpdatingStatus}
                    onClick={() => handleUpdateStatus('APPROVED')}
                  >
                    Approve
                  </Button>
                )}
              </div>

              <div>
                {selectedApp.status === 'PROVISIONED' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      if (selectedApp.provisionedBusinessId) {
                        onNavigate('admin-business-detail', { id: selectedApp.provisionedBusinessId });
                      }
                    }}
                    rightIcon={<ArrowRight size={14} />}
                  >
                    Open Provisioned Business
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setProvisionResult(null);
                      setIsProvisionConfirmOpen(true);
                    }}
                    leftIcon={<Sparkles size={14} />}
                  >
                    Provision Business
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* PROVISIONING CONFIRMATION & RESULT MODAL (Section 37 UX compliant) */}
      <Modal
        isOpen={isProvisionConfirmOpen}
        onClose={() => {
          setIsProvisionConfirmOpen(false);
          setProvisionResult(null);
        }}
        title={provisionResult ? "Business Provisioned Successfully" : "Create Reployty Business?"}
      >
        {provisionResult ? (
          /* Provisioning Success View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-4)',
                backgroundColor: '#ECFDF5',
                borderRadius: 'var(--radius-md)',
                color: '#065F46',
              }}
            >
              <CheckCircle2 size={24} color="#059669" />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Business workspace successfully provisioned!</div>
                <div style={{ fontSize: 12 }}>
                  Database tenant, owner account, branch, and customer QR are live in PostgreSQL.
                </div>
              </div>
            </div>

            {/* Owner Invitation Setup Link Box */}
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                Owner Setup Invitation Link
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 var(--space-2) 0' }}>
                Provide this secure one-time link to <strong>{selectedApp?.ownerEmail}</strong> to set their password.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  readOnly
                  value={provisionResult.invitation.setupUrl || ''}
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: '#FFFFFF',
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopySetupLink}
                  leftIcon={copiedLink ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                >
                  {copiedLink ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Generated QR Info */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <QrCode size={20} color="var(--color-primary)" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Customer Entry QR Standee</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Resolves to: {provisionResult.qrCode.destinationUrl}
                  </div>
                </div>
              </div>
              <StatusBadge status="active" label="Active" />
            </div>


            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setIsProvisionConfirmOpen(false);
                  setIsDetailModalOpen(false);
                  onNavigate('admin-business-detail', { id: provisionResult.business.id });
                }}
              >
                View Business Profile
              </Button>
            </div>
          </div>
        ) : (
          /* Confirmation View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {selectedApp?.businessName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Owner: {selectedApp?.ownerName} ({selectedApp?.ownerEmail})
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--color-bg)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                This action will atomically execute:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669' }}>
                <CheckCircle2 size={16} /> Business tenant record in PostgreSQL
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669' }}>
                <CheckCircle2 size={16} /> Owner user identity & Business Owner role
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669' }}>
                <CheckCircle2 size={16} /> Primary branch configuration
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669' }}>
                <CheckCircle2 size={16} /> Phase 6 Customer Standee QR code
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669' }}>
                <CheckCircle2 size={16} /> Secure one-time password setup invitation
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669' }}>
                <CheckCircle2 size={16} /> Audit trail entry
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <Button
                variant="outline"
                size="md"
                onClick={() => setIsProvisionConfirmOpen(false)}
                disabled={isProvisioning}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={isProvisioning}
                onClick={handleExecuteProvision}
                rightIcon={<Sparkles size={16} />}
              >
                Provision Business
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
