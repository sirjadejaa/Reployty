import React from 'react';
import { ArrowLeft } from 'lucide-react';

export interface AdminPageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  backAction?: {
    label: string;
    onClick: () => void;
  };
  actions?: React.ReactNode;
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  title,
  description,
  icon,
  badge,
  backAction,
  actions,
}) => {
  return (
    <div
      className="admin-page-header-wrap"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
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

      <div className="page-header admin-page-header">
        <div className="page-header-main">
          {icon && <div className="page-header-icon-box">{icon}</div>}
          <div className="page-header-text">
            <div className="page-header-title-row">
              <h1 className="page-title">{title}</h1>
              {badge && <span className="page-header-badge">{badge}</span>}
            </div>
            {description && <p className="page-subtitle">{description}</p>}
          </div>
        </div>

        {actions && (
          <div className="page-actions admin-header-actions">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
