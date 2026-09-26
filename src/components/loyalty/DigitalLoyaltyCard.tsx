import React from 'react';
import { Check, Gift, Sparkles, AlertCircle } from 'lucide-react';
import { getCategoryThemePreset } from '../../types/theme';

export interface DigitalLoyaltyCardProps {
  businessName: string;
  businessLogo?: string | null;
  businessCategory?: string;
  branchName?: string | null;
  programName?: string;
  programType?: 'STAMP' | 'POINTS';
  targetStamps?: number;
  currentStamps?: number;
  pointsBalance?: number;
  pointsConversionLabel?: string | null;
  rewardTitle?: string;
  customerName?: string;
  customerPhone?: string;
  cardStatus?: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED' | 'INACTIVE';
  primaryColor?: string;
  secondaryColor?: string;
  themePreset?: string;
  isPreview?: boolean;
  className?: string;
}

/**
 * Mask phone number for customer privacy while preserving end digits for counter staff identification.
 * E.g. "+15558889900" -> "+1 (555) •••-9900" or "+91 ••••• ••9900"
 */
function maskPhoneNumber(phone?: string): string {
  if (!phone) return '•••• ••••';
  const clean = phone.trim();
  if (clean.length <= 4) return clean;
  const lastFour = clean.slice(-4);
  const prefix = clean.startsWith('+') ? clean.slice(0, 3) : '';
  return `${prefix} •••• ••${lastFour}`;
}

