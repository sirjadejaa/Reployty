import React from 'react';
import { Award, Check, Gift, Sparkles } from 'lucide-react';

export interface LoyaltyCardProps {
  businessName: string;
  category: string;
  customerName: string;
  stampsCollected: number;
  totalStampsNeeded: number;
  rewardTitle: string;
  tier?: string;
  pointsBalance?: number;
  className?: string;
}

export const LoyaltyCard: React.FC<LoyaltyCardProps> = ({
  businessName,
  category,
  customerName,
  stampsCollected,
  totalStampsNeeded = 10,
  rewardTitle = 'Free Specialty Item',
  tier = 'Regular',
  pointsBalance = 240,
  className = '',
}) => {
  const stampsRemaining = Math.max(0, totalStampsNeeded - stampsCollected);

  return (
    <div
      className={`card ${className}`}
      style={{
        borderRadius: 'var(--theme-radius, 14px)',
        border: '1px solid var(--theme-card-border, var(--color-border))',
        backgroundColor: 'var(--theme-card-bg, #FFFFFF)',
        padding: 'var(--space-5)',
        boxShadow: 'var(--shadow-card-hover)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative top theme band */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          backgroundColor: 'var(--theme-primary, var(--color-primary))',
        }}
      />

      {/* Card Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--theme-primary, var(--color-primary))',
              display: 'block',
              marginBottom: 2,
            }}
          >
            {category.toUpperCase()} LOYALTY
          </span>
          <h3
            style={{
              fontSize: 'var(--font-size-xl)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {businessName}
          </h3>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
            Passholder: {customerName}
          </p>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--theme-primary-subtle, var(--color-primary-subtle))',
            color: 'var(--theme-primary, var(--color-primary))',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          <Award size={13} />
          <span>{tier}</span>
        </div>
      </div>

      {/* Stamp Collection Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          backgroundColor: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        {Array.from({ length: totalStampsNeeded }).map((_, index) => {
          const isCollected = index < stampsCollected;
          const isRewardStamp = index === totalStampsNeeded - 1;

          return (
            <div
              key={index}
              style={{
                aspectRatio: '1',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isCollected
                  ? 'var(--theme-primary, var(--color-primary))'
                  : 'var(--color-surface)',
                color: isCollected ? '#FFFFFF' : 'var(--color-text-muted)',
                border: isCollected
                  ? 'none'
                  : isRewardStamp
                  ? '2px dashed var(--theme-primary, var(--color-primary))'
                  : '1px solid var(--color-border)',
                boxShadow: isCollected ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all var(--transition-fast)',
              }}
              title={
                isRewardStamp
                  ? `Reward: ${rewardTitle}`
                  : `Stamp ${index + 1}`
              }
            >
              {isCollected ? (
                <Check size={16} strokeWidth={3} />
              ) : isRewardStamp ? (
                <Gift size={16} color="var(--theme-primary, var(--color-primary))" />
              ) : (
                <span style={{ fontSize: '11px', fontWeight: 600 }}>{index + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress & Reward Callout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--theme-primary-subtle, var(--color-primary-subtle))',
          color: 'var(--color-text-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Sparkles size={16} color="var(--theme-primary, var(--color-primary))" />
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
            {stampsRemaining === 0 ? (
              <span style={{ color: 'var(--color-success)' }}>Reward Unlocked: {rewardTitle}!</span>
            ) : (
              `${stampsRemaining} stamp${stampsRemaining > 1 ? 's' : ''} until ${rewardTitle}`
            )}
          </span>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block' }}>
            Balance
          </span>
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>
            {pointsBalance} pts
          </span>
        </div>
      </div>
    </div>
  );
};
