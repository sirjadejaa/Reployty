import React, { useId } from 'react';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Switch: React.FC<SwitchProps> = ({
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
  const switchId = id || generatedId;

  return (
    <label htmlFor={switchId} className={`switch-control ${className}`}>
      <input
        type="checkbox"
        id={switchId}
        role="switch"
        aria-checked={checked}
        className="switch-input sr-only"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...props}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
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
