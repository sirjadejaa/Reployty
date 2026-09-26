import React from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search customers, rewards...',
  className = '',
  ...props
}) => {
  return (
    <div className={`form-control-wrap ${className}`}>
      <span className="input-icon-left">
        <Search size={16} />
      </span>
      <input
        type="search"
        className="form-input input-has-icon-left"
        style={{ paddingRight: value ? '32px' : '12px' }}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        {...props}
      />
      {value && onClear && (
        <button
          type="button"
          className="input-icon-right"
          onClick={onClear}
          aria-label="Clear search"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
