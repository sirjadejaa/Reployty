import React from 'react';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '16px',
  radius = 'var(--radius-md)',
  className = '',
  style,
}) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
};

export const MetricSkeleton: React.FC = () => (
  <div className="card metric-card" aria-hidden="true">
    <div className="metric-header">
      <Skeleton width="90px" height="14px" />
      <Skeleton width="36px" height="36px" radius="var(--radius-md)" />
    </div>
    <div className="metric-value-wrap">
      <Skeleton width="120px" height="32px" />
      <Skeleton width="60px" height="20px" radius="var(--radius-sm)" />
    </div>
    <Skeleton width="100px" height="12px" />
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="table-container" style={{ padding: 'var(--space-4)' }} aria-hidden="true">
    <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      <Skeleton width="25%" height="16px" />
      <Skeleton width="25%" height="16px" />
      <Skeleton width="25%" height="16px" />
      <Skeleton width="25%" height="16px" />
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          padding: 'var(--space-3) 0',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <Skeleton width="25%" height="20px" />
        <Skeleton width="25%" height="20px" />
        <Skeleton width="25%" height="20px" />
        <Skeleton width="25%" height="20px" />
      </div>
    ))}
  </div>
);
