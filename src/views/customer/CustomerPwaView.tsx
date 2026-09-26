import React, { useState, useEffect } from 'react';
import { CustomerAuthProvider, useCustomerAuth } from '../../context/CustomerAuthContext';
import { CustomerPwaShell } from '../../components/customer/CustomerPwaShell';
import { CustomerJoinView } from './CustomerJoinView';
import { CustomerHomeView } from './CustomerHomeView';
import { CustomerLoyaltyView } from './CustomerLoyaltyView';
import { CustomerRewardsView } from './CustomerRewardsView';
import { CustomerActivityView } from './CustomerActivityView';
import { CustomerProfileView } from './CustomerProfileView';
import { CustomerCatalogView } from './CustomerCatalogView';
import { CustomerOffersView } from './CustomerOffersView';
import { CustomerPwaTab } from '../../components/customer/CustomerPwaShell';

interface CustomerPwaContentProps {
  initialQrToken?: string;
  initialTab?: CustomerPwaTab;
}

const CustomerPwaContent: React.FC<CustomerPwaContentProps> = ({
  initialQrToken = 'bean-stand-01',
  initialTab = 'home',
}) => {
  const { isAuthenticated, isLoading, customer } = useCustomerAuth();
  const [currentTab, setCurrentTab] = useState<CustomerPwaTab>(initialTab);
  const [qrToken, setQrToken] = useState<string>(initialQrToken);

  useEffect(() => {
    // Parse current hash for QR or Tab
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('join/')) {
      const token = hash.replace('join/', '').split('?')[0];
      if (token) setQrToken(token);
    } else if (hash === 'customer/loyalty') {
      setCurrentTab('loyalty');
    } else if (hash === 'customer/rewards') {
      setCurrentTab('rewards');
    } else if (hash === 'customer/offers') {
      setCurrentTab('offers');
    } else if (hash === 'customer/catalog') {
      setCurrentTab('catalog');
    } else if (hash === 'customer/activity') {
      setCurrentTab('activity');
    } else if (hash === 'customer/profile') {
      setCurrentTab('profile');
    } else if (hash.startsWith('customer')) {
      setCurrentTab('home');
    }
  }, []);

  const handleNavigateTab = (tab: CustomerPwaTab) => {
    setCurrentTab(tab);
    window.location.hash = tab === 'home' ? 'customer' : `customer/${tab}`;
  };

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>
          Loading your customer portal...
        </div>
      </div>
    );
  }

  // If not authenticated, render Join / Phone / OTP flow
  if (!isAuthenticated || !customer) {
    return (
      <CustomerJoinView
        qrCodeToken={qrToken}
        onJoinSuccess={() => {
          setCurrentTab('home');
          window.location.hash = 'customer';
        }}
      />
    );
  }

  // Render PWA shell with bottom tab navigation
  return (
    <CustomerPwaShell currentTab={currentTab} onNavigateTab={handleNavigateTab}>
      {currentTab === 'home' && <CustomerHomeView onNavigateTab={handleNavigateTab} />}
      {currentTab === 'loyalty' && <CustomerLoyaltyView />}
      {currentTab === 'rewards' && <CustomerRewardsView onNavigateTab={handleNavigateTab} />}
      {currentTab === 'offers' && <CustomerOffersView onNavigateTab={handleNavigateTab} />}
      {currentTab === 'catalog' && <CustomerCatalogView onNavigateTab={handleNavigateTab} />}
      {currentTab === 'activity' && <CustomerActivityView />}
      {currentTab === 'profile' && <CustomerProfileView />}
    </CustomerPwaShell>
  );
};

export const CustomerPwaView: React.FC<CustomerPwaContentProps> = props => {
  return (
    <CustomerAuthProvider>
      <CustomerPwaContent {...props} />
    </CustomerAuthProvider>
  );
};