export const DigitalLoyaltyCard: React.FC<DigitalLoyaltyCardProps> = ({
  businessName,
  businessLogo,
  businessCategory = 'cafe',
  branchName,
  programName = 'Digital Loyalty Pass',
  programType = 'STAMP',
  targetStamps = 10,
  currentStamps = 0,
  pointsBalance = 0,
  pointsConversionLabel,
  rewardTitle = 'Exclusive Regular Reward',
  customerName = 'Valued Customer',
  customerPhone,
  cardStatus = 'ACTIVE',
  primaryColor,
  secondaryColor,
  themePreset = 'CAFE',
  isPreview = false,
  className = '',
}) => {
  // Resolve theme preset tokens
  const presetConfig = getCategoryThemePreset(themePreset || businessCategory);
  const activePrimary = primaryColor || presetConfig.theme.primaryColor || '#4F6BFF';

  // Preset-specific luxury background gradients
  const presetGradients: Record<string, string> = {
    cafe: 'linear-gradient(145deg, #1C1917 0%, #292524 50%, #1C1917 100%)',
    restaurant: 'linear-gradient(145deg, #1A050A 0%, #2A0812 50%, #1A050A 100%)',
    salon: 'linear-gradient(145deg, #1C0A15 0%, #2E0B20 50%, #1C0A15 100%)',
    gym: 'linear-gradient(145deg, #061A19 0%, #0F2E2C 50%, #061A19 100%)',
    gamezone: 'linear-gradient(145deg, #12072B 0%, #210C4A 50%, #12072B 100%)',
    retail: 'linear-gradient(145deg, #09132B 0%, #0F2042 50%, #09132B 100%)',
    other: 'linear-gradient(145deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
  };

  const normalizedPresetKey = (themePreset || businessCategory).toLowerCase();
  const cardGradient = presetGradients[normalizedPresetKey] || presetGradients.other;

  const isStamp = programType === 'STAMP';
  const stampsRemaining = Math.max(0, targetStamps - currentStamps);
  const stampProgressPct = Math.min(100, Math.round((currentStamps / Math.max(1, targetStamps)) * 100));
  const isCardCompleted = cardStatus === 'COMPLETED' || (isStamp && currentStamps >= targetStamps);
  const isCardExpired = cardStatus === 'EXPIRED';
  const isCardInactive = cardStatus === 'INACTIVE' || cardStatus === 'CANCELLED';

  return (
    <div
      className={className}
      style={{
        borderRadius: '20px',
        background: cardGradient,
        color: '#FFFFFF',
        padding: '22px 20px',
        boxShadow: '0 16px 36px -8px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.12)',
        border: `1px solid ${activePrimary}35`,
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        maxWidth: isPreview ? '360px' : '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        transition: 'all 0.25s ease',
      }}
    >
      {/* Radial Theme Ambient Glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -45,
          right: -45,
          width: 150,
          height: 150,
          borderRadius: '50%',
          backgroundColor: activePrimary,
          opacity: 0.22,
          filter: 'blur(35px)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -40,
          left: -40,
          width: 120,
          height: 120,
          borderRadius: '50%',
          backgroundColor: secondaryColor || `${activePrimary}80`,
          opacity: 0.15,
          filter: 'blur(30px)',
          pointerEvents: 'none',
        }}
      />

      {/* Decorative Brand Accent Line */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${activePrimary}, ${activePrimary}80 70%, transparent 100%)`,
        }}
      />

      {/* CARD HEADER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          {/* Logo or Branded Initials Badge */}
          {businessLogo ? (
            <img
              src={businessLogo}
              alt={businessName}
              style={{
                width: 38,
                height: 38,
                borderRadius: '10px',
                objectFit: 'cover',
                border: '1.5px solid rgba(255, 255, 255, 0.25)',
                backgroundColor: '#FFFFFF',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '10px',
                backgroundColor: activePrimary,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: '-0.02em',
                boxShadow: `0 4px 12px ${activePrimary}50`,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                flexShrink: 0,
              }}
            >
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}

          <div style={{ minWidth: 0, flex: 1 }}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: '#FFFFFF',
                margin: 0,
                lineHeight: 1.25,
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {businessName}
            </h2>
            <div
              style={{
                fontSize: 11,
                color: 'rgba(255, 255, 255, 0.7)',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {branchName ? branchName : programName}
            </div>
          </div>
        </div>

        {/* Program Type Badge & Status */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span
            style={{
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(6px)',
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              border: '1px solid rgba(255, 255, 255, 0.18)',
            }}
          >
            {isStamp ? 'Stamp Pass' : 'Points Pass'}
          </span>

          {cardStatus !== 'ACTIVE' && (
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                backgroundColor: isCardCompleted
                  ? '#16A34A'
                  : isCardExpired
                  ? '#DC2626'
                  : '#D97706',
                color: '#FFFFFF',
              }}
            >
              {cardStatus}
            </span>
          )}
        </div>
      </div>

      {/* CARD STATUS WARNING BANNER (If inactive or expired) */}
      {(isCardExpired || isCardInactive) && (
        <div
          style={{
            backgroundColor: isCardExpired ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)',
            border: `1px solid ${isCardExpired ? '#EF4444' : '#F59E0B'}`,
            borderRadius: '10px',
            padding: '8px 12px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#FFFFFF',
          }}
        >
          <AlertCircle size={15} color={isCardExpired ? '#FCA5A5' : '#FDE68A'} style={{ flexShrink: 0 }} />
          <span>
            {isCardExpired
              ? 'This pass has expired. Please contact counter staff to renew.'
              : 'This pass is currently inactive.'}
          </span>
        </div>
      )}

      {/* MAIN BALANCE SECTION */}
      {isStamp ? (
        /* ================= STAMP PROGRAM BALANCE ================= */
        <div style={{ position: 'relative', zIndex: 1, marginBottom: 16 }}>
          {/* Stamps Big Number Callout */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Stamps Collected
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 32, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em' }}>
                  {currentStamps}
                </span>
                <span style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.7)', fontWeight: 700 }}>
                  / {targetStamps}
                </span>
              </div>
            </div>

            {/* Target Reward Pill */}
            <div
              style={{
                textAlign: 'right',
                maxWidth: '55%',
              }}
            >
              <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.65)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Target Reward
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#FDE047',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={rewardTitle}
              >
                {rewardTitle}
              </div>
            </div>
          </div>

          {/* Stamp Matrix Grid (Adapts to target count up to 10) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(5, targetStamps)}, 1fr)`,
              gap: 8,
              padding: '12px 10px',
              backgroundColor: 'rgba(0, 0, 0, 0.22)',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: 12,
            }}
          >
            {Array.from({ length: targetStamps }).map((_, i) => {
              const isFilled = i < currentStamps;
              const isGift = i === targetStamps - 1;

              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: '1',
                    borderRadius: '50%',
                    backgroundColor: isFilled ? activePrimary : 'rgba(255, 255, 255, 0.06)',
                    border: isFilled
                      ? '2px solid #FFFFFF'
                      : `1.5px dashed ${isGift ? '#FDE047' : 'rgba(255, 255, 255, 0.25)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#FFFFFF',
                    boxShadow: isFilled ? `0 2px 8px ${activePrimary}60` : 'none',
                    transition: 'all 0.2s ease',
                  }}
                  title={isGift ? `Reward: ${rewardTitle}` : `Stamp ${i + 1}`}
                >
                  {isFilled ? (
                    <Check size={14} strokeWidth={3} />
                  ) : isGift ? (
                    <Gift size={14} color="#FDE047" />
                  ) : (
                    <span style={{ opacity: 0.65 }}>{i + 1}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Visual Progress Bar */}
          <div>
            <div
              style={{
                width: '100%',
                height: 6,
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderRadius: '999px',
                overflow: 'hidden',
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: `${stampProgressPct}%`,
                  height: '100%',
                  backgroundColor: isCardCompleted ? '#22C55E' : activePrimary,
                  borderRadius: '999px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255, 255, 255, 0.75)' }}>
              <span>{stampProgressPct}% Completed</span>
              <span>
                {stampsRemaining === 0
                  ? '🎉 Ready to Redeem!'
                  : `${stampsRemaining} more stamp${stampsRemaining === 1 ? '' : 's'} needed`}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* ================= POINTS PROGRAM BALANCE ================= */
        <div style={{ position: 'relative', zIndex: 1, marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Available Points Balance
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em', color: '#FFFFFF' }}>
                {pointsBalance.toLocaleString()}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255, 255, 255, 0.75)' }}>
                pts
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(0, 0, 0, 0.22)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255, 255, 255, 0.85)' }}>
              <Sparkles size={14} color="#FDE047" />
              <span>{pointsConversionLabel || 'Earn 1 point per ₹10 spent'}</span>
            </div>

            <div style={{ color: '#FDE047', fontWeight: 700 }}>
              {rewardTitle}
            </div>
          </div>
        </div>
      )}

      {/* CARD FOOTER: PASSHOLDER IDENTITY */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.12)',
          paddingTop: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.65)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Passholder
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#FFFFFF',
              marginTop: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {customerName}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.65)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Member ID
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.9)',
              fontFamily: 'monospace',
              letterSpacing: '0.04em',
              marginTop: 1,
            }}
          >
            {maskPhoneNumber(customerPhone)}
          </div>
        </div>
      </div>
    </div>
  );
};
