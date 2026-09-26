import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  icon?: React.ReactNode;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  icon = <AlertCircle size={28} />,
  title = 'Something went wrong',
  message = 'Unable to load data right now. Please check your connection and try again.',
  onRetry,
  retryLabel = 'Try again',
  className = '',
}) => {
  return (
    <div className={`state-container ${className}`}>
      <div className="state-icon-box error" aria-hidden="true">
        {icon}
      </div>
      <h3 className="state-title">{title}</h3>
      <p className="state-desc">{message}</p>
      {onRetry && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Button
            variant="secondary"
            onClick={onRetry}
            leftIcon={<RotateCcw size={16} />}
          >
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
};
