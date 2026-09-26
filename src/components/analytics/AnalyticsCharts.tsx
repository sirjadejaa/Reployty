import React, { useState, useId } from 'react';
import { ChartDataPoint } from '../../types/analytics';

// ============================================================================
// 1. Analytics Area / Line Chart (with optional comparison line)
// ============================================================================

export interface AnalyticsAreaChartProps {
  data: ChartDataPoint[];
  comparisonData?: ChartDataPoint[];
  color?: string;
  comparisonColor?: string;
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  emptyMessage?: string;
  showPoints?: boolean;
}

export const AnalyticsAreaChart: React.FC<AnalyticsAreaChartProps> = ({
  data,
  comparisonData,
  color = '#4F6BFF',
  comparisonColor = '#94A3B8',
  height = 240,
  valuePrefix = '',
  valueSuffix = '',
  emptyMessage = 'No activity recorded in this period',
  showPoints = true,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const gradientId = useId();

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: `${height}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          border: '1px dashed #CBD5E1',
          color: '#64748B',
          fontSize: '13px',
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  const width = 700;
  const padding = { top: 25, right: 25, bottom: 35, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find max value between primary and comparison data
  const primaryValues = data.map((d) => d.value);
  const compValues = comparisonData ? comparisonData.map((d) => d.value) : [];
  const allValues = [...primaryValues, ...compValues];
  const maxValue = Math.max(...allValues, 1);
  const minValue = 0;
  const valueRange = maxValue - minValue || 1;

  // Primary coordinates
  const points = data.map((d, idx) => {
    const x = padding.left + (idx / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.value - minValue) / valueRange) * chartHeight;
    return { ...d, x, y };
  });

  const linePath = points.reduce((acc, pt, idx) => {
    if (idx === 0) return `M ${pt.x} ${pt.y}`;
    return `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`
      : '';

  // Comparison coordinates
  let compPoints: { x: number; y: number; value: number; label: string }[] = [];
  let compLinePath = '';
  if (comparisonData && comparisonData.length > 0) {
    compPoints = comparisonData.map((d, idx) => {
      const x = padding.left + (idx / Math.max(comparisonData.length - 1, 1)) * chartWidth;
      const y = padding.top + chartHeight - ((d.value - minValue) / valueRange) * chartHeight;
      return { ...d, x, y };
    });
    compLinePath = compPoints.reduce((acc, pt, idx) => {
      if (idx === 0) return `M ${pt.x} ${pt.y}`;
      return `${acc} L ${pt.x} ${pt.y}`;
    }, '');
  }

  const yTicks = [
    { value: 0, y: padding.top + chartHeight },
    { value: Math.round(maxValue / 2), y: padding.top + chartHeight / 2 },
    { value: maxValue, y: padding.top },
  ];

  // Pick up to 6 labels along the X axis
  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data.filter((_, idx) => idx % step === 0 || idx === data.length - 1);

  return (
    <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines & Y-axis labels */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              stroke="#F1F5F9"
              strokeWidth="1"
              strokeDasharray={i === 0 ? 'none' : '4 4'}
            />
            <text
              x={padding.left - 8}
              y={tick.y + 4}
              fontSize="11"
              fill="#94A3B8"
              textAnchor="end"
              fontWeight="500"
            >
              {valuePrefix}
              {tick.value}
              {valueSuffix}
            </text>
          </g>
        ))}

        {/* Comparison dashed line */}
        {compLinePath && (
          <path
            d={compLinePath}
            fill="none"
            stroke={comparisonColor}
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity="0.75"
          />
        )}

        {/* Primary Area Fill */}
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {/* Primary Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points */}
        {showPoints &&
          points.map((pt, idx) => (
            <circle
              key={idx}
              cx={pt.x}
              cy={pt.y}
              r={hoveredIdx === idx ? 6 : 3.5}
              fill={hoveredIdx === idx ? '#FFFFFF' : color}
              stroke={color}
              strokeWidth={hoveredIdx === idx ? 3 : 1.5}
              style={{ transition: 'r 0.15s ease, fill 0.15s ease', cursor: 'pointer' }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}

        {/* X-axis labels */}
        {xLabels.map((item, idx) => {
          const originalIdx = data.indexOf(item);
          const x = padding.left + (originalIdx / Math.max(data.length - 1, 1)) * chartWidth;
          return (
            <text
              key={idx}
              x={x}
              y={height - 8}
              fontSize="11"
              fill="#64748B"
              textAnchor="middle"
              fontWeight="500"
            >
              {item.label}
            </text>
          );
        })}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredIdx !== null && points[hoveredIdx] && (
        <div
          style={{
            position: 'absolute',
            left: `${(points[hoveredIdx].x / width) * 100}%`,
            top: `${(points[hoveredIdx].y / height) * 100}%`,
            transform: 'translate(-50%, -120%)',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {valuePrefix}
            {points[hoveredIdx].value.toLocaleString()}
            {valueSuffix}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>{points[hoveredIdx].date || points[hoveredIdx].label}</div>
          {compPoints[hoveredIdx] !== undefined && (
            <div style={{ fontSize: '11px', color: '#CBD5E1', marginTop: '2px', borderTop: '1px solid #334155', paddingTop: '2px' }}>
              Prev Period: {valuePrefix}{compPoints[hoveredIdx].value.toLocaleString()}{valueSuffix}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. Analytics Bar Chart
// ============================================================================

export interface BarChartItem {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
  secondaryColor?: string;
}

export interface AnalyticsBarChartProps {
  data: BarChartItem[];
  height?: number;
  horizontal?: boolean;
  valuePrefix?: string;
  valueSuffix?: string;
  emptyMessage?: string;
}

export const AnalyticsBarChart: React.FC<AnalyticsBarChartProps> = ({
  data,
  height = 240,
  horizontal = false,
  valuePrefix = '',
  valueSuffix = '',
  emptyMessage = 'No data available',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: `${height}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          border: '1px dashed #CBD5E1',
          color: '#64748B',
          fontSize: '13px',
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => Math.max(d.value, d.secondaryValue || 0)), 1);

  if (horizontal) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
        {data.map((item, idx) => {
          const pct = Math.min(100, Math.round((item.value / maxValue) * 100));
          const secPct = item.secondaryValue !== undefined ? Math.min(100, Math.round((item.secondaryValue / maxValue) * 100)) : 0;
          const barColor = item.color || '#4F6BFF';

          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1E293B', fontWeight: 500 }}>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                  {item.label}
                </span>
                <span style={{ fontWeight: 600 }}>
                  {valuePrefix}
                  {item.value.toLocaleString()}
                  {valueSuffix}
                </span>
              </div>
              <div style={{ height: '8px', width: '100%', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    backgroundColor: barColor,
                    borderRadius: '4px',
                    transition: 'width 0.4s ease',
                  }}
                />
                {item.secondaryValue !== undefined && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: `${secPct}%`,
                      backgroundColor: item.secondaryColor || '#94A3B8',
                      borderRadius: '4px',
                      opacity: 0.4,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Vertical SVG Bar Chart
  const width = 600;
  const padding = { top: 20, right: 20, bottom: 40, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const barWidth = Math.max(12, Math.min(40, (chartWidth / data.length) * 0.6));
  const slotWidth = chartWidth / data.length;

  return (
    <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      >
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((ratio, i) => {
          const y = padding.top + chartHeight * (1 - ratio);
          const val = Math.round(maxValue * ratio);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#F1F5F9"
                strokeWidth="1"
                strokeDasharray={i === 0 ? 'none' : '4 4'}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                fontSize="11"
                fill="#94A3B8"
                textAnchor="end"
                fontWeight="500"
              >
                {valuePrefix}
                {val}
                {valueSuffix}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((item, idx) => {
          const barH = (item.value / maxValue) * chartHeight;
          const x = padding.left + idx * slotWidth + (slotWidth - barWidth) / 2;
          const y = padding.top + chartHeight - barH;
          const barColor = item.color || '#4F6BFF';
          const isHovered = hoveredIdx === idx;

          return (
            <g key={idx} onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 2)}
                rx="4"
                fill={isHovered ? '#3B82F6' : barColor}
                style={{ transition: 'fill 0.15s ease', cursor: 'pointer' }}
              />
              <text
                x={x + barWidth / 2}
                y={height - 12}
                fontSize="11"
                fill="#64748B"
                textAnchor="middle"
                fontWeight="500"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div
          style={{
            position: 'absolute',
            left: `${((padding.left + hoveredIdx * slotWidth + slotWidth / 2) / width) * 100}%`,
            top: `${((padding.top + chartHeight - (data[hoveredIdx].value / maxValue) * chartHeight) / height) * 100}%`,
            transform: 'translate(-50%, -120%)',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            padding: '5px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        >
          <span style={{ fontWeight: 600 }}>{data[hoveredIdx].label}:</span> {valuePrefix}
          {data[hoveredIdx].value.toLocaleString()}
          {valueSuffix}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. Analytics Donut Chart
// ============================================================================

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface AnalyticsDonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

export const AnalyticsDonutChart: React.FC<AnalyticsDonutChartProps> = ({
  segments,
  size = 180,
  strokeWidth = 24,
  centerLabel,
  centerValue,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          border: `${strokeWidth}px solid #F1F5F9`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          margin: '0 auto',
        }}
      >
        <span style={{ fontSize: '12px', color: '#94A3B8' }}>No data</span>
      </div>
    );
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedAngle = 0;

  return (
    <div style={{ position: 'relative', width: `${size}px`, height: `${size}px`, margin: '0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {segments.map((seg, idx) => {
          const pct = seg.value / total;
          const strokeDashoffset = circumference - pct * circumference;
          const rotation = accumulatedAngle;
          accumulatedAngle += pct * 360;

          return (
            <circle
              key={idx}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke={seg.color}
              strokeWidth={hoveredIdx === idx ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{
                transformOrigin: `${size / 2}px ${size / 2}px`,
                transform: `rotate(${rotation}deg)`,
                transition: 'stroke-width 0.2s ease, opacity 0.2s ease',
                cursor: 'pointer',
                opacity: hoveredIdx !== null && hoveredIdx !== idx ? 0.6 : 1,
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}
      </svg>

      {/* Center Label */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {hoveredIdx !== null ? (
          <>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
              {segments[hoveredIdx].value.toLocaleString()}
            </span>
            <span style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>
              {segments[hoveredIdx].label}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
              {centerValue !== undefined ? centerValue : total.toLocaleString()}
            </span>
            {centerLabel && (
              <span style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>
                {centerLabel}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};
