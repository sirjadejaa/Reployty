import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { StarRating } from './StarRating';
import { Skeleton } from '../ui/Skeleton';
import { PublicBusinessContext } from '../../types/customer';
import { getCustomerSessionForBusiness } from '../../context/CustomerAuthContext';

const InstagramIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#E1306C' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const FacebookIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#1877F2' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

export interface CustomerReviewFlowProps {
  business: PublicBusinessContext;
  qrCodeToken?: string;
  onBack: () => void;
}

type ReviewLanguage = 'ENGLISH' | 'HINDI' | 'HINGLISH';

export const CustomerReviewFlow: React.FC<CustomerReviewFlowProps> = ({
  business,
  qrCodeToken,
  onBack,
}) => {
  const [rating, setRating] = useState<number>(0);
  const [language, setLanguage] = useState<ReviewLanguage>('ENGLISH');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(0);
  const [editableReview, setEditableReview] = useState<string>('');
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Copy / Google redirect states
  const [copied, setCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [googleUrlMissing, setGoogleUrlMissing] = useState<boolean>(false);
  const [googleOpened, setGoogleOpened] = useState<boolean>(false);
  const [serverGoogleUrl, setServerGoogleUrl] = useState<string | null>(null);

  const primaryColor = business.primaryColor || '#4F6BFF';
  const hasInstagram = Boolean(business.instagramUrl && business.instagramUrl.trim().length > 0);
  const hasFacebook = Boolean(business.facebookUrl && business.facebookUrl.trim().length > 0);

  // Track active request to prevent delayed or out-of-order AI responses from replacing newly selected business review
  const activeRequestRef = useRef<{
    id: number;
    businessId: string;
    qrToken?: string;
  }>({
    id: 0,
    businessId: business.id,
    qrToken: qrCodeToken,
  });

  // Reset review state whenever the target business or QR token changes
  useEffect(() => {
    activeRequestRef.current = {
      id: activeRequestRef.current.id + 1,
      businessId: business.id,
      qrToken: qrCodeToken,
    };
    setRating(0);
    setLanguage('ENGLISH');
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
    setEditableReview('');
    setIsLoadingSuggestions(false);
    setGenerationError(null);
    setCopied(false);
    setCopyError(null);
    setGoogleUrlMissing(false);
    setGoogleOpened(false);
    setServerGoogleUrl(null);
  }, [business.id, qrCodeToken]);

  // Trigger server-side AI suggestions whenever rating or language changes
  useEffect(() => {
    if (rating >= 1 && rating <= 5) {
      fetchSuggestions(rating, language);
    }
  }, [rating, language]);

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const sessionToken = business?.id ? getCustomerSessionForBusiness(business.id) : null;
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return headers;
  };

  const emitEvent = async (eventName: string, metadata?: Record<string, any>) => {
    try {
      await fetch('/api/customer/reviews/events', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          event: eventName,
          qrCode: qrCodeToken,
          metadata: {
            rating,
            language,
            businessId: business.id,
            ...(metadata || {}),
          },
        }),
      });
    } catch {
      // Non-blocking event reporting
    }
  };

  const fetchSuggestions = async (targetRating: number, targetLang: ReviewLanguage) => {
    const currentReq = {
      id: activeRequestRef.current.id + 1,
      businessId: business.id,
      qrToken: qrCodeToken,
    };
    activeRequestRef.current = currentReq;

    setIsLoadingSuggestions(true);
    setGenerationError(null);
    setCopyError(null);
    setGoogleUrlMissing(false);
    setCopied(false);
    setGoogleOpened(false);

    emitEvent('CUSTOMER_REVIEW_RATED', { rating: targetRating, language: targetLang });

    try {
      const res = await fetch('/api/customer/reviews/suggest', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          rating: targetRating,
          language: targetLang,
          qrCode: qrCodeToken,
        }),
      });

      // Discard response if business or active request has changed
      if (
        activeRequestRef.current.id !== currentReq.id ||
        activeRequestRef.current.businessId !== business.id ||
        activeRequestRef.current.qrToken !== qrCodeToken
      ) {
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate review suggestions');
      }

      const data = await res.json();

      // Check again after parsing body
      if (
        activeRequestRef.current.id !== currentReq.id ||
        activeRequestRef.current.businessId !== business.id ||
        activeRequestRef.current.qrToken !== qrCodeToken
      ) {
        return;
      }

      if (data.googleReviewUrl) {
        setServerGoogleUrl(data.googleReviewUrl);
      }

      const options: string[] = Array.isArray(data.suggestions) && data.suggestions.length > 0
        ? data.suggestions
        : Array.isArray(data.options) && data.options.length > 0
        ? data.options
        : [];

      if (options.length === 0) {
        throw new Error('No suggestions returned from server');
      }

      setSuggestions(options);
      setSelectedSuggestionIndex(0);
      setEditableReview(options[0]);
      emitEvent('CUSTOMER_REVIEW_GENERATED', { count: options.length });
    } catch (err: any) {
      if (
        activeRequestRef.current.id === currentReq.id &&
        activeRequestRef.current.businessId === business.id
      ) {
        setGenerationError(err.message || 'We could not create review suggestions right now. You can try again.');
      }
    } finally {
      if (
        activeRequestRef.current.id === currentReq.id &&
        activeRequestRef.current.businessId === business.id
      ) {
        setIsLoadingSuggestions(false);
      }
    }
  };

  const handleSelectSuggestion = (index: number) => {
    setSelectedSuggestionIndex(index);
    if (suggestions[index]) {
      setEditableReview(suggestions[index]);
    }
    setCopied(false);
    setCopyError(null);
    emitEvent('CUSTOMER_REVIEW_SELECTED', { selectedIndex: index });
  };

  const handleCopyAndOpenGoogle = async () => {
    setCopyError(null);
    setGoogleUrlMissing(false);

    if (!editableReview.trim()) {
      return;
    }

    // Step 1: Copy to clipboard
    let copySuccessful = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(editableReview.trim());
        copySuccessful = true;
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = editableReview.trim();
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copySuccessful = document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch {
      copySuccessful = false;
    }

    if (copySuccessful) {
      setCopied(true);
      emitEvent('CUSTOMER_REVIEW_COPIED', { textLength: editableReview.length });
    } else {
      setCopyError("We couldn't copy the review automatically. Please copy the text manually.");
    }

    // Step 2: Open verified Google review URL (Section 16: do NOT open fallback URL)
    const reviewUrl = (business.googleReviewUrl || serverGoogleUrl)?.trim();
    if (reviewUrl && reviewUrl.length > 0) {
      setGoogleOpened(true);
      emitEvent('GOOGLE_REVIEW_OPENED', { googleReviewUrl: reviewUrl });
      window.open(reviewUrl, '_blank', 'noopener,noreferrer');
    } else {
      setGoogleUrlMissing(true);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '440px',
        margin: '0 auto',
        padding: '16px 16px 40px 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Navigation Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={`Back to ${business.name}`}
          style={{
            padding: '8px',
            borderRadius: '10px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            color: '#111827',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '44px',
            minHeight: '44px',
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 800,
              color: '#111827',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Leave a Review
          </h1>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {business.name}
          </div>
        </div>
      </div>

      {/* Step 1: Star Rating Selection */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '22px 18px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
          marginBottom: '16px',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontSize: '17px',
            fontWeight: 800,
            color: '#111827',
            margin: '0 0 4px 0',
          }}
        >
          How was your experience?
        </h2>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0' }}>
          Tap the stars below to rate your visit
        </p>

        <StarRating
          id="customer-review-stars"
          value={rating}
          onChange={(newRating) => setRating(newRating)}
          size={40}
        />
      </div>

      {/* Progressive Flow: Only show Language and AI Options once rating is chosen */}
      {rating > 0 && (
        <>
          {/* Step 2: Language Selection */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              padding: '18px 16px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#111827',
                marginBottom: '10px',
                textAlign: 'center',
              }}
            >
              Choose your language
            </div>

            <div
              role="group"
              aria-label="Select review language"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
              }}
            >
              {(
                [
                  { code: 'ENGLISH', label: 'English' },
                  { code: 'HINDI', label: 'हिन्दी' },
                  { code: 'HINGLISH', label: 'Hinglish' },
                ] as const
              ).map((lang) => {
                const isSelected = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setLanguage(lang.code)}
                    aria-pressed={isSelected}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: isSelected ? 700 : 500,
                      backgroundColor: isSelected ? primaryColor : '#F8FAFC',
                      color: isSelected ? '#FFFFFF' : '#111827',
                      border: `1px solid ${isSelected ? primaryColor : '#E2E8F0'}`,
                      cursor: 'pointer',
                      minHeight: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      outline: 'none',
                    }}
                  >
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Loading States */}
          {isLoadingSuggestions && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '24px 18px',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#EEF2FF',
                  color: primaryColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px auto',
                }}
              >
                <Sparkles size={22} color={primaryColor} />
              </div>
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#111827',
                  margin: '0 0 6px 0',
                }}
              >
                Creating a few review options...
              </h3>
              <p
                style={{
                  fontSize: '12px',
                  color: '#64748B',
                  margin: '0 0 16px 0',
                }}
              >
                Generating suggestions tailored for {business.name}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Skeleton height="56px" radius="10px" />
                <Skeleton height="56px" radius="10px" />
                <Skeleton height="56px" radius="10px" />
              </div>
            </div>
          )}

          {/* Error State */}
          {!isLoadingSuggestions && generationError && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                borderRadius: '14px',
                border: '1px solid #FECACA',
                padding: '18px 16px',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              <AlertCircle size={24} color="#DC2626" style={{ margin: '0 auto 8px auto' }} />
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#991B1B',
                  marginBottom: '12px',
                }}
              >
                {generationError}
              </div>
              <button
                type="button"
                onClick={() => fetchSuggestions(rating, language)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                <RefreshCw size={16} />
                <span>Try Again</span>
              </button>
            </div>
          )}

          {/* Step 4: AI Review Options (3-5 suggestions) */}
          {!isLoadingSuggestions && !generationError && suggestions.length > 0 && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '20px 16px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                marginBottom: '16px',
              }}
            >
              <div style={{ marginBottom: '14px' }}>
                <h3
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#111827',
                    margin: '0 0 4px 0',
                  }}
                >
                  Choose a review
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
                  Select the option that matches your experience:
                </p>
              </div>

              <div
                role="radiogroup"
                aria-label="Choose a review suggestion"
                style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                {suggestions.map((text, idx) => {
                  const isSelected = selectedSuggestionIndex === idx;
                  return (
                    <div
                      key={idx}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onClick={() => handleSelectSuggestion(idx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectSuggestion(idx);
                        }
                      }}
                      style={{
                        padding: '14px 14px',
                        borderRadius: '12px',
                        backgroundColor: isSelected ? '#EEF2FF' : '#F8FAFC',
                        border: `1.5px solid ${isSelected ? primaryColor : '#E2E8F0'}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        outline: 'none',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                        }}
                      >
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: `2px solid ${isSelected ? primaryColor : '#94A3B8'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: '2px',
                            flexShrink: 0,
                          }}
                        >
                          {isSelected && (
                            <div
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                backgroundColor: primaryColor,
                              }}
                            />
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '13px',
                            color: isSelected ? '#111827' : '#334155',
                            lineHeight: 1.5,
                            fontWeight: isSelected ? 500 : 400,
                          }}
                        >
                          {text}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5: Editable Review Textarea */}
          {!isLoadingSuggestions && !generationError && editableReview && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '20px 16px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                marginBottom: '16px',
              }}
            >
              <div style={{ marginBottom: '10px' }}>
                <label
                  htmlFor="customer-review-textarea"
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#111827',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Your review
                </label>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Edit or personalize the text before copying:
                </span>
              </div>

              <textarea
                id="customer-review-textarea"
                rows={4}
                value={editableReview}
                onChange={(e) => {
                  setEditableReview(e.target.value);
                  setCopied(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  boxSizing: 'border-box',
                  outline: 'none',
                  fontFamily: 'inherit',
                  color: '#111827',
                  resize: 'vertical',
                  marginBottom: '14px',
                }}
              />

              {/* Step 6: Copy Review Button */}
              <button
                type="button"
                onClick={handleCopyAndOpenGoogle}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: '12px',
                  backgroundColor: primaryColor,
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '15px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minHeight: '48px',
                  boxShadow: '0 4px 12px rgba(79, 107, 255, 0.24)',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                <span>{copied ? 'Copied Review!' : 'Copy Review'}</span>
              </button>

              {/* Feedback status messages */}
              {copied && !googleUrlMissing && (
                <div
                  role="status"
                  style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    color: '#15803D',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={16} color="#16A34A" style={{ flexShrink: 0 }} />
                  <span>Review copied to clipboard! Paste it on Google to share.</span>
                </div>
              )}

              {/* Google URL Missing Error (Section 16 requirement) */}
              {googleUrlMissing && (
                <div
                  role="alert"
                  style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    color: '#92400E',
                    fontSize: '13px',
                    lineHeight: 1.45,
                  }}
                >
                  <strong>Google reviews aren't configured yet.</strong>
                  <div style={{ marginTop: '4px' }}>
                    Please ask the business to complete their review setup.
                  </div>
                </div>
              )}

              {/* Clipboard failure error (Section 20 requirement) */}
              {copyError && (
                <div
                  role="alert"
                  style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    fontSize: '13px',
                  }}
                >
                  {copyError}
                </div>
              )}

              {/* Re-open Google Link if popup was blocked */}
              {googleOpened && (business.googleReviewUrl || serverGoogleUrl) && (
                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                  <a
                    href={(business.googleReviewUrl || serverGoogleUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '12px',
                      color: primaryColor,
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>Click here if Google Review page didn't open</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Section 17: Social Follow Options */}
          {(hasInstagram || hasFacebook) && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '16px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#64748B',
                  marginBottom: '10px',
                }}
              >
                Follow us
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                }}
              >
                {hasInstagram && (
                  <a
                    href={business.instagramUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => emitEvent('INSTAGRAM_OPENED')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 16px',
                      borderRadius: '10px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      color: '#111827',
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      minHeight: '44px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <InstagramIcon size={16} color="#E1306C" />
                    <span>Instagram</span>
                  </a>
                )}

                {hasFacebook && (
                  <a
                    href={business.facebookUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => emitEvent('FACEBOOK_OPENED')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 16px',
                      borderRadius: '10px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      color: '#111827',
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      minHeight: '44px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <FacebookIcon size={16} color="#1877F2" />
                    <span>Facebook</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
