import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div className={`tabs-nav ${className}`} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {typeof tab.count === 'number' && (
            <span
              style={{
                marginLeft: 'var(--space-2)',
                fontSize: 'var(--font-size-xs)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: activeTab === tab.id ? 'var(--color-primary-subtle)' : 'var(--color-surface-muted)',
                color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};
