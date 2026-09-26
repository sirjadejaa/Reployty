import React, { useId } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled,
  id,
  className = '',
  ...props
}) => {
  const generatedId = useId();
  const checkboxId = id || generatedId;

  return (
    <label htmlFor={checkboxId} className={`checkbox-control ${className}`}>
      <input
        type="checkbox"
        id={checkboxId}
        className="checkbox-input sr-only"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...props}
      />
      <span className="checkbox-box" aria-hidden="true">
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
      {(label || description) && (
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          {label && <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{label}</span>}
          {description && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
};
