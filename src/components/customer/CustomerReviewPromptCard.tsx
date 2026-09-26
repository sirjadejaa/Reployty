import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, ExternalLink, CheckCircle2, ShieldCheck, Heart } from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { CustomerReviewState } from '../../types/reviews';

const FEEDBACK_CATEGORIES = [
  'Service Quality',
  'Food & Drinks',
  'Wait Time',
  'Staff Behavior',
  'Cleanliness',
  'Pricing / Value',
  'Other',
];

export const CustomerReviewPromptCard: React.FC = () => {
  const { business, branch } = useCustomerAuth();
  const [reviewState, setReviewState] = useState<CustomerReviewState | null>(null);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Service Quality');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedResult, setSubmittedResult] = useState<{
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    isPublicGoogleReviewTarget: boolean;
    googleReviewUrl: string | null;
  } | null>(null);

  const primaryColor = business?.primaryColor || '#4F6BFF';
  const businessName = business?.name || 'Local Business';

  useEffect(() => {
    fetchReviewStatus();
  }, []);

  const fetchReviewStatus = async () => {
    try {
      const res = await fetch('/api/customer/reviews/status');
      if (res.ok) {
        const data: CustomerReviewState = await res.json();
        setReviewState(data);
        if (data.latestReview) {
          setSelectedRating(data.latestReview.rating);
          setFeedbackText(data.latestReview.feedbackText || '');
        }
      }
    } catch (err) {
      console.error('Failed to load customer review status:', err);
    }
  };

  const handleStarClick = (rating: number) => {
    setSelectedRating(rating);
    // Reset submission state if customer is updating their rating
    setSubmittedResult(null);
  };

  const handleSubmit = async (isGoogleCtaClick: boolean = false) => {
    if (selectedRating === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/customer/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: selectedRating,
          feedbackText: feedbackText.trim() || undefined,
          category: selectedRating <= 3 ? selectedCategory : undefined,
          branchId: branch?.id || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to submit review');
      }

      const data = await res.json();
      setSubmittedResult({
        sentiment: data.sentiment,
        isPublicGoogleReviewTarget: data.isPublicGoogleReviewTarget,
        googleReviewUrl: data.googleReviewUrl,
      });

      // If user clicked the Google Review CTA on positive review
      if (isGoogleCtaClick && data.googleReviewUrl) {
        window.open(data.googleReviewUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Failed to submit review:', err);
      alert('Could not submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Success confirmation screen after submission
  if (submittedResult) {
    if (submittedResult.sentiment === 'POSITIVE') {
      return (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '24px 20px',
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: '#ECFDF5',
              color: '#10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
            }}
          >
            <Heart size={28} fill="#10B981" />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
            Thank You for the Love!
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, margin: '0 0 16px 0' }}>
            Your support makes a huge difference for <strong>{businessName}</strong>.
          </p>

          {submittedResult.googleReviewUrl ? (
            <button
              onClick={() => window.open(submittedResult.googleReviewUrl!, '_blank', 'noopener,noreferrer')}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: '#1E293B',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
              }}
            >
              <span>View Google Review Page</span>
              <ExternalLink size={16} />
            </button>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#059669', fontWeight: 600 }}>
              <CheckCircle2 size={16} />
              <span>Review Recorded Successfully</span>
            </div>
          )}
        </div>
      );
    }

    // Neutral / Negative private feedback submission acknowledgement
    return (
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '24px 20px',
          textAlign: 'center',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            backgroundColor: '#F1F5F9',
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
          }}
        >
          <ShieldCheck size={28} />
        </div>
        <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
          Private Feedback Received
        </h3>
        <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, margin: '0 0 16px 0' }}>
          Thank you for being candid. Your feedback has been sent directly to the management team at{' '}
          <strong>{businessName}</strong> so we can make this right.
        </p>
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#F8FAFC',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            fontSize: '12px',
            color: '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <CheckCircle2 size={15} color="#10B981" />
          <span>Kept strictly confidential with store manager</span>
        </div>
      </div>
    );
  }

  // 2. Interactive Review Request & Star Selection
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: primaryColor,
            marginBottom: '4px',
          }}
        >
          How Was Your Visit?
        </div>
        <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
          Rate your experience at {businessName}
        </h3>
        <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
          Your honest rating helps us serve you better every day
        </p>
      </div>

      {/* 5 Interactive Stars */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '10px',
          margin: '16px 0',
        }}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= (hoverRating || selectedRating);
          return (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => handleStarClick(star)}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                transition: 'transform 0.15s ease',
                transform: isFilled ? 'scale(1.15)' : 'scale(1)',
              }}
              title={`Rate ${star} star${star > 1 ? 's' : ''}`}
            >
              <Star
                size={34}
                fill={isFilled ? '#F59E0B' : 'transparent'}
                color={isFilled ? '#F59E0B' : '#CBD5E1'}
                strokeWidth={isFilled ? 1.5 : 2}
              />
            </button>
          );
        })}
      </div>

      {/* Rating Label Helper */}
      {selectedRating > 0 && (
        <div
          style={{
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 700,
            marginBottom: '16px',
            color: selectedRating >= 4 ? '#059669' : selectedRating === 3 ? '#D97706' : '#DC2626',
          }}
        >
          {selectedRating === 5 && '★★★★★ Excellent Experience!'}
          {selectedRating === 4 && '★★★★☆ Great Visit!'}
          {selectedRating === 3 && '★★★☆☆ Average Experience'}
          {selectedRating === 2 && '★★☆☆☆ Below Expectations'}
          {selectedRating === 1 && '★☆☆☆☆ Disappointing'}
        </div>
      )}

      {/* BRANCH A: POSITIVE (4-5 STARS) -> Google Review CTA */}
      {selectedRating >= 4 && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#F0FDF4',
            borderRadius: '12px',
            border: '1px solid #BBF7D0',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '18px' }}>🎉</span>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#166534' }}>
              We're thrilled you loved your visit!
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#15803D', lineHeight: 1.5, margin: '0 0 14px 0' }}>
            Would you take 10 seconds to share your praise on Google? It genuinely helps our team and helps other regulars find us!
          </p>

          {/* Optional Compliment Note */}
          <input
            type="text"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="What made your visit great? (Optional)"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #86EFAC',
              backgroundColor: '#FFFFFF',
              fontSize: '13px',
              marginBottom: '12px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />

          {reviewState?.googleReviewUrl ? (
            <button
              onClick={() => handleSubmit(true)}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: '#1E293B',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
              }}
            >
              <span>{isSubmitting ? 'Opening...' : 'Share on Google Reviews ⭐'}</span>
              <ExternalLink size={16} />
            </button>
          ) : (
            <button
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: '#166534',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          )}
        </div>
      )}

      {/* BRANCH B: NEUTRAL / NEGATIVE (1-3 STARS) -> Private Feedback (CRM) */}
      {selectedRating > 0 && selectedRating <= 3 && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#FFFBEB',
            borderRadius: '12px',
            border: '1px solid #FDE68A',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <MessageSquare size={18} color="#B45309" />
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#92400E' }}>
              Help us make things right privately
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#B45309', lineHeight: 1.5, margin: '0 0 12px 0' }}>
            We sincerely apologize that your experience was not 5-star. Tell us what went wrong so store management can investigate and improve.
          </p>

          {/* Category Chips */}
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#78350F', marginBottom: '6px' }}>
            What area needed improvement?
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {FEEDBACK_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '16px',
                  fontSize: '11px',
                  fontWeight: selectedCategory === cat ? 700 : 500,
                  backgroundColor: selectedCategory === cat ? '#92400E' : '#FFFFFF',
                  color: selectedCategory === cat ? '#FFFFFF' : '#78350F',
                  border: '1px solid #FCD34D',
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Feedback Textarea */}
          <textarea
            rows={3}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Share details of what happened... (kept strictly confidential)"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #FCD34D',
              backgroundColor: '#FFFFFF',
              fontSize: '13px',
              lineHeight: 1.4,
              marginBottom: '8px',
              boxSizing: 'border-box',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: '#92400E',
              marginBottom: '14px',
            }}
          >
            <ShieldCheck size={14} />
            <span>This feedback goes directly to business leadership — not posted online.</span>
          </div>

          <button
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: '#92400E',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '14px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(146, 64, 14, 0.2)',
            }}
          >
            {isSubmitting ? 'Sending...' : 'Send Private Feedback to Management'}
          </button>
        </div>
      )}
    </div>
  );
};
