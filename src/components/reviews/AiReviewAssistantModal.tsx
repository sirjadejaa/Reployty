import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Star,
  Globe,
  AlertCircle,
  Building2,
  Phone,
  User,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { ReviewFeedback, ReviewGeneration } from '../../types/reviews';
import { useToast } from '../../context/ToastContext';

interface AiReviewAssistantModalProps {
  review: ReviewFeedback;
  googleReviewUrl?: string | null;
  onClose: () => void;
  onReviewUpdated?: (updatedReview: ReviewFeedback) => void;
}

export const AiReviewAssistantModal: React.FC<AiReviewAssistantModalProps> = ({
  review,
  googleReviewUrl,
  onClose,
  onReviewUpdated,
}) => {
  const { addToast } = useToast();
  const [selectedLanguage, setSelectedLanguage] = useState<'ENGLISH' | 'HINGLISH' | 'HINDI'>('ENGLISH');
  const [generation, setGeneration] = useState<ReviewGeneration | null>(
    review.latestGeneration || (review.generations && review.generations[0]) || null
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [editedText, setEditedText] = useState<string>('');

  useEffect(() => {
    if (generation) {
      const activeText =
        generation.editedText ||
        (selectedLanguage === 'ENGLISH'
          ? generation.generatedEnglish
          : selectedLanguage === 'HINGLISH'
          ? generation.generatedHinglish
          : generation.generatedHindi);
      setEditedText(activeText || '');
    } else {
      // Auto-trigger initial draft generation if none exists yet
      handleGenerateDraft();
    }
  }, [generation?.id]);

  // When staff switches language tab, update editor text to that draft version
  const handleLanguageTabSwitch = (lang: 'ENGLISH' | 'HINGLISH' | 'HINDI') => {
    setSelectedLanguage(lang);
    if (generation) {
      const targetText =
        lang === 'ENGLISH'
          ? generation.generatedEnglish
          : lang === 'HINGLISH'
          ? generation.generatedHinglish
          : generation.generatedHindi;
      setEditedText(targetText || '');
    }
  };

  const handleGenerateDraft = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/business/reviews/${review.id}/generate-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to generate response draft');
      }

      const newGen: ReviewGeneration = await res.json();
      setGeneration(newGen);
      setSelectedLanguage('ENGLISH');
      setEditedText(newGen.generatedEnglish);
      addToast({ title: 'AI Drafts Ready', message: 'Generated in English, Hinglish, & Hindi', type: 'success' });

      if (onReviewUpdated) {
        onReviewUpdated({
          ...review,
          latestGeneration: newGen,
          generations: [newGen, ...(review.generations || [])],
        });
      }
    } catch (err: any) {
      console.error('Error generating AI drafts:', err);
      addToast({ title: 'Generation Failed', message: err.message || 'Could not generate draft', type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!generation) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/business/reviews/generations/${generation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedVersion: selectedLanguage,
          editedText,
          status: 'SELECTED',
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save approved draft');
      }

      const updatedGen: ReviewGeneration = await res.json();
      setGeneration(updatedGen);
      addToast({ title: 'Draft Saved', message: 'Approved response draft saved', type: 'success' });

      if (onReviewUpdated) {
        onReviewUpdated({
          ...review,
          latestGeneration: updatedGen,
        });
      }
    } catch (err: any) {
      console.error('Error saving draft:', err);
      addToast({ title: 'Save Failed', message: err.message || 'Failed to save draft', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!editedText.trim()) return;

    try {
      await navigator.clipboard.writeText(editedText);
      setCopied(true);
      addToast({
        title: 'Copied to Clipboard!',
        message: 'Paste it directly into Google Business Profile.',
        type: 'success',
      });

      // Transition generation status to COPIED_TO_GOOGLE
      if (generation && generation.status !== 'COPIED_TO_GOOGLE') {
        fetch(`/api/business/reviews/generations/${generation.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'COPIED_TO_GOOGLE',
            editedText,
            selectedVersion: selectedLanguage,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((updatedGen) => {
            if (updatedGen) {
              setGeneration(updatedGen);
              if (onReviewUpdated) {
                onReviewUpdated({
                  ...review,
                  latestGeneration: updatedGen,
                });
              }
            }
          })
          .catch((e) => console.error('Failed to update copy status:', e));
      }

      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      addToast({
        title: 'Copy Failed',
        message: 'Please manually select and copy the text',
        type: 'error',
      });
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '92vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FAFAFA',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                backgroundColor: '#EEF2FF',
                color: '#4F46E5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                AI Review Assistant
              </h2>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                Draft personalized, empathetic responses for Google & private feedback
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              cursor: 'pointer',
              color: '#64748B',
              borderRadius: '8px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Customer Review Summary Card */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: '#F8FAFC',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={18}
                      fill={s <= review.rating ? '#F59E0B' : 'transparent'}
                      color={s <= review.rating ? '#F59E0B' : '#CBD5E1'}
                    />
                  ))}
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor:
                      review.sentiment === 'POSITIVE'
                        ? '#ECFDF5'
                        : review.sentiment === 'NEUTRAL'
                        ? '#FEF3C7'
                        : '#FEF2F2',
                    color:
                      review.sentiment === 'POSITIVE'
                        ? '#059669'
                        : review.sentiment === 'NEUTRAL'
                        ? '#D97706'
                        : '#DC2626',
                  }}
                >
                  {review.sentiment || 'REVIEW'}
                </span>

                {review.isPublicGoogleReviewTarget ? (
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
                    Private Feedback
                  </span>
                )}
              </div>

              <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} />
                <span>{new Date(review.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={14} color="#64748B" />
                <strong>{review.customerName || 'Anonymous Customer'}</strong>
              </span>
              {review.customerPhone && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={14} color="#64748B" />
                  <span>{review.customerPhone}</span>
                </span>
              )}
              {review.branchName && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={14} color="#64748B" />
                  <span>{review.branchName}</span>
                </span>
              )}
            </div>

            <div
              style={{
                fontSize: '14px',
                color: '#0F172A',
                lineHeight: 1.5,
                backgroundColor: '#FFFFFF',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontStyle: review.feedbackText ? 'normal' : 'italic',
              }}
            >
              {review.feedbackText
                ? `"${review.feedbackText}"`
                : 'Customer submitted rating without additional written comments.'}
            </div>
          </div>

          {/* AI Draft Language Selector Tabs */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Globe size={16} color="#4F46E5" />
                <span>Select Response Language:</span>
              </div>

              <button
                onClick={handleGenerateDraft}
                disabled={isGenerating}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#4F46E5',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                }}
              >
                <Sparkles size={14} />
                <span>{isGenerating ? 'Regenerating...' : 'Regenerate Drafts'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { key: 'ENGLISH', label: 'English (Professional)' },
                { key: 'HINGLISH', label: 'Hinglish (Local Casual)' },
                { key: 'HINDI', label: 'Hindi (Formal हिन्दी)' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleLanguageTabSwitch(tab.key as any)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: selectedLanguage === tab.key ? 700 : 500,
                    backgroundColor: selectedLanguage === tab.key ? '#4F46E5' : '#F1F5F9',
                    color: selectedLanguage === tab.key ? '#FFFFFF' : '#475569',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editable Draft Textarea */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                Staff Review & Edit Draft:
              </label>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                You can personalize or edit this response before using it
              </span>
            </div>

            <textarea
              rows={7}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              placeholder="Response draft text..."
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                lineHeight: 1.6,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* IMPORTANT GOOGLE DISCLOSURE NOTICE */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: '#EFF6FF',
              borderRadius: '12px',
              border: '1px solid #BFDBFE',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <AlertCircle size={20} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', color: '#1E40AF', lineHeight: 1.5 }}>
              <strong>Notice on Google Business Reviews:</strong> Reployty generates AI-assisted drafts for your approval. Because Google does not allow direct third-party publishing without an approved Google Business Profile API connection, click <strong>"Copy Response"</strong> below and paste it directly into your Google profile review reply box.
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {generation?.status === 'COPIED_TO_GOOGLE' && (
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Check size={14} />
                <span>Copied for Google</span>
              </span>
            )}
            {generation?.status === 'SELECTED' && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#4F46E5' }}>
                Draft Approved
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleSaveDraft}
              disabled={isSaving || !editedText.trim()}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: '#FFFFFF',
                color: '#334155',
                border: '1px solid #CBD5E1',
                cursor: 'pointer',
              }}
            >
              {isSaving ? 'Saving...' : 'Approve Draft'}
            </button>

            <button
              onClick={handleCopyToClipboard}
              disabled={!editedText.trim()}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: copied ? '#059669' : '#0F172A',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)',
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Response'}</span>
            </button>

            {googleReviewUrl && (
              <button
                onClick={() => window.open(googleReviewUrl, '_blank', 'noopener,noreferrer')}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: '#EEF2FF',
                  color: '#4338CA',
                  border: '1px solid #C7D2FE',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Google Reviews</span>
                <ExternalLink size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
