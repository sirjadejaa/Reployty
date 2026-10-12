import React, { useState, useEffect } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
  Send,
  Calendar,
  MessageSquare,
  Store,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface ApplicationTrackingViewProps {
  initialRef?: string;
  initialEmail?: string;
  onNavigateLogin?: () => void;
  onNavigateDashboard?: () => void;
}

interface TimelineEvent {
  status: string;
  timestamp: string;
  actorRole?: 'APPLICANT' | 'SUPER_ADMIN' | 'SYSTEM';
  actorName?: string | null;
  actionTitle: string;
  notes?: string | null;
  message?: string | null;
}

interface TrackedApplication {
  id: string;
  applicationNumber: string;
  businessName: string;
  businessCategory: string;
  status: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  city: string;
  country: string;
  address?: string;
  website?: string | null;
  businessPhone?: string | null;
  estimatedBranches?: number;
  submittedAt: string;
  updatedAt: string;
  additionalInfoRequested?: string | null;
  additionalInfoSubmitted?: string | null;
  additionalInfoSubmittedAt?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
  statusHistory: TimelineEvent[];
  provisionedBusiness?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
}

export const ApplicationTrackingView: React.FC<ApplicationTrackingViewProps> = ({
  initialRef,
  initialEmail,
  onNavigateLogin,
  onNavigateDashboard,
}) => {
  const isMobile = useIsMobile();
  const { addToast } = useToast();
  const { user, isAuthenticated } = useAuth();

  // Search / Lookup state
  const [refInput, setRefInput] = useState<string>(initialRef || '');
  const [emailInput, setEmailInput] = useState<string>(initialEmail || (user?.email || ''));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Application data
  const [application, setApplication] = useState<TrackedApplication | null>(null);
  const [userApplications, setUserApplications] = useState<TrackedApplication[]>([]);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);

  // Additional info response state
  const [responseText, setResponseText] = useState<string>('');
  const [updatedWebsite, setUpdatedWebsite] = useState<string>('');
  const [updatedPhone, setUpdatedPhone] = useState<string>('');
  const [isSubmittingInfo, setIsSubmittingInfo] = useState<boolean>(false);

  // Cancel application modal state
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // 1. Initial Load: check URL params or authenticated user's applications
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const hashQuery = hash.includes('?') ? new URLSearchParams(hash.split('?')[1]) : null;

    const queryRef = hashQuery?.get('ref') || searchParams.get('ref') || initialRef;
    const queryEmail = hashQuery?.get('email') || searchParams.get('email') || initialEmail;

    if (queryRef) {
      setRefInput(queryRef);
    }
    if (queryEmail) {
      setEmailInput(queryEmail);
    }

    if (queryRef && (queryEmail || user?.email)) {
      lookupApplication(queryRef, queryEmail || user?.email || '');
    } else if (isAuthenticated) {
      fetchMyApplications();
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Lookup authenticated user's applications
  const fetchMyApplications = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/applications/my', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch your applications');
      }

      const json = await res.json();
      const list: TrackedApplication[] = json.applications || [];
      setUserApplications(list);

      if (list.length > 0) {
        setApplication(list[0]);
        setRefInput(list[0].applicationNumber);
        setEmailInput(list[0].ownerEmail);
      }
    } catch (err: any) {
      // If not authenticated or error, allow manual reference search
    } finally {
      setIsLoading(false);
    }
  };

  // Lookup application by reference number & email
  const lookupApplication = async (refNum: string, emailStr: string) => {
    if (!refNum.trim()) {
      setError('Please enter your application reference number (e.g. APP-XXXXX)');
      return;
    }
    if (!emailStr.trim()) {
      setError('Please enter the owner email address associated with your application');
      return;
    }

    try {
      setIsSearching(true);
      setError(null);

      const res = await fetch('/api/public/applications/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          applicationNumber: refNum.trim(),
          email: emailStr.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Application not found with provided reference number and email');
      }

      setApplication(json.application);
      setResponseText('');
    } catch (err: any) {
      setError(err.message || 'Error tracking application. Please verify your reference number and email.');
      setApplication(null);
    } finally {
      setIsSearching(false);
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookupApplication(refInput, emailInput);
  };

  const handleCopyRef = () => {
    if (!application?.applicationNumber) return;
    navigator.clipboard?.writeText(application.applicationNumber);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
    addToast({ type: 'info', title: 'Reference Number Copied' });
  };

  // Submit additional information requested by Super Admin
  const handleSubmitAdditionalInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!application) return;
    if (!responseText.trim()) {
      addToast({ type: 'error', title: 'Please provide the requested information in detail' });
      return;
    }

    try {
      setIsSubmittingInfo(true);
      const url = isAuthenticated
        ? `/api/applications/${application.id}/additional-info`
        : `/api/public/applications/${application.id}/additional-info`;

      const payload = {
        applicationNumber: application.applicationNumber,
        email: application.ownerEmail,
        responseText: responseText.trim(),
        ...(updatedWebsite.trim() ? { website: updatedWebsite.trim() } : {}),
        ...(updatedPhone.trim() ? { businessPhone: updatedPhone.trim() } : {}),
      };

      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to submit additional information');
      }

      addToast({
        type: 'success',
        title: 'Information Submitted',
        message: 'Your updates were saved and your application status has been returned to review.',
      });

      // Refresh application details
      await lookupApplication(application.applicationNumber, application.ownerEmail);
      setResponseText('');
    } catch (err: any) {
      addToast({ type: 'error', title: err.message || 'Error submitting response' });
    } finally {
      setIsSubmittingInfo(false);
    }
  };

  // Cancel / Withdraw Application
  const handleCancelApplication = async () => {
    if (!application) return;

    try {
      setIsCancelling(true);
      const res = await fetch(`/api/applications/${application.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to cancel application');
      }

      addToast({
        type: 'success',
        title: 'Application Withdrawn',
        message: 'Your application has been successfully cancelled.',
      });

      setIsCancelModalOpen(false);
      await lookupApplication(application.applicationNumber, application.ownerEmail);
    } catch (err: any) {
      addToast({ type: 'error', title: err.message || 'Error cancelling application' });
    } finally {
      setIsCancelling(false);
    }
  };

  // Format Status Badge Color & Label
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return {
          label: 'Draft',
          color: '#6B7280',
          bg: '#F3F4F6',
          border: '#E5E7EB',
          icon: FileText,
        };
      case 'SUBMITTED':
      case 'PENDING':
        return {
          label: 'Submitted',
          color: '#2563EB',
          bg: '#EFF6FF',
          border: '#BFDBFE',
          icon: Clock,
        };
      case 'UNDER_REVIEW':
        return {
          label: 'Under Review',
          color: '#4F6BFF',
          bg: '#EEF2FF',
          border: '#C7D2FE',
          icon: Clock,
        };
      case 'ADDITIONAL_INFO_REQUIRED':
        return {
          label: 'Action Required',
          color: '#D97706',
          bg: '#FFFBEB',
          border: '#FDE68A',
          icon: HelpCircle,
        };
      case 'APPROVED':
        return {
          label: 'Approved',
          color: '#059669',
          bg: '#ECFDF5',
          border: '#A7F3D0',
          icon: CheckCircle2,
        };
      case 'PROVISIONED':
        return {
          label: 'Workspace Live',
          color: '#059669',
          bg: '#ECFDF5',
          border: '#A7F3D0',
          icon: CheckCircle2,
        };
      case 'REJECTED':
        return {
          label: 'Declined',
          color: '#DC2626',
          bg: '#FEF2F2',
          border: '#FECACA',
          icon: XCircle,
        };
      case 'CANCELLED':
        return {
          label: 'Withdrawn',
          color: '#6B7280',
          bg: '#F3F4F6',
          border: '#E5E7EB',
          icon: XCircle,
        };
      default:
        return {
          label: status,
          color: '#4B5563',
          bg: '#F3F4F6',
          border: '#E5E7EB',
          icon: Clock,
        };
    }
  };

  // Next required action prompt
  const getNextActionPrompt = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return {
          title: 'Complete and submit your application',
          description: 'Your application is currently saved as a draft. Review your details and submit to initiate Super Admin review.',
        };
      case 'SUBMITTED':
      case 'PENDING':
        return {
          title: 'Application under queue',
          description: 'Your application has been received and queued for Super Admin review. You will receive real-time updates as verification progresses.',
        };
      case 'UNDER_REVIEW':
        return {
          title: 'Verification in progress',
          description: 'The platform administration team is reviewing your business details and setting up your workspace.',
        };
      case 'ADDITIONAL_INFO_REQUIRED':
        return {
          title: 'Super Admin requested additional information',
          description: 'Please review the request from Super Admin below and provide the requested details to proceed with approval.',
        };
      case 'APPROVED':
        return {
          title: 'Application Approved',
          description: 'Your application has been verified! Super Admin is finalizing your business workspace, owner credentials, and QR standee.',
        };
      case 'PROVISIONED':
        return {
          title: 'Workspace ready to use',
          description: 'Your business is live on Reployty! You can now log into your business management dashboard.',
        };
      case 'REJECTED':
        return {
          title: 'Application declined',
          description: 'Your application was not approved during this review cycle. Please see the explanation below.',
        };
      case 'CANCELLED':
        return {
          title: 'Application withdrawn',
          description: 'This application was cancelled. You may submit a new onboarding application at any time.',
        };
      default:
        return {
          title: 'Status: ' + status,
          description: 'Track ongoing updates below.',
        };
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-canvas, #F8FAFC)',
        padding: isMobile ? '16px 12px' : '32px 24px',
        maxWidth: 960,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {/* HEADER BAR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              backgroundColor: '#4F6BFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '18px',
            }}
          >
            R
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              Business Application Tracking
            </h1>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
              Track your Reployty onboarding verification and workspace provisioning
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isAuthenticated ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateDashboard || (() => { window.location.hash = 'dashboard'; })}
            >
              Workspace Dashboard
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateLogin || (() => { window.location.hash = ''; })}
            >
              Log In
            </Button>
          )}
        </div>
      </div>

      {/* LOOKUP SEARCH BAR (if no application loaded or to search another) */}
      <Card style={{ padding: '16px 20px', marginBottom: '20px', borderRadius: '14px' }}>
        <form onSubmit={handleSearchSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto',
              gap: '12px',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                Application Reference #
              </label>
              <Input
                placeholder="e.g. APP-10023"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                Owner Email
              </label>
              <Input
                type="email"
                placeholder="Owner email used in application"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={isSearching}
              style={{ height: '40px', minWidth: '120px' }}
            >
              {isSearching ? <RefreshCw size={16} className="animate-spin" /> : 'Track Status'}
            </Button>
          </div>
        </form>

        {userApplications.length > 1 && (
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>Your applications:</span>
            {userApplications.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => {
                  setApplication(app);
                  setRefInput(app.applicationNumber);
                  setEmailInput(app.ownerEmail);
                }}
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: application?.id === app.id ? '#EEF2FF' : '#FFFFFF',
                  color: application?.id === app.id ? '#4F6BFF' : '#334155',
                  cursor: 'pointer',
                }}
              >
                #{app.applicationNumber} — {app.businessName}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* ERROR ALERT */}
      {error && (
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '10px',
            color: '#991B1B',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
          }}
        >
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* LOADING STATE */}
      {isLoading ? (
        <div style={{ display: 'grid', gap: '16px' }}>
          <Skeleton height="160px" radius="14px" />
          <Skeleton height="280px" radius="14px" />
        </div>
      ) : application ? (
        /* APPLICATION TRACKING CONTENT */
        <div style={{ display: 'grid', gap: '20px' }}>
          {/* 1. TOP SUMMARY CARD */}
          {(() => {
            const badge = getStatusBadge(application.status);
            const StatusIcon = badge.icon;
            const actionPrompt = getNextActionPrompt(application.status);

            return (
              <Card
                style={{
                  padding: isMobile ? '18px 16px' : '24px',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#4F6BFF',
                          backgroundColor: '#EEF2FF',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          letterSpacing: '0.04em',
                        }}
                      >
                        #{application.applicationNumber}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyRef}
                        title="Copy reference number"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748B',
                          padding: '2px',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        {copiedRef ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                      </button>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>
                        • {application.businessCategory}
                      </span>
                    </div>

                    <h2
                      style={{
                        fontSize: isMobile ? '20px' : '24px',
                        fontWeight: 700,
                        color: '#0F172A',
                        margin: '0 0 4px 0',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {application.businessName}
                    </h2>
                    <div style={{ fontSize: '13px', color: '#64748B' }}>
                      Owner: {application.ownerName} ({application.ownerEmail}) • {application.city}, {application.country}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      backgroundColor: badge.bg,
                      color: badge.color,
                      border: `1px solid ${badge.border}`,
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    <StatusIcon size={16} />
                    <span>{badge.label}</span>
                  </div>
                </div>

                {/* CURRENT ACTION / STATUS PROMPT BANNER */}
                <div
                  style={{
                    backgroundColor: application.status === 'ADDITIONAL_INFO_REQUIRED' ? '#FFFBEB' : '#F8FAFC',
                    border: `1px solid ${application.status === 'ADDITIONAL_INFO_REQUIRED' ? '#FDE68A' : '#E2E8F0'}`,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ marginTop: '2px' }}>
                      {application.status === 'ADDITIONAL_INFO_REQUIRED' ? (
                        <AlertCircle size={18} color="#D97706" />
                      ) : application.status === 'APPROVED' || application.status === 'PROVISIONED' ? (
                        <CheckCircle2 size={18} color="#059669" />
                      ) : (
                        <Clock size={18} color="#4F6BFF" />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: application.status === 'ADDITIONAL_INFO_REQUIRED' ? '#92400E' : '#0F172A',
                          marginBottom: '2px',
                        }}
                      >
                        {actionPrompt.title}
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          color: application.status === 'ADDITIONAL_INFO_REQUIRED' ? '#78350F' : '#64748B',
                          lineHeight: 1.45,
                        }}
                      >
                        {actionPrompt.description}
                      </div>

                      {/* Display Super Admin message if additional info requested */}
                      {application.status === 'ADDITIONAL_INFO_REQUIRED' && application.additionalInfoRequested && (
                        <div
                          style={{
                            marginTop: '10px',
                            padding: '10px 12px',
                            backgroundColor: '#FEF3C7',
                            borderRadius: '8px',
                            border: '1px solid #FCD34D',
                            color: '#78350F',
                            fontSize: '13px',
                            fontWeight: 500,
                          }}
                        >
                          <strong>Super Admin Request:</strong> "{application.additionalInfoRequested}"
                        </div>
                      )}

                      {/* Display decline reason if rejected */}
                      {application.status === 'REJECTED' && application.rejectionReason && (
                        <div
                          style={{
                            marginTop: '10px',
                            padding: '10px 12px',
                            backgroundColor: '#FEF2F2',
                            borderRadius: '8px',
                            border: '1px solid #FECACA',
                            color: '#991B1B',
                            fontSize: '13px',
                          }}
                        >
                          <strong>Reason:</strong> "{application.rejectionReason}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* TIMESTAMPS FOOTER */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px',
                    color: '#94A3B8',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} />
                    <span>Submitted: {new Date(application.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  <div>
                    Last Updated: {new Date(application.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(application.updatedAt).toLocaleDateString()})
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* 2. ACTION PANEL: FORM TO RESPOND TO ADDITIONAL INFO REQUEST */}
          {application.status === 'ADDITIONAL_INFO_REQUIRED' && (
            <Card style={{ padding: '22px', borderRadius: '16px', border: '1px solid #F59E0B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <MessageSquare size={18} color="#D97706" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Provide Requested Information
                </h3>
              </div>
              <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
                Enter the details requested by the Super Admin team to resume review of your workspace.
              </p>

              <form onSubmit={handleSubmitAdditionalInfo} style={{ display: 'grid', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Response Details <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <Textarea
                    rows={4}
                    placeholder="Provide the missing documentation, clarifying notes, or requested details here..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Updated Website URL (optional)
                    </label>
                    <Input
                      type="url"
                      placeholder="https://..."
                      value={updatedWebsite}
                      onChange={(e) => setUpdatedWebsite(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Updated Contact Phone (optional)
                    </label>
                    <Input
                      placeholder="+91 ..."
                      value={updatedPhone}
                      onChange={(e) => setUpdatedPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmittingInfo || !responseText.trim()}
                    style={{ minWidth: '160px' }}
                  >
                    {isSubmittingInfo ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={15} style={{ marginRight: '6px' }} />
                        Submit Information
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* 3. WORKSPACE LIVE CONGRATULATIONS CARD */}
          {(application.status === 'PROVISIONED' || application.status === 'APPROVED') && (
            <Card
              style={{
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid #10B981',
                backgroundColor: '#F0FDF4',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    backgroundColor: '#ECFDF5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid #A7F3D0',
                  }}
                >
                  <Store size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#065F46', margin: '0 0 6px 0' }}>
                    Congratulations! Your Business Workspace Is Approved
                  </h3>
                  <p style={{ fontSize: '13px', color: '#047857', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                    {application.status === 'PROVISIONED'
                      ? 'Your Reployty multi-tenant workspace, loyalty passes, and counter standees are provisioned and active.'
                      : 'Your application has been verified by the administration team and is scheduled for immediate workspace activation.'}
                  </p>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {isAuthenticated ? (
                      <Button
                        variant="primary"
                        onClick={onNavigateDashboard || (() => { window.location.hash = 'dashboard'; })}
                      >
                        Enter Business Workspace
                        <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={onNavigateLogin || (() => { window.location.hash = ''; })}
                      >
                        Log in to Workspace
                        <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 4. REAL PERSISTED APPLICATION TIMELINE */}
          <Card style={{ padding: isMobile ? '18px 16px' : '24px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 2px 0' }}>
                  Application Progress & Timeline
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                  Real-time persisted history from platform audit trail
                </p>
              </div>

              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', backgroundColor: '#F1F5F9', padding: '3px 8px', borderRadius: '6px' }}>
                {application.statusHistory.length} status {application.statusHistory.length === 1 ? 'event' : 'events'}
              </span>
            </div>

            {application.statusHistory.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                Application registered. Verification underway.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0px', position: 'relative' }}>
                {application.statusHistory.map((step, idx) => {
                  const isLast = idx === application.statusHistory.length - 1;
                  const date = new Date(step.timestamp);
                  const stepBadge = getStatusBadge(step.status);
                  const Icon = stepBadge.icon;

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        gap: '14px',
                        paddingBottom: isLast ? '0px' : '24px',
                        position: 'relative',
                      }}
                    >
                      {/* Vertical line connector */}
                      {!isLast && (
                        <div
                          style={{
                            position: 'absolute',
                            left: '15px',
                            top: '32px',
                            bottom: '0px',
                            width: '2px',
                            backgroundColor: '#E2E8F0',
                          }}
                        />
                      )}

                      {/* Icon circle */}
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          backgroundColor: stepBadge.bg,
                          color: stepBadge.color,
                          border: `1px solid ${stepBadge.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          zIndex: 1,
                        }}
                      >
                        <Icon size={16} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, paddingTop: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                            {step.actionTitle || stepBadge.label}
                          </span>
                          <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                          Updated by: <strong style={{ color: '#475569' }}>{step.actorRole === 'SUPER_ADMIN' ? 'Platform Administrator' : step.actorRole === 'APPLICANT' ? 'Applicant' : 'System Automation'}</strong>
                        </div>

                        {step.notes && (
                          <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0 0', lineHeight: 1.4 }}>
                            {step.notes}
                          </p>
                        )}

                        {step.message && (
                          <div
                            style={{
                              marginTop: '8px',
                              padding: '8px 12px',
                              backgroundColor: '#F8FAFC',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              fontSize: '12px',
                              color: '#334155',
                              fontStyle: 'italic',
                            }}
                          >
                            "{step.message}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* 5. SUBMITTED APPLICATION DETAILS DRAWER */}
          <Card style={{ padding: isMobile ? '18px 16px' : '22px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '0 0 14px 0' }}>
              Submitted Application Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '12px', marginBottom: '2px' }}>Business Name:</span>
                <strong style={{ color: '#0F172A' }}>{application.businessName}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '12px', marginBottom: '2px' }}>Category:</span>
                <strong style={{ color: '#0F172A' }}>{application.businessCategory}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '12px', marginBottom: '2px' }}>Owner Contact:</span>
                <strong style={{ color: '#0F172A' }}>{application.ownerName}</strong> ({application.ownerEmail})
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '12px', marginBottom: '2px' }}>Location:</span>
                <strong style={{ color: '#0F172A' }}>{application.city}, {application.country}</strong>
              </div>
              {application.address && (
                <div style={{ gridColumn: isMobile ? '1' : '1 / span 2' }}>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '12px', marginBottom: '2px' }}>Registered Address:</span>
                  <span style={{ color: '#0F172A' }}>{application.address}</span>
                </div>
              )}
              {application.website && (
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '12px', marginBottom: '2px' }}>Website:</span>
                  <a href={application.website} target="_blank" rel="noopener noreferrer" style={{ color: '#4F6BFF', textDecoration: 'none' }}>
                    {application.website}
                  </a>
                </div>
              )}
            </div>

            {/* WITHDRAW APPLICATION OPTION (if not provisioned or cancelled) */}
            {application.status !== 'PROVISIONED' && application.status !== 'CANCELLED' && (
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCancelModalOpen(true)}
                  style={{ color: '#94A3B8' }}
                >
                  Withdraw Application
                </Button>
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* EMPTY / NOT FOUND PROMPT */
        <Card style={{ padding: '48px 24px', textAlign: 'center', borderRadius: '16px' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: '#EEF2FF',
              color: '#4F6BFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <FileText size={26} />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
            Track Your Reployty Application
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '440px', margin: '0 auto 20px auto', lineHeight: 1.5 }}>
            Enter your application reference number (#APP-XXXXX) and the email address used during onboarding submission above to view your verification status.
          </p>
          <Button
            variant="outline"
            onClick={() => { window.location.hash = 'get-started'; }}
          >
            Start New Business Registration
          </Button>
        </Card>
      )}

      {/* WITHDRAW / CANCEL APPLICATION MODAL */}
      {isCancelModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCancelModalOpen(false)}
          title="Withdraw Business Application"
        >
          <div style={{ display: 'grid', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
              Are you sure you want to withdraw your application for <strong>{application?.businessName}</strong>? This will stop further review by Super Admin.
            </p>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Reason for Withdrawal (optional)
              </label>
              <Input
                placeholder="e.g. Changed business name / post-poned opening"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <Button variant="outline" onClick={() => setIsCancelModalOpen(false)}>
                Keep Application
              </Button>
              <Button
                variant="danger"
                onClick={handleCancelApplication}
                disabled={isCancelling}
              >
                {isCancelling ? 'Withdrawing...' : 'Confirm Withdrawal'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
