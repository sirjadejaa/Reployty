import React from 'react';
import { Sparkles } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <Sparkles size={24} />,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`state-container ${className}`}>
      <div className="state-icon-box" aria-hidden="true">
        {icon}
      </div>
      <h3 className="state-title">{title}</h3>
      <p className="state-desc">{description}</p>
      {action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
    </div>
  );
};
