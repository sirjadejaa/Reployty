import React, { useState } from 'react';
import { Star } from 'lucide-react';

export interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  size?: number;
  readOnly?: boolean;
  id?: string;
  className?: string;
}

const RATING_DESCRIPTIONS: Record<number, string> = {
  1: '1 star — Disappointing',
  2: '2 stars — Below Expectations',
  3: '3 stars — Average Experience',
  4: '4 stars — Great Visit',
  5: '5 stars — Excellent Experience',
};

export const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  size = 38,
  readOnly = false,
  id = 'star-rating',
  className = '',
}) => {
  const [hoverRating, setHoverRating] = useState<number>(0);

  const activeRating = hoverRating || value;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, star: number) => {
    if (readOnly || !onChange) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(star);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(5, star + 1);
      onChange(next);
      const nextEl = document.getElementById(`${id}-star-${next}`);
      nextEl?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const prev = Math.max(1, star - 1);
      onChange(prev);
      const prevEl = document.getElementById(`${id}-star-${prev}`);
      prevEl?.focus();
    }
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
      }}
    >
      <div
        id={id}
        role="radiogroup"
        aria-label="Rate your experience on a scale of 1 to 5 stars"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= activeRating;
          return (
            <button
              key={star}
              id={`${id}-star-${star}`}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} star${star > 1 ? 's' : ''}${
                RATING_DESCRIPTIONS[star] ? ` — ${RATING_DESCRIPTIONS[star]}` : ''
              }`}
              disabled={readOnly}
              onMouseEnter={() => !readOnly && setHoverRating(star)}
              onMouseLeave={() => !readOnly && setHoverRating(0)}
              onClick={() => !readOnly && onChange && onChange(star)}
              onKeyDown={(e) => handleKeyDown(e, star)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '6px',
                minWidth: '48px',
                minHeight: '48px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: readOnly ? 'default' : 'pointer',
                borderRadius: '8px',
                transition: 'transform 0.15s ease, background-color 0.15s ease',
                transform: isFilled && !readOnly ? 'scale(1.12)' : 'scale(1)',
                outline: 'none',
              }}
            >
              <Star
                size={size}
                fill={isFilled ? '#F59E0B' : 'transparent'}
                color={isFilled ? '#F59E0B' : '#CBD5E1'}
                strokeWidth={isFilled ? 1.5 : 2}
              />
            </button>
          );
        })}
      </div>

      {/* Accessible rating label feedback */}
      <div
        aria-live="polite"
        style={{
          fontSize: '13px',
          fontWeight: 700,
          minHeight: '20px',
          textAlign: 'center',
          color:
            activeRating >= 4
              ? '#16A34A'
              : activeRating === 3
              ? '#D97706'
              : activeRating > 0
              ? '#DC2626'
              : '#64748B',
        }}
      >
        {activeRating > 0 ? RATING_DESCRIPTIONS[activeRating] : 'Select a star rating to begin'}
      </div>
    </div>
  );
};
