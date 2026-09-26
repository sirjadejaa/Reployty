import React from 'react';
import { Customer } from '../../types/loyalty';
import { Avatar } from '../ui/Avatar';
import { StatusBadge } from '../ui/StatusBadge';

export interface CustomerRowProps {
  customer: Customer;
  onClick?: () => void;
}

export const CustomerRow: React.FC<CustomerRowProps> = ({
  customer,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-surface)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all var(--transition-fast)',
      }}
      className="card-hoverable"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Avatar name={customer.name} size="md" />
        <div>
          <span
            style={{
              fontSize: 'var(--font-size-base)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              display: 'block',
            }}
          >
            {customer.name}
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            {customer.phone}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, display: 'block' }}>
            {customer.stampsCollected}/{customer.totalStampsNeeded} Stamps
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Visited {customer.lastVisit}
          </span>
        </div>
        <StatusBadge status={customer.status} />
      </div>
    </div>
  );
};
