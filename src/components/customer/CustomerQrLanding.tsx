import React from 'react';
import { Gift, Star, ChevronRight, Award, CheckCircle2 } from 'lucide-react';
import { PublicBusinessContext, PublicBranchContext } from '../../types/customer';

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

export interface CustomerQrLandingProps {
  business: PublicBusinessContext;
  branch?: PublicBranchContext | null;
  onNavigateToLoyalty: () => void;
  onNavigateToReview: () => void;
  customerPhone?: string | null;
  claimNotification?: string | null;
}

export const CustomerQrLanding: React.FC<CustomerQrLandingProps> = ({
  business,
  branch,
  onNavigateToLoyalty,
  onNavigateToReview,
  customerPhone,
  claimNotification,
}) => {
  const primaryColor = business.primaryColor || '#4F6BFF';
  const hasInstagram = Boolean(business.instagramUrl && business.instagramUrl.trim().length > 0);
  const hasFacebook = Boolean(business.facebookUrl && business.facebookUrl.trim().length > 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: '420px',
        margin: '0 auto',
        padding: '24px 16px 40px 16px',
        boxSizing: 'border-box',
        minHeight: '100%',
      }}
    >
      {/* Optional claim notification toast */}
      {claimNotification && (
        <div
          role="status"
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            color: '#15803D',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
            boxSizing: 'border-box',
          }}
        >
          <CheckCircle2 size={18} color="#16A34A" style={{ flexShrink: 0 }} />
          <span>{claimNotification}</span>
        </div>
      )}

      {/* Business Branding: Logo */}
      <div
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '20px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: '16px',
          flexShrink: 0,
        }}
      >
        {business.logo ? (
          <img
            src={business.logo}
            alt={`${business.name} logo`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#EEF2FF',
              color: primaryColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 800,
            }}
          >
            {business.name ? business.name.charAt(0).toUpperCase() : 'R'}
          </div>
        )}
      </div>

      {/* Business Name & Description */}
      <h1
        style={{
          fontSize: '22px',
          fontWeight: 800,
          color: '#111827',
          textAlign: 'center',
          margin: '0 0 6px 0',
          letterSpacing: '-0.02em',
          lineHeight: 1.25,
        }}
      >
        {business.name}
      </h1>

      {branch?.name && (
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#64748B',
            textAlign: 'center',
            marginBottom: '6px',
          }}
        >
          {branch.name}
        </div>
      )}

      {business.description ? (
        <p
          style={{
            fontSize: '13px',
            color: '#64748B',
            textAlign: 'center',
            margin: '0 0 24px 0',
            lineHeight: 1.45,
            maxWidth: '320px',
          }}
        >
          {business.description}
        </p>
      ) : (
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#4F6BFF',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '24px',
          }}
        >
          {business.category}
        </div>
      )}

      {/* Primary Actions Container */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          marginBottom: '28px',
        }}
      >
        {/* Action 1: Loyalty Card */}
        <button
          type="button"
          onClick={onNavigateToLoyalty}
          style={{
            width: '100%',
            padding: '18px 16px',
            borderRadius: '16px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
            outline: 'none',
            minHeight: '74px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = primaryColor;
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(79, 107, 255, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                backgroundColor: '#EEF2FF',
                color: '#4F6BFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Gift size={24} color="#4F6BFF" />
            </div>
            <div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#111827',
                  marginBottom: '3px',
                }}
              >
                Loyalty Card
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: '#64748B',
                }}
              >
                View your rewards & collect stamps
              </div>
            </div>
          </div>
          <ChevronRight size={20} color="#94A3B8" style={{ flexShrink: 0 }} />
        </button>

        {/* Action 2: ⭐ Leave a Review */}
        <button
          type="button"
          onClick={onNavigateToReview}
          style={{
            width: '100%',
            padding: '18px 16px',
            borderRadius: '16px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
            outline: 'none',
            minHeight: '74px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#F59E0B';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                backgroundColor: '#FFFBEB',
                color: '#F59E0B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Star size={24} fill="#F59E0B" color="#F59E0B" />
            </div>
            <div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#111827',
                  marginBottom: '3px',
                }}
              >
                Leave a Review
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: '#64748B',
                }}
              >
                Share your experience on Google
              </div>
            </div>
          </div>
          <ChevronRight size={20} color="#94A3B8" style={{ flexShrink: 0 }} />
        </button>
      </div>

      {/* Social Follow Options (Section 17: only if configured) */}
      {(hasInstagram || hasFacebook) && (
        <div
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '14px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            textAlign: 'center',
            boxSizing: 'border-box',
            marginBottom: '20px',
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
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#FFFFFF',
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
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#FFFFFF',
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

      {/* Customer Status Footer if signed in */}
      {customerPhone && (
        <div
          style={{
            fontSize: '12px',
            color: '#64748B',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Award size={14} color="#4F6BFF" />
          <span>Signed in as {customerPhone}</span>
        </div>
      )}
    </div>
  );
};
