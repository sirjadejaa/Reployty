import React from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon,
  badge,
  actions,
  className = '',
}) => {
  return (
    <div className={`page-header ${className}`}>
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
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
};
