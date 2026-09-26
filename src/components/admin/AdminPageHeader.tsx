import React from 'react';
import { ArrowLeft } from 'lucide-react';

export interface AdminPageHeaderProps {
  title: string;
  description?: string;
  backAction?: {
    label: string;
    onClick: () => void;
  };
  actions?: React.ReactNode;
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  title,
  description,
  backAction,
  actions,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-6)',
      }}
    >
      {backAction && (
        <button
          type="button"
          onClick={backAction.onClick}
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            marginLeft: -8,
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            color: '#64748B',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'color 150ms ease, background-color 150ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#1E293B';
            e.currentTarget.style.backgroundColor = '#F1F5F9';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = '#64748B';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <ArrowLeft size={15} />
          <span>{backAction.label}</span>
        </button>
      )}

      <div
        className="page-header admin-page-header"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          width: '100%',
          minWidth: 0,
        }}
      >
        <div className="page-header-text" style={{ minWidth: 0 }}>
          <h1
            className="page-title"
            style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: 700,
              color: '#0F172A',
              letterSpacing: '-0.025em',
              lineHeight: 1.25,
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              className="page-subtitle"
              style={{
                margin: '4px 0 0 0',
                fontSize: '14px',
                color: '#64748B',
                lineHeight: 1.5,
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div
            className="page-actions admin-header-actions"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              minWidth: 0,
            }}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
