import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  helperText,
  error,
  required,
  className = '',
  id,
  rows = 3,
  ...props
}) => {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const errorId = `${textareaId}-error`;
  const helperId = `${textareaId}-helper`;

  const textareaClasses = [
    'form-textarea',
    error ? 'has-error' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className="form-group">
      {label && (
        <label htmlFor={textareaId} className="form-label">
          {label}
          {required && <span className="form-label-required">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        className={textareaClasses}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
        required={required}
        {...props}
      />
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
