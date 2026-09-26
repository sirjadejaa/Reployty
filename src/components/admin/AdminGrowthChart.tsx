import React, { useState, useId } from 'react';

export type TimeRange = '7d' | '30d' | '90d' | 'all';
export type ChartMetric = 'businesses' | 'users' | 'customers' | 'activity';

export interface DataPoint {
  label: string;
  value: number;
  date: string;
}

export interface AdminGrowthChartProps {
  timeRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  activeMetric?: ChartMetric;
  onMetricChange?: (metric: ChartMetric) => void;
  dataPoints: DataPoint[];
  metricLabel: string;
  totalValue?: number | string;
  isLoading?: boolean;
}

export const AdminGrowthChart: React.FC<AdminGrowthChartProps> = ({
  timeRange,
  onRangeChange,
  activeMetric = 'businesses',
  onMetricChange,
  dataPoints,
  metricLabel,
  totalValue,
  isLoading = false,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const gradientId = useId();

  const width = 640;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 30, left: 35 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = dataPoints.map(p => p.value);
  const maxValue = Math.max(...values, 1);
  const minValue = 0;
  const valueRange = maxValue - minValue || 1;

  // Compute SVG coordinates
  const points = dataPoints.map((p, idx) => {
    const x = padding.left + (idx / Math.max(dataPoints.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((p.value - minValue) / valueRange) * chartHeight;
    return { ...p, x, y };
  });

  // Construct SVG Path
  const linePath = points.length > 0
    ? points.reduce((acc, pt, idx) => {
        if (idx === 0) return `M ${pt.x} ${pt.y}`;
        // Clean line segment
        return `${acc} L ${pt.x} ${pt.y}`;
      }, '')
    : '';

  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`
    : '';

  const yTicks = [0, Math.round(maxValue / 2), maxValue];

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      {/* Header with Title, Range Toggle & Metric Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 600,
                color: '#0F172A',
                letterSpacing: '-0.01em',
              }}
            >
              Platform Growth
            </h3>
            {totalValue !== undefined && (
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#4F6BFF',
                  backgroundColor: '#EEF2FF',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                {totalValue} {metricLabel}
              </span>
            )}
          </div>
          <p
            style={{
              margin: '2px 0 0 0',
              fontSize: '13px',
              color: '#64748B',
            }}
          >
            Historical growth & activity across all tenant databases.
          </p>
        </div>

        {/* Range Selector */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '2px',
          }}
        >
          {(['7d', '30d', '90d', 'all'] as const).map(range => {
            const isSelected = timeRange === range;
            const labels = { '7d': '7D', '30d': '30D', '90d': '90D', all: 'ALL' };
            return (
              <button
                key={range}
                type="button"
                onClick={() => onRangeChange(range)}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  color: isSelected ? '#4F6BFF' : '#64748B',
                  backgroundColor: isSelected ? '#FFFFFF' : 'transparent',
                  borderRadius: '6px',
                  border: 'none',
                  boxShadow: isSelected ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease, color 150ms ease',
                }}
              >
                {labels[range]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Metric Selector Pills (if onMetricChange provided) */}
      {onMetricChange && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {[
            { id: 'businesses' as const, label: 'Businesses' },
            { id: 'users' as const, label: 'Platform Users' },
            { id: 'customers' as const, label: 'Customers' },
            { id: 'activity' as const, label: 'Loyalty Activity' },
          ].map(m => {
            const isSelected = activeMetric === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onMetricChange(m.id)}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  color: isSelected ? '#4F6BFF' : '#475569',
                  backgroundColor: isSelected ? '#EEF2FF' : '#F8FAFC',
                  border: `1px solid ${isSelected ? '#C7D2FE' : '#E2E8F0'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Chart Canvas Area */}
      <div style={{ position: 'relative', width: '100%', minHeight: 220 }}>
        {isLoading ? (
          <div
            style={{
              height: 220,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94A3B8',
              fontSize: '13px',
            }}
          >
            Aggregating platform growth metrics...
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4F6BFF" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#4F6BFF" stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {/* Subtle Horizontal Gridlines */}
            {yTicks.map(tick => {
              const y = padding.top + chartHeight - ((tick - minValue) / valueRange) * chartHeight;
              return (
                <g key={tick}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke="#F1F5F9"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="#94A3B8"
                    fontFamily="Inter, sans-serif"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Gradient Area Fill */}
            {areaPath && (
              <path
                d={areaPath}
                fill={`url(#${gradientId})`}
              />
            )}

            {/* Main Restrained Blue Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#4F6BFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data Points and Interaction Circles */}
            {points.map((pt, idx) => {
              const isHovered = hoveredPoint?.date === pt.date;
              return (
                <g key={idx}>
                  {/* Subtle point dot */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 5 : 3}
                    fill="#FFFFFF"
                    stroke="#4F6BFF"
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    style={{ transition: 'r 150ms ease' }}
                  />

                  {/* Invisible larger hover target */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={18}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => {
                      setHoveredPoint(pt);
                      setHoverCoords({ x: pt.x, y: pt.y });
                    }}
                    onMouseLeave={() => {
                      setHoveredPoint(null);
                      setHoverCoords(null);
                    }}
                  />

                  {/* X-axis Label (spaced evenly) */}
                  {(points.length <= 8 || idx % Math.ceil(points.length / 6) === 0 || idx === points.length - 1) && (
                    <text
                      x={pt.x}
                      y={height - 8}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#94A3B8"
                      fontFamily="Inter, sans-serif"
                    >
                      {pt.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* Clean Reployty Tooltip on Hover */}
        {hoveredPoint && hoverCoords && (
          <div
            style={{
              position: 'absolute',
              left: `${(hoverCoords.x / width) * 100}%`,
              top: `${(hoverCoords.y / height) * 100}%`,
              transform: 'translate(-50%, -120%)',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '6px 12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              pointerEvents: 'none',
              zIndex: 10,
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
              {hoveredPoint.date}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: 1 }}>
              {hoveredPoint.value.toLocaleString()} {metricLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
