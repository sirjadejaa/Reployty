import React from 'react';

export interface AdminStatCardProps {
  label: string;
  value: string | number;
  context?: string;
  contextType?: 'neutral' | 'success' | 'warning' | 'danger';
  icon?: React.ReactNode;
}

export const AdminStatCard: React.FC<AdminStatCardProps> = ({
  label,
  value,
  context,
  contextType = 'neutral',
  icon,
}) => {
  const contextColorMap = {
    neutral: '#64748B',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#64748B',
            letterSpacing: '-0.01em',
          }}
        >
          {label}
        </span>
        {icon && (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4F6BFF',
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div>
        <div
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#0F172A',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {context && (
          <div
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: contextColorMap[contextType],
              marginTop: '6px',
            }}
          >
            {context}
          </div>
        )}
      </div>
    </div>
  );
};
