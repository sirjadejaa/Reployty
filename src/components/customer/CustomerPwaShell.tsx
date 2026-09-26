import { Home, Award, Gift, Clock, User, UtensilsCrossed, Tag } from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';

export type CustomerPwaTab = 'home' | 'loyalty' | 'rewards' | 'offers' | 'catalog' | 'activity' | 'profile';

interface CustomerPwaShellProps {
  currentTab: CustomerPwaTab;
  onNavigateTab: (tab: CustomerPwaTab) => void;
  children: React.ReactNode;
}

export const CustomerPwaShell: React.FC<CustomerPwaShellProps> = ({
  currentTab,
  onNavigateTab,
  children,
}) => {
  const { business, branch } = useCustomerAuth();

  const primaryColor = business?.primaryColor || '#4F6BFF';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F1F5F9',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          minHeight: '100vh',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
          position: 'relative',
        }}
      >
        {/* Top Business Header */}
        <header
          style={{
            padding: '16px 20px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '10px',
                backgroundColor: `${primaryColor}15`,
                color: primaryColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '16px',
                border: `1px solid ${primaryColor}30`,
              }}
            >
              {business?.name ? business.name.charAt(0) : 'R'}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>
                {business?.name || 'Reployty Partner'}
              </div>
              {branch?.name ? (
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  {branch.name}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  {business?.category || 'Customer Rewards'}
                </div>
              )}
            </div>
          </div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: '#F8FAFC',
              color: '#64748B',
              border: '1px solid #E2E8F0',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            PWA
          </div>
        </header>

        {/* Main Content View (Padded for Bottom Nav) */}
        <main
          style={{
            flex: 1,
            padding: '20px 18px 90px 18px',
            overflowY: 'auto',
          }}
        >
          {children}
        </main>

        {/* Fixed Bottom Navigation Bar */}
        <nav
          style={{
            position: 'fixed',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100%',
            maxWidth: '440px',
            backgroundColor: '#FFFFFF',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '10px 0',
            zIndex: 40,
            boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.03)',
          }}
        >
          <button
            onClick={() => onNavigateTab('home')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'home' ? primaryColor : '#64748B',
              padding: '4px 12px',
              minWidth: '64px',
            }}
          >
            <Home size={20} strokeWidth={currentTab === 'home' ? 2.5 : 2} />
            <span style={{ fontSize: '11px', fontWeight: currentTab === 'home' ? 600 : 500 }}>Home</span>
          </button>

          <button
            onClick={() => onNavigateTab('loyalty')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'loyalty' ? primaryColor : '#64748B',
              padding: '4px 12px',
              minWidth: '64px',
            }}
          >
            <Award size={20} strokeWidth={currentTab === 'loyalty' ? 2.5 : 2} />
            <span style={{ fontSize: '11px', fontWeight: currentTab === 'loyalty' ? 600 : 500 }}>Loyalty</span>
          </button>

          <button
            onClick={() => onNavigateTab('rewards')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'rewards' ? primaryColor : '#64748B',
              padding: '4px 8px',
              minWidth: '54px',
            }}
          >
            <Gift size={20} strokeWidth={currentTab === 'rewards' ? 2.5 : 2} />
            <span style={{ fontSize: '11px', fontWeight: currentTab === 'rewards' ? 600 : 500 }}>Rewards</span>
          </button>

          <button
            onClick={() => onNavigateTab('offers')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'offers' ? primaryColor : '#64748B',
              padding: '4px 8px',
              minWidth: '50px',
            }}
          >
            <Tag size={20} strokeWidth={currentTab === 'offers' ? 2.5 : 2} />
            <span style={{ fontSize: '11px', fontWeight: currentTab === 'offers' ? 600 : 500 }}>Offers</span>
          </button>

          <button
            onClick={() => onNavigateTab('catalog')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'catalog' ? primaryColor : '#64748B',
              padding: '4px 8px',
              minWidth: '54px',
            }}
          >
            <UtensilsCrossed size={20} strokeWidth={currentTab === 'catalog' ? 2.5 : 2} />
            <span style={{ fontSize: '11px', fontWeight: currentTab === 'catalog' ? 600 : 500 }}>Catalog</span>
          </button>

          <button
            onClick={() => onNavigateTab('activity')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'activity' ? primaryColor : '#64748B',
              padding: '4px 12px',
              minWidth: '64px',
            }}
          >
            <Clock size={20} strokeWidth={currentTab === 'activity' ? 2.5 : 2} />
            <span style={{ fontSize: '11px', fontWeight: currentTab === 'activity' ? 600 : 500 }}>Activity</span>
          </button>

          <button
            onClick={() => onNavigateTab('profile')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: currentTab === 'profile' ? primaryColor : '#64748B',
              padding: '4px 12px',
              minWidth: '64px',
            }}
          >
            <User size={20} strokeWidth={currentTab === 'profile' ? 2.5 : 2} />
            <span style={{ fontSize: '11px', fontWeight: currentTab === 'profile' ? 600 : 500 }}>Profile</span>
          </button>
        </nav>
      </div>
    </div>
  );
};
