import React, { useId } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  helperText?: string;
  error?: string;
  required?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  helperText,
  error,
  required,
  className = '',
  id,
  ...props
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;
  const errorId = `${selectId}-error`;
  const helperId = `${selectId}-helper`;

  const selectClasses = [
    'form-select',
    error ? 'has-error' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className="form-group">
      {label && (
        <label htmlFor={selectId} className="form-label">
          {label}
          {required && <span className="form-label-required">*</span>}
        </label>
      )}
      <div className="form-control-wrap" style={{ position: 'relative' }}>
        <select
          id={selectId}
          className={selectClasses}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          required={required}
          style={{ appearance: 'none', paddingRight: '36px' }}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="input-icon-right" style={{ pointerEvents: 'none' }}>
          <ChevronDown size={16} />
        </span>
      </div>
      {error && (
        <div id={errorId} className="form-error" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
      {!error && helperText && (
        <span id={helperId} className="form-helper">
          {helperText}
        </span>
      )}
    </div>
  );
};
