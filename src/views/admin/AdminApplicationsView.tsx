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
  MessageSquare,
  HelpCircle,
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

export interface StatusHistoryEntry {
  status: string;
  timestamp: string;
  actorRole?: 'APPLICANT' | 'SUPER_ADMIN' | 'SYSTEM' | string;
  actorName?: string | null;
  actionTitle: string;
  notes?: string | null;
  message?: string | null;
}

export interface OnboardingApplication {
  id: string;
  applicationNumber: string;
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
  submittedAt: string | null;
  additionalInfoRequested: string | null;
  additionalInfoSubmitted: string | null;
  additionalInfoSubmittedAt: string | null;
  statusHistory?: StatusHistoryEntry[] | null;
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
    DRAFT: number;
    SUBMITTED: number;
    PENDING: number;
    UNDER_REVIEW: number;
    ADDITIONAL_INFO_REQUIRED: number;
    APPROVED: number;
    REJECTED: number;
    CANCELLED: number;
    PROVISIONED: number;
  }>({
    ALL: 0,
    DRAFT: 0,
    SUBMITTED: 0,
    PENDING: 0,
    UNDER_REVIEW: 0,
    ADDITIONAL_INFO_REQUIRED: 0,
    APPROVED: 0,
    REJECTED: 0,
    CANCELLED: 0,
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
  const [copiedAppNumber, setCopiedAppNumber] = useState<boolean>(false);

  // Request Info Modal State
  const [isRequestInfoModalOpen, setIsRequestInfoModalOpen] = useState<boolean>(false);
  const [requestInfoMessage, setRequestInfoMessage] = useState<string>('');
  const [isSubmittingInfoRequest, setIsSubmittingInfoRequest] = useState<boolean>(false);

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
        DRAFT: 0,
        SUBMITTED: 0,
        PENDING: 0,
        UNDER_REVIEW: 0,
        ADDITIONAL_INFO_REQUIRED: 0,
        APPROVED: 0,
        REJECTED: 0,
        CANCELLED: 0,
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

  const handleCopyAppNumber = (appNum: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(appNum);
      setCopiedAppNumber(true);
      setTimeout(() => setCopiedAppNumber(false), 2000);
      addToast({
        type: 'info',
        title: 'Copied Reference',
        message: `${appNum} copied to clipboard.`,
      });
    }
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

  const handleRequestInfo = async () => {
    if (!selectedApp || !requestInfoMessage.trim()) return;

    try {
      setIsSubmittingInfoRequest(true);
      const res = await fetch(`/api/admin/onboarding-requests/${selectedApp.id}/request-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: requestInfoMessage.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to request additional information');
      }

      addToast({
        type: 'success',
        title: 'Information Requested',
        message: `Applicant has been notified. Application status updated to Additional Information Required.`,
      });

      setIsRequestInfoModalOpen(false);
      setRequestInfoMessage('');
      setSelectedApp(json.request);
      await fetchApplications();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Request Failed',
        message: err.message,
      });
    } finally {
      setIsSubmittingInfoRequest(false);
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

  const getBadgeConfig = (status: OnboardingRequestStatus | string): { status: string; label: string } => {
    switch (status) {
      case 'PROVISIONED':
        return { status: 'completed', label: 'Provisioned' };
      case 'APPROVED':
        return { status: 'active', label: 'Approved' };
      case 'UNDER_REVIEW':
        return { status: 'pending', label: 'Under Review' };
      case 'ADDITIONAL_INFO_REQUIRED':
        return { status: 'at-risk', label: 'Info Required' };
      case 'SUBMITTED':
        return { status: 'pending', label: 'Submitted' };
      case 'DRAFT':
        return { status: 'inactive', label: 'Draft' };
      case 'CANCELLED':
        return { status: 'inactive', label: 'Cancelled' };
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
        description="Review prospective business onboarding requests, manage application lifecycle, and provision active tenant workspaces."
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
          { id: 'SUBMITTED', label: 'Submitted', count: counts.SUBMITTED },
          { id: 'UNDER_REVIEW', label: 'Under Review', count: counts.UNDER_REVIEW },
          { id: 'ADDITIONAL_INFO_REQUIRED', label: 'Info Required', count: counts.ADDITIONAL_INFO_REQUIRED },
          { id: 'APPROVED', label: 'Approved', count: counts.APPROVED },
          { id: 'PROVISIONED', label: 'Provisioned', count: counts.PROVISIONED },
          { id: 'REJECTED', label: 'Rejected', count: counts.REJECTED },
          { id: 'CANCELLED', label: 'Cancelled', count: counts.CANCELLED },
          { id: 'DRAFT', label: 'Drafts', count: counts.DRAFT },
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
        <div style={{ position: 'relative', flex: 1, maxWidth: 460 }}>
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
            placeholder="Search by APP-XXXXX reference, business, owner, or email..."
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
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-danger-subtle)',
            color: 'var(--color-danger-text)',
            borderRadius: 'var(--radius-md)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: 11,
                        padding: '2px 6px',
                        backgroundColor: '#EEF2FF',
                        color: 'var(--color-primary)',
                        borderRadius: 4,
                      }}
                    >
                      {app.applicationNumber || 'PENDING'}
                    </span>
                  </div>
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

              {app.additionalInfoRequested && !app.additionalInfoSubmitted && (
                <div
                  style={{
                    fontSize: 11,
                    color: '#B45309',
                    backgroundColor: '#FEF3C7',
                    padding: '4px 8px',
                    borderRadius: 4,
                  }}
                >
                  Waiting for applicant info
                </div>
              )}

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
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Application / Business</th>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: 11,
                          padding: '2px 6px',
                          backgroundColor: '#EEF2FF',
                          color: 'var(--color-primary)',
                          borderRadius: 4,
                        }}
                      >
                        {app.applicationNumber || 'PENDING'}
                      </span>
                    </div>
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
                    {app.additionalInfoRequested && !app.additionalInfoSubmitted && (
                      <div style={{ fontSize: 10, color: '#B45309', marginTop: 4, fontWeight: 500 }}>
                        Awaiting info
                      </div>
                    )}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '78vh', overflowY: 'auto', paddingRight: 4 }}>
            {/* Status Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--color-bg)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: 13,
                      padding: '2px 8px',
                      backgroundColor: '#EEF2FF',
                      color: 'var(--color-primary)',
                      borderRadius: 4,
                      border: '1px solid #C7D2FE',
                    }}
                  >
                    #{selectedApp.applicationNumber || 'PENDING'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyAppNumber(selectedApp.applicationNumber)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                    title="Copy reference number"
                  >
                    {copiedAppNumber ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                  </button>
                  <StatusBadge {...getBadgeConfig(selectedApp.status)} />
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-muted)' }}>
                Submitted: {new Date(selectedApp.createdAt).toLocaleString()}
              </div>
            </div>

            {/* Additional Information Notices */}
            {selectedApp.additionalInfoRequested && (
              <div
                style={{
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-4)',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#B45309', marginBottom: 4 }}>
                  <HelpCircle size={15} /> Super Admin Requested Information
                </div>
                <div style={{ color: '#78350F', lineHeight: 1.5 }}>
                  {selectedApp.additionalInfoRequested}
                </div>
              </div>
            )}

            {selectedApp.additionalInfoSubmitted && (
              <div
                style={{
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-4)',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#15803D', marginBottom: 4 }}>
                  <CheckCircle2 size={15} /> Applicant Response Submitted
                  {selectedApp.additionalInfoSubmittedAt && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#166534' }}>
                      ({new Date(selectedApp.additionalInfoSubmittedAt).toLocaleString()})
                    </span>
                  )}
                </div>
                <div style={{ color: '#14532D', lineHeight: 1.5 }}>
                  {selectedApp.additionalInfoSubmitted}
                </div>
              </div>
            )}

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

            {/* Persisted Status History Timeline */}
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                Persisted Application History
              </div>

              {selectedApp.statusHistory && selectedApp.statusHistory.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedApp.statusHistory.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor:
                            item.status === 'APPROVED' || item.status === 'PROVISIONED'
                              ? '#059669'
                              : item.status === 'REJECTED'
                              ? '#DC2626'
                              : item.status === 'ADDITIONAL_INFO_REQUIRED'
                              ? '#D97706'
                              : 'var(--color-primary)',
                          marginTop: 5,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {item.actionTitle}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>
                          Actor: {item.actorRole || 'SYSTEM'} {item.actorName ? `(${item.actorName})` : ''}
                        </div>
                        {(item.notes || item.message) && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--color-text-secondary)',
                              marginTop: 4,
                              padding: '4px 8px',
                              backgroundColor: '#FFFFFF',
                              borderRadius: 4,
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            {item.message || item.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  No historical entries recorded.
                </div>
              )}
            </div>

            {/* Review Notes Input */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Review Notes / Explanation for Action
              </label>
              <textarea
                rows={2}
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Add explanation note for approval, rejection, or under review change..."
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
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {selectedApp.status !== 'REJECTED' && selectedApp.status !== 'PROVISIONED' && selectedApp.status !== 'CANCELLED' && (
                  <Button
                    variant="danger"
                    size="sm"
                    loading={isUpdatingStatus}
                    onClick={() => handleUpdateStatus('REJECTED')}
                  >
                    Reject
                  </Button>
                )}

                {selectedApp.status !== 'PROVISIONED' && selectedApp.status !== 'CANCELLED' && selectedApp.status !== 'REJECTED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsRequestInfoModalOpen(true)}
                    leftIcon={<MessageSquare size={13} />}
                  >
                    Request Info
                  </Button>
                )}

                {(selectedApp.status === 'PENDING' || selectedApp.status === 'SUBMITTED' || selectedApp.status === 'ADDITIONAL_INFO_REQUIRED') && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={isUpdatingStatus}
                    onClick={() => handleUpdateStatus('UNDER_REVIEW')}
                  >
                    Mark Under Review
                  </Button>
                )}

                {selectedApp.status !== 'APPROVED' && selectedApp.status !== 'PROVISIONED' && selectedApp.status !== 'CANCELLED' && (
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
                    Provision Workspace
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* REQUEST ADDITIONAL INFORMATION MODAL */}
      <Modal
        isOpen={isRequestInfoModalOpen}
        onClose={() => setIsRequestInfoModalOpen(false)}
        title="Request Additional Information"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Specify what additional details, documents, or corrections are required from the applicant for <strong>{selectedApp?.businessName}</strong>. The applicant will see this notice directly on their tracking screen.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Required Information or Action Notice
            </label>
            <textarea
              rows={4}
              value={requestInfoMessage}
              onChange={e => setRequestInfoMessage(e.target.value)}
              placeholder="e.g. Please provide your business registration tax document or specify your primary menu offerings..."
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button
              variant="outline"
              size="md"
              onClick={() => setIsRequestInfoModalOpen(false)}
              disabled={isSubmittingInfoRequest}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={isSubmittingInfoRequest}
              disabled={!requestInfoMessage.trim()}
              onClick={handleRequestInfo}
              leftIcon={<MessageSquare size={14} />}
            >
              Send Information Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* PROVISIONING CONFIRMATION & RESULT MODAL */}
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
                <CheckCircle2 size={16} /> Customer Standee QR code
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
                Provision Workspace
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminApplicationsView;
