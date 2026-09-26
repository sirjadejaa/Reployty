import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface MetricCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  timeframe?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  change,
  trend = 'neutral',
  timeframe,
  icon,
  className = '',
}) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp size={12} />;
      case 'down':
        return <TrendingDown size={12} />;
      case 'neutral':
        return <Minus size={12} />;
    }
  };

  return (
    <div className={`card metric-card ${className}`}>
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        {icon && <div className="metric-icon-box">{icon}</div>}
      </div>
      <div className="metric-value-wrap">
        <span className="metric-value">{value}</span>
        {change && (
          <span className={`metric-trend metric-trend-${trend}`}>
            {getTrendIcon()}
            <span>{change}</span>
          </span>
        )}
      </div>
      {timeframe && <span className="metric-timeframe">{timeframe}</span>}
    </div>
  );
};
