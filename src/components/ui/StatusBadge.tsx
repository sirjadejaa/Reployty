import React from 'react';
import { StatusType } from '../../types/loyalty';

export interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  showDot?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'status-active' },
  completed: { label: 'Completed', className: 'status-completed' },
  available: { label: 'Available', className: 'status-available' },
  inactive: { label: 'Inactive', className: 'status-inactive' },
  expired: { label: 'Expired', className: 'status-expired' },
  pending: { label: 'Pending', className: 'status-pending' },
  failed: { label: 'Failed', className: 'status-failed' },
  'at-risk': { label: 'At Risk', className: 'status-at-risk' },
  at_risk: { label: 'At Risk', className: 'status-at-risk' },
  vip: { label: 'VIP', className: 'status-vip' },
  redeemed: { label: 'Redeemed', className: 'status-redeemed' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  showDot = true,
  className = '',
}) => {
  const normalizedKey = status.toLowerCase().replace(/\s+/g, '-');
  const config = STATUS_CONFIG[normalizedKey] || {
    label: label || status,
    className: 'status-inactive',
  };

  const displayText = label || config.label;

  return (
    <span className={`status-badge ${config.className} ${className}`}>
      {showDot && <span className="badge-dot" aria-hidden="true" />}
      <span>{displayText}</span>
    </span>
  );
};
