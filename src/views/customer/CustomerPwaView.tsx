import React, { useState, useEffect, useCallback } from 'react';
import { CustomerAuthProvider, useCustomerAuth } from '../../context/CustomerAuthContext';
import { CustomerPwaShell, CustomerPwaTab } from '../../components/customer/CustomerPwaShell';
import { CustomerQrLanding } from '../../components/customer/CustomerQrLanding';
import { CustomerReviewFlow } from '../../components/customer/CustomerReviewFlow';
import { CustomerJoinView } from './CustomerJoinView';
import { CustomerHomeView } from './CustomerHomeView';
import { CustomerLoyaltyView } from './CustomerLoyaltyView';
import { CustomerRewardsView } from './CustomerRewardsView';
import { CustomerActivityView } from './CustomerActivityView';
import { CustomerProfileView } from './CustomerProfileView';
import { CustomerCatalogView } from './CustomerCatalogView';
import { CustomerOffersView } from './CustomerOffersView';
import { PublicQrResolution } from '../../types/customer';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface CustomerPwaContentProps {
  initialQrToken?: string;
  initialTab?: CustomerPwaTab;
}

const CustomerPwaContent: React.FC<CustomerPwaContentProps> = ({
  initialQrToken = '',
  initialTab = 'home',
}) => {
  const {
    isAuthenticated,
    isLoading,
    customer,
    business,
    branch,
    resolveQr,
    refreshProfile,
  } = useCustomerAuth();

  const [currentTab, setCurrentTab] = useState<CustomerPwaTab | 'enroll'>(initialTab);
  const [qrToken, setQrToken] = useState<string>(initialQrToken);
  const [resolvedQrData, setResolvedQrData] = useState<PublicQrResolution | null>(null);
  const [qrLoading, setQrLoading] = useState<boolean>(Boolean(initialQrToken));
  const [qrError, setQrError] = useState<string | null>(null);
  const [claimNotification, setClaimNotification] = useState<string | null>(null);

  // Synchronize hash on load and changes
  useEffect(() => {
    const parseHash = () => {
      const rawHash = window.location.hash.replace('#', '');
      const [, queryPart] = rawHash.split('?');

      let tokenFromUrl = '';
      if (queryPart) {
        const params = new URLSearchParams(queryPart);
        const qp = params.get('qr');
        if (qp) tokenFromUrl = qp;
      } else if (typeof window !== 'undefined' && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const qp = params.get('qr');
        if (qp) tokenFromUrl = qp;
      }

      if (rawHash.startsWith('join/')) {
        const extracted = rawHash.replace('join/', '').split('?')[0];
        if (extracted) {
          tokenFromUrl = extracted;
        }
        setCurrentTab('landing');
      } else if (rawHash === 'join' || rawHash.startsWith('join?')) {
        setCurrentTab('landing');
      } else if (rawHash.startsWith('customer-review/')) {
        const extracted = rawHash.replace('customer-review/', '').split('?')[0];
        if (extracted) {
          tokenFromUrl = extracted;
        }
        setCurrentTab('review');
      } else if (rawHash.startsWith('customer/review/')) {
        const extracted = rawHash.replace('customer/review/', '').split('?')[0];
        if (extracted) {
          tokenFromUrl = extracted;
        }
        setCurrentTab('review');
      } else if (
        rawHash === 'customer-review' ||
        rawHash.startsWith('customer-review?') ||
        rawHash === 'customer/review' ||
        rawHash.startsWith('customer/review?')
      ) {
        setCurrentTab('review');
      } else if (rawHash.startsWith('customer/loyalty')) {
        setCurrentTab('loyalty');
      } else if (rawHash.startsWith('customer/rewards')) {
        setCurrentTab('rewards');
      } else if (rawHash.startsWith('customer/offers')) {
        setCurrentTab('offers');
      } else if (rawHash.startsWith('customer/catalog')) {
        setCurrentTab('catalog');
      } else if (rawHash.startsWith('customer/activity')) {
        setCurrentTab('activity');
      } else if (rawHash.startsWith('customer/profile')) {
        setCurrentTab('profile');
      } else if (rawHash.startsWith('customer')) {
        // If unauthenticated and reached customer directly, default to landing
        setCurrentTab(isAuthenticated ? 'home' : 'landing');
      }

      if (tokenFromUrl) {
        setQrToken(tokenFromUrl);
        try {
          sessionStorage.setItem('reployty_active_qr', tokenFromUrl);
        } catch {
          // Ignore
        }
      } else {
        try {
          const stored = sessionStorage.getItem('reployty_active_qr');
          if (stored) {
            setQrToken(stored);
          }
        } catch {
          // Ignore
        }
      }
    };

    parseHash();
    window.addEventListener('hashchange', parseHash);
    return () => window.removeEventListener('hashchange', parseHash);
  }, [isAuthenticated]);

  const lastLoadedTokenRef = React.useRef<string | null>(null);

  // Resolve QR code from backend server whenever qrToken changes
  const loadQrDetails = useCallback(async (token: string, force = false) => {
    if (!token) {
      setResolvedQrData(null);
      setQrLoading(false);
      setQrError('No QR code or business specified. Please scan a store QR code.');
      return;
    }
    if (!force && lastLoadedTokenRef.current === token) return;
    lastLoadedTokenRef.current = token;
    setQrLoading(true);
    setQrError(null);
    setResolvedQrData(null);
    try {
      const data = await resolveQr(token);
      setResolvedQrData(data);
    } catch (err: any) {
      setQrError(err.message || 'This business or QR code could not be verified.');
      setResolvedQrData(null);
    } finally {
      setQrLoading(false);
    }
  }, [resolveQr]);

  useEffect(() => {
    loadQrDetails(qrToken);
  }, [qrToken, loadQrDetails]);

  // Server-side QR loyalty earning claim
  const claimQrEarning = async (token: string) => {
    if (!token || !isAuthenticated) return;
    try {
      const res = await fetch('/api/customer/qr/claim-earning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode: token,
          idempotencyKey: `scan_${token}_${Date.now()}`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.alreadyClaimed) {
            setClaimNotification(data.message || 'Reward already credited for this visit.');
          } else {
            setClaimNotification(
              data.earnedType === 'STAMP'
                ? `🎉 Stamp added to your pass! (${data.newStamps}/${data.targetStamps})`
                : `🎉 ${data.deltaPoints} points added to your pass!`
            );
          }
          await refreshProfile();
        }
      }
    } catch (err) {
      console.error('Failed to claim QR loyalty reward:', err);
    }
  };

  const handleNavigateTab = (tab: CustomerPwaTab | 'enroll') => {
    setCurrentTab(tab);
    if (tab === 'landing') {
      window.location.hash = qrToken ? `join/${qrToken}` : 'join';
    } else if (tab === 'review') {
      window.location.hash = qrToken ? `customer-review?qr=${qrToken}` : 'customer-review';
    } else if (tab === 'enroll') {
      window.location.hash = qrToken ? `join/${qrToken}` : 'join';
    } else if (tab === 'home') {
      window.location.hash = qrToken ? `customer?qr=${qrToken}` : 'customer';
    } else {
      window.location.hash = qrToken ? `customer/${tab}?qr=${qrToken}` : `customer/${tab}`;
    }
  };

  const handleGoToLoyalty = async () => {
    const isEnrolledInActiveBusiness = isAuthenticated && customer?.businessId === activeBusiness?.id;
    if (isEnrolledInActiveBusiness) {
      if (qrToken) {
        await claimQrEarning(qrToken);
      }
    }
    handleNavigateTab('loyalty');
  };

  const handleGoToReview = () => {
    handleNavigateTab('review');
  };

  const activeBusiness = resolvedQrData?.business || (qrToken ? null : business);
  const activeBranch = resolvedQrData?.branch || (qrToken ? null : branch);

  // Loading Splash Screen (only when activeBusiness is not yet loaded)
  if (!activeBusiness && (isLoading || qrLoading)) {
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
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: '#4F6BFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: '18px',
          }}
        >
          R
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
          Loading your customer experience...
        </div>
      </div>
    );
  }

  // QR Verification Error Screen (only when activeBusiness cannot be resolved)
  if (qrError && !activeBusiness) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          padding: '24px',
          textAlign: 'center',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            backgroundColor: '#FEF2F2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <AlertCircle size={28} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', margin: '0 0 8px 0' }}>
          Unable to Verify QR Code
        </h2>
        <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '320px', margin: '0 0 20px 0', lineHeight: 1.5 }}>
          {qrError}
        </p>
        <button
          type="button"
          onClick={() => loadQrDetails(qrToken, true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            borderRadius: '12px',
            backgroundColor: '#4F6BFF',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '14px',
            border: 'none',
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          <RotateCcw size={16} />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  if (!activeBusiness) {
    return null;
  }

  // 1. QR LANDING SCREEN (Section 4)
  if (currentTab === 'landing') {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#F8FAFC',
          fontFamily: "'Inter', sans-serif",
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <CustomerQrLanding
          business={activeBusiness}
          branch={activeBranch}
          onNavigateToLoyalty={handleGoToLoyalty}
          onNavigateToReview={handleGoToReview}
          customerPhone={customer?.phone}
          claimNotification={claimNotification}
        />
      </div>
    );
  }

  // 2. REVIEW FLOW SCREEN (Sections 8 - 20)
  if (currentTab === 'review') {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#F8FAFC',
          fontFamily: "'Inter', sans-serif",
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <CustomerReviewFlow
          business={activeBusiness}
          qrCodeToken={qrToken}
          onBack={() => handleNavigateTab(isAuthenticated ? 'home' : 'landing')}
        />
      </div>
    );
  }

  // 3. ENROLLMENT / LOGIN FLOW (Phone & OTP)
  if (currentTab === 'enroll' || (!isAuthenticated && currentTab !== 'loyalty')) {
    return (
      <CustomerJoinView
        qrCodeToken={qrToken}
        onBack={() => handleNavigateTab('landing')}
        onJoinSuccess={async () => {
          if (qrToken) {
            await claimQrEarning(qrToken);
          }
          handleNavigateTab('loyalty');
        }}
      />
    );
  }

  // 4. CUSTOMER PWA SHELL (Existing tabs: Home, Loyalty, Rewards, etc.)
  return (
    <CustomerPwaShell
      currentTab={currentTab as CustomerPwaTab}
      onNavigateTab={handleNavigateTab}
      business={activeBusiness}
      branch={activeBranch}
    >
      {currentTab === 'home' && (
        <CustomerHomeView onNavigateTab={handleNavigateTab} />
      )}
      {currentTab === 'loyalty' && (
        <CustomerLoyaltyView
          qrToken={qrToken}
          businessId={activeBusiness?.id}
          onEnroll={() => handleNavigateTab('enroll')}
        />
      )}
      {currentTab === 'rewards' && <CustomerRewardsView onNavigateTab={handleNavigateTab} />}
      {currentTab === 'offers' && <CustomerOffersView onNavigateTab={handleNavigateTab} />}
      {currentTab === 'catalog' && <CustomerCatalogView onNavigateTab={handleNavigateTab} />}
      {currentTab === 'activity' && <CustomerActivityView />}
      {currentTab === 'profile' && <CustomerProfileView />}
    </CustomerPwaShell>
  );
};

export const CustomerPwaView: React.FC<CustomerPwaContentProps> = (props) => {
  return (
    <CustomerAuthProvider>
      <CustomerPwaContent {...props} />
    </CustomerAuthProvider>
  );
};
