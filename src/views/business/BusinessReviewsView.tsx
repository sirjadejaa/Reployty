import React, { useState, useEffect } from 'react';
import {
  Star,
  MessageSquare,
  Search,
  Filter,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Building2,
  Phone,
  User,
  Clock,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { ReviewFeedback, ReviewMetrics, ReviewSentiment } from '../../types/reviews';
import { AiReviewAssistantModal } from '../../components/reviews/AiReviewAssistantModal';
import { useTenant } from '../../context/TenantContext';

export const BusinessReviewsView: React.FC = () => {
  const { currentBusiness } = useTenant();
  const [reviews, setReviews] = useState<ReviewFeedback[]>([]);
  const [metrics, setMetrics] = useState<ReviewMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeSentiment, setActiveSentiment] = useState<'ALL' | ReviewSentiment>('ALL');
  const [activeType, setActiveType] = useState<'ALL' | 'GOOGLE' | 'PRIVATE'>('ALL');
  const [activeStatus, setActiveStatus] = useState<'ALL' | 'UNRESPONDED' | 'DRAFTED' | 'COPIED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedReview, setSelectedReview] = useState<ReviewFeedback | null>(null);

  useEffect(() => {
    fetchReviewsAndMetrics();
  }, [currentBusiness?.id, activeSentiment, activeType, activeStatus]);

  const fetchReviewsAndMetrics = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Metrics
      const metricsRes = await fetch('/api/business/reviews/metrics');
      if (metricsRes.ok) {
        const m: ReviewMetrics = await metricsRes.json();
        setMetrics(m);
      }

      // 2. Fetch Filtered Reviews
      const query = new URLSearchParams();
      if (activeSentiment !== 'ALL') query.set('sentiment', activeSentiment);
      if (activeType === 'GOOGLE') query.set('isPublicGoogleReviewTarget', 'true');
      if (activeType === 'PRIVATE') query.set('isPublicGoogleReviewTarget', 'false');
      if (activeStatus !== 'ALL') query.set('status', activeStatus);
      if (searchQuery.trim()) query.set('search', searchQuery.trim());

      const reviewsRes = await fetch(`/api/business/reviews?${query.toString()}`);
      if (reviewsRes.ok) {
        const data = await reviewsRes.json();
        setReviews(data.reviews || []);
      }
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReviewsAndMetrics();
  };

  const handleReviewUpdated = (updated: ReviewFeedback) => {
    setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (selectedReview?.id === updated.id) {
      setSelectedReview(updated);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      {/* Top Page Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Customer Reviews & Reputation Engine
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: '#EEF2FF',
                color: '#4F46E5',
              }}
            >
              Phase 13
            </span>
          </div>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>
            Filter positive regulars to Google Reviews while routing constructive feedback into private CRM
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchReviewsAndMetrics}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>

          {currentBusiness?.googleReviewUrl && (
            <button
              onClick={() => window.open(currentBusiness.googleReviewUrl!, '_blank')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '10px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span>Google Business Profile</span>
              <ExternalLink size={15} />
            </button>
          )}
        </div>
      </div>

      {/* KPI Reputation Aggregates */}
      {metrics && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '28px',
          }}
        >
          {/* Average Rating Card */}
          <div
            style={{
              padding: '20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
              Average Rating
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <span style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A' }}>
                {metrics.averageRating > 0 ? metrics.averageRating.toFixed(1) : '—'}
              </span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={16}
                    fill={s <= Math.round(metrics.averageRating) ? '#F59E0B' : 'transparent'}
                    color={s <= Math.round(metrics.averageRating) ? '#F59E0B' : '#CBD5E1'}
                  />
                ))}
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
              From {metrics.totalReviews} total rating{metrics.totalReviews === 1 ? '' : 's'}
            </div>
          </div>

          {/* Positive / Google Targets Card */}
          <div
            style={{
              padding: '20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#059669', textTransform: 'uppercase' }}>
              Google Review Targets (4-5★)
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
              {metrics.googleTargetCount}
            </div>
            <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px', fontWeight: 600 }}>
              {metrics.totalReviews > 0
                ? `${Math.round((metrics.googleTargetCount / metrics.totalReviews) * 100)}% satisfaction rate`
                : 'Redirected to Google CTA'}
            </div>
          </div>

          {/* Private Feedback / Needing Attention Card */}
          <div
            style={{
              padding: '20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', textTransform: 'uppercase' }}>
              Private Feedback (1-3★)
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
              {metrics.privateFeedbackCount}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
              Kept confidential in Business CRM
            </div>
          </div>

          {/* Response / AI Drafted Rate Card */}
          <div
            style={{
              padding: '20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#4F46E5', textTransform: 'uppercase' }}>
              AI Response Coverage
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
              {metrics.responseRate}%
            </div>
            <div style={{ fontSize: '12px', color: '#4F46E5', marginTop: '4px', fontWeight: 600 }}>
              {metrics.responseCount} of {metrics.totalReviews} reviews addressed
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '16px',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          {/* Sentiment Filter Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'All Reviews' },
              { id: 'POSITIVE', label: 'Positive (4-5★)' },
              { id: 'NEUTRAL', label: 'Neutral (3★)' },
              { id: 'NEGATIVE', label: 'Critical (1-2★)' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSentiment(tab.id as any)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: activeSentiment === tab.id ? 700 : 500,
                  backgroundColor: activeSentiment === tab.id ? '#0F172A' : '#F1F5F9',
                  color: activeSentiment === tab.id ? '#FFFFFF' : '#475569',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                color="#94A3B8"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Search customer, phone, comment..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '8px 14px 8px 36px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '13px',
                  width: '260px',
                  outline: 'none',
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                backgroundColor: '#F1F5F9',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                border: '1px solid #E2E8F0',
                cursor: 'pointer',
              }}
            >
              Search
            </button>
          </form>
        </div>

        {/* Secondary Filter Row: Source & Response Status */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', paddingTop: '10px', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748B' }}>
            <Filter size={14} />
            <span>Target:</span>
            <select
              value={activeType}
              onChange={(e) => setActiveType(e.target.value as any)}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#0F172A',
                outline: 'none',
              }}
            >
              <option value="ALL">All Targets</option>
              <option value="GOOGLE">Public Google Review Targets</option>
              <option value="PRIVATE">Private Feedback (CRM)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748B' }}>
            <span>Response Status:</span>
            <select
              value={activeStatus}
              onChange={(e) => setActiveStatus(e.target.value as any)}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#0F172A',
                outline: 'none',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="UNRESPONDED">Needs AI Draft</option>
              <option value="DRAFTED">Draft Generated</option>
              <option value="COPIED">Copied for Google</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reviews List */}
      {isLoading ? (
        <div
          style={{
            padding: '48px',
            textAlign: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            color: '#64748B',
            fontSize: '14px',
          }}
        >
          Loading customer reviews...
        </div>
      ) : reviews.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#F1F5F9',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
            }}
          >
            <MessageSquare size={24} />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0' }}>
            No reviews match the selected filters
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
            Customer ratings submitted via the PWA or QR counter stands will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reviews.map((r) => {
            const hasDraft = !!r.latestGeneration;
            const isCopied = r.latestGeneration?.status === 'COPIED_TO_GOOGLE';

            return (
              <div
                key={r.id}
                style={{
                  padding: '20px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Row Header */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Stars */}
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={16}
                          fill={s <= r.rating ? '#F59E0B' : 'transparent'}
                          color={s <= r.rating ? '#F59E0B' : '#CBD5E1'}
                        />
                      ))}
                    </div>

                    {/* Sentiment Badge */}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor:
                          r.sentiment === 'POSITIVE'
                            ? '#ECFDF5'
                            : r.sentiment === 'NEUTRAL'
                            ? '#FEF3C7'
                            : '#FEF2F2',
                        color:
                          r.sentiment === 'POSITIVE'
                            ? '#059669'
                            : r.sentiment === 'NEUTRAL'
                            ? '#D97706'
                            : '#DC2626',
                      }}
                    >
                      {r.sentiment || 'REVIEW'}
                    </span>

                    {/* Target Route Badge */}
                    {r.isPublicGoogleReviewTarget ? (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#EEF2FF',
                          color: '#4338CA',
                        }}
                      >
                        Google Review Target
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#F1F5F9',
                          color: '#475569',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <ShieldCheck size={12} />
                        Private CRM Feedback
                      </span>
                    )}

                    {/* AI Response Status Badge */}
                    {isCopied ? (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#ECFDF5',
                          color: '#059669',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckCircle2 size={12} />
                        Copied to Google
                      </span>
                    ) : hasDraft ? (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#F5F3FF',
                          color: '#7C3AED',
                        }}
                      >
                        AI Draft Ready
                      </span>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B' }}>
                    <Clock size={13} />
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {/* Customer Identity Bar */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px', color: '#475569' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} color="#64748B" />
                    <strong>{r.customerName || 'Anonymous Customer'}</strong>
                  </span>
                  {r.customerPhone && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Phone size={14} color="#64748B" />
                      <span>{r.customerPhone}</span>
                    </span>
                  )}
                  {r.branchName && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Building2 size={14} color="#64748B" />
                      <span>{r.branchName}</span>
                    </span>
                  )}
                </div>

                {/* Feedback Content */}
                <div
                  style={{
                    fontSize: '14px',
                    color: '#0F172A',
                    lineHeight: 1.5,
                    backgroundColor: '#F8FAFC',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    fontStyle: r.feedbackText ? 'normal' : 'italic',
                  }}
                >
                  {r.feedbackText ? `"${r.feedbackText}"` : 'Customer rated visit without comment'}
                </div>

                {/* Card Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    onClick={() => setSelectedReview(r)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      backgroundColor: '#4F46E5',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(79, 70, 229, 0.2)',
                    }}
                  >
                    <Sparkles size={15} />
                    <span>{hasDraft ? 'View / Edit AI Response' : 'AI Review Assistant'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Review Assistant Modal */}
      {selectedReview && (
        <AiReviewAssistantModal
          review={selectedReview}
          googleReviewUrl={currentBusiness?.googleReviewUrl}
          onClose={() => setSelectedReview(null)}
          onReviewUpdated={handleReviewUpdated}
        />
      )}
    </div>
  );
};
